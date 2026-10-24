// The same report as CSV (docs/12 §7), section by section, for spreadsheets.
// Cells that a spreadsheet would run as a formula are made plain text first
// (a leading ', for = + - @ and control characters).

/** @typedef {import("./pdf.js").ReportDoc} ReportDoc */

const BOM = String.fromCharCode(0xfeff);

/** @param {string} value */
function cell(value) {
  let s = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
}

/** @param {ReportDoc} doc @returns {Buffer} */
export function renderCsv(doc) {
  /** @type {string[][]} */
  const rows = [[doc.title], [doc.subtitle], []];
  for (const section of doc.sections) {
    rows.push([section.heading]);
    if (section.note) rows.push([section.note]);
    for (const [label, value] of section.pairs ?? []) rows.push([label, value]);
    if (section.table) {
      rows.push(section.table.head);
      for (const r of section.table.rows) rows.push(r);
    }
    rows.push([]);
  }
  // A byte-order mark so spreadsheets read the text as UTF-8.
  return Buffer.from(`${BOM}${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`, "utf8");
}
