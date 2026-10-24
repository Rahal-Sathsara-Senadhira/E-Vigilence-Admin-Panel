// A list of reward entries — the Rewards page and a citizen's account.

import { Gift, PauseCircle } from "lucide-react";
import { Link } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Badge, EmptyState, Pagination, Skeleton } from "@/ui/index.js";
import { STATUS, points, shareLabel } from "../lib/labels.js";

/**
 * @param {{
 *   rows: import("../api.js").RewardRow[] | undefined,
 *   pending?: boolean,
 *   error?: Error | null,
 *   paging?: { page: number, pageSize: number, total: number, onPage: (p: number) => void },
 *   empty: { title: string, description: string },
 *   showCitizen?: boolean,
 * }} props
 */
export function RewardList({ rows, pending, error, paging, empty, showCitizen = true }) {
  if (pending) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-14" />
        ))}
      </div>
    );
  }
  if (error) return <p className="p-4 text-sm text-danger">{error.message}</p>;
  if (!rows?.length)
    return <EmptyState icon={<Gift />} title={empty.title} description={empty.description} />;
  return (
    <>
      <ul className="divide-y divide-border">
        {rows.map((e) => {
          const [label, tone] = STATUS[e.status];
          return (
            <li key={e.id}>
              <Link
                to={`/rewards/${e.id}`}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-sunken sm:px-5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-text">
                    <span className="font-mono text-[13px] font-medium">{e.reportNumber}</span>
                    <span className="text-text-muted"> · case {e.caseNumber}</span>
                  </span>
                  <span className="block truncate text-xs text-text-muted">
                    {showCitizen ? `${e.reporterName ?? "Citizen"} · ` : ""}
                    {e.kind === "recovery" ? "Recovery of points paid out" : shareLabel(e.share)}
                    {" · "}
                    {formatDateTime(e.updatedAt)}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  {e.hold && ["pending", "confirmed"].includes(e.status) ? (
                    <Badge tone="warning">
                      <PauseCircle className="size-3" aria-hidden /> Held
                    </Badge>
                  ) : null}
                  <Badge tone={/** @type {any} */ (tone)}>{label}</Badge>
                  <span className="w-24 text-right text-sm font-semibold tabular-nums text-text">
                    {points(e.points)}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {paging ? (
        <Pagination
          page={paging.page}
          pageSize={paging.pageSize}
          total={paging.total}
          noun="rewards"
          onPage={paging.onPage}
        />
      ) : null}
    </>
  );
}
