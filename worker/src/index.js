import { clientName, entryFields } from "../../shared/directory-schema.js";
import {
  validateDetails,
  trackingPattern,
} from "../../shared/shipment-schema.js";

const json = (data, status = 200, extra = {}) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extra,
    },
  });
const emptyRecord = () => ({
  details: validateDetails({}),
  version: 0,
  updatedAt: null,
});

async function readJSON(request, maxSize = 16000) {
  if (
    !request.headers
      .get("Content-Type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    throw new Error("Send shipment details as JSON.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Shipment details are missing.");
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxSize) {
      await reader.cancel();
      throw new Error("Shipment details are too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error("Shipment details are not valid JSON.");
  }
}

export class ShipmentNotes {
  constructor(ctx) {
    this.storage = ctx.storage;
  }

  async fetch(request) {
    if (request.method === "GET")
      return json((await this.storage.get("record")) || emptyRecord());
    if (request.method !== "PUT")
      return json({ error: "Method not allowed." }, 405, { Allow: "GET, PUT" });
    let details, baseVersion;
    try {
      const body = await readJSON(request);
      if (
        !body ||
        typeof body !== "object" ||
        Array.isArray(body) ||
        Object.keys(body).some(
          (key) => !["details", "baseVersion"].includes(key),
        )
      ) {
        throw new Error("Send details and the version you last loaded.");
      }
      details = validateDetails(body.details);
      baseVersion = body.baseVersion;
      if (!Number.isSafeInteger(baseVersion) || baseVersion < 0)
        throw new Error("A valid shipment version is required.");
    } catch (error) {
      return json({ error: error.message }, 400);
    }

    // Compare and write inside a storage transaction so two employees cannot silently overwrite one another.
    const result = await this.storage.transaction(async (transaction) => {
      const current = (await transaction.get("record")) || emptyRecord();
      if (current.version !== baseVersion) return { conflict: true, current };
      const record = {
        details,
        version: current.version + 1,
        updatedAt: new Date().toISOString(),
      };
      await transaction.put("record", record);
      return { record };
    });
    return result.conflict
      ? json(
          {
            error: "This shipment was updated elsewhere.",
            current: result.current,
          },
          409,
        )
      : json(result.record);
  }
}

// A separate directory keeps saved numbers organized without changing shipment notes.
export class SavedShipments {
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async fetch(request) {
    if (request.method === "GET") {
      return json(
        await this.storage.transaction(async (tx) => ({
          folders: [...(await tx.list({ prefix: "folder:" })).values()],
          entries: [...(await tx.list({ prefix: "entry:" })).values()],
          trash: [...(await tx.list({ prefix: "trash:" })).values()],
        })),
      );
    }
    if (request.method !== "PUT")
      return json({ error: "Method not allowed." }, 405);
    try {
      const body = await readJSON(request, 64000);
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Invalid saved shipment.");
      const result = await this.storage.transaction(async (tx) => {
        const folders = [...(await tx.list({ prefix: "folder:" })).values()];
        const nextVersion = async (key, current) => {
          const version =
            Math.max(
              current?.version || 0,
              (await tx.get(`revision:${key}`)) || 0,
            ) + 1;
          await tx.put(`revision:${key}`, version);
          return version;
        };
        const makeFolder = async (name) => {
          name = clientName(name);
          const existing = folders.find(
            (folder) => folder.name.toLowerCase() === name.toLowerCase(),
          );
          if (existing) return existing;
          if (folders.length >= 2000)
            throw new Error("The workspace has reached its folder limit.");
          const folder = { id: crypto.randomUUID(), name, version: 1 };
          await tx.put(`folder:${folder.id}`, folder);
          folders.push(folder);
          return folder;
        };
        if (body.action === "folder") return makeFolder(body.name);
        if (body.action === "import") {
          if (
            !Array.isArray(body.rows) ||
            !body.rows.length ||
            body.rows.length > 20
          )
            throw new Error("Import 1–20 rows at a time.");
          let added = 0,
            skipped = 0,
            createdFolders = 0;
          // All rows in a batch are validated before the transaction commits.
          for (const row of body.rows) {
            const before = folders.length;
            const folder = await makeFolder(row.client);
            createdFolders += folders.length - before;
            if (!row.number) continue;
            const fields = entryFields(row),
              key = `entry:${folder.id}:${fields.number}`;
            if (await tx.get(key)) {
              skipped++;
              continue;
            }
            await tx.put(key, {
              ...fields,
              folderId: folder.id,
              version: await nextVersion(key),
              updatedAt: new Date().toISOString(),
            });
            added++;
          }
          return { added, skipped, createdFolders };
        }
        if (body.action === "restore") {
          if (
            typeof body.trashId !== "string" ||
            !/^[a-f0-9-]{36}$/.test(body.trashId)
          )
            throw new Error("Choose a deleted item.");
          const deleted = await tx.get(`trash:${body.trashId}`);
          if (!deleted)
            throw new Error(
              "This item has already been restored. Refresh the workspace.",
            );
          const original = deleted.folder;
          const folder = folders.find((item) => item.id === original.id);
          if (
            !folder &&
            folders.some(
              (item) => item.name.toLowerCase() === original.name.toLowerCase(),
            )
          )
            throw new Error(
              "A folder already uses that client name. Rename it before restoring this folder.",
            );
          const entries = await tx.list({ prefix: `deleted:${body.trashId}:` });
          for (const entry of entries.values())
            if (await tx.get(`entry:${original.id}:${entry.number}`))
              throw new Error(
                "A number already exists in that folder. Move it before restoring this item.",
              );
          if (!folder)
            await tx.put(`folder:${original.id}`, {
              ...original,
              version: (original.version || 0) + 1,
            });
          for (const [key, entry] of entries) {
            await tx.put(`entry:${original.id}:${entry.number}`, {
              ...entry,
              version: await nextVersion(
                `entry:${original.id}:${entry.number}`,
                entry,
              ),
            });
            await tx.delete(key);
          }
          await tx.delete(`trash:${body.trashId}`);
          return { ok: true };
        }
        if (
          typeof body.folderId !== "string" ||
          !/^[a-f0-9-]{36}$/.test(body.folderId)
        )
          throw new Error("Choose an existing client folder.");
        const folder = await tx.get(`folder:${body.folderId}`);
        if (!folder)
          throw new Error(
            "This folder no longer exists. Refresh the workspace.",
          );
        if (body.action === "rename") {
          const name = clientName(body.name);
          if (body.baseVersion !== (folder.version || 0))
            throw new Error(
              "This folder changed elsewhere. Refresh before renaming.",
            );
          if (
            folders.some(
              (item) =>
                item.id !== folder.id &&
                item.name.toLowerCase() === name.toLowerCase(),
            )
          )
            throw new Error("Another folder already uses that client name.");
          const renamed = {
            ...folder,
            name,
            version: (folder.version || 0) + 1,
          };
          await tx.put(`folder:${folder.id}`, renamed);
          return renamed;
        }
        if (body.action === "delete-folder") {
          const entries = await tx.list({ prefix: `entry:${body.folderId}:` });
          if (
            !Number.isSafeInteger(body.entryCount) ||
            body.entryCount !== entries.size
          )
            throw new Error(
              "This folder changed. Refresh Saved numbers and review it before deleting.",
            );
          if (
            body.baseVersion !== undefined &&
            body.baseVersion !== (folder.version || 0)
          )
            throw new Error("This folder changed. Refresh before deleting.");
          const id = crypto.randomUUID();
          await tx.put(`trash:${id}`, {
            id,
            folder,
            count: entries.size,
            type: "folder",
            deletedAt: new Date().toISOString(),
          });
          for (const [key, entry] of entries) {
            await tx.put(`deleted:${id}:${entry.number}`, entry);
            await tx.delete(key);
          }
          await tx.delete(`folder:${folder.id}`);
          return { ok: true };
        }
        const number =
          typeof body.number === "string"
            ? body.number.trim().toUpperCase()
            : "";
        if (!trackingPattern.test(number))
          throw new Error("Enter a valid tracking number.");
        const key = `entry:${folder.id}:${number}`,
          current = await tx.get(key);
        if (!["entry", "remove", "move"].includes(body.action))
          throw new Error("Choose a valid saved shipment action.");
        // Old clients may create new entries, but edits require the version that was loaded.
        if (current && body.baseVersion !== (current.version || 0))
          throw new Error(
            "This shipment changed elsewhere. Your draft is kept. Refresh the list and reopen Edit before saving.",
          );
        if (body.action === "remove") {
          if (!current)
            throw new Error("This number is no longer in the folder.");
          const id = crypto.randomUUID();
          await tx.put(`trash:${id}`, {
            id,
            folder,
            count: 1,
            type: "number",
            number,
            deletedAt: new Date().toISOString(),
          });
          await tx.put(`deleted:${id}:${number}`, current);
          await tx.delete(key);
          return { ok: true };
        }
        if (body.action === "move") {
          if (!current)
            throw new Error("This number is no longer in the folder.");
          const target = folders.find((item) => item.id === body.targetId);
          if (!target || target.id === folder.id)
            throw new Error("Choose a different destination folder.");
          const targetKey = `entry:${target.id}:${number}`;
          if (await tx.get(targetKey))
            throw new Error(
              "That number already exists in the destination. Nothing was moved.",
            );
          const entry = {
            ...current,
            folderId: target.id,
            version: await nextVersion(targetKey, current),
            updatedAt: new Date().toISOString(),
          };
          await tx.put(targetKey, entry);
          await tx.delete(key);
          return entry;
        }
        if (!current && body.baseVersion > 0)
          throw new Error(
            "This shipment was removed or moved. Refresh before saving.",
          );
        const entry = {
          ...entryFields(body),
          folderId: folder.id,
          version: await nextVersion(key, current),
          updatedAt: new Date().toISOString(),
        };
        await tx.put(key, entry);
        return entry;
      });
      return json(result);
    } catch (error) {
      return json({ error: error.message }, 400);
    }
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (origin && !allowed.includes(origin))
      return json(
        { error: "This website is not configured to use shared notes." },
        403,
      );
    const cors = {
      ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "3600",
      Vary: "Origin",
    };
    const url = new URL(request.url);
    const match = /^\/api\/shipments\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    let response;
    if (url.pathname === "/health" && request.method === "GET")
      response = json({ ok: true, service: "nina-elman-shipment-notes" });
    else if (url.pathname === "/api/saved") {
      if (request.method === "OPTIONS")
        response = new Response(null, { status: 204 });
      else {
        try {
          response = await env.SAVED_SHIPMENTS.get(
            env.SAVED_SHIPMENTS.idFromName("studio"),
          ).fetch(request);
        } catch {
          response = json(
            {
              error:
                "Saved numbers are temporarily unavailable. Please try again.",
            },
            503,
          );
        }
      }
    } else if (!match || !trackingPattern.test(match[1].toUpperCase()))
      response = json({ error: "Shipment not found." }, 404);
    else if (request.method === "OPTIONS")
      response = new Response(null, { status: 204 });
    else if (!["GET", "PUT"].includes(request.method))
      response = json({ error: "Method not allowed." }, 405, {
        Allow: "GET, PUT, OPTIONS",
      });
    else {
      try {
        const id = env.SHIPMENT_NOTES.idFromName(match[1].toUpperCase());
        response = await env.SHIPMENT_NOTES.get(id).fetch(request);
      } catch {
        response = json(
          {
            error:
              "Shared notes are temporarily unavailable. Please try again.",
          },
          503,
        );
      }
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
