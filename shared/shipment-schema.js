export const detailLimits = { project: 120, supplier: 120, item: 200, order: 120, notes: 2000 };
export const trackingPattern = /^[A-Z0-9-]{5,50}$/;

export function validateDetails(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Shipment details must be an object.');
  if (Object.keys(input).some(key => !Object.hasOwn(detailLimits, key))) throw new Error('An unknown shipment field was supplied.');
  const details = {};
  for (const [key, limit] of Object.entries(detailLimits)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || value.length > limit) throw new Error(`${key} must be text of at most ${limit} characters.`);
    details[key] = value;
  }
  return details;
}
