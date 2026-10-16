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
