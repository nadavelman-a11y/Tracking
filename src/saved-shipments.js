import {
  sharedNotesEnabled,
  sharedNotesURL,
  loadSharedNotes,
  saveSharedNotes,
} from "./shared-notes.js";
import { validateDetails, trackingPattern } from "../shared/shipment-schema.js";
import {
  shipmentStatuses,
  clientName,
  entryFields,
} from "../shared/directory-schema.js";
import {
  parseDelimited,
  readSpreadsheet,
  guessMapping,
  previewImport,
  importColumns,
} from "./spreadsheet.js";

const collator = new Intl.Collator("en", {
  sensitivity: "base",
  numeric: true,
});
const byName = (a, b) => collator.compare(a.name, b.name);
const node = (tag, text, cls) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (cls) element.className = cls;
  return element;
};
const button = (text, action, cls = "text-button") => {
  const element = node("button", text, cls);
  element.type = "button";
  element.onclick = action;
  return element;
};
const localDate = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
export function mountSavedShipments({ openShipment }) {
  const workspace = document.createElement("dialog");
  workspace.className = "saved-dialog saved-workspace shell";
  workspace.id = "saved-workspace";
  workspace.setAttribute("aria-labelledby", "saved-title");
  workspace.innerHTML = `
    <div class="saved-heading"><div><div class="eyebrow">THE STUDIO DELIVERY DESK</div><h2 id="saved-title" tabindex="-1">Saved numbers</h2></div><button type="button" class="text-button" id="close-saved">Close ×</button></div>
    <p class="saved-intro">Your clients and deliveries, together. Statuses and expected dates below are entered by the team; open a shipment for live carrier updates.</p>
    <div class="workspace-actions"><button class="outline-button" id="open-import" type="button">Import spreadsheet</button><button class="text-button" id="export-shared" type="button">Download shared backup</button><button class="text-button" id="restore-backup" type="button">Restore shared backup</button><button class="text-button" id="open-trash" type="button">Recently deleted <span id="trash-count"></span></button><input type="file" id="shared-backup-file" accept="application/json,.json" hidden></div>
    <div class="workspace-filters"><div><label for="saved-search">Find a client, number, item, or supplier</label><input id="saved-search" type="search" placeholder="Search saved shipments…" autocomplete="off"></div><div><label for="saved-scope">Search in</label><select id="saved-scope"><option value="all">All folders</option><option value="folder">This folder</option></select></div><div><label for="saved-filter">Show shipments</label><select id="saved-filter"><option value="all">All shipments</option><option value="soon">Arriving in 7 days</option><option value="overdue">Past expected date</option><option value="Delayed">Delayed</option><option value="Received">Received</option><option value="open">Not received</option></select></div></div>
    <p id="saved-status" role="status" aria-live="polite"></p>
    <div class="saved-layout"><aside class="saved-sidebar"><h3>Client folders <span id="folder-count"></span></h3><form id="folder-form"><label for="folder-name">New client folder</label><div class="saved-inline"><input id="folder-name" name="name" maxlength="120" required placeholder="Client name"><button class="outline-button" type="submit">Add folder</button></div></form><div id="folder-list" class="folder-list" aria-label="Client folders"></div></aside>
    <section class="saved-content" aria-labelledby="folder-title"><div class="saved-folder-heading"><h3 id="folder-title">Choose a client folder</h3><span id="entry-count"></span><button class="text-button" id="rename-folder" type="button" hidden>Rename folder</button><button type="button" class="text-button delete-folder" id="delete-folder" hidden>Delete folder</button></div><p id="folder-empty">Add your first folder or import your client spreadsheet.</p>
    <details id="entry-editor"><summary>Add tracking number</summary><form id="saved-entry-form" hidden><label for="saved-number">Tracking number</label><input id="saved-number" name="number" maxlength="50" required pattern="[A-Za-z0-9-]{5,50}" autocapitalize="characters" placeholder="Enter tracking number"><label for="saved-description">Item description</label><input id="saved-description" name="description" maxlength="200" required placeholder="e.g. Chair for dining room"><label for="saved-supplier">Shipment supplier</label><input id="saved-supplier" name="supplier" maxlength="120"><label for="saved-team-status">Team status (manual)</label><select id="saved-team-status" name="status"></select><label for="saved-expected">Expected date (team estimate)</label><input id="saved-expected" name="expected" type="date"><div class="saved-entry-actions"><button class="primary-button" type="submit">Save number</button><button class="text-button" type="button" id="cancel-saved-edit" hidden>Cancel edit</button></div><p class="input-hint">Choose Edit on a saved number to change its details.</p></form></details>
    <div id="saved-pagination" class="saved-pagination" aria-label="Shipment result pages"></div><div id="saved-entry-list" class="saved-entry-list"></div></section></div>`;
  document.body.append(workspace);
  const $ = (selector) => workspace.querySelector(selector);
  for (const value of shipmentStatuses)
    $("#saved-team-status").add(new Option(value || "Not set", value));
  const status = $("#saved-status"),
    folderForm = $("#folder-form"),
    entryForm = $("#saved-entry-form");
  let data = { folders: [], entries: [], trash: [] },
    selected = null,
    busy = false,
    loading = false,
    ready = false,
    editing = null;
  let returnY = 0,
    page = 1;
  const pageSize = 50;
  const message = (text, error = false) => {
    status.textContent = text;
    status.dataset.state = error ? "error" : "";
  };
  async function api(body) {
    const response = await fetch(`${sharedNotesURL}/api/saved`, {
      method: body ? "PUT" : "GET",
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "Saved numbers could not be reached. Please try again.",
      );
    return result;
  }
  function context(entry) {
    return {
      ...entry,
      client:
        data.folders.find((folder) => folder.id === entry.folderId)?.name || "",
    };
  }
  function render() {
    const focused = document.activeElement?.dataset?.rowAction;
    const query = $("#saved-search").value.trim().toLowerCase(),
      acrossAll = $("#saved-scope").value === "all";
    const filter = $("#saved-filter").value,
      globalSearch = acrossAll;
    const today = localDate(new Date()),
      end = new Date();
    end.setDate(end.getDate() + 7);
    const matchesFilter = (entry) =>
      filter === "all" ||
      (filter === "soon"
        ? entry.status !== "Received" &&
          entry.expected >= today &&
          entry.expected <= localDate(end)
        : filter === "overdue"
          ? entry.status !== "Received" &&
            entry.expected &&
            entry.expected < today
          : filter === "open"
            ? entry.status !== "Received"
            : entry.status === filter);
    const folderEntries = (id) =>
      data.entries.filter((entry) => entry.folderId === id);
    const matches = (entry) =>
      (!query ||
        `${entry.number} ${entry.description} ${entry.supplier || ""} ${data.folders.find((folder) => folder.id === entry.folderId)?.name || ""}`
          .toLowerCase()
          .includes(query)) &&
      matchesFilter(entry);
    const folders = [...data.folders].sort(byName);
    const visible = folders.filter(
      (folder) =>
        !acrossAll ||
        (!query && filter === "all") ||
        (!folderEntries(folder.id).length &&
          filter === "all" &&
          folder.name.toLowerCase().includes(query)) ||
        folderEntries(folder.id).some(matches),
    );
    $("#folder-count").textContent = `(${folders.length})`;
    $("#trash-count").textContent = data.trash?.length
      ? `(${data.trash.length})`
      : "";
    const list = $("#folder-list"),
      scrollTop = list.scrollTop;
    list.replaceChildren();
    for (const folder of visible) {
      const item = button(
        "",
        () => {
          selected = folder.id;
          $("#saved-scope").value = "folder";
          resetEntry();
          render();
        },
        "folder-button",
      );
      item.dataset.rowAction = `folder:${folder.id}`;
      item.setAttribute(
        "aria-pressed",
        String(!acrossAll && selected === folder.id),
      );
      item.append(
        node("span", folder.name),
        node("span", folderEntries(folder.id).length),
      );
      list.append(item);
    }
    list.scrollTop = scrollTop;
    if (!visible.length)
      list.append(
        node(
          "p",
          query || filter !== "all"
            ? "No matching clients or shipments."
            : "Your client folders will appear here.",
        ),
      );
    const folder = folders.find((item) => item.id === selected);
    $("#saved-scope").querySelector("[value=folder]").disabled = !folder;
    $("#folder-title").textContent = globalSearch
      ? query || filter !== "all"
        ? "Results across all folders"
        : "All saved shipments"
      : folder?.name || "Choose a client folder";
    for (const id of [
      "#saved-entry-form",
      "#entry-editor",
      "#delete-folder",
      "#rename-folder",
    ])
      $(id).hidden = !folder || globalSearch;
    const entries = (
      globalSearch ? data.entries : folder ? folderEntries(folder.id) : []
    )
      .filter(matches)
      .sort(
        (a, b) =>
          (a.expected || "9999").localeCompare(b.expected || "9999") ||
          collator.compare(a.number, b.number),
      );
    $("#entry-count").textContent =
      folder || globalSearch
        ? `${entries.length} ${entries.length === 1 ? "shipment" : "shipments"}`
        : "";
    $("#folder-empty").hidden = Boolean(entries.length);
    $("#folder-empty").textContent = globalSearch
      ? "No matching shipments across all folders."
      : !folder
        ? folders.length
          ? "Choose a client on the left to see its shipments."
          : "Add your first folder or import your client spreadsheet."
        : query || filter !== "all"
          ? "No matching shipments in this folder."
          : "No saved numbers yet. Add one or import a spreadsheet.";
    const rows = $("#saved-entry-list");
    rows.replaceChildren();
    page = Math.max(1, Math.min(page, Math.ceil(entries.length / pageSize)));
    const start = (page - 1) * pageSize;
    for (const entry of entries.slice(start, start + pageSize)) {
      const entryFolder = folders.find((item) => item.id === entry.folderId),
        row = node("article", undefined, "saved-entry");
      const open = button(
        "",
        () => {
          returnY = workspace.scrollTop;
          workspace.close();
          workspace.hidden = true;
          openShipment(entry.number, context(entry));
        },
        "saved-entry-open",
      );
      open.append(
        node("strong", entry.number),
        node("span", ` — ${entry.description}`),
      );
      if (globalSearch)
        open.append(
          node("small", entryFolder?.name || "", "saved-entry-client"),
        );
      const metadata = node("div", undefined, "shipment-metadata");
      metadata.append(
        node("span", entry.status || "Status not set", "team-status"),
        node(
          "span",
          entry.expected
            ? `Expected ${new Date(entry.expected + "T12:00:00").toLocaleDateString()}`
            : "No expected date",
        ),
        node("span", entry.supplier || "Supplier not set"),
      );
      const actions = node("div", undefined, "shipment-row-actions");
      const edit = button("Edit", () => startEdit(entry));
      edit.setAttribute("aria-label", `Edit ${entry.number}`);
      const copy = button("Copy number", async () => {
        try {
          await navigator.clipboard.writeText(entry.number);
          message("Tracking number copied.");
        } catch {
          message(
            "Could not copy automatically. Select the tracking number and copy it.",
            true,
          );
        }
      });
      copy.setAttribute("aria-label", `Copy ${entry.number}`);
      const move = button("Move", () => moveEntry(entry));
      move.setAttribute("aria-label", `Move ${entry.number}`);
      const remove = button("Remove", () => {
        if (
          confirm(
            `Remove ${entry.number} from ${entryFolder?.name}? You can recover it in Recently deleted. Shipment notes will be kept.`,
          )
        )
          mutate(
            {
              action: "remove",
              folderId: entry.folderId,
              number: entry.number,
              baseVersion: entry.version || 0,
            },
            () => resetEntry(),
            "Number moved to Recently deleted. Shipment notes kept.",
          );
      });
      remove.setAttribute("aria-label", `Remove ${entry.number} from folder`);
      for (const [key, control] of Object.entries({
        open,
        edit,
        copy,
        move,
        remove,
      })) {
        control.dataset.rowAction = `${entry.folderId}:${entry.number}:${key}`;
        control.disabled = busy;
      }
      actions.append(edit, copy, move, remove);
      row.append(open, metadata, actions);
      rows.append(row);
    }
    const pager = $("#saved-pagination");
    pager.replaceChildren();
    if (entries.length > pageSize) {
      const previous = button("Previous page", () => {
        page--;
        render();
      });
      previous.disabled = page === 1;
      previous.dataset.rowAction = "previous-page";
      const next = button("Next page", () => {
        page++;
        render();
      });
      next.disabled = start + pageSize >= entries.length;
      next.dataset.rowAction = "next-page";
      const range = node(
        "span",
        `${start + 1}–${Math.min(start + pageSize, entries.length)} of ${entries.length}`,
      );
      range.setAttribute("role", "status");
      pager.append(previous, range, next);
    }
    if (focused)
      [...workspace.querySelectorAll("[data-row-action]")]
        .find((element) => element.dataset.rowAction === focused)
        ?.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent("directory-updated"));
  }
  function resetEntry() {
    entryForm.reset();
    $("#saved-number").readOnly = false;
    $("#cancel-saved-edit").hidden = true;
    editing = null;
    page = 1;
    $("#entry-editor").open = false;
  }
  function startEdit(entry) {
    selected = entry.folderId;
    $("#saved-scope").value = "folder";
    render();
    editing = { ...entry };
    for (const key of [
      "number",
      "description",
      "supplier",
      "status",
      "expected",
    ])
      entryForm.elements.namedItem(key).value = entry[key] || "";
    $("#saved-number").readOnly = true;
    $("#cancel-saved-edit").hidden = false;
    $("#entry-editor").open = true;
    $("#saved-description").focus();
  }
  function setBusy(value) {
    busy = value;
    workspace
      .querySelectorAll("button:not(#close-saved), input[type=file]")
      .forEach((control) => {
        control.disabled = value || (!ready && control.id !== "refresh-saved");
      });
  }
  async function refresh(quiet = false) {
    if (loading || busy || !sharedNotesEnabled) return;
    loading = true;
    if (!quiet) message("Loading shared folders…");
    try {
      data = await api();
      data.trash ||= [];
      ready = true;
      if (!data.folders.some((folder) => folder.id === selected))
        selected = null;
      if (!selected && data.folders.length)
        selected = [...data.folders].sort(byName)[0].id;
      render();
      if (!quiet) message("Shared with everyone using this workspace.");
    } catch {
      message(
        "Couldn’t refresh saved numbers. Check your connection and choose Refresh. Your form is kept.",
        true,
      );
    } finally {
      loading = false;
      setBusy(false);
    }
  }
  const refreshButton = button("Refresh", () => refresh());
  refreshButton.id = "refresh-saved";
  $(".workspace-actions").append(refreshButton);
  async function mutate(body, onSuccess, success) {
    if (busy || loading || !ready) return false;
    setBusy(true);
    message("Saving to the shared workspace…");
    try {
      const result = await api(body);
      onSuccess(result);
      busy = false;
      await refresh(true);
      message(success);
      return true;
    } catch (error) {
      message(`${error.message} Your form is kept.`, true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  folderForm.onsubmit = (event) => {
    event.preventDefault();
    mutate(
      { action: "folder", name: $("#folder-name").value },
      (folder) => {
        selected = folder.id;
        folderForm.reset();
        resetEntry();
        $("#saved-search").value = "";
        $("#saved-filter").value = "all";
        $("#saved-scope").value = "folder";
        $("#entry-editor").open = true;
      },
      "Client folder saved. Add a tracking number below.",
    );
  };
  entryForm.onsubmit = (event) => {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(entryForm));
    const existing = data.entries.find(
      (entry) =>
        entry.folderId === selected &&
        entry.number === fields.number.trim().toUpperCase(),
    );
    if (existing && !editing) {
      message(
        "That number is already saved in this folder. Choose Edit on its row to change it.",
        true,
      );
      return;
    }
    mutate(
      {
        action: "entry",
        folderId: selected,
        ...fields,
        baseVersion: editing?.version || 0,
      },
      resetEntry,
      "Tracking number saved for the team.",
    );
  };
  $("#delete-folder").onclick = () => {
    const folder = data.folders.find((item) => item.id === selected);
    if (!folder || busy || loading) return;
    const entryCount = data.entries.filter(
      (entry) => entry.folderId === folder.id,
    ).length;
    if (
      !confirm(
        `Delete “${folder.name}” and its ${entryCount} saved ${entryCount === 1 ? "number" : "numbers"} for everyone? You can restore them in Recently deleted. Shipment notes will be kept.`,
      )
    )
      return;
    mutate(
      {
        action: "delete-folder",
        folderId: folder.id,
        entryCount,
        baseVersion: folder.version || 0,
      },
      () => {
        selected = null;
        $("#saved-scope").value = "all";
        resetEntry();
      },
      "Folder and its saved numbers moved to Recently deleted. Shipment notes kept.",
    );
  };
  function modal(title) {
    const dialog = node("dialog", undefined, "workspace-modal");
    const heading = node("h2", title);
    heading.id = `modal-${crypto.randomUUID()}`;
    dialog.setAttribute("aria-labelledby", heading.id);
    const close = button("Close ×", () => dialog.close());
    const top = node("div", undefined, "saved-heading");
    top.append(heading, close);
    dialog.append(top);
    document.body.append(dialog);
    const returnFocus = document.activeElement;
    dialog.addEventListener("close", () => {
      dialog.remove();
      returnFocus?.focus();
    });
    dialog.showModal();
    return dialog;
  }
  function formField(form, label, id, type = "text") {
    const caption = node("label", label);
    caption.htmlFor = id;
    const input = node(type === "select" ? "select" : "input");
    input.id = id;
    if (type !== "select") input.type = type;
    form.append(caption, input);
    return input;
  }
  $("#rename-folder").onclick = () => {
    const folder = data.folders.find((item) => item.id === selected);
    if (!folder) return;
    const dialog = modal("Rename client folder"),
      form = node("form"),
      input = formField(form, "Client name", "rename-name");
    input.value = folder.name;
    input.maxLength = 120;
    input.required = true;
    const save = node("button", "Save name", "primary-button");
    save.type = "submit";
    form.append(save);
    dialog.append(form);
    input.focus();
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      const ok = await mutate(
        {
          action: "rename",
          folderId: folder.id,
          name: input.value,
          baseVersion: folder.version || 0,
        },
        () => {},
        "Client folder renamed.",
      );
      if (ok) dialog.close();
      else {
        let error = form.querySelector("[role=alert]");
        if (!error) {
          error = node("p");
          error.setAttribute("role", "alert");
          form.append(error);
        }
        error.textContent = status.textContent;
        save.disabled = false;
      }
    };
  };
  function moveEntry(entry) {
    const dialog = modal("Move shipment"),
      form = node("form"),
      select = formField(form, "Destination client", "move-target", "select");
    for (const folder of [...data.folders].sort(byName))
      if (folder.id !== entry.folderId)
        select.add(new Option(folder.name, folder.id));
    const save = node("button", "Move number", "primary-button");
    save.type = "submit";
    save.disabled = !select.options.length;
    form.append(save);
    dialog.append(form);
    if (!select.options.length)
      form.append(
        node("p", "Add another client folder before moving this shipment."),
      );
    form.onsubmit = async (event) => {
      event.preventDefault();
      save.disabled = true;
      const ok = await mutate(
        {
          action: "move",
          folderId: entry.folderId,
          targetId: select.value,
          number: entry.number,
          baseVersion: entry.version || 0,
        },
        () => resetEntry(),
        "Number moved to its new client folder.",
      );
      if (ok) dialog.close();
      else {
        form.append(node("p", status.textContent));
        save.disabled = false;
      }
    };
  }
  $("#open-trash").onclick = () => {
    const dialog = modal("Recently deleted");
    dialog.append(
      node(
        "p",
        "Restore folders and numbers removed from this shared workspace. Shipment notes are kept separately.",
      ),
    );
    for (const item of [...data.trash].sort((a, b) =>
      b.deletedAt.localeCompare(a.deletedAt),
    )) {
      const row = node("div", undefined, "trash-row");
      row.append(
        node(
          "span",
          `${item.folder.name}${item.type === "number" ? ` — ${item.number}` : ` — ${item.count} saved numbers`}`,
        ),
      );
      const restore = button("Restore", async () => {
        restore.disabled = true;
        const ok = await mutate(
          { action: "restore", trashId: item.id },
          () => {},
          "Deleted item restored.",
        );
        if (ok) row.remove();
        else {
          row.append(node("p", status.textContent));
          restore.disabled = false;
        }
      });
      row.append(restore);
      dialog.append(row);
    }
    if (!data.trash.length) dialog.append(node("p", "No deleted items."));
  };
  function downloadJSON(value, name) {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
    );
    const link = node("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  $("#export-shared").onclick = async () => {
    if (busy) return;
    setBusy(true);
    message("Preparing shared backup…");
    try {
      const snapshot = await api(),
        numbers = [...new Set(snapshot.entries.map((entry) => entry.number))],
        notes = {};
      let done = 0;
      for (let offset = 0; offset < numbers.length; offset += 4) {
        await Promise.all(
          numbers.slice(offset, offset + 4).map(async (number) => {
            notes[number] = (await loadSharedNotes(number)).details;
          }),
        );
        done = Math.min(offset + 4, numbers.length);
        message(`Backing up saved shipments: ${done} of ${numbers.length}…`);
      }
      downloadJSON(
        {
          app: "nina-elman-shared-workspace",
          version: 1,
          exportedAt: new Date().toISOString(),
          folders: snapshot.folders,
          entries: snapshot.entries,
          notes,
        },
        `nina-elman-shared-${localDate(new Date())}.json`,
      );
      message(
        "Backup downloaded: active client folders, saved numbers, and their shared shipment details and notes. Recently deleted items are kept online; restore them first to include them.",
      );
    } catch {
      message(
        "Backup could not be completed. No partial backup was downloaded. Try again.",
        true,
      );
    } finally {
      setBusy(false);
    }
  };
  $("#restore-backup").onclick = () => $("#shared-backup-file").click();
  $("#shared-backup-file").onchange = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      if (file.size > 10_000_000)
        throw new Error("Use a shared backup smaller than 10 MB.");
      const backup = JSON.parse(await file.text());
      if (
        backup.app !== "nina-elman-shared-workspace" ||
        backup.version !== 1 ||
        !Array.isArray(backup.folders) ||
        !Array.isArray(backup.entries) ||
        backup.entries.length > 5000 ||
        backup.folders.length > 2000 ||
        !backup.notes ||
        typeof backup.notes !== "object" ||
        Array.isArray(backup.notes)
      )
        throw new Error("Choose a valid shared workspace backup.");
      const rows = backup.entries.map((entry) => ({
        client: backup.folders.find((folder) => folder.id === entry.folderId)
          ?.name,
        ...entry,
      }));
      for (const folder of backup.folders) rows.push({ client: folder.name });
      rows.forEach((row) => {
        clientName(row.client);
        if (row.number) entryFields(row);
      });
      for (const [number, details] of Object.entries(backup.notes)) {
        if (
          !trackingPattern.test(number) ||
          !backup.entries.some((entry) => entry.number === number)
        )
          throw new Error("Backup notes must belong to its saved shipments.");
        validateDetails(details);
      }
      const dialog = modal("Restore shared backup");
      dialog.append(
        node(
          "p",
          `${backup.folders.length} client folders and ${backup.entries.length} saved numbers. Existing numbers and shared notes will be kept. This adds missing items without replacing current team data.`,
        ),
      );
      const restore = button(
        "Restore missing data",
        async () => {
          restore.disabled = true;
          setBusy(true);
          let added = 0,
            skipped = 0;
          try {
            for (let i = 0; i < rows.length; i += 20) {
              const result = await api({
                action: "import",
                rows: rows.slice(i, i + 20),
              });
              added += result.added;
              skipped += result.skipped;
            }
            let notesSkipped = 0;
            for (const [number, details] of Object.entries(backup.notes)) {
              const current = await loadSharedNotes(number);
              if (current.version === 0)
                await saveSharedNotes(number, details, 0);
              else notesSkipped++;
            }
            busy = false;
            await refresh(true);
            message(
              `Backup restored: ${added} numbers added; ${skipped} existing numbers and ${notesSkipped} existing note records kept.`,
            );
            dialog.close();
          } catch (error) {
            dialog.append(
              node(
                "p",
                `Restore stopped: ${error.message} Successfully added items remain saved. Retry safely; existing data is skipped.`,
              ),
            );
            restore.disabled = false;
          } finally {
            setBusy(false);
          }
        },
        "primary-button",
      );
      dialog.append(restore);
    } catch (error) {
      message(error.message, true);
    }
  };
  function openImport() {
    const dialog = modal("Import spreadsheet");
    dialog.classList.add("import-modal");
    dialog.append(
      node(
        "p",
        "Upload Excel (.xlsx), CSV, or TSV, or copy rows—including headings—from Google Sheets and paste below. Client-only lists create folders. Files stay in your browser until you confirm the preview. First worksheet only; up to 5,000 rows. Format tracking-number columns as text to preserve leading zeros and long numbers. Expected dates use YYYY-MM-DD. Team statuses: Ordered, In transit, Arriving soon, Delayed, or Received; leave a column unmapped to omit it.",
      ),
    );
    const input = node("input");
    input.type = "file";
    input.accept = ".xlsx,.csv,.tsv,.txt";
    input.setAttribute("aria-label", "Spreadsheet file");
    const pasteLabel = node("label", "Paste from Google Sheets or Excel");
    pasteLabel.htmlFor = "import-paste";
    const paste = node("textarea");
    paste.id = "import-paste";
    paste.rows = 5;
    paste.placeholder = "Client\tTracking number\tItem description";
    const load = button(
      "Use pasted rows",
      () => {
        mappingArea.replaceChildren();
        preview.replaceChildren();
        prepared = null;
        try {
          setMatrix(parseDelimited(paste.value));
        } catch (error) {
          notice.textContent = error.message;
        }
      },
      "outline-button",
    );
    const notice = node("p");
    notice.setAttribute("role", "status");
    const mappingArea = node("div", undefined, "import-mapping"),
      preview = node("div", undefined, "import-preview");
    dialog.append(input, pasteLabel, paste, load, notice, mappingArea, preview);
    let matrix = [],
      mapping = {},
      prepared = null;
    input.onchange = async () => {
      mappingArea.replaceChildren();
      preview.replaceChildren();
      prepared = null;
      try {
        notice.textContent = "Reading spreadsheet…";
        setMatrix(await readSpreadsheet(input.files[0]));
      } catch (error) {
        notice.textContent = error.message;
      }
    };
    function setMatrix(rows) {
      if (rows.length < 2 || rows.length > 5001 || rows[0].length > 100)
        throw new Error(
          "Include headings and 1–5,000 data rows, up to 100 columns.",
        );
      matrix = rows;
      mapping = guessMapping(rows[0]);
      mappingArea.replaceChildren();
      preview.replaceChildren();
      notice.textContent = `${rows.length - 1} data rows found. Match the columns, then review.`;
      for (const [key, label] of Object.entries(importColumns)) {
        const wrapper = node("div"),
          caption = node(
            "label",
            label + (key === "client" ? " (required)" : ""),
          ),
          select = node("select");
        select.id = `map-${key}`;
        caption.htmlFor = select.id;
        select.add(new Option("Not included", "-1"));
        rows[0].forEach((heading, index) =>
          select.add(
            new Option(
              `${index + 1}. ${String(heading) || "Unnamed column"}`,
              String(index),
            ),
          ),
        );
        select.value = String(mapping[key]);
        select.onchange = () => {
          mapping[key] = Number(select.value);
          preview.replaceChildren();
          prepared = null;
        };
        wrapper.append(caption, select);
        mappingArea.append(wrapper);
      }
      mappingArea.append(button("Review import", review, "primary-button"));
    }
    function review() {
      try {
        prepared = previewImport(matrix, mapping);
        preview.replaceChildren();
        const existingFolders = new Map(
          data.folders.map((folder) => [folder.name.toLowerCase(), folder.id]),
        );
        const existing = prepared.rows.filter(
          (row) =>
            row.number &&
            data.entries.some(
              (entry) =>
                entry.folderId ===
                  existingFolders.get(row.client.toLowerCase()) &&
                entry.number === row.number,
            ),
        ).length;
        preview.append(
          node(
            "p",
            `${prepared.rows.length} valid rows · ${prepared.rows.filter((row) => row.number).length} shipment rows · ${prepared.duplicates} duplicate rows ignored · ${existing} existing numbers will be skipped.`,
          ),
        );
        if (prepared.errors.length) {
          preview.append(
            node(
              "p",
              `${prepared.errors.length} invalid rows. Fix these before importing; no data has been saved.`,
            ),
          );
          const errors = node("ul");
          prepared.errors
            .slice(0, 30)
            .forEach((error) => errors.append(node("li", error)));
          preview.append(errors);
          return;
        }
        const table = node("table"),
          head = node("tr");
        ["Client", "Tracking number", "Item"].forEach((text) =>
          head.append(node("th", text)),
        );
        table.append(head);
        prepared.rows.slice(0, 20).forEach((row) => {
          const tr = node("tr");
          [
            row.client,
            row.number || "Folder only",
            row.description || "",
          ].forEach((text) => tr.append(node("td", text)));
          table.append(tr);
        });
        preview.append(
          table,
          node(
            "p",
            "Preview shows the first 20 rows. Existing numbers and their details will not be overwritten. Missing item descriptions become “Shipment”.",
          ),
        );
        const apply = button(
          "Import reviewed rows",
          async () => {
            apply.disabled = true;
            input.disabled = true;
            load.disabled = true;
            mappingArea
              .querySelectorAll("select,button")
              .forEach((control) => (control.disabled = true));
            setBusy(true);
            let added = 0,
              skipped = 0,
              folders = 0;
            try {
              for (
                let offset = 0;
                offset < prepared.rows.length;
                offset += 20
              ) {
                const result = await api({
                  action: "import",
                  rows: prepared.rows.slice(offset, offset + 20),
                });
                added += result.added;
                skipped += result.skipped;
                folders += result.createdFolders;
                notice.textContent = `Importing ${Math.min(offset + 20, prepared.rows.length)} of ${prepared.rows.length} rows…`;
              }
              busy = false;
              await refresh(true);
              message(
                `Import complete: ${folders} folders and ${added} numbers added; ${skipped} existing numbers kept.`,
              );
              dialog.close();
            } catch (error) {
              notice.textContent = `Import stopped: ${error.message} Completed batches are saved. You can retry; existing numbers are skipped.`;
              apply.disabled = false;
              input.disabled = false;
              load.disabled = false;
              mappingArea
                .querySelectorAll("select,button")
                .forEach((control) => (control.disabled = false));
            } finally {
              setBusy(false);
            }
          },
          "primary-button",
        );
        apply.disabled = !prepared.rows.length;
        preview.append(apply);
      } catch (error) {
        notice.textContent = error.message;
      }
    }
  }
  $("#open-import").onclick = openImport;
  $("#saved-search").oninput = () => {
    page = 1;
    render();
  };
  $("#saved-scope").onchange = () => {
    page = 1;
    render();
  };
  $("#saved-filter").onchange = () => {
    page = 1;
    render();
  };
  $("#cancel-saved-edit").onclick = resetEntry;
  $("#close-saved").onclick = () => workspace.close();
  workspace.addEventListener("close", () => { workspace.hidden = true; });
  function open(number = "", back = false) {
    workspace.hidden = false;
    if (!workspace.open) workspace.showModal();
    if (number) {
      $("#saved-search").value = "";
      $("#saved-filter").value = "all";
      $("#saved-scope").value = "folder";
      render();
      $("#entry-editor").open = true;
      $("#saved-number").value = number;
    }
    $("#saved-title").focus({ preventScroll: true });
    if (back) workspace.scrollTop = returnY;
    if (!sharedNotesEnabled) {
      message(
        "Shared folders are not connected in this offline preview.",
        true,
      );
      ready = false;
      setBusy(false);
      return;
    }
    refresh(true);
  }
  document.querySelector("#open-saved").onclick = () => open();
  document.addEventListener("click", (event) => {
    const save = event.target.closest("[data-save-number]");
    if (save) open(save.dataset.saveNumber);
    if (event.target.closest("[data-back-client]")) open("", true);
  });
  setInterval(() => {
    if (!workspace.hidden && !document.hidden) refresh(true);
  }, 10000);
  window.addEventListener("focus", () => {
    if (!workspace.hidden) refresh(true);
  });
  workspace.hidden = true;
  setBusy(false);
  if (sharedNotesEnabled) refresh();
  return {
    contextFor: (number) => {
      const entries = data.entries.filter((entry) => entry.number === number);
      return entries.length === 1 ? context(entries[0]) : null;
    },
    getContext: (folderId, number) => {
      const entry = data.entries.find(
        (entry) => entry.folderId === folderId && entry.number === number,
      );
      return entry ? context(entry) : null;
    },
  };
}
