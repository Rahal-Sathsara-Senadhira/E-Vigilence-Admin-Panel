import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlertTriangle, MapPin, ChevronRight } from "lucide-react";
import StatusBadge from "../../../components/StatusBadge";
import { getStatusMeta } from "../../../utils/violationStatus";
import {
  relativeTime,
  fullDate,
  placeOf,
  coordsOf,
  offenceNames,
  isDuplicate,
} from "./format";

// Styled like a number plate so it reads at a glance.
export function Plate({ number }) {
  if (!number) return <span className="text-muted">—</span>;
  return (
    <span className="inline-block whitespace-nowrap rounded-md border-2 border-ink/70 bg-surface px-1.5 py-0.5 font-mono text-xs font-bold uppercase tracking-wider text-ink">
      {number}
    </span>
  );
}

export function StationCell({ v }) {
  if (v.assignedStationName) {
    return <span className="text-sm text-ink">{v.assignedStationName}</span>;
  }
  if (v.assignedStation) return <span className="text-sm text-muted">Assigned</span>;
  return (
    <span className="inline-flex items-center rounded-full bg-attention/15 px-2 py-0.5 text-xs font-semibold text-attention-ink">
      Unassigned
    </span>
  );
}

export function DuplicateBadge({ v }) {
  if (!isDuplicate(v)) return null;
  return (
    <span
      title={`${v.possibleDuplicateOf.length} possible duplicate(s)`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-attention/40 bg-attention/10 px-2 py-0.5 text-[11px] font-semibold text-attention-ink"
    >
      <AlertTriangle className="h-3 w-3" />
      Duplicate?
    </span>
  );
}

function Offences({ v }) {
  const names = offenceNames(v);
  if (names.length === 0) return <span className="text-muted">{v.type || "—"}</span>;

  const shown = names.slice(0, 2);
  const rest = names.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((n) => (
        <span
          key={n}
          className="max-w-[160px] truncate rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-medium text-ink"
          title={n}
        >
          {n}
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-md px-1 py-0.5 text-xs font-medium text-muted" title={names.slice(2).join(", ")}>
          +{rest}
        </span>
      ) : null}
    </div>
  );
}

const TH = "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted";

// `hrefFor(id)` — where a row opens (defaults to the HQ details page;
// station users are sent to their Assigned Violations list instead).
export default function ViolationsTable({ items, hrefFor = (id) => `/violations/${id}` }) {
  const nav = useNavigate();

  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-raised">
          <tr>
            <th className={`${TH} pl-5`}>Violation</th>
            <th className={TH}>Offences</th>
            <th className={TH}>Vehicle</th>
            <th className={TH}>Status</th>
            <th className={TH}>Station</th>
            <th className={TH}>Reported</th>
            <th className="w-8" aria-label="Open" />
          </tr>
        </thead>
        <tbody>
          {items.map((v) => {
            const id = v._id || v.id;
            const place = placeOf(v);
            const coords = coordsOf(v);
            const created = v.createdAt ?? v.created_at;

            return (
              <tr
                key={id}
                onClick={() => nav(hrefFor(id))}
                className={`group cursor-pointer border-l-4 border-t border-t-line transition-colors hover:bg-raised ${getStatusMeta(v.status).stripe}`}
              >
                <td className="max-w-[320px] py-3 pl-4 pr-4">
                  <div className="flex items-center gap-2">
                    {/* A real link, so the row is reachable by keyboard and
                        can be opened in a new tab. */}
                    <Link
                      to={hrefFor(id)}
                      onClick={(e) => e.stopPropagation()}
                      className="truncate font-semibold text-ink hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      {v.title}
                    </Link>
                    <DuplicateBadge v={v} />
                  </div>
                  {place || coords ? (
                    <div className="mt-0.5 flex items-center gap-1 text-xs text-muted">
                      {coords ? (
                        <span title={coords} className="shrink-0">
                          <MapPin className="h-3.5 w-3.5" aria-label={`Coordinates ${coords}`} />
                        </span>
                      ) : null}
                      <span className="truncate">{place || coords}</span>
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <Offences v={v} />
                </td>
                <td className="px-4 py-3">
                  <Plate number={v.vehicleNumber} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={v.status} />
                </td>
                <td className="px-4 py-3">
                  <StationCell v={v} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-muted" title={fullDate(created)}>
                  {relativeTime(created)}
                </td>
                <td className="py-3 pr-3 text-muted">
                  <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
