import { validateDetails, trackingPattern } from '../../shared/shipment-schema.js';

const json = (data, status = 200, extra = {}) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
const emptyRecord = () => ({ details: validateDetails({}), version: 0, updatedAt: null });

async function readJSON(request) {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) {
    throw new Error('Send shipment details as JSON.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Shipment details are missing.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 16000) { await reader.cancel(); throw new Error('Shipment details are too large.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('Shipment details are not valid JSON.'); }
}

export class ShipmentNotes {
  constructor(ctx) { this.storage = ctx.storage; }

  async fetch(request) {
    if (request.method === 'GET') return json(await this.storage.get('record') || emptyRecord());
    if (request.method !== 'PUT') return json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PUT' });
    let details, baseVersion;
    try {
      const body = await readJSON(request);
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !['details', 'baseVersion'].includes(key))) {
        throw new Error('Send details and the version you last loaded.');
      }
      details = validateDetails(body.details);
      baseVersion = body.baseVersion;
      if (!Number.isSafeInteger(baseVersion) || baseVersion < 0) throw new Error('A valid shipment version is required.');
    } catch (error) { return json({ error: error.message }, 400); }

    // Compare and write inside a storage transaction so two employees cannot silently overwrite one another.
    const result = await this.storage.transaction(async transaction => {
      const current = await transaction.get('record') || emptyRecord();
      if (current.version !== baseVersion) return { conflict: true, current };
      const record = { details, version: current.version + 1, updatedAt: new Date().toISOString() };
      await transaction.put('record', record);
      return { record };
    });
    return result.conflict ? json({ error: 'This shipment was updated elsewhere.', current: result.current }, 409) : json(result.record);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
    if (origin && !allowed.includes(origin)) return json({ error: 'This website is not configured to use shared notes.' }, 403);
    const cors = {
      ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '3600',
      Vary: 'Origin',
    };
    const url = new URL(request.url);
    const match = /^\/api\/shipments\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    let response;
    if (url.pathname === '/health' && request.method === 'GET') response = json({ ok: true, service: 'nina-elman-shipment-notes' });
    else if (!match || !trackingPattern.test(match[1].toUpperCase())) response = json({ error: 'Shipment not found.' }, 404);
    else if (request.method === 'OPTIONS') response = new Response(null, { status: 204 });
    else if (!['GET', 'PUT'].includes(request.method)) response = json({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PUT, OPTIONS' });
    else {
      try {
        const id = env.SHIPMENT_NOTES.idFromName(match[1].toUpperCase());
        response = await env.SHIPMENT_NOTES.get(id).fetch(request);
      } catch {
        response = json({ error: 'Shared notes are temporarily unavailable. Please try again.' }, 503);
      }
    }
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(cors)) headers.set(key, value);
    return new Response(response.body, { status: response.status, headers });
  },
};
