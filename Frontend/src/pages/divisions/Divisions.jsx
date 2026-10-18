import React from "react";
import { Link } from "react-router-dom";
import { Plus, ChevronRight, Info } from "lucide-react";
import { listDivisions, createDivision } from "../../services/stationsApi";
import { showToast } from "../../utils/toastBus";
import { StatTile, Count, Dialog, Field } from "../policeStations/parts/common";
import { btnPrimary, btnSecondary, fieldClass } from "../policeStations/parts/styles";

function AddDivisionDialog({ open, onClose, onSaved, provinces }) {
  const [form, setForm] = React.useState({ name: "", range: "", province: "" });
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) setForm({ name: "", range: "", province: "" });
  }, [open]);

  async function save() {
    setBusy(true);
    try {
      await createDivision(form);
      showToast("Division added", "success");
      onSaved();
      onClose();
    } catch {
      /* api client shows the error */
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add a division"
      subtitle="A territorial police division (SSP/SP command)."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>Cancel</button>
          <button type="button" className={btnPrimary} onClick={save} disabled={busy || !form.name || !form.range || !form.province}>
            {busy ? "Saving…" : "Add division"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Division name" htmlFor="dv-name" required>
          <input id="dv-name" className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kalmunai" />
        </Field>
        <Field label="Range" htmlFor="dv-range" required hint="The DIG's range, e.g. “Ampara Range”">
          <input id="dv-range" className={fieldClass} value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })} />
        </Field>
        <Field label="Province" htmlFor="dv-prov" required>
          <input id="dv-prov" list="dv-provinces" className={fieldClass} value={form.province} onChange={(e) => setForm({ ...form, province: e.target.value })} />
          <datalist id="dv-provinces">{provinces.map((p) => <option key={p} value={p} />)}</datalist>
        </Field>
      </div>
    </Dialog>
  );
}

// Territorial police divisions (the regional offices), grouped by province
// and range, with their stations' workload rolled up.
export default function Divisions() {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const load = React.useCallback(() => {
    listDivisions().then(setRows).catch((e) => setError(e.message || "Couldn't load divisions"));
  }, []);
  React.useEffect(load, [load]);

  const provinces = [...new Set((rows || []).map((d) => d.province))];
  const totals = (rows || []).reduce(
    (t, d) => ({
      stations: t.stations + d.stats.activeStations,
      open: t.open + d.stats.openCases,
      unack: t.unack + d.stats.unacknowledged,
      overdue: t.overdue + d.stats.overdue,
    }),
    { stations: 0, open: 0, unack: 0, overdue: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Sri Lanka Police territorial divisions — each police station belongs to one.</p>
        <button type="button" className={btnPrimary} onClick={() => setAdding(true)}>
          <Plus className="h-4 w-4" /> Add division
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Divisions" value={rows ? rows.length : "…"} />
        <StatTile label="Active stations" value={rows ? totals.stations : "…"} />
        <StatTile label="Not accepted (24h)" value={rows ? totals.unack : "…"} tone={totals.unack ? "attention" : "ink"} />
        <StatTile label="Overdue (72h)" value={rows ? totals.overdue : "…"} tone={totals.overdue ? "danger" : "ink"} />
      </div>

      {rows && rows.length < 45 ? (
        <p className="flex items-start gap-2 rounded-xl border border-line bg-raised px-3 py-2 text-xs text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Sri Lanka Police reports 45 territorial divisions (31.12.2024); {rows.length} are named in its published chart. Add any missing division here.
        </p>
      ) : null}

      {error ? <p className="rounded-2xl border border-st-rejected/40 bg-st-rejected/10 p-4 text-sm text-ink">{error}</p> : null}
      {!rows && !error ? <div className="skeleton h-96 rounded-2xl" /> : null}

      {provinces.map((province) => {
        const inProvince = rows.filter((d) => d.province === province);
        const ranges = [...new Set(inProvince.map((d) => d.range))];
        return (
          <section key={province} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
            <h2 className="border-b border-line bg-raised px-5 py-3 text-sm font-semibold text-ink">{province} Province</h2>
            <table className="w-full text-sm">
              <thead className="text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <tr>
                  <th className="px-5 py-2">Division</th>
                  <th className="px-4 py-2 text-center">Stations</th>
                  <th className="px-4 py-2 text-center">Open</th>
                  <th className="px-4 py-2 text-center">Not accepted</th>
                  <th className="px-4 py-2 text-center">Overdue</th>
                  <th className="px-4 py-2 text-center">Returned</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {ranges.map((range) => (
                  <React.Fragment key={range}>
                    <tr className="border-t border-line">
                      <td colSpan={7} className="bg-canvas/40 px-5 py-1.5 text-xs font-semibold text-muted">{range}</td>
                    </tr>
                    {inProvince
                      .filter((d) => d.range === range)
                      .map((d) => (
                        <tr key={d.id} className="group border-t border-line hover:bg-raised">
                          <td className="px-5 py-2.5">
                            <Link to={`/divisions/${d.id}`} className="font-semibold text-ink group-hover:text-primary">
                              {d.name}
                            </Link>
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-ink">
                            {d.stats.activeStations}
                            {d.stats.stations > d.stats.verifiedStations ? (
                              <span className="ml-1 text-xs text-attention-ink">({d.stats.stations - d.stats.verifiedStations} unverified)</span>
                            ) : null}
                          </td>
                          <td className="px-4 py-2.5 text-center tabular-nums text-ink">{d.stats.openCases}</td>
                          <td className="px-4 py-2.5 text-center"><Count n={d.stats.unacknowledged} /></td>
                          <td className="px-4 py-2.5 text-center"><Count n={d.stats.overdue} tone="danger" /></td>
                          <td className="px-4 py-2.5 text-center"><Count n={d.stats.returned30d} /></td>
                          <td className="pr-3 text-muted">
                            <Link to={`/divisions/${d.id}`} aria-label={`Open ${d.name}`}><ChevronRight className="h-4 w-4" /></Link>
                          </td>
                        </tr>
                      ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}

      <p className="text-xs text-muted">Source: Sri Lanka Police Performance Report 2024 (Parliament of Sri Lanka).</p>
      <AddDivisionDialog open={adding} onClose={() => setAdding(false)} onSaved={load} provinces={provinces} />
    </div>
  );
}
