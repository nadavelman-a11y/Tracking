import { test, expect } from '@playwright/test';

const widgetURL = 'https://www.17track.net/externalcall.js';
const mockWidget = `window.YQV5 = {trackSingle: function(options) {
  const frame = document.createElement('iframe');
  frame.src = 'about:blank';
  frame.dataset.number = options.YQ_Num;
  frame.dataset.hideHeader = String(options.YQ_RmHeader);
  frame.dataset.hideAds = String(options.YQ_RmAD);
  document.getElementById(options.YQ_ContainerId).append(frame);
}};`;

test('empty and invalid tracking numbers stay on the form', async ({ page }) => {
  let requested = false;
  await page.route(widgetURL, route => { requested = true; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.getByRole('alert')).toContainText('Please enter the tracking number');
  await expect(page.getByRole('textbox', { name: 'TRACKING NUMBER', exact: true })).toBeFocused();
  await page.locator('#tracking-number').fill('<script>alert(1)</script>');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.getByRole('alert')).toContainText('5–50');
  await expect(page.locator('#results')).toBeHidden();
  expect(requested).toBe(false);
});

test('valid submissions pass a normalized number to the widget and the external link', async ({ page }) => {
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget }));
  await page.goto('/');
  await page.locator('#tracking-number').fill(' rr123456789cn ');
  await page.locator('#tracking-number').press('Enter');
  await expect(page.locator('#active-number')).toHaveText('RR123456789CN');
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('data-number', 'RR123456789CN');
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('data-hide-header', 'true');
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('data-hide-ads', 'true');
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('title', '17TRACK shipment details for RR123456789CN');
  await expect(page.getByRole('link', { name: 'Open in 17TRACK' })).toHaveAttribute('href', 'https://t.17track.net/en#nums=RR123456789CN');
  await expect(page.locator('.recent-chip')).toHaveText('RR123456789CN');
});

test('a blocked tracker offers a working external link and can be retried', async ({ page }) => {
  await page.route(widgetURL, route => route.abort());
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.locator('.widget-notice')).toContainText('Your tracking link is ready.');
  await expect(page.getByRole('link', { name: 'Open in 17TRACK' })).toHaveAttribute('href', /#nums=RR123456789CN$/);
  await page.unroute(widgetURL);
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget }));
  await page.getByRole('button', { name: 'Try connecting again' }).click();
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('data-number', 'RR123456789CN');
});

test('multiple shipments deduplicate and switch the visible tracking result', async ({ page }) => {
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Track multiple', exact: true }).click();
  await page.locator('#tracking-number').fill('RR123456789CN\nAB987654321GB\nrr123456789cn');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.getByRole('group', { name: 'Choose shipment' }).getByRole('button')).toHaveCount(2);
  await page.getByRole('group', { name: 'Choose shipment' }).getByRole('button', { name: 'AB987654321GB' }).click();
  await expect(page.locator('#tracking-widget iframe')).toHaveAttribute('data-number', 'AB987654321GB');
  await expect(page.locator('#active-number')).toHaveText('AB987654321GB');
});

test('multiple mode limits batches and single mode rejects pasted batches', async ({ page }) => {
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN\nAB987654321GB');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.getByRole('alert')).toContainText('select “Track multiple”');
  await page.getByRole('button', { name: 'Track multiple', exact: true }).click();
  await page.locator('#tracking-number').fill(Array.from({ length: 11 }, (_, i) => `SHIPMENT${10000+i}`).join('\n'));
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.getByRole('alert')).toContainText('up to 10');
});

test('history survives reload and clear history removes it', async ({ page }) => {
  await page.route(widgetURL, route => route.abort());
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.locator('.recent-chip')).toHaveText('RR123456789CN');
  await page.reload();
  await expect(page.locator('.recent-chip')).toHaveText('RR123456789CN');
  await page.getByRole('button', { name: 'Clear recent searches' }).click();
  await expect(page.locator('#recent-section')).toBeHidden();
  await page.reload();
  await expect(page.locator('#recent-section')).toBeHidden();
});

