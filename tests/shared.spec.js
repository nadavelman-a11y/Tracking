import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const api = 'http://127.0.0.1:8787/api/shipments/';
const number = () => `TEST${randomUUID().replaceAll('-', '').toUpperCase()}`;
const url = 'http://127.0.0.1:5174';
async function openShipment(page, tracking) {
  await page.route('https://www.17track.net/externalcall.js', route => route.abort());
  await page.goto(url);
  await page.locator('#tracking-number').fill(tracking);
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Save details', exact: true })).toBeEnabled();
}

test('two separate browsers share notes by number without signing in and refresh automatically', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  try {
    const a = await first.newPage(), b = await second.newPage();
    const tracking = number();
    await openShipment(a, tracking);
    await b.clock.install();
    await openShipment(b, tracking);
    await a.getByLabel('Project / client reference', { exact: true }).fill('Shared project');
    await a.getByLabel('Team notes', { exact: true }).fill('The receiving team should call ahead.');
    await a.getByRole('button', { name: 'Save details', exact: true }).click();
    await expect(a.locator('#details-status')).toContainText('Shared details saved');
    await b.clock.runFor(10000);
    await expect(b.getByLabel('Team notes', { exact: true })).toHaveValue('The receiving team should call ahead.');
    await b.reload();
    await b.locator('.recent-chip').click();
    await expect(b.getByLabel('Project / client reference', { exact: true })).toHaveValue('Shared project');
    expect(await second.cookies()).toEqual([]);
  } finally { await first.close(); await second.close(); }
});

test('concurrent employee edits keep the losing draft and require loading the current version', async ({ browser }) => {
  const first = await browser.newContext(), second = await browser.newContext();
  try {
    const a = await first.newPage(), b = await second.newPage();
    const tracking = number();
    await openShipment(a, tracking); await openShipment(b, tracking);
    await a.getByLabel('Team notes', { exact: true }).fill('Saved by the first browser');
    await b.getByLabel('Team notes', { exact: true }).fill('Keep the second browser’s draft');
    await a.getByRole('button', { name: 'Save details', exact: true }).click();
    await expect(a.locator('#details-status')).toContainText('Shared details saved');
    await b.getByRole('button', { name: 'Save details', exact: true }).click();
    await expect(b.locator('#details-status')).toContainText('Someone updated this shipment');
    await expect(b.getByLabel('Team notes', { exact: true })).toHaveValue('Keep the second browser’s draft');
    await expect(b.getByRole('button', { name: 'Save details', exact: true })).toBeDisabled();
    await b.getByRole('button', { name: 'Load shared version' }).click();
    await expect(b.getByLabel('Team notes', { exact: true })).toHaveValue('Saved by the first browser');
  } finally { await first.close(); await second.close(); }
});

