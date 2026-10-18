import React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { getDivision } from "../../services/stationsApi";
import { StatTile, StationPills, Count } from "../policeStations/parts/common";
import StationsMap from "../policeStations/parts/StationsMap";

// One division: its stations on a map and their workload, so the division
// can see which station is behind.
export default function DivisionDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    setD(null);
    getDivision(id).then(setD).catch((e) => setError(e.message || "Couldn't load this division"));
  }, [id]);

  if (error) return <p className="rounded-2xl border border-line bg-surface p-10 text-center font-semibold text-ink">{error}</p>;
  if (!d) return <div className="space-y-4"><div className="skeleton h-20 rounded-2xl" /><div className="skeleton h-96 rounded-2xl" /></div>;

  const sum = (f) => d.stations.reduce((t, s) => t + (s.stats?.[f] || 0), 0);
  const active = d.stations.filter((s) => s.isActive);

  return (
    <div className="space-y-5">
      <div>
        <Link to="/divisions" className="mb-2 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
          <ArrowLeft className="h-4 w-4" /> All divisions
        </Link>
        <h2 className="text-2xl font-bold text-ink">{d.name} Division</h2>
        <p className="text-sm text-muted">{d.range} · {d.province} Province</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile label="Active stations" value={active.length} hint={`${d.stations.filter((s) => !s.verified).length} unverified`} />
        <StatTile label="Open cases" value={sum("openCases")} />
        <StatTile label="Not accepted (24h)" value={sum("unacknowledged")} tone={sum("unacknowledged") ? "attention" : "ink"} />
        <StatTile label="Overdue (72h)" value={sum("overdue")} tone={sum("overdue") ? "danger" : "ink"} />
        <StatTile label="Returned (30 days)" value={sum("returned30d")} tone={sum("returned30d") ? "attention" : "ink"} />
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_420px]">
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-raised text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Station</th>
                <th className="px-3 py-3 text-center">Open</th>
                <th className="px-3 py-3 text-center">Not accepted</th>
                <th className="px-3 py-3 text-center">Overdue</th>
                <th className="px-3 py-3 text-center">Officers</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {d.stations.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted">No stations assigned to this division yet — assign them from the verification queue.</td></tr>
              ) : (
                d.stations.map((s) => (
                  <tr key={s.id} onClick={() => nav(`/police-stations/${s.id}`)} className="group cursor-pointer border-t border-line hover:bg-raised">
                    <td className="px-4 py-2.5">
                      <span className="font-semibold text-ink group-hover:text-primary">{s.name}</span>
                      <div className="mt-0.5"><StationPills station={s} /></div>
                    </td>
                    <td className="px-3 py-2.5 text-center tabular-nums text-ink">{s.stats.openCases}</td>
                    <td className="px-3 py-2.5 text-center"><Count n={s.stats.unacknowledged} /></td>
                    <td className="px-3 py-2.5 text-center"><Count n={s.stats.overdue} tone="danger" /></td>
                    <td className="px-3 py-2.5 text-center tabular-nums">
                      {s.stats.officers || <span className="text-xs font-semibold text-st-rejected">None</span>}
                    </td>
                    <td className="pr-3 text-muted"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <StationsMap stations={d.stations} onSelect={(s) => nav(`/police-stations/${s.id}`)} height="h-[460px]" />
      </div>
    </div>
  );
}
