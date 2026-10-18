import React from "react";
import { AlertTriangle } from "lucide-react";
import { Dialog, Field } from "./common";
import { fieldClass, btnSecondary, btnDanger } from "./styles";
import { getDeactivationPlan, deactivateStation, listStations } from "../../../services/stationsApi";
import { showToast } from "../../../utils/toastBus";

const METHOD = { jurisdiction: "its area", nearest: "nearest" };

// Guided deactivation: every open case needs a new station (pre-filled with
// the station whose area contains it, else the nearest) and every officer is
// moved or deactivated — the backend refuses anything less.
export default function DeactivateDialog({ open, onClose, station, onDone }) {
  const [plan, setPlan] = React.useState(null);
  const [targets, setTargets] = React.useState([]);
  const [cases, setCases] = React.useState({});
  const [users, setUsers] = React.useState({});
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setPlan(null);
    setError("");
    setReason("");
    Promise.all([getDeactivationPlan(station.id), listStations({ status: "active" })])
      .then(([p, s]) => {
        setPlan(p);
        setTargets(s.filter((x) => x.id !== station.id));
        setCases(Object.fromEntries(p.cases.map((c) => [c.id, c.suggestion?.stationId || ""])));
        setUsers(Object.fromEntries(p.users.map((u) => [u.id, { action: "move", stationId: p.cases[0]?.suggestion?.stationId || "" }])));
      })
      .catch((e) => setError(e.message || "Couldn't prepare the deactivation"));
  }, [open, station.id]);

  const casesDone = plan ? plan.cases.every((c) => cases[c.id]) : false;
  const usersDone = plan ? plan.users.every((u) => users[u.id]?.action === "deactivate" || users[u.id]?.stationId) : false;
  const ready = plan && casesDone && usersDone && reason.trim().length >= 5;

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const updated = await deactivateStation(station.id, {
        reason,
        reassignments: plan.cases.map((c) => ({ violationId: c.id, stationId: cases[c.id] })),
        users: plan.users.map((u) => ({ userId: u.id, ...users[u.id] })),
      });
      showToast(`${station.name} deactivated`, "success");
      onDone?.(updated);
      onClose();
    } catch (e) {
      setError(e.message || "Deactivation failed");
    } finally {
      setBusy(false);
    }
  }

  const stationSelect = (value, onChange, label) => (
    <select className={`${fieldClass} h-9`} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="">Choose a station…</option>
      {targets.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title={`Deactivate ${station.name}`}
      subtitle="Nothing is lost: open cases move to another station and every officer is moved or deactivated. You can reactivate later."
      footer={
        <>
          <button type="button" className={btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={btnDanger} onClick={submit} disabled={!ready || busy}>
            {busy ? "Deactivating…" : "Deactivate station"}
          </button>
        </>
      }
    >
      {error ? <p className="mb-4 rounded-xl border border-st-rejected/40 bg-st-rejected/10 px-3 py-2 text-sm text-ink">{error}</p> : null}
      {!plan ? (
        <div className="skeleton h-40 rounded-xl" />
      ) : (
        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-ink">
              Open cases ({plan.cases.length}) {plan.cases.length && casesDone ? <span className="text-st-verified">✓</span> : null}
            </h3>
            {plan.cases.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No open cases.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {plan.cases.map((c) => (
                  <li key={c.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_260px] sm:items-center">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{c.title}</p>
                      <p className="text-xs text-muted">
                        {c.status.replace("_", " ")}
                        {c.suggestion ? ` · suggested: ${c.suggestion.stationName} (${METHOD[c.suggestion.method]}, ${c.suggestion.distanceKm} km)` : " · no location — choose manually"}
                      </p>
                    </div>
                    {stationSelect(cases[c.id] || "", (v) => setCases((m) => ({ ...m, [c.id]: v })), `New station for ${c.title}`)}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold text-ink">
              Officers ({plan.users.length}) {plan.users.length && usersDone ? <span className="text-st-verified">✓</span> : null}
            </h3>
            {plan.users.length === 0 ? (
              <p className="mt-1 text-sm text-muted">No active officers.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
                {plan.users.map((u) => {
                  const p = users[u.id] || {};
                  return (
                    <li key={u.id} className="grid gap-2 px-3 py-2.5 sm:grid-cols-[1fr_150px_260px] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{u.name}</p>
                        <p className="text-xs text-muted">{u.role === "station_admin" ? "Station admin" : "Officer"} · {u.email}</p>
                      </div>
                      <select
                        className={`${fieldClass} h-9`}
                        value={p.action}
                        onChange={(e) => setUsers((m) => ({ ...m, [u.id]: { ...p, action: e.target.value } }))}
                        aria-label={`What happens to ${u.name}`}
                      >
                        <option value="move">Move to</option>
                        <option value="deactivate">Deactivate account</option>
                      </select>
                      {p.action === "move"
                        ? stationSelect(p.stationId || "", (v) => setUsers((m) => ({ ...m, [u.id]: { ...p, stationId: v } })), `New station for ${u.name}`)
                        : <span className="text-xs text-muted">They won't be able to sign in.</span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <Field label="Reason" htmlFor="deact-reason" required hint="Kept in the station's history.">
            <textarea
              id="deact-reason"
              rows={2}
              className={`${fieldClass} h-auto py-2`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Merged into Bravo Police Station"
            />
          </Field>

          <p className="flex items-start gap-2 text-xs text-muted">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-attention-ink" />
            An inactive station gets no new dispatches. Its past cases and history stay on record.
          </p>
        </div>
      )}
    </Dialog>
  );
}
