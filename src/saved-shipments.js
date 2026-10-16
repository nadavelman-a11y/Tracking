import { sharedNotesEnabled, sharedNotesURL } from './shared-notes.js';

export function mountSavedShipments({ openShipment }) {
  const dialog = document.createElement('dialog');
  dialog.className = 'saved-dialog';
  dialog.setAttribute('aria-labelledby', 'saved-title');
  dialog.innerHTML = `
    <div class="saved-heading"><div><div class="eyebrow">THE STUDIO DIRECTORY</div><h2 id="saved-title">Saved no.s</h2></div><button type="button" class="text-button" id="close-saved">Close ×</button></div>
    <p class="saved-intro">Client folders, shared with the team. Select a number to open its shipment.</p>
    <label class="saved-search-label" for="saved-search">Find a client, number, or item</label><input id="saved-search" type="search" placeholder="Search saved shipments…" autocomplete="off">
    <p id="saved-status" role="status" aria-live="polite"></p>
    <div class="saved-layout"><aside class="saved-sidebar"><h3>Client folders <span id="folder-count"></span></h3><form id="folder-form"><label for="folder-name">New client folder</label><div class="saved-inline"><input id="folder-name" name="name" maxlength="120" required placeholder="Client name"><button class="outline-button" type="submit">Add folder</button></div></form><div id="folder-list" class="folder-list" aria-label="Client folders"></div></aside>
    <section class="saved-content" aria-labelledby="folder-title"><div class="saved-folder-heading"><h3 id="folder-title">Choose a client folder</h3><span id="entry-count"></span></div><p id="folder-empty">Add your first folder to start organizing shipments.</p>
    <form id="saved-entry-form" hidden><h4>Add tracking number</h4><label for="saved-number">Tracking number</label><input id="saved-number" name="number" maxlength="50" required pattern="[A-Za-z0-9-]{5,50}" autocapitalize="characters" placeholder="Enter tracking number"><label for="saved-description">Item description</label><input id="saved-description" name="description" maxlength="200" required placeholder="e.g. Chair for dining room"><div class="saved-entry-actions"><button class="primary-button" type="submit">Save number</button><button class="text-button" type="button" id="cancel-saved-edit" hidden>Cancel edit</button></div><p class="input-hint">An existing number in this folder updates its description.</p></form>
    <div id="saved-entry-list" class="saved-entry-list"></div></section></div>`;
  document.body.append(dialog);
  const $ = selector => dialog.querySelector(selector);
  const status = $('#saved-status'), folderForm = $('#folder-form'), entryForm = $('#saved-entry-form');
  let data = { folders: [], entries: [] }, selected = null, busy = false, loading = false, ready = false;
  let returnFocus;
  const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true });
  const message = (text, error = false) => { status.textContent = text; status.dataset.state = error ? 'error' : ''; };
  async function api(body) {
    const response = await fetch(`${sharedNotesURL}/api/saved`, {
      method: body ? 'PUT' : 'GET', cache: 'no-store',
      headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Saved numbers could not be reached. Please try again.');
    return result;
  }
  function render() {
    const query = $('#saved-search').value.trim().toLowerCase();
    const folderEntries = id => data.entries.filter(entry => entry.folderId === id);
    const matches = entry => `${entry.number} ${entry.description}`.toLowerCase().includes(query);
    const folders = [...data.folders].sort((a, b) => collator.compare(a.name, b.name));
    const visible = folders.filter(folder => !query || folder.name.toLowerCase().includes(query) || folderEntries(folder.id).some(matches));
    $('#folder-count').textContent = `(${folders.length})`;
    const list = $('#folder-list'); list.replaceChildren();
    for (const folder of visible) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'folder-button';
      button.setAttribute('aria-pressed', String(selected === folder.id));
      const name = document.createElement('span'); name.textContent = folder.name;
      const count = document.createElement('span'); count.textContent = folderEntries(folder.id).length;
      button.append(name, count);
      button.onclick = () => { selected = folder.id; resetEntry(); render(); };
      list.append(button);
    }
    if (!visible.length) { const p = document.createElement('p'); p.textContent = query ? 'No matching clients or shipments.' : 'Your client folders will appear here.'; list.append(p); }
    const folder = folders.find(item => item.id === selected);
    $('#folder-title').textContent = folder?.name || 'Choose a client folder';
    entryForm.hidden = !folder;
    const entries = folder ? folderEntries(folder.id).filter(entry => !query || folder.name.toLowerCase().includes(query) || matches(entry)).sort((a,b) => collator.compare(a.number,b.number)) : [];
    $('#entry-count').textContent = folder ? `${entries.length} ${entries.length === 1 ? 'shipment' : 'shipments'}` : '';
    $('#folder-empty').hidden = Boolean(entries.length);
    $('#folder-empty').textContent = !folder ? (folders.length ? 'Choose a client on the left to see its shipments.' : 'Add your first folder to start organizing shipments.') : query ? 'No matching shipments in this folder.' : 'No saved numbers yet. Add one below.';
    const rows = $('#saved-entry-list'); rows.replaceChildren();
    for (const entry of entries) {
      const row = document.createElement('div'); row.className = 'saved-entry';
      const open = document.createElement('button'); open.type = 'button'; open.className = 'saved-entry-open';
      const number = document.createElement('strong'); number.textContent = entry.number;
      const description = document.createElement('span'); description.textContent = ` — ${entry.description}`;
      open.append(number, description); open.onclick = () => { dialog.close(); openShipment(entry.number); };
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'text-button'; edit.textContent = 'Edit'; edit.setAttribute('aria-label', `Edit ${entry.number}`);
      edit.onclick = () => { $('#saved-number').value = entry.number; $('#saved-number').readOnly = true; $('#saved-description').value = entry.description; $('#cancel-saved-edit').hidden = false; $('#saved-description').focus(); };
      const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'text-button'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', `Remove ${entry.number} from folder`);
      remove.onclick = () => { if (confirm(`Remove ${entry.number} from ${folder.name}? Its shipment notes will be kept.`)) mutate({ action: 'remove', folderId: folder.id, number: entry.number }, () => { data.entries = data.entries.filter(item => !(item.folderId === folder.id && item.number === entry.number)); resetEntry(); }, 'Number removed from folder. Shipment notes kept.'); };
      row.append(open, edit, remove); rows.append(row);
    }
  }
  function resetEntry() { entryForm.reset(); $('#saved-number').readOnly = false; $('#cancel-saved-edit').hidden = true; }
  function setBusy(value) { busy = value; dialog.querySelectorAll('button[type="submit"]').forEach(button => { button.disabled = value || !ready; }); }
  async function refresh(quiet = false) {
    if (loading || busy || !sharedNotesEnabled) return;
    loading = true;
    if (!quiet) message('Loading shared folders…');
    try {
      data = await api(); ready = true;
      if (!data.folders.some(folder => folder.id === selected)) selected = null;
      if (!selected && data.folders.length) selected = [...data.folders].sort((a,b) => collator.compare(a.name,b.name))[0].id;
      render(); if (!quiet) message('Shared with everyone using this workspace.');
    } catch { message('Couldn’t refresh saved numbers. Check your connection and reopen Saved no.s to retry. Your form is kept.', true); }
    finally { loading = false; setBusy(false); }
  }
  async function mutate(body, onSuccess, success) {
    if (busy || loading || !ready) return;
    setBusy(true); message('Saving to the shared workspace…');
    try { const result = await api(body); onSuccess(result); render(); message(success); }
    catch (error) { message(`${error.message} Your form is kept.`, true); }
    finally { setBusy(false); }
  }
  folderForm.onsubmit = event => { event.preventDefault(); mutate({ action: 'folder', name: $('#folder-name').value }, folder => { if (!data.folders.some(item => item.id === folder.id)) data.folders.push(folder); selected = folder.id; folderForm.reset(); resetEntry(); $('#saved-search').value = ''; }, 'Client folder saved. Add a tracking number below.'); };
  entryForm.onsubmit = event => { event.preventDefault(); const folderId = selected; mutate({ action: 'entry', folderId, number: $('#saved-number').value, description: $('#saved-description').value }, entry => { data.entries = data.entries.filter(item => !(item.folderId === folderId && item.number === entry.number)); data.entries.push(entry); resetEntry(); }, 'Tracking number saved for the team.'); };
  $('#saved-search').oninput = render;
  $('#cancel-saved-edit').onclick = resetEntry;
  $('#close-saved').onclick = () => dialog.close();
  dialog.addEventListener('close', () => returnFocus?.focus());
  function open(number = '') {
    returnFocus = document.activeElement;
    if (!dialog.open) dialog.showModal();
    if (number) { resetEntry(); $('#saved-number').value = number; }
    if (!sharedNotesEnabled) { message('Shared folders are not connected in this offline preview.', true); ready = false; setBusy(false); return; }
    refresh();
  }
  document.querySelector('#open-saved').onclick = () => open();
  document.addEventListener('click', event => { const button = event.target.closest('[data-save-number]'); if (button) open(button.dataset.saveNumber); });
  setInterval(() => { if (dialog.open && !document.hidden) refresh(true); }, 10000);
  window.addEventListener('focus', () => { if (dialog.open) refresh(true); });
}
