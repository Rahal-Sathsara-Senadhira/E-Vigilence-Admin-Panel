import React from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowLeft, LayoutDashboard, ClipboardList, Users as UsersIcon, Map as MapIcon, History, Settings as SettingsIcon,
  Phone, Mail, UserRound, MapPin, Pencil, BadgeCheck, Power, Trash2, AlertTriangle,
} from "lucide-react";
import {
  getStation, getStationOfficers, getStationAudit, listDivisions, verifyStation, reactivateStation, deleteStation,
} from "../../services/stationsApi";
import { listViolations } from "../../services/violationsApi";
import { getUser } from "../../utils/auth";
import { showToast } from "../../utils/toastBus";
import { STATUS_OPTIONS, getStatusMeta } from "../../utils/violationStatus";
import ViolationsTable from "../violations/list/ViolationsTable";
import ViolationCards from "../violations/list/ViolationCards";
import { StatTile, StationPills, Tabs } from "./parts/common";
import { btnPrimary, btnSecondary, btnDanger, fieldClass, formatPhone } from "./parts/styles";
import StationsMap from "./parts/StationsMap";
import StationFormDialog from "./parts/StationFormDialog";
import JurisdictionEditor from "./parts/JurisdictionEditor";
import DeactivateDialog from "./parts/DeactivateDialog";

function ContactRow({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0">
        <p className="text-xs text-muted">{label}</p>
        <div className="text-sm text-ink">{children || <span className="text-muted">Not set</span>}</div>
      </div>
    </div>
  );
}

function Overview({ station, canEditContact, onEditContact }) {
  const s = station.stats || {};
  const decided = s.decidedThisMonth || {};
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatTile label="Open cases" value={s.openCases} />
          <StatTile label="Not accepted (24h)" value={s.unacknowledged} tone={s.unacknowledged ? "attention" : "ink"} />
          <StatTile label="Overdue (72h)" value={s.overdue} tone={s.overdue ? "danger" : "ink"} />
          <StatTile label="Avg. time to accept" value={s.avgHoursToAccept != null ? `${s.avgHoursToAccept} h` : "—"} hint="Last 90 days" />
          <StatTile label="Verified this month" value={decided.verified || 0} tone="good" />
          <StatTile label="Returned (30 days)" value={s.returned30d} tone={s.returned30d ? "attention" : "ink"} hint="Sent back as not their area" />
        </div>
        <StationsMap stations={[station]} highlightId={station.id} jurisdiction={station.jurisdiction} height="h-80" />
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Contact</h2>
            {canEditContact ? (
              <button type="button" onClick={onEditContact} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
            ) : null}
          </div>
          <div className="mt-2 divide-y divide-line">
            <ContactRow icon={UserRound} label="Officer in charge">{station.oicName}</ContactRow>
            <ContactRow icon={Phone} label="Phone">
              {station.phone ? <a className="hover:text-primary" href={`tel:${station.phone}`}>{formatPhone(station.phone)}</a> : null}
            </ContactRow>
            <ContactRow icon={Mail} label="Email">
              {station.email ? <a className="hover:text-primary" href={`mailto:${station.email}`}>{station.email}</a> : null}
            </ContactRow>
            <ContactRow icon={MapPin} label="Address">{station.address || station.area}</ContactRow>
          </div>
        </div>
        {station.stats?.officers === 0 && station.isActive ? (
          <p className="flex items-start gap-2 rounded-2xl border border-st-rejected/40 bg-st-rejected/10 p-4 text-sm text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-st-rejected" />
            No active officers — cases dispatched here won't be seen. Add officers in User Management.
          </p>
        ) : null}
      </aside>
    </div>
  );
}

