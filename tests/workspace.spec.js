import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  parseDelimited,
  previewImport,
  guessMapping,
} from "../src/spreadsheet.js";
import { readFile } from "node:fs/promises";
const endpoint = "http://127.0.0.1:8787/api/saved";
const url = "http://127.0.0.1:5174";
const unique = () => randomUUID().slice(0, 8);
async function put(request, body) {
  const response = await request.put(endpoint, { data: body });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}
async function start(page) {
  await page.route("https://www.17track.net/externalcall.js", (route) =>
    route.abort(),
  );
  await page.goto(url);
  await expect(page.locator(".hero-art")).toBeVisible();
  await expect(page.locator("#saved-workspace")).not.toBeVisible();
  await page.getByRole("button", { name: "Saved numbers", exact: true }).click();
  await expect(page.locator("#saved-status")).toContainText(
    "Shared with everyone",
  );
}
function xlsx(rows) {
  const escape = (s) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  const files = {
    "[Content_Types].xml":
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Clients" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((row, index) => `<row r="${index + 1}">${row.map((cell, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${escape(cell)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`,
  };
  return Buffer.from(
    zipSync(
      Object.fromEntries(
        Object.entries(files).map(([name, value]) => [name, strToU8(value)]),
      ),
    ),
  );
}

test("CSV and Google Sheets paste preserve quoted cells, newlines, and leading zeros", () => {
  const matrix = parseDelimited(
    'Client,Tracking number,Item description\r\n"Smith, Jane",0001234567,"Chair\nfor dining room"\r\n"Smith, Jane",0001234567,Duplicate',
  );
  const preview = previewImport(matrix, guessMapping(matrix[0]));
  expect(preview.errors).toEqual([]);
  expect(preview.duplicates).toBe(1);
  expect(preview.rows[0]).toMatchObject({
    client: "Smith, Jane",
    number: "0001234567",
    description: "Chair\nfor dining room",
  });
  expect(
    parseDelimited(
      "Name\tTracking\tItem\nCohen\t0000001234\tDining chair",
    )[1][1],
  ).toBe("0000001234");
  expect(() => parseDelimited('Name,Item\n"never closed')).toThrow(
    "closing quote",
  );
  expect(
    previewImport(
      [
        ["Client", "Tracking number"],
        ["Cohen", "?"],
      ],
      { client: 0, number: 1 },
    ).errors,
  ).toHaveLength(1);
});

test("Google Sheets paste previews, maps client-only rows, imports safely, and skips existing entries", async ({
  page,
  request,
}) => {
  const client = `Google ${unique()}`;
  await start(page);
  await page
    .getByRole("button", { name: "Import spreadsheet", exact: true })
    .click();
  await page
    .getByLabel("Paste from Google Sheets or Excel")
    .fill(
      `Client\tTracking number\tItem description\n${client}\t0001234567\tDining chair\n${client} empty\t\t\n${client}\t0001234567\tDuplicate`,
    );
  await page.getByRole("button", { name: "Use pasted rows" }).click();
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.locator(".import-preview")).toContainText(
    "1 duplicate rows ignored",
  );
  let snapshot = await (await request.get(endpoint)).json();
  expect(snapshot.folders.some((folder) => folder.name === client)).toBeFalsy();
  await page.getByRole("button", { name: "Import reviewed rows" }).click();
  await expect(page.locator("#saved-status")).toContainText("Import complete");
  snapshot = await (await request.get(endpoint)).json();
  const folder = snapshot.folders.find((folder) => folder.name === client);
  expect(
    snapshot.entries.find((entry) => entry.folderId === folder.id),
  ).toMatchObject({ number: "0001234567", description: "Dining chair" });
  expect(
    snapshot.folders.some((folder) => folder.name === client + " empty"),
  ).toBeTruthy();
  const result = await put(request, {
    action: "import",
    rows: [{ client, number: "0001234567", description: "Must not overwrite" }],
  });
  expect(result.skipped).toBe(1);
  const after = await (await request.get(endpoint)).json();
  expect(
    after.entries.find((entry) => entry.folderId === folder.id).description,
  ).toBe("Dining chair");
});

