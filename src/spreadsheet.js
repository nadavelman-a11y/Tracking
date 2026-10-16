import { readSheet } from "read-excel-file/browser";
import { clientName, entryFields } from "../shared/directory-schema.js";

// CSV/TSV parsing retains leading zeros and never evaluates spreadsheet formulas.
export function parseDelimited(text) {
  if (text.length > 5_000_000) throw new Error("Use a file smaller than 5 MB.");
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t")
    ? "\t"
    : firstLine.split(";").length > firstLine.split(",").length
      ? ";"
      : ",";
  const rows = [];
  let row = [],
    value = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted || value === "") quoted = !quoted;
      else value += char;
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      value = "";
      if (rows.length > 5001)
        throw new Error("Import up to 5,000 rows at a time.");
    } else value += char;
  }
  if (quoted)
    throw new Error(
      "An opening quote has no closing quote. Check the CSV file.",
    );
  row.push(value);
  if (row.some((cell) => cell.trim())) rows.push(row);
  return rows;
}
export async function readSpreadsheet(file) {
  if (file.size > 5_000_000) throw new Error("Use a file smaller than 5 MB.");
  if (/\.xlsx$/i.test(file.name)) {
    const rows = await readSheet(file, 1, { parseNumber: (value) => value });
    return rows.map((row) =>
      row.map((value) => {
        return value instanceof Date
          ? value.toISOString().slice(0, 10)
          : String(value ?? "");
      }),
    );
  }
  if (!/\.(csv|tsv|txt)$/i.test(file.name))
    throw new Error(
      "Choose an Excel .xlsx, CSV, or TSV file. Save older .xls files as .xlsx first.",
    );
  return parseDelimited(await file.text());
}
export const importColumns = {
  client: "Client",
  number: "Tracking number",
  description: "Item description",
  supplier: "Supplier",
  expected: "Expected date",
  status: "Team status",
};
export function guessMapping(headers) {
  const aliases = {
    client: [
      "client",
      "clientname",
      "customer",
      "customername",
      "name",
      "project",
      "projectname",
    ],
    number: [
      "tracking",
      "trackingnumber",
      "trackingno",
      "trackingnum",
      "shipmentnumber",
    ],
    description: [
      "item",
      "description",
      "itemdescription",
      "itemroom",
      "product",
      "furniture",
    ],
    supplier: ["supplier", "vendor", "store"],
    expected: ["expected", "expecteddate", "eta", "deliverydate"],
    status: ["status", "teamstatus"],
  };
  return Object.fromEntries(
    Object.entries(aliases).map(([key, names]) => [
      key,
      headers.findIndex((header) =>
        names.includes(
          String(header)
            .toLowerCase()
            .replace(/[^a-z0-9]/g, ""),
        ),
      ),
    ]),
  );
}
export function previewImport(matrix, mapping) {
  if (matrix.length < 2)
    throw new Error("Include column headings and at least one data row.");
  if (matrix.length > 5001 || matrix[0].length > 100)
    throw new Error("Import up to 5,000 rows and 100 columns at a time.");
  if (mapping.client < 0) throw new Error("Choose the client-name column.");
  const rows = [],
    errors = [],
    seen = new Set();
  let duplicates = 0;
  matrix.slice(1).forEach((cells, index) => {
    if (!cells.some((cell) => String(cell ?? "").trim())) return;
    try {
      const value = (key) => String(cells[mapping[key]] ?? "").trim();
      const client = clientName(value("client"));
      const number = value("number").toUpperCase();
      const row = number
        ? {
            client,
            ...entryFields({
              number,
              description: value("description") || "Shipment",
              supplier: value("supplier"),
              expected: value("expected"),
              status: value("status"),
            }),
          }
        : { client };
      const key = `${client.toLowerCase()}\0${number}`;
      if (seen.has(key)) {
        duplicates++;
        return;
      }
      seen.add(key);
      rows.push(row);
    } catch (error) {
      errors.push(`Row ${index + 2}: ${error.message}`);
    }
  });
  return { rows, errors, duplicates };
}