function Cases({ stationId, isHQ }) {
  const [status, setStatus] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [data, setData] = React.useState(null);
  const LIMIT = 20;

  React.useEffect(() => {
    let cancelled = false;
    setData(null);
    listViolations({ station: stationId, status: status || undefined, limit: LIMIT, offset: page * LIMIT })
      .then((r) => !cancelled && setData(r))
      .catch(() => !cancelled && setData({ data: [], meta: { total: 0 } }));
    return () => {
      cancelled = true;
    };
  }, [stationId, status, page]);

  const hrefFor = isHQ ? undefined : () => "/station/assigned";
  const total = data?.meta?.total ?? 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {["", ...STATUS_OPTIONS].map((s) => {
          const active = status === s;
          return (
            <button
              key={s || "all"}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setStatus(s);
                setPage(0);
              }}
              className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                active ? "border-primary bg-primary text-white" : "border-line bg-surface text-ink hover:bg-raised"
              }`}
            >
              {s ? <span className={`h-2 w-2 rounded-full ${getStatusMeta(s).dot}`} /> : null}
              {s ? getStatusMeta(s).label : "All"}
            </button>
          );
        })}
      </div>
      <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        {!data ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-5 rounded" />)}
          </div>
        ) : data.data.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted">No cases{status ? ` with status “${getStatusMeta(status).label}”` : ""}.</p>
        ) : (
          <>
            <ViolationsTable items={data.data} hrefFor={hrefFor} />
            <ViolationCards items={data.data} hrefFor={hrefFor} />
            <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
              <span>
                {page * LIMIT + 1}–{Math.min((page + 1) * LIMIT, total)} of {total}
              </span>
              <div className="flex gap-2">
                <button type="button" className={`${btnSecondary} h-8`} disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <button type="button" className={`${btnSecondary} h-8`} disabled={(page + 1) * LIMIT >= total} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function Officers({ stationId, isHQ }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    getStationOfficers(stationId).then(setRows).catch(() => setRows([]));
  }, [stationId]);

  if (!rows) return <div className="skeleton h-40 rounded-2xl" />;
  return (
    <div className="space-y-3">
      {isHQ ? (
        <p className="text-sm text-muted">
          Accounts are managed in <Link to="/users" className="font-semibold text-primary hover:underline">User Management</Link>.
        </p>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-muted">No officers at this station.</td></tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="border-t border-line">
                  <td className="px-4 py-3 font-medium text-ink">{u.name}</td>
                  <td className="px-4 py-3 text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-ink">{u.role === "station_admin" ? "Station admin (OIC)" : "Officer"}</td>
                  <td className="px-4 py-3">
                    {u.isActive ? <span className="text-st-verified">Active</span> : <span className="text-muted">Inactive</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const AUDIT_LABEL = {
  created: "Station created",
  updated: "Details changed",
  verified: "Verified",
  jurisdiction: "Jurisdiction changed",
  deactivated: "Deactivated",
  reactivated: "Reactivated",
  imported: "Imported",
};

function describeAudit(r) {
  if (r.action === "updated" || r.action === "verified") {
    const fields = Object.keys(r.changes || {}).map((k) => ({ divisionId: "division", oicName: "OIC" }[k] || k));
    return fields.length ? `Changed ${fields.join(", ")}` : "";
  }
  if (r.action === "jurisdiction") return r.meta?.cleared ? "Area cleared" : `${r.meta?.areaKm2} km²${r.meta?.overlaps?.length ? ` · overlaps ${r.meta.overlaps.join(", ")}` : ""}`;
  if (r.action === "deactivated") {
    return `${r.meta?.reason} · ${r.meta?.casesReassigned} case(s) reassigned, ${r.meta?.officersMoved} officer(s) moved, ${r.meta?.officersDeactivated} deactivated`;
  }
  if (r.action === "imported") return r.meta?.source || (r.meta?.via === "csv" ? "From CSV" : "");
  return "";
}

function AuditLog({ stationId }) {
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    getStationAudit(stationId).then(setRows).catch(() => setRows([]));
  }, [stationId]);
  if (!rows) return <div className="skeleton h-40 rounded-2xl" />;
  return (
    <ol className="space-y-0 rounded-2xl border border-line bg-surface p-2 shadow-sm">
      {rows.length === 0 ? <li className="px-3 py-8 text-center text-sm text-muted">No history yet.</li> : null}
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3 rounded-xl px-3 py-2.5 hover:bg-raised">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">
              {AUDIT_LABEL[r.action] || r.action}
              <span className="font-normal text-muted"> · {r.by} · {new Date(r.at).toLocaleString()}</span>
            </p>
            {describeAudit(r) ? <p className="text-xs text-muted">{describeAudit(r)}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function Settings({ station, divisions, onChanged, onEdit, onDeactivate }) {
  const [divisionId, setDivisionId] = React.useState(station.divisionId || "");
  const [useOsm, setUseOsm] = React.useState(false);
  const [busy, setBusy] = React.useState("");

  async function run(kind, fn, ok) {
    setBusy(kind);
    try {
      const r = await fn();
      if (ok) showToast(ok, "success");
      onChanged?.(r);
    } catch {
      /* api client shows the error */
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {!station.verified ? (
        <section className="rounded-2xl border border-attention/50 bg-attention/10 p-5 lg:col-span-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BadgeCheck className="h-4 w-4 text-attention-ink" /> Verify this station
          </h2>
          <p className="mt-1 text-sm text-ink/80">Confirm the name and pin on the map, choose the division, then verify. Dispatches to unverified stations are flagged.</p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="min-w-60">
              <span className="mb-1.5 block text-sm font-medium text-ink">Division</span>
              <select className={fieldClass} value={divisionId} onChange={(e) => setDivisionId(e.target.value)}>
                <option value="">Choose…</option>
                {divisions.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.range}</option>)}
              </select>
            </label>
            {station.osmLocation ? (
              <label className="flex h-10 items-center gap-2 text-sm text-ink">
                <input type="checkbox" checked={useOsm} onChange={(e) => setUseOsm(e.target.checked)} />
                Use the OpenStreetMap pin ({station.osmLocation.distanceKm} km away)
              </label>
            ) : null}
            <button
              type="button"
              className={btnPrimary}
              disabled={!divisionId || busy === "verify"}
              onClick={() => run("verify", () => verifyStation(station.id, { divisionId, useOsmLocation: useOsm }), "Station verified")}
            >
              Verify station
            </button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">Station details</h2>
        <p className="mt-1 text-sm text-muted">Name, code, grade, division, contact and location.</p>
        <button type="button" className={`${btnSecondary} mt-4`} onClick={onEdit}>
          <Pencil className="h-4 w-4" /> Edit details
        </button>
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-ink">{station.isActive ? "Deactivate" : "Reactivate"}</h2>
        {station.isActive ? (
          <>
            <p className="mt-1 text-sm text-muted">Stops new dispatches. Open cases and officers are moved first.</p>
            <button type="button" className={`${btnDanger} mt-4`} onClick={onDeactivate}>
              <Power className="h-4 w-4" /> Deactivate station
            </button>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-muted">
              Inactive since {new Date(station.deactivatedAt).toLocaleDateString()}: {station.deactivationReason}
            </p>
            <button type="button" className={`${btnPrimary} mt-4`} disabled={busy === "reactivate"} onClick={() => run("reactivate", () => reactivateStation(station.id), "Station reactivated")}>
              <Power className="h-4 w-4" /> Reactivate
            </button>
          </>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm lg:col-span-2">
        <h2 className="text-sm font-semibold text-ink">Delete</h2>
        <p className="mt-1 text-sm text-muted">Only for a station added by mistake and never used. A station with any cases or officers can only be deactivated.</p>
        <button
          type="button"
          className={`${btnSecondary} mt-4 text-st-rejected`}
          disabled={busy === "delete"}
          onClick={() => {
            if (!window.confirm(`Delete ${station.name}? This can't be undone.`)) return;
            run("delete", async () => {
              await deleteStation(station.id);
              window.location.assign("/police-stations");
            }, "Station deleted");
          }}
        >
          <Trash2 className="h-4 w-4" /> Delete station
        </button>
      </section>
    </div>
  );
}

