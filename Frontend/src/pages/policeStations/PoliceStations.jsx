import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Plus, FileUp, Search, List, Map as MapIcon, Building2, ChevronRight } from "lucide-react";
import { listStations, listDivisions } from "../../services/stationsApi";
import { StatTile, StationPills, Count, Tabs } from "./parts/common";
import { fieldClass, inlineFieldClass, btnPrimary, btnSecondary } from "./parts/styles";
import StationsMap from "./parts/StationsMap";
import StationFormDialog from "./parts/StationFormDialog";
import ImportDialog from "./parts/ImportDialog";
import VerificationQueue from "./parts/VerificationQueue";

const TH = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";

export default function PoliceStations() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get("tab") === "verify" ? "verify" : "all";
  const view = sp.get("view") === "map" ? "map" : "table";

  const [stations, setStations] = React.useState(null);
  const [divisions, setDivisions] = React.useState([]);
  const [error, setError] = React.useState("");
  const [q, setQ] = React.useState("");
  const [divisionId, setDivisionId] = React.useState("");
  const [status, setStatus] = React.useState("active");
  const [verified, setVerified] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [page, setPage] = React.useState(0);
  const PAGE = 50;

  const setParam = (k, v) =>
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v) n.set(k, v);
      else n.delete(k);
      return n;
    }, { replace: true });

  const load = React.useCallback(async () => {
    try {
      setError("");
      const [s, d] = await Promise.all([listStations({ stats: "true", status: "all" }), listDivisions()]);
      setStations(s);
      setDivisions(d);
    } catch (e) {
      setError(e.message || "Couldn't load police stations");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const all = stations || [];
  const term = q.trim().toLowerCase();
  const shown = all.filter(
    (s) =>
      (!term || s.name.toLowerCase().includes(term) || (s.code || "").toLowerCase().includes(term) || (s.area || "").toLowerCase().includes(term)) &&
      (!divisionId || (divisionId === "none" ? !s.divisionId : s.divisionId === divisionId)) &&
      (status === "all" || (status === "active" ? s.isActive : !s.isActive)) &&
      (!verified || String(s.verified) === verified)
  );

  // Back to the first page whenever the filters change.
  React.useEffect(() => setPage(0), [q, divisionId, status, verified]);
  const pageRows = shown.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));

  const totals = all.reduce(
    (t, s) => {
      if (s.isActive) t.active++;
      if (!s.verified && s.isActive) t.unverified++;
      t.open += s.stats?.openCases || 0;
      t.unack += s.stats?.unacknowledged || 0;
      t.overdue += s.stats?.overdue || 0;
      return t;
    },
    { active: 0, unverified: 0, open: 0, unack: 0, overdue: 0 }
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">Every station, its division and its current workload.</p>
        <div className="flex gap-2">
          <button type="button" className={btnSecondary} onClick={() => setImporting(true)}>
            <FileUp className="h-4 w-4" /> Import CSV
          </button>
          <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add station
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatTile label="Active stations" value={stations ? totals.active : "…"} hint="Sri Lanka Police reports 607 (2024)" />
        <StatTile label="Awaiting verification" value={stations ? totals.unverified : "…"} tone={totals.unverified ? "attention" : "ink"} />
        <StatTile label="Open cases" value={stations ? totals.open : "…"} />
        <StatTile label="Not accepted (24h)" value={stations ? totals.unack : "…"} tone={totals.unack ? "attention" : "ink"} />
        <StatTile label="Overdue (72h)" value={stations ? totals.overdue : "…"} tone={totals.overdue ? "danger" : "ink"} />
      </div>

      <Tabs
        value={tab}
        onChange={(v) => setParam("tab", v === "verify" ? "verify" : "")}
        tabs={[
          { value: "all", label: "All stations", icon: Building2, count: stations ? all.length : undefined },
          { value: "verify", label: "Verification queue", count: stations ? totals.unverified : undefined },
        ]}
      />

      {error ? <p className="rounded-2xl border border-st-rejected/40 bg-st-rejected/10 p-4 text-sm text-ink">{error}</p> : null}

      {tab === "verify" ? (
        <VerificationQueue divisions={divisions} onChanged={load} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className={`${fieldClass} pl-9`} placeholder="Search name, code or area…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search stations" />
            </div>
            <select className={inlineFieldClass} value={divisionId} onChange={(e) => setDivisionId(e.target.value)} aria-label="Division">
              <option value="">All divisions</option>
              <option value="none">No division yet</option>
              {divisions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select className={inlineFieldClass} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">Active and inactive</option>
            </select>
            <select className={inlineFieldClass} value={verified} onChange={(e) => setVerified(e.target.value)} aria-label="Verification">
              <option value="">Verified or not</option>
              <option value="true">Verified</option>
              <option value="false">Unverified</option>
            </select>
            <div className="ml-auto inline-flex rounded-xl border border-line bg-surface p-0.5" role="group" aria-label="View">
              {[
                { v: "table", icon: List, label: "Table" },
                { v: "map", icon: MapIcon, label: "Map" },
              ].map((o) => (
                <button
                  key={o.v}
                  type="button"
                  aria-pressed={view === o.v}
                  onClick={() => setParam("view", o.v === "map" ? "map" : "")}
                  className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium ${
                    view === o.v ? "bg-primary text-white" : "text-muted hover:text-ink"
                  }`}
                >
                  <o.icon className="h-4 w-4" /> {o.label}
                </button>
              ))}
            </div>
          </div>

          {view === "map" ? (
            <StationsMap stations={shown} onSelect={(s) => nav(`/police-stations/${s.id}`)} />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-raised">
                  <tr>
                    <th className={`${TH} pl-5`}>Station</th>
                    <th className={TH}>Division</th>
                    <th className={`${TH} text-center`}>Open</th>
                    <th className={`${TH} text-center`} title="Sent more than 24 hours ago and not accepted">Not accepted</th>
                    <th className={`${TH} text-center`} title="No action within 72 hours">Overdue</th>
                    <th className={`${TH} text-center`} title="Cases sent back as not their jurisdiction, last 30 days">Returned</th>
                    <th className={`${TH} text-center`}>Officers</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {!stations ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i} className="border-t border-line">
                        <td colSpan={8} className="px-5 py-4">
                          <div className="skeleton h-4 w-1/3 rounded" />
                        </td>
                      </tr>
                    ))
                  ) : shown.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-12 text-center text-muted">
                        No stations match these filters.
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((s) => (
                      <tr key={s.id} onClick={() => nav(`/police-stations/${s.id}`)} className="group cursor-pointer border-t border-line hover:bg-raised">
                        <td className="py-3 pl-5 pr-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink group-hover:text-primary">{s.name}</span>
                            <StationPills station={s} />
                          </div>
                          {s.code || s.area ? <p className="text-xs text-muted">{[s.code, s.area].filter(Boolean).join(" · ")}</p> : null}
                        </td>
                        <td className="px-4 py-3">
                          {s.division ? (
                            <>
                              <p className="text-ink">{s.division.name}</p>
                              <p className="text-xs text-muted">{s.division.range}</p>
                            </>
                          ) : (
                            <span className="text-xs font-semibold text-attention-ink">Not assigned</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-ink">{s.stats?.openCases ?? 0}</td>
                        <td className="px-4 py-3 text-center"><Count n={s.stats?.unacknowledged} /></td>
                        <td className="px-4 py-3 text-center"><Count n={s.stats?.overdue} tone="danger" /></td>
                        <td className="px-4 py-3 text-center"><Count n={s.stats?.returned30d} /></td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          {s.stats?.officers ? <span className="text-ink">{s.stats.officers}</span> : <span className="text-xs font-semibold text-st-rejected">None</span>}
                        </td>
                        <td className="pr-3 text-muted">
                          <ChevronRight className="h-4 w-4" />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {stations ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
                  <span>
                    {shown.length ? `${page * PAGE + 1}–${Math.min((page + 1) * PAGE, shown.length)} of ${shown.length}` : "0"} stations
                    {shown.length !== all.length ? ` (filtered from ${all.length})` : ""}. Station data partly from OpenStreetMap — © OpenStreetMap contributors.
                  </span>
                  {pages > 1 ? (
                    <span className="flex items-center gap-2">
                      <button type="button" className={`${btnSecondary} h-8`} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                      <span className="tabular-nums">Page {page + 1} of {pages}</span>
                      <button type="button" className={`${btnSecondary} h-8`} disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Next</button>
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </>
      )}

      <StationFormDialog open={creating} onClose={() => setCreating(false)} onSaved={(s) => nav(`/police-stations/${s.id}`)} divisions={divisions} />
      <ImportDialog open={importing} onClose={() => setImporting(false)} onDone={load} />
    </div>
  );
}
