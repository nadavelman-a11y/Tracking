import { test, expect } from '@playwright/test';

const backup = details => ({ app: 'nina-elman-shipment-desk', version: 1, recent: ['BACKUP12345'], shipments: { BACKUP12345: details } });

test('a workspace backup can be downloaded and restored on a separate browser context', async ({ page, browser }) => {
  await page.route('https://www.17track.net/externalcall.js', route => route.abort());
  await page.goto('/');
  await page.locator('#tracking-number').fill('BACKUP12345');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await page.getByLabel('Project / client reference', { exact: true }).fill('Domain migration project');
  await page.getByLabel('Team notes', { exact: true }).fill('Keep these notes on the new domain.');
  await page.getByRole('button', { name: 'Save details' }).click();
  await page.getByText('Keep your saved notes', { exact: true }).click();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download backup' }).click();
  const download = await downloadEvent;
  const context = await browser.newContext();
  try {
    const other = await context.newPage();
    await other.route('https://www.17track.net/externalcall.js', route => route.abort());
    await other.goto('http://127.0.0.1:5173');
    await other.locator('#backup-file').setInputFiles(await download.path());
    await expect(other.locator('#backup-status')).toContainText('Backup restored');
    await other.locator('.recent-chip').click();
    await expect(other.getByLabel('Team notes', { exact: true })).toHaveValue('Keep these notes on the new domain.');
  } finally { await context.close(); }
});

test('restoring merges missing fields and preserves existing nonempty details', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('nina-elman-shipment-details', JSON.stringify({ BACKUP12345: { project: 'Keep existing project', notes: 'Keep existing note' } })));
  await page.locator('#backup-file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup({ project: 'Old project', supplier: 'Restored supplier', notes: 'Old note' }))) });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('nina-elman-shipment-details')));
  expect(stored.BACKUP12345).toMatchObject({ project: 'Keep existing project', supplier: 'Restored supplier', notes: 'Keep existing note' });
});

test('invalid or oversized backups are rejected without changing stored notes', async ({ page }) => {
  await page.goto('/');
  const existing = { BACKUP12345: { notes: 'Preserve this note' } };
  await page.evaluate(data => localStorage.setItem('nina-elman-shipment-details', JSON.stringify(data)), existing);
  await page.locator('#backup-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup({ notes: 'x'.repeat(2001) }))) });
  await expect(page.locator('#backup-status')).toContainText('invalid or too long');
  await page.locator('#backup-file').setInputFiles({ name: 'large.json', mimeType: 'application/json', buffer: Buffer.alloc(1_000_001, 'x') });
  await expect(page.locator('#backup-status')).toContainText('smaller than 1 MB');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('nina-elman-shipment-details')))).toEqual(existing);
});