test("Excel upload reads real xlsx text cells and CSV upload blocks invalid rows before writes", async ({
  page,
  request,
}) => {
  const client = `Excel ${unique()}`;
  await start(page);
  await page
    .getByRole("button", { name: "Import spreadsheet", exact: true })
    .click();
  await page.getByLabel("Spreadsheet file").setInputFiles({
    name: "clients.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: xlsx([
      ["Client", "Tracking number", "Item description"],
      [client, "0000012345", "Console table"],
    ]),
  });
  await expect(page.locator(".import-mapping")).toContainText(
    "Client (required)",
  );
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.locator(".import-preview")).toContainText("0000012345");
  await page.getByRole("button", { name: "Import reviewed rows" }).click();
  await expect(page.locator("#saved-status")).toContainText("Import complete");
  await page
    .getByRole("button", { name: "Import spreadsheet", exact: true })
    .click();
  await page.getByLabel("Spreadsheet file").setInputFiles({
    name: "bad.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Client,Tracking number\nBad ${client},?`),
  });
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(page.locator(".import-preview")).toContainText("1 invalid rows");
  await expect(
    page.getByRole("button", { name: "Import reviewed rows" }),
  ).toHaveCount(0);
  const snapshot = await (await request.get(endpoint)).json();
  expect(
    snapshot.folders.some((folder) => folder.name === `Bad ${client}`),
  ).toBeFalsy();
});

test("folders rename and numbers move with version checks, destination collisions preserve data", async ({
  request,
}) => {
  const from = await put(request, {
      action: "folder",
      name: `Move ${unique()}`,
    }),
    to = await put(request, { action: "folder", name: `Target ${unique()}` });
  let entry = await put(request, {
    action: "entry",
    folderId: from.id,
    number: "TESTMOVE123",
    description: "Chair",
  });
  const renamed = await put(request, {
    action: "rename",
    folderId: from.id,
    name: from.name + " renamed",
    baseVersion: from.version,
  });
  expect(renamed.name).toContain("renamed");
  expect(
    (
      await request.put(endpoint, {
        data: {
          action: "rename",
          folderId: from.id,
          name: "Stale",
          baseVersion: from.version,
        },
      })
    ).status(),
  ).toBe(400);
  const edited = await put(request, {
    action: "entry",
    folderId: from.id,
    number: entry.number,
    description: "Updated chair",
    baseVersion: entry.version,
  });
  expect(
    (
      await request.put(endpoint, {
        data: {
          action: "entry",
          folderId: from.id,
          number: entry.number,
          description: "Stale overwrite",
          baseVersion: entry.version,
        },
      })
    ).status(),
  ).toBe(400);
  const moved = await put(request, {
    action: "move",
    folderId: from.id,
    targetId: to.id,
    number: entry.number,
    baseVersion: edited.version,
  });
  expect(moved.folderId).toBe(to.id);
  await put(request, {
    action: "entry",
    folderId: from.id,
    number: entry.number,
    description: "Another listing",
  });
  expect(
    (
      await request.put(endpoint, {
        data: {
          action: "move",
          folderId: to.id,
          targetId: from.id,
          number: entry.number,
          baseVersion: moved.version,
        },
      })
    ).status(),
  ).toBe(400);
});