export default function StationProfile() {
  const { stationId } = useParams();
  const [sp, setSp] = useSearchParams();
  const user = getUser();
  const isHQ = user?.role === "hq";
  const canEditContact = isHQ || (user?.role === "station_admin" && String(user.stationId) === String(stationId));

  const [station, setStation] = React.useState(null);
  const [divisions, setDivisions] = React.useState([]);
  const [error, setError] = React.useState("");
  const [editing, setEditing] = React.useState(null); // "full" | "contact"
  const [deactivating, setDeactivating] = React.useState(false);

  const tab = sp.get("tab") || "overview";
  const setTab = (t) => setSp((p) => { const n = new URLSearchParams(p); if (t === "overview") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });

  const load = React.useCallback(async () => {
    try {
      setError("");
      setStation(await getStation(stationId));
    } catch (e) {
      setError(e.message || "Couldn't load this station");
    }
  }, [stationId]);

  React.useEffect(() => {
    load();
    if (isHQ) listDivisions().then(setDivisions).catch(() => setDivisions([]));
  }, [load, isHQ]);

  if (error) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-10 text-center">
        <p className="font-semibold text-ink">{error}</p>
        {isHQ ? <Link to="/police-stations" className="mt-3 inline-block text-sm font-semibold text-primary">Back to stations</Link> : null}
      </div>
    );
  }
  if (!station) return <div className="space-y-4"><div className="skeleton h-20 rounded-2xl" /><div className="skeleton h-80 rounded-2xl" /></div>;

  const tabs = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "cases", label: "Cases", icon: ClipboardList, count: station.stats?.openCases },
    { value: "officers", label: "Officers", icon: UsersIcon, count: station.stats?.officers },
    { value: "jurisdiction", label: "Jurisdiction", icon: MapIcon },
    { value: "history", label: "History", icon: History },
    ...(isHQ ? [{ value: "settings", label: "Settings", icon: SettingsIcon }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {isHQ ? (
            <Link to="/police-stations" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
              <ArrowLeft className="h-4 w-4" /> All stations
            </Link>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-2xl font-bold text-ink">{station.name}</h2>
            <StationPills station={station} size="md" />
          </div>
          <p className="mt-1 text-sm text-muted">
            {station.division ? (
              <>
                {isHQ ? <Link to={`/divisions/${station.division.id}`} className="font-medium text-ink hover:text-primary">{station.division.name} Division</Link> : <span className="font-medium text-ink">{station.division.name} Division</span>}
                {" · "}{station.division.range} · {station.division.province} Province
              </>
            ) : (
              <span className="font-semibold text-attention-ink">No division assigned</span>
            )}
            {station.code ? ` · Code ${station.code}` : ""}
          </p>
        </div>
        {isHQ ? (
          <button type="button" className={btnSecondary} onClick={() => setEditing("full")}>
            <Pencil className="h-4 w-4" /> Edit
          </button>
        ) : null}
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} />

      {tab === "overview" ? <Overview station={station} canEditContact={canEditContact} onEditContact={() => setEditing(isHQ ? "full" : "contact")} /> : null}
      {tab === "cases" ? <Cases stationId={station.id} isHQ={isHQ} /> : null}
      {tab === "officers" ? <Officers stationId={station.id} isHQ={isHQ} /> : null}
      {tab === "jurisdiction" ? <JurisdictionEditor station={station} editable={isHQ} onSaved={setStation} /> : null}
      {tab === "history" ? <AuditLog stationId={station.id} /> : null}
      {tab === "settings" && isHQ ? (
        <Settings
          station={station}
          divisions={divisions}
          onChanged={(r) => (r?.id ? setStation(r) : load())}
          onEdit={() => setEditing("full")}
          onDeactivate={() => setDeactivating(true)}
        />
      ) : null}

      <StationFormDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        onSaved={(s) => setStation(s)}
        station={station}
        divisions={divisions}
        contactOnly={editing === "contact"}
      />
      {isHQ ? <DeactivateDialog open={deactivating} onClose={() => setDeactivating(false)} station={station} onDone={setStation} /> : null}
    </div>
  );
}