test('a failed shared save retains the draft and does not claim success', async ({ page }) => {
  await openShipment(page, number());
  await page.route('http://127.0.0.1:8787/api/shipments/**', route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await page.getByLabel('Team notes', { exact: true }).fill('Keep this draft during an outage');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#details-status')).toContainText('Couldn’t confirm the shared save');
  await expect(page.getByLabel('Team notes', { exact: true })).toHaveValue('Keep this draft during an outage');
});

test('the storage service isolates numbers, validates input, and prevents blind overwrites', async ({ request }) => {
  const tracking = number(), other = number();
  const first = await request.put(api + tracking, { data: { details: { notes: 'Original shared note' }, baseVersion: 0 } });
  expect(first.status()).toBe(200);
  expect((await first.json()).version).toBe(1);
  expect((await (await request.get(api + other)).json()).details.notes).toBe('');
  expect((await (await request.get(api + tracking.toLowerCase())).json()).details.notes).toBe('Original shared note');
  expect((await request.put(api + tracking, { data: { details: { notes: 'Stale write' }, baseVersion: 0 } })).status()).toBe(409);
  expect((await request.put(api + tracking, { data: { details: { notes: 'x'.repeat(2001) }, baseVersion: 1 } })).status()).toBe(400);
  expect((await request.put(api + tracking, { data: { details: { unexpected: 'value' }, baseVersion: 1 } })).status()).toBe(400);
  expect((await request.get('http://127.0.0.1:8787/api/shipments')).status()).toBe(404);
  expect((await request.get(api + tracking, { headers: { Origin: 'https://unconfigured.example' } })).status()).toBe(403);
  expect((await (await request.get(api + tracking)).json()).details.notes).toBe('Original shared note');
});

test('the storage transaction permits only one writer for a shared version', async ({ request }) => {
  const tracking = number();
  const responses = await Promise.all(['First note', 'Second note'].map(notes => request.put(api + tracking, { data: { details: { notes }, baseVersion: 0 } })));
  expect(responses.map(response => response.status()).sort()).toEqual([200, 409]);
  expect((await (await request.get(api + tracking)).json()).version).toBe(1);
});

test('existing browser notes can be shared without being replaced by an empty online record', async ({ page, request }) => {
  const tracking = number();
  await page.goto(url);
  await page.evaluate(({ tracking }) => localStorage.setItem('nina-elman-shipment-details', JSON.stringify({ [tracking]: { project: 'Existing browser project', notes: 'Existing browser note' } })), { tracking });
  await openShipment(page, tracking);
  await expect(page.getByLabel('Team notes', { exact: true })).toHaveValue('Existing browser note');
  await expect(page.locator('#details-status')).toContainText('ready to share');
  await page.getByRole('button', { name: 'Save details', exact: true }).click();
  await expect(page.locator('#details-status')).toContainText('Shared details saved');
  expect((await (await request.get(api + tracking)).json()).details).toMatchObject({ project: 'Existing browser project', notes: 'Existing browser note' });
});

test('an automatic refresh preserves an active draft when another browser changes the shared record', async ({ page, request }) => {
  const tracking = number();
  await page.clock.install();
  await openShipment(page, tracking);
  await page.getByLabel('Team notes', { exact: true }).fill('Keep my active draft');
  await request.put(api + tracking, { data: { details: { notes: 'Updated elsewhere' }, baseVersion: 0 } });
  await page.clock.runFor(10000);
  await expect(page.locator('#details-status')).toContainText('Someone updated this shipment');
  await expect(page.getByLabel('Team notes', { exact: true })).toHaveValue('Keep my active draft');
});

test('client folders sort alphabetically, share across browsers, and open saved numbers', async ({ browser, request }) => {
  const unique = randomUUID().slice(0, 8);
  const first = await browser.newContext(), second = await browser.newContext();
  const tracking = number();
  try {
    const a = await first.newPage(), b = await second.newPage();
    await a.goto(url);
    await a.getByRole('button', { name: 'Saved numbers', exact: true }).click();
    await expect(a.locator('#saved-status')).toContainText('Shared with everyone');
    for (const name of [`Zelda ${unique}`, `Alice ${unique}`]) {
      await a.getByLabel('New client folder', { exact: true }).fill(name);
      await a.getByRole('button', { name: 'Add folder', exact: true }).click();
      await expect(a.locator('#folder-title')).toHaveText(name);
    }
    await a.locator('#saved-number').fill(tracking.toLowerCase());
    await a.getByLabel('Item description', { exact: true }).fill('Chair for dining room');
    await a.getByRole('button', { name: 'Save number', exact: true }).click();
    await expect(a.locator('.saved-entry-open')).toContainText(`${tracking} — Chair for dining room`);
    await b.route('https://www.17track.net/externalcall.js', route => route.abort());
    await b.goto(url);
    await b.getByRole('button', { name: 'Saved numbers', exact: true }).click();
    await expect(b.locator('#saved-status')).toContainText('Shared with everyone');
    await b.locator('#saved-search').fill(unique);
    const names = await b.locator('.folder-button span:first-child').allTextContents();
    expect(names).toEqual([`Alice ${unique}`, `Zelda ${unique}`]);
    await b.locator('.folder-button').filter({ hasText: `Alice ${unique}` }).click();
    await expect(b.locator('.saved-entry-open')).toContainText('Chair for dining room');
    await b.getByRole('button', { name: `Edit ${tracking}`, exact: true }).click();
    await b.getByLabel('Item description', { exact: true }).fill('Dining chair — updated');
    await b.getByRole('button', { name: 'Save number', exact: true }).click();
    await expect(b.locator('.saved-entry-open')).toContainText('Dining chair — updated');
    await expect(b.locator('.saved-entry')).toHaveCount(1);
    await b.getByLabel('Search in', { exact: true }).selectOption('all');
    await b.locator('#saved-search').fill(tracking);
    await expect(b.locator('.folder-button')).toHaveCount(1);
    await b.locator('.saved-entry-open').click();
    await expect(b.locator('.saved-dialog')).not.toBeVisible();
    await expect(b.locator('#active-number')).toHaveText(tracking);
    // Directory changes must not overwrite the independent shipment notes record.
    expect((await (await request.get(api + tracking)).json()).version).toBe(0);
  } finally { await first.close(); await second.close(); }
});

test('saved directory validates input, deduplicates folders, and removes only the listing', async ({ request }) => {
  const endpoint = 'http://127.0.0.1:8787/api/saved';
  const name = `Directory ${randomUUID()}`;
  const folders = await Promise.all([name, name.toUpperCase()].map(name => request.put(endpoint, { data: { action: 'folder', name } }).then(r => r.json())));
  expect(folders[0].id).toBe(folders[1].id);
  const folderId = folders[0].id, tracking = number();
  await request.put(api + tracking, { data: { details: { notes: 'Keep these notes' }, baseVersion: 0 } });
  expect((await request.put(endpoint, { data: { action: 'entry', folderId, number: tracking, description: '' } })).status()).toBe(400);
  expect((await request.put(endpoint, { data: { action: 'entry', folderId: 'missing', number: tracking, description: 'Chair' } })).status()).toBe(400);
  for (const description of ['Chair', 'Dining chair']) expect((await request.put(endpoint, { data: { action: 'entry', folderId, number: tracking, description } })).ok()).toBeTruthy();
  let result = await (await request.get(endpoint)).json();
  expect(result.entries.filter(entry => entry.folderId === folderId)).toEqual([{ folderId, number: tracking, description: 'Dining chair' }]);
  await request.put(endpoint, { data: { action: 'remove', folderId, number: tracking } });
  result = await (await request.get(endpoint)).json();
  expect(result.entries.filter(entry => entry.folderId === folderId)).toEqual([]);
  expect((await (await request.get(api + tracking)).json()).details.notes).toBe('Keep these notes');
});

test('saved forms retain drafts when the directory cannot save', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Saved numbers', exact: true }).click();
  await expect(page.locator('#saved-status')).toContainText('Shared with everyone');
  await page.route('**/api/saved', route => route.request().method() === 'PUT' ? route.abort() : route.continue());
  await page.getByLabel('New client folder', { exact: true }).fill('Keep this client draft');
  await page.getByRole('button', { name: 'Add folder', exact: true }).click();
  await expect(page.locator('#saved-status')).toContainText('Your form is kept');
  await expect(page.getByLabel('New client folder', { exact: true })).toHaveValue('Keep this client draft');
});

