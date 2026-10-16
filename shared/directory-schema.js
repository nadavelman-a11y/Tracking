import { trackingPattern } from "./shipment-schema.js";
export const shipmentStatuses = [
  "",
  "Ordered",
  "In transit",
  "Arriving soon",
  "Delayed",
  "Received",
];
export function clientName(value) {
  const name =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name || name.length > 120)
    throw new Error("Enter a client name, up to 120 characters.");
  return name;
}
export function entryFields(body) {
  const number =
    typeof body.number === "string" ? body.number.trim().toUpperCase() : "";
  if (!trackingPattern.test(number))
    throw new Error(
      "Enter a tracking number with 5–50 letters, digits, or hyphens.",
    );
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description || description.length > 200)
    throw new Error("Enter an item description, up to 200 characters.");
  const supplier =
    typeof body.supplier === "string" ? body.supplier.trim() : "";
  if (supplier.length > 120)
    throw new Error("Supplier must be at most 120 characters.");
  const status = body.status ?? "";
  if (!shipmentStatuses.includes(status))
    throw new Error("Choose a supported team status.");
  const expected = body.expected ?? "";
  if (
    typeof expected !== "string" ||
    (expected &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(expected) ||
        Number.isNaN(Date.parse(expected)) ||
        new Date(expected).toISOString().slice(0, 10) !== expected))
  )
    throw new Error("Use a valid expected date (YYYY-MM-DD).");
  return { number, description, supplier, status, expected };
}
