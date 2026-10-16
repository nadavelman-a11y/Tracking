import {
  loadSharedNotes,
  saveSharedNotes,
  SharedNotesConflict,
} from "./shared-notes.js";

export function connectSharedDetails({
  number,
  form,
  status,
  loadLatest,
  localDetails,
  drafts,
  versions,
  cached,
  onRecord,
  persist,
  decorateDetails = (details) => details,
}) {
  let closed = false,
    loading = false,
    saving = false,
    initialized = false;
  let baseVersion = drafts.has(number) ? versions.get(number) : cached?.version;
  let conflict = null;
  const saveButton = form.querySelector('button[type="submit"]');
  const controls = [...form.querySelectorAll("input, textarea")];
  const fill = (details) => {
    for (const [key, value] of Object.entries(decorateDetails(details)))
      form.elements.namedItem(key).value = value;
  };
  const setStatus = (text, state = "") => {
    status.textContent = text;
    status.dataset.state = state;
  };
  const syncButtons = () => {
    saveButton.disabled =
      saving || baseVersion === undefined || Boolean(conflict);
    loadLatest.hidden = !conflict;
    loadLatest.disabled = saving;
    controls.forEach((control) => {
      control.disabled = saving;
    });
  };
  const describeRecord = (record) =>
    record.version === 0
      ? "No shared notes yet. Save details to share them."
      : `Shared notes are up to date. Updated ${new Date(record.updatedAt).toLocaleString()}.`;
  const showConflict = (record) => {
    conflict = record;
    setStatus(
      "Someone updated this shipment. Your draft is kept. Loading the shared version replaces your unsaved fields.",
      "conflict",
    );
    syncButtons();
  };

  fill(drafts.get(number) || localDetails);
  setStatus("Loading shared notes…");
  syncButtons();

  async function refresh() {
    if (closed || loading || saving) return;
    loading = true;
    try {
      const record = await loadSharedNotes(number);
      if (closed) return;
      onRecord(record);
      const dirty = drafts.has(number);
      if (
        dirty &&
        (baseVersion === undefined
          ? record.version > 0
          : record.version !== baseVersion)
      ) {
        showConflict(record);
      } else if (!dirty) {
        if (
          !initialized &&
          record.version === 0 &&
          Object.values(localDetails).some(Boolean)
        ) {
          fill(localDetails);
          drafts.set(number, { ...localDetails });
          versions.set(number, 0);
          setStatus(
            "Browser details are ready to share. Select “Save details” to share them with the team.",
            "unsaved",
          );
        } else {
          fill(record.details);
          setStatus(describeRecord(record), "saved");
        }
        baseVersion = record.version;
      } else {
        if (baseVersion === undefined) {
          baseVersion = record.version;
          versions.set(number, record.version);
        }
        if (!conflict)
          setStatus(
            "Unsaved changes. Select “Save details” to share them.",
            "unsaved",
          );
      }
      initialized = true;
    } catch {
      if (!closed)
        setStatus(
          "Shared notes are unavailable right now. Your browser details and draft are kept. Reconnecting automatically…",
          "error",
        );
    } finally {
      loading = false;
      if (!closed) syncButtons();
    }
  }

  const onInput = () => {
    if (!drafts.has(number)) versions.set(number, baseVersion);
    drafts.set(number, Object.fromEntries(new FormData(form)));
    if (!conflict)
      setStatus(
        "Unsaved changes. Select “Save details” to share them.",
        "unsaved",
      );
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (saving || baseVersion === undefined || conflict) return;
    const details = decorateDetails(Object.fromEntries(new FormData(form)));
    saving = true;
    setStatus("Saving shared details…");
    syncButtons();
    try {
      const record = await saveSharedNotes(number, details, baseVersion);
      if (
        JSON.stringify(drafts.get(number)) === JSON.stringify(details) ||
        !drafts.has(number)
      ) {
        drafts.delete(number);
        versions.delete(number);
      }
      let backupSaved = true;
      try {
        persist(record.details);
      } catch {
        backupSaved = false;
      }
      if (closed) return;
      baseVersion = record.version;
      onRecord(record);
      setStatus(
        backupSaved
          ? "Shared details saved. Others viewing this number will update automatically."
          : "Shared details saved. A browser backup could not be updated.",
        "saved",
      );
    } catch (error) {
      if (closed) return;
      if (error instanceof SharedNotesConflict) {
        onRecord(error.current);
        showConflict(error.current);
      } else
        setStatus(
          "Couldn’t confirm the shared save. Your draft is kept; please try again.",
          "error",
        );
    } finally {
      saving = false;
      if (!closed) syncButtons();
    }
  };

  const useShared = () => {
    if (!conflict) return;
    const record = conflict;
    fill(record.details);
    baseVersion = record.version;
    conflict = null;
    drafts.delete(number);
    versions.delete(number);
    setStatus(describeRecord(record), "saved");
    syncButtons();
  };
  const onVisible = () => {
    if (!document.hidden) refresh();
  };
  form.addEventListener("input", onInput);
  form.addEventListener("submit", onSubmit);
  loadLatest.addEventListener("click", useShared);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", onVisible);
  const timer = setInterval(onVisible, 10000);
  refresh();
  return () => {
    closed = true;
    clearInterval(timer);
    form.removeEventListener("input", onInput);
    form.removeEventListener("submit", onSubmit);
    loadLatest.removeEventListener("click", useShared);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("focus", onVisible);
  };
}
