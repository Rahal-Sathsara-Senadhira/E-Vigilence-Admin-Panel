import React from "react";
import { FileUp } from "lucide-react";
import { Dialog } from "./common";
import { btnPrimary, btnSecondary } from "./styles";
import { importStations } from "../../../services/stationsApi";
import { showToast } from "../../../utils/toastBus";

// Minimal CSV parser: commas, quoted fields with "" escapes, CRLF/LF.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

const COLUMNS = ["name", "code", "lat", "lng", "division", "grade", "phone", "address", "area"];

export default function ImportDialog({ open, onClose, onDone }) {
  const [rows, setRows] = React.useState([]);
  const [fileName, setFileName] = React.useState("");
  const [error, setError] = React.useState("");
  const [report, setReport] = React.useState(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setRows([]);
    setFileName("");
    setError("");
    setReport(null);
  }, [open]);

  async function onFile(file) {
    setError("");
    setReport(null);
    if (!file) return;
    setFileName(file.name);
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      setError("The file needs a header row and at least one station");
      return;
    }
    const header = table[0].map((h) => h.trim().toLowerCase());
    for (const required of ["name", "lat", "lng"]) {
      if (!header.includes(required)) {
        setError(`Missing column “${required}”. Expected columns: ${COLUMNS.join(", ")}`);
        return;
      }
    }
    setRows(
      table.slice(1).map((r) => {
        const o = {};
        header.forEach((h, i) => {
          if (COLUMNS.includes(h) && r[i] !== undefined && r[i].trim() !== "") o[h] = r[i].trim();
        });
        if (o.lat) o.lat = Number(o.lat);
        if (o.lng) o.lng = Number(o.lng);
        return o;
      })
    );
  }

  async function run() {
    setBusy(true);
    try {
      const r = await importStations(rows);
      setReport(r);
      showToast(`Imported: ${r.created} new, ${r.updated} updated`, r.errors.length ? "warning" : "success");
      onDone?.();
    } catch (e) {
      setError(e.message || "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Import stations from CSV"
      subtitle="New rows are added as unverified stations; a row whose code matches an existing station updates it."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            {report ? "Close" : "Cancel"}
          </button>
          {!report ? (
            <button type="button" className={btnPrimary} onClick={run} disabled={busy || rows.length === 0}>
              {busy ? "Importing…" : `Import ${rows.length || ""} station${rows.length === 1 ? "" : "s"}`}
            </button>
          ) : null}
        </>
      }
    >
      <p className="text-sm text-muted">
        Columns: <span className="font-mono text-xs text-ink">{COLUMNS.join(", ")}</span>. <span className="font-mono text-xs">name</span>,{" "}
        <span className="font-mono text-xs">lat</span> and <span className="font-mono text-xs">lng</span> are required;{" "}
        <span className="font-mono text-xs">division</span> must match a division name.
      </p>

      <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line bg-raised/50 px-4 py-8 text-center hover:border-primary/50">
        <FileUp className="h-7 w-7 text-muted" />
        <span className="mt-2 text-sm font-medium text-ink">{fileName || "Choose a .csv file"}</span>
        {rows.length ? <span className="text-xs text-muted">{rows.length} rows ready</span> : null}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {error ? <p className="mt-3 text-sm font-medium text-st-rejected">{error}</p> : null}

      {report ? (
        <div className="mt-4 space-y-2 text-sm">
          <p className="text-ink">
            <span className="font-semibold">{report.created}</span> created · <span className="font-semibold">{report.updated}</span> updated ·{" "}
            <span className={report.errors.length ? "font-semibold text-st-rejected" : ""}>{report.errors.length} failed</span>
          </p>
          {report.errors.length ? (
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-line text-xs">
              {report.errors.map((e) => (
                <li key={e.row} className="border-b border-line px-3 py-2 last:border-0">
                  <span className="font-semibold text-ink">Row {e.row}</span> {e.name ? `(${e.name})` : ""} — {e.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