test("folder and individual deletions are recoverable and stale edits cannot overwrite restored entries", async ({
  request,
}) => {
  const folder = await put(request, {
    action: "folder",
    name: `Recovery ${unique()}`,
  });
  const entry = await put(request, {
    action: "entry",
    folderId: folder.id,
    number: "TESTRECOVER",
    description: "Chair",
  });
  await put(request, {
    action: "delete-folder",
    folderId: folder.id,
    entryCount: 1,
    baseVersion: folder.version,
  });
  let snapshot = await (await request.get(endpoint)).json();
  const deleted = snapshot.trash.find((item) => item.folder.id === folder.id);
  expect(deleted.count).toBe(1);
  await put(request, { action: "restore", trashId: deleted.id });
  snapshot = await (await request.get(endpoint)).json();
  const restored = snapshot.entries.find((item) => item.folderId === folder.id);
  expect(restored.description).toBe("Chair");
  expect(restored.version).toBeGreaterThan(entry.version);
  expect(
    (
      await request.put(endpoint, {
        data: {
          action: "entry",
          folderId: folder.id,
          number: entry.number,
          description: "Stale",
          baseVersion: entry.version,
        },
      })
    ).status(),
  ).toBe(400);
  await put(request, {
    action: "remove",
    folderId: folder.id,
    number: entry.number,
    baseVersion: restored.version,
  });
  snapshot = await (await request.get(endpoint)).json();
  await put(request, {
    action: "restore",
    trashId: snapshot.trash.find(
      (item) => item.folder.id === folder.id && item.type === "number",
    ).id,
  });
  expect(
    (await (await request.get(endpoint)).json()).entries.some(
      (item) => item.folderId === folder.id,
    ),
  ).toBeTruthy();
});

test("saved shipment context, manual filters, and Back to client preserve the working view", async ({
  page,
  request,
}) => {
  const name = `Context ${unique()}`,
    folder = await put(request, { action: "folder", name });
  const entry = await put(request, {
    action: "entry",
    folderId: folder.id,
    number: "TESTCONTEXT123",
    description: "Dining chair",
    supplier: "Test supplier",
    status: "Delayed",
  });
  await start(page);
  await page.locator("#saved-search").fill(name);
  await page.locator(".folder-button").filter({ hasText: name }).click();
  await page.getByLabel("Show shipments").selectOption("Delayed");
  await page.locator(".saved-entry-open").click();
  await expect(
    page.getByLabel("Project / client reference", { exact: true }),
  ).toHaveValue(name);
  await expect(page.getByLabel("Item / room", { exact: true })).toHaveValue(
    "Dining chair",
  );
  await expect(page.getByLabel("Supplier", { exact: true })).toHaveValue(
    "Test supplier",
  );
  await expect(page.getByLabel("Item / room", { exact: true })).toHaveAttribute(
    "readonly",
    "",
  );
  await page
    .getByRole("button", { name: "Back to saved numbers", exact: false })
    .click();
  await expect(page.locator("#saved-search")).toHaveValue(name);
  await expect(page.getByLabel("Show shipments")).toHaveValue("Delayed");
  await page.getByLabel("Show shipments").selectOption("Received");
  await expect(page.locator(".saved-entry")).toHaveCount(0);
  await page.getByLabel("Show shipments").selectOption("Delayed");
  await expect(page.locator(".saved-entry")).toHaveCount(1);
});

test("shared backup includes directory and notes and restores missing data without overwriting", async ({
  page,
  request,
}) => {
  const name = `Backup ${unique()}`,
    folder = await put(request, { action: "folder", name });
  const entry = await put(request, {
    action: "entry",
    folderId: folder.id,
    number: `TESTBACKUP${unique()}`.toUpperCase(),
    description: "Desk",
  });
  await request.put(`http://127.0.0.1:8787/api/shipments/${entry.number}`, {
    data: { details: { notes: "Keep this shared note" }, baseVersion: 0 },
  });
  // Isolate the export fixture so this check exercises exactly its own saved records.
  await page.route("**/api/saved", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({
          json: { folders: [folder], entries: [entry], trash: [] },
        })
      : route.continue(),
  );
  await start(page);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download shared backup" }).click();
  const download = await downloaded;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.notes[entry.number].notes).toBe("Keep this shared note");
  expect(backup.folders[0].name).toBe(name);
  backup.folders.push({ id: "new-imported", name: name + " restored" });
  backup.entries.push({
    folderId: "new-imported",
    number: `RESTORE${unique()}`.toUpperCase(),
    description: "Lamp",
  });
  await page.locator("#shared-backup-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByRole("button", { name: "Restore missing data" }).click();
  await expect(page.locator("#saved-status")).toContainText("Backup restored");
  const snapshot = await (await request.get(endpoint)).json();
  expect(
    snapshot.folders.some((item) => item.name === name + " restored"),
  ).toBeTruthy();
  expect(
    (
      await (
        await request.get(`http://127.0.0.1:8787/api/shipments/${entry.number}`)
      ).json()
    ).details.notes,
  ).toBe("Keep this shared note");
});

