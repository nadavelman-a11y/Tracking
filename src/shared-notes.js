import { validateDetails } from '../shared/shipment-schema.js';
import { sharedNotesEndpoint } from './site-config.js';

export const sharedNotesURL = (import.meta.env.VITE_SHARED_NOTES_URL || sharedNotesEndpoint).trim().replace(/\/$/, '');
if (sharedNotesURL) {
  const url = new URL(sharedNotesURL);
  if (url.username || url.password || url.search || url.hash || !['https:', ...(url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? ['http:'] : [])].includes(url.protocol)) {
    throw new Error('Shared notes must use a public HTTPS endpoint.');
  }
}
export const sharedNotesEnabled = Boolean(sharedNotesURL);

function recordFromJSON(data) {
  if (!Number.isSafeInteger(data?.version) || data.version < 0 || (data.updatedAt !== null && (typeof data.updatedAt !== 'string' || Number.isNaN(Date.parse(data.updatedAt))))) {
    throw new Error('The shared notes service returned an invalid response.');
  }
  return { details: validateDetails(data.details), version: data.version, updatedAt: data.updatedAt };
}

export class SharedNotesConflict extends Error {
  constructor(current) { super('This shipment was updated elsewhere.'); this.current = current; }
}

async function request(number, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${sharedNotesURL}/api/shipments/${encodeURIComponent(number)}`, {
      ...options,
      cache: 'no-store',
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
      signal: controller.signal,
    });
    const body = await response.json();
    if (response.status === 409 && body.current) throw new SharedNotesConflict(recordFromJSON(body.current));
    if (!response.ok) throw new Error('Shared notes could not be reached. Please try again.');
    return recordFromJSON(body);
  } finally { clearTimeout(timeout); }
}

export const loadSharedNotes = number => request(number);
export const saveSharedNotes = (number, details, baseVersion) => request(number, { method: 'PUT', body: JSON.stringify({ details, baseVersion }) });