test('hundreds of saved shipments stay searchable on a narrow phone', async ({ page, request }) => {
  const endpoint = 'http://127.0.0.1:8787/api/saved';
  const name = `Hundreds ${randomUUID().slice(0,8)}`;
  const folder = await (await request.put(endpoint, { data: { action: 'folder', name } })).json();
  for (let start = 0; start < 220; start += 20) {
    const results = await Promise.all(Array.from({ length: 20 }, (_, offset) => request.put(endpoint, { data: { action: 'entry', folderId: folder.id, number: `TESTBULK${String(start+offset).padStart(5,'0')}`, description: `Furniture piece ${start+offset}` } })));
    expect(results.every(response => response.ok())).toBeTruthy();
  }
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(url);
  await page.getByRole('button', { name: 'Saved numbers', exact: true }).click();
  await expect(page.locator('#saved-status')).toContainText('Shared with everyone');
  await page.locator('#saved-search').fill(name);
  await page.locator('.folder-button').filter({ hasText: name }).click();
  await expect(page.locator('.saved-entry')).toHaveCount(220);
  await page.locator('#saved-search').fill('Furniture piece 219');
  await expect(page.locator('.saved-entry')).toHaveCount(1);
  await expect(page.locator('.saved-entry-open')).toContainText('TESTBULK00219');
  expect(await page.locator('.saved-dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
});

test('search switches between all folders and the selected folder', async ({ page }) => {
  await page.route('**/api/saved', route => route.fulfill({ json: {
    folders: [{ id: 'a', name: 'Alpha Client' }, { id: 'b', name: 'Beta Client' }],
    entries: [{ folderId: 'a', number: 'TEST11111', description: 'Dining chair' }, { folderId: 'b', number: 'TEST22222', description: 'Dining table' }],
  } }));
  await page.goto(url);
  await page.getByRole('button', { name: 'Saved numbers', exact: true }).click();
  await expect(page.locator('#folder-title')).toHaveText('Alpha Client');
  await page.locator('#saved-search').fill('Dining');
  await expect(page.locator('.saved-entry')).toHaveCount(2);
  await expect(page.locator('.saved-entry-client')).toHaveText(['Alpha Client', 'Beta Client']);
  await page.getByLabel('Search in', { exact: true }).selectOption('folder');
  await expect(page.locator('.saved-entry')).toHaveCount(1);
  await expect(page.locator('.saved-entry-open')).toContainText('TEST11111');
  await page.locator('#saved-search').fill('TEST22222');
  await expect(page.locator('.saved-entry')).toHaveCount(0);
  await expect(page.locator('#folder-empty')).toHaveText('No matching shipments in this folder.');
  await page.getByLabel('Search in', { exact: true }).selectOption('all');
  await expect(page.locator('.saved-entry')).toHaveCount(1);
  await expect(page.locator('.saved-entry-client')).toHaveText('Beta Client');
  await page.getByRole('button', { name: 'Edit TEST22222', exact: true }).click();
  await expect(page.locator('#folder-title')).toHaveText('Beta Client');
  await expect(page.locator('#saved-number')).toHaveValue('TEST22222');
});

test('deleting a folder confirms, removes only its listings, and keeps notes and other folders', async ({ page, request }) => {
  const endpoint = 'http://127.0.0.1:8787/api/saved';
  const name = `Delete test ${randomUUID()}`;
  const folder = await (await request.put(endpoint, { data: { action: 'folder', name } })).json();
  const other = await (await request.put(endpoint, { data: { action: 'folder', name: `${name} keep` } })).json();
  const tracking = number();
  for (const folderId of [folder.id, other.id]) await request.put(endpoint, { data: { action: 'entry', folderId, number: tracking, description: 'Keep notes separately' } });
  await request.put(api + tracking, { data: { details: { notes: 'Keep these shipment notes' }, baseVersion: 0 } });
  const stale = await request.put(endpoint, { data: { action: 'delete-folder', folderId: folder.id, entryCount: 0 } });
  expect(stale.status()).toBe(400);
  await page.goto(url);
  await page.getByRole('button', { name: 'Saved numbers', exact: true }).click();
  await expect(page.locator('#saved-status')).toContainText('Shared with everyone');
  await page.locator('#saved-search').fill(name);
  await page.locator('.folder-button').filter({ hasText: name }).first().click();
  page.once('dialog', async dialog => { expect(dialog.message()).toContain('1 saved number'); await dialog.dismiss(); });
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await expect(page.locator('#folder-title')).toHaveText(name);
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete folder', exact: true }).click();
  await expect(page.locator('#saved-status')).toHaveText('Folder and its saved numbers deleted. Shipment notes kept.');
  let data = await (await request.get(endpoint)).json();
  expect(data.folders.some(item => item.id === folder.id)).toBeFalsy();
  expect(data.entries.some(item => item.folderId === folder.id)).toBeFalsy();
  expect(data.entries.some(item => item.folderId === other.id && item.number === tracking)).toBeTruthy();
  expect((await (await request.get(api + tracking)).json()).details.notes).toBe('Keep these shipment notes');
  // Empty folders can be deleted too.
  const empty = await (await request.put(endpoint, { data: { action: 'folder', name: `${name} empty` } })).json();
  expect((await request.put(endpoint, { data: { action: 'delete-folder', folderId: empty.id, entryCount: 0 } })).ok()).toBeTruthy();
});