test("rename, move, and Recently deleted controls work on a phone without horizontal overflow", async ({
  page,
  request,
}) => {
  const name = `Phone ${unique()}`,
    from = await put(request, { action: "folder", name }),
    to = await put(request, { action: "folder", name: name + " destination" });
  await put(request, {
    action: "entry",
    folderId: from.id,
    number: "TESTPHONE123",
    description: "Entry console",
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await start(page);
  await page.locator("#saved-search").fill(name);
  await page
    .locator(".folder-button")
    .filter({ hasText: name })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Rename folder", exact: true })
    .click();
  await page.getByLabel("Client name", { exact: true }).fill(name + " renamed");
  await page.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(page.locator("#folder-title")).toHaveText(name + " renamed");
  await page
    .getByRole("button", { name: "Move TESTPHONE123", exact: true })
    .click();
  await page.getByLabel("Destination client").selectOption(to.id);
  await page.getByRole("button", { name: "Move number", exact: true }).click();
  await expect(page.locator("#saved-status")).toContainText("Number moved");
  await page
    .locator(".folder-button")
    .filter({ hasText: name + " destination" })
    .click();
  await expect(page.locator(".saved-entry-open")).toContainText(
    "Entry console",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Delete folder", exact: true })
    .click();
  await expect(page.locator("#saved-status")).toContainText("Recently deleted");
  await page
    .getByRole("button", { name: "Recently deleted", exact: false })
    .click();
  const trash = page
    .locator(".trash-row")
    .filter({ hasText: name + " destination" });
  await trash.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(trash).toHaveCount(0);
  const snapshot = await (await request.get(endpoint)).json();
  expect(
    snapshot.entries.some(
      (entry) => entry.folderId === to.id && entry.number === "TESTPHONE123",
    ),
  ).toBeTruthy();
});

test("import batches roll back invalid rows and competing directory edits cannot overwrite", async ({
  request,
}) => {
  const name = `Atomic ${unique()}`;
  const invalid = await request.put(endpoint, {
    data: {
      action: "import",
      rows: [
        { client: name, number: "TESTATOMIC123", description: "Chair" },
        { client: name, number: "?", description: "Invalid" },
      ],
    },
  });
  expect(invalid.status()).toBe(400);
  let snapshot = await (await request.get(endpoint)).json();
  expect(snapshot.folders.some((folder) => folder.name === name)).toBeFalsy();
  const folder = await put(request, { action: "folder", name });
  const entry = await put(request, {
    action: "entry",
    folderId: folder.id,
    number: "TESTATOMIC123",
    description: "Chair",
  });
  const responses = await Promise.all(
    ["First edit", "Second edit"].map((description) =>
      request.put(endpoint, {
        data: {
          action: "entry",
          folderId: folder.id,
          number: entry.number,
          description,
          baseVersion: entry.version,
        },
      }),
    ),
  );
  expect(responses.filter((response) => response.ok())).toHaveLength(1);
  snapshot = await (await request.get(endpoint)).json();
  expect(
    snapshot.entries.find((item) => item.folderId === folder.id).version,
  ).toBeGreaterThan(entry.version);
});

test("choosing an unreadable spreadsheet clears an earlier import preview", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Import spreadsheet", exact: true })
    .click();
  await page
    .getByLabel("Paste from Google Sheets or Excel")
    .fill("Client\nPreview draft");
  await page.getByRole("button", { name: "Use pasted rows" }).click();
  await page.getByRole("button", { name: "Review import" }).click();
  await expect(
    page.getByRole("button", { name: "Import reviewed rows" }),
  ).toBeEnabled();
  await page
    .getByLabel("Spreadsheet file")
    .setInputFiles({
      name: "invalid.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from("not an Excel file"),
    });
  await expect(
    page.getByRole("button", { name: "Import reviewed rows" }),
  ).toHaveCount(0);
  await expect(page.locator(".import-mapping")).toBeEmpty();
});
