const fields = { project: 120, supplier: 120, item: 200, order: 120, notes: 2000 };
const numberPattern = /^[A-Z0-9-]{5,50}$/;

function normalizeRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('The backup contains an invalid shipment.');
  const result = {};
  for (const [field, limit] of Object.entries(fields)) {
    const value = record[field] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw new Error('A shipment detail in this backup is invalid or too long.');
    result[field] = value;
  }
  return result;
}

export function readBackup(text) {
  if (text.length > 1_000_000) throw new Error('Please choose a workspace backup smaller than 1 MB.');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a valid workspace backup.'); }
  if (data?.app !== 'nina-elman-shipment-desk' || data.version !== 1 || !data.shipments || typeof data.shipments !== 'object' || Array.isArray(data.shipments)) {
    throw new Error('Please choose a backup downloaded from this shipment desk.');
  }
  if (Object.keys(data.shipments).length > 500) throw new Error('This backup contains more than 500 shipments.');
  const shipments = Object.create(null);
  for (const [number, record] of Object.entries(data.shipments)) {
    if (!numberPattern.test(number)) throw new Error('This backup contains an invalid tracking number.');
    shipments[number] = normalizeRecord(record);
  }
  const recent = Array.isArray(data.recent) ? data.recent.filter(n => typeof n === 'string' && numberPattern.test(n)).slice(0, 8) : [];
  return { shipments, recent };
}

export function createBackup(shipments, recent) {
  const data = {
    app: 'nina-elman-shipment-desk',
    version: 1,
    exportedAt: new Date().toISOString(),
    shipments,
    recent,
  };
  readBackup(JSON.stringify(data));
  return JSON.stringify(data, null, 2);
}

export function mergeBackup(existing, incoming) {
  const shipments = Object.create(null);
  for (const [number, record] of Object.entries(incoming)) shipments[number] = { ...record };
  for (const [number, record] of Object.entries(existing)) {
    if (!numberPattern.test(number)) continue;
    const normalized = normalizeRecord(record);
    // Preserve every existing nonempty field when the same shipment is imported.
    shipments[number] = Object.fromEntries(Object.keys(fields).map(field => [field, normalized[field] || shipments[number]?.[field] || '']));
  }
  return shipments;
}