test('the preview is labeled as fictional and never requests live tracking', async ({ page }) => {
  let requested = false;
  await page.route(widgetURL, route => { requested = true; return route.abort(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'See an example shipment' }).click();
  await expect(page.locator('.demo-banner')).toContainText('not a live shipment');
  await expect(page.getByRole('heading', { name: 'In transit to your local depot' })).toBeVisible();
  await expect(page.locator('#recent-section')).toBeHidden();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.locator('#results')).toBeHidden();
  await expect(page.locator('#tracking-number')).toBeFocused();
  expect(requested).toBe(false);
});

test('phone layout fits narrow screens, including shipment results and FAQ', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route(widgetURL, route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#tracking-number').fill('A'.repeat(50));
  await page.getByRole('button', { name: 'Track shipment' }).click();
  await expect(page.locator('.widget-notice')).toContainText('Your tracking link is ready.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByText('Why isn’t my tracking showing updates?', { exact: true }).click();
  await expect(page.getByText('A new number can take 24–48 hours', { exact: false })).toBeVisible();
});


test('staff can save project details, reopen the shipment, and keep notes separate from recent searches', async ({ page }) => {
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget }));
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await page.getByLabel('Project / client reference', { exact: true }).fill('Oak House');
  await page.getByLabel('Supplier', { exact: true }).fill('Studio supplier');
  await page.getByLabel('Item / room', { exact: true }).fill('Lounge chair · living room');
  await page.getByLabel('PO / order number', { exact: true }).fill('PO-1042');
  await page.getByLabel('Team notes', { exact: true }).fill('Call receiving before arrival.');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('#details-status')).toHaveText('Details saved on this browser.');
  await page.reload();
  await expect(page.locator('.recent-chip')).toContainText('Oak House');
  await page.locator('.recent-chip').click();
  await expect(page.getByLabel('Project / client reference', { exact: true })).toHaveValue('Oak House');
  await expect(page.getByLabel('Team notes', { exact: true })).toHaveValue('Call receiving before arrival.');
  await page.getByRole('button', { name: 'Clear recent searches' }).click();
  await page.reload();
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await expect(page.getByLabel('PO / order number', { exact: true })).toHaveValue('PO-1042');
});

test('shipment details and drafts remain separate when switching between tracking numbers', async ({ page }) => {
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Track multiple', exact: true }).click();
  await page.locator('#tracking-number').fill('RR123456789CN\nAB987654321GB');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await page.getByLabel('Project / client reference', { exact: true }).fill('Unsaved project draft');
  const tabs = page.getByRole('group', { name: 'Choose shipment' });
  await tabs.getByRole('button', { name: 'AB987654321GB' }).click();
  await expect(page.getByLabel('Project / client reference', { exact: true })).toHaveValue('');
  await page.getByLabel('Project / client reference', { exact: true }).fill('Second project');
  await page.getByRole('button', { name: 'Save details' }).click();
  await tabs.getByRole('button', { name: 'RR123456789CN' }).click();
  await expect(page.getByLabel('Project / client reference', { exact: true })).toHaveValue('Unsaved project draft');
  await expect(page.locator('#details-status')).toContainText('Unsaved changes');
});

test('project names display as text, and disabled storage reports a failed save', async ({ page }) => {
  await page.route(widgetURL, route => route.abort());
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  await page.getByLabel('Project / client reference', { exact: true }).fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('.recent-chip')).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.recent-chip img')).toHaveCount(0);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('Storage unavailable'); }; });
  await page.getByLabel('Team notes', { exact: true }).fill('Cannot save this note');
  await page.getByRole('button', { name: 'Save details' }).click();
  await expect(page.locator('#details-status')).toContainText('could not save');
});

test('the carrier frame and staff fields fit a narrow phone together', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route(widgetURL, route => route.fulfill({ contentType: 'application/javascript', body: mockWidget.replace("frame.src = 'about:blank';", "frame.src = 'about:blank'; frame.style.minWidth = '260px';") }));
  await page.goto('/');
  await page.locator('#tracking-number').fill('RR123456789CN');
  await page.getByRole('button', { name: 'Track shipment', exact: true }).click();
  const frame = page.locator('#tracking-widget iframe');
  await expect(frame).toBeVisible();
  expect(await frame.evaluate(element => element.getBoundingClientRect().width)).toBeLessThanOrEqual(280);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByLabel('Project / client reference', { exact: true })).toBeVisible();
});
