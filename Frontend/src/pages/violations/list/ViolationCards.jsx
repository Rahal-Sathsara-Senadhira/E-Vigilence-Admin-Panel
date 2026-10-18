import React from "react";
import { Link } from "react-router-dom";
import StatusBadge from "../../../components/StatusBadge";
import { getStatusMeta } from "../../../utils/violationStatus";
import { Plate, StationCell, DuplicateBadge } from "./ViolationsTable";
import { relativeTime, fullDate, placeOf, offenceNames } from "./format";

// Phone-width replacement for the table (shown below the md breakpoint).
export default function ViolationCards({ items, hrefFor = (id) => `/violations/${id}` }) {
  return (
    <ul className="divide-y divide-line md:hidden">
      {items.map((v) => {
        const id = v._id || v.id;
        const place = placeOf(v);
        const offences = offenceNames(v);
        const created = v.createdAt ?? v.created_at;

        return (
          <li key={id}>
            <Link
              to={hrefFor(id)}
              className={`block border-l-4 px-4 py-3 transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none ${getStatusMeta(v.status).stripe}`}
            >
              <div className="flex items-start justify-between gap-3">
                <StatusBadge status={v.status} />
                <span className="text-xs text-muted" title={fullDate(created)}>
                  {relativeTime(created)}
                </span>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate font-semibold text-ink">{v.title}</p>
                <DuplicateBadge v={v} />
              </div>

              {offences.length > 0 ? (
                <p className="mt-0.5 truncate text-xs text-muted">{offences.join(" · ")}</p>
              ) : null}
              {place ? <p className="mt-0.5 truncate text-xs text-muted">{place}</p> : null}

              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <Plate number={v.vehicleNumber} />
                <StationCell v={v} />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
