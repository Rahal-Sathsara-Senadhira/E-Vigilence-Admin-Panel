import React from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, MapPin, Search } from "lucide-react";
import { getVerificationQueue, verifyStation } from "../../../services/stationsApi";
import { showToast } from "../../../utils/toastBus";
import { fieldClass } from "./styles";

const SOURCE_LABEL = { osm: "OpenStreetMap", seed: "Original seed", manual: "Added by HQ", csv: "CSV import" };

// Unverified stations, each with what HQ needs to confirm it: the division
// (pre-filled with a suggestion from the nearest division HQ town) and, if
// OpenStreetMap places it elsewhere, the option to use that pin.
export default function VerificationQueue({ divisions, onChanged }) {
  const [rows, setRows] = React.useState(null);
  const [error, setError] = React.useState("");
  const [choice, setChoice] = React.useState({}); // id -> { divisionId, useOsm }
  const [busyId, setBusyId] = React.useState("");
  const [q, setQ] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      setError("");
      const data = await getVerificationQueue();
      setRows(data);
      setChoice(
        Object.fromEntries(
          data.map((s) => [s.id, { divisionId: s.divisionId || s.suggestedDivision?.id || "", useOsm: false }])
        )
      );
    } catch (e) {
      setError(e.message || "Couldn't load the verification queue");
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function verify(s) {
    const c = choice[s.id] || {};
    setBusyId(s.id);
    try {
      await verifyStation(s.id, { divisionId: c.divisionId || undefined, useOsmLocation: !!c.useOsm });
      setRows((list) => list.filter((x) => x.id !== s.id));
      showToast(`${s.name} verified`, "success");
      onChanged?.();
    } catch {
      /* api client already shows the error */
    } finally {
      setBusyId("");
    }
  }

  if (error) return <p className="rounded-2xl border border-st-rejected/40 bg-st-rejected/10 p-4 text-sm text-ink">{error}</p>;
  if (!rows) return <div className="skeleton h-64 rounded-2xl" />;

  const term = q.trim().toLowerCase();
  const shown = term ? rows.filter((s) => s.name.toLowerCase().includes(term)) : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.length} station{rows.length === 1 ? "" : "s"} waiting. Check each one's name and pin, confirm the division, then verify.
          Imported from OpenStreetMap — © OpenStreetMap contributors.
        </p>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className={`${fieldClass} pl-9`} placeholder="Find a station…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a station" />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-raised text-left text-xs font-semibold uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-3">Station</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Division</th>
              <th className="px-4 py-3">Pin</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted">
                  {rows.length ? "No match." : "Every station is verified."}
                </td>
              </tr>
            ) : (
              shown.map((s) => {
                const c = choice[s.id] || {};
                return (
                  <tr key={s.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <Link to={`/police-stations/${s.id}`} className="font-semibold text-ink hover:text-primary">
                        {s.name}
                      </Link>
                      <p className="text-xs text-muted">
                        {s.lat?.toFixed(5)}, {s.lng?.toFixed(5)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted">{SOURCE_LABEL[s.source] || s.source}</td>
                    <td className="px-4 py-3">
                      <select
                        className={`${fieldClass} h-9 min-w-48`}
                        value={c.divisionId}
                        onChange={(e) => setChoice((m) => ({ ...m, [s.id]: { ...c, divisionId: e.target.value } }))}
                        aria-label={`Division for ${s.name}`}
                      >
                        <option value="">Choose…</option>
                        {divisions.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      {s.suggestedDivision && c.divisionId === s.suggestedDivision.id ? (
                        <p className="mt-1 text-xs text-muted">Suggested — nearest division HQ ({s.suggestedDivision.distanceKm} km)</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {s.osmLocation ? (
                        <label className="flex cursor-pointer items-start gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={!!c.useOsm}
                            onChange={(e) => setChoice((m) => ({ ...m, [s.id]: { ...c, useOsm: e.target.checked } }))}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="font-medium text-ink">Use OpenStreetMap pin</span>
                            <span className="block text-muted">{s.osmLocation.distanceKm} km from ours</span>
                          </span>
                        </label>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted">
                          <MapPin className="h-3.5 w-3.5" /> Keep current pin
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => verify(s)}
                        disabled={!c.divisionId || busyId === s.id}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-st-verified px-3 text-sm font-semibold text-white hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <BadgeCheck className="h-4 w-4" /> Verify
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
