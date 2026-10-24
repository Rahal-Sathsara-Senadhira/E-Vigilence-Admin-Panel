// Penalty notices — every notice and warning letter the user can see, by
// state; and the outbox of letters and texts waiting to go out.

import { Mail, MessageSquare, Search } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Badge, EmptyState, Input, Page, Panel, Select, Skeleton } from "@/ui/index.js";
import { useNotices, useOutbox } from "../api.js";
import { NoticeList } from "../components/NoticeList.jsx";

const VIEWS = [
  ["all", "All notices"],
  ["to_post", "To be posted"],
  ["running", "Served, running"],
  ["service_failed", "Service failed"],
  ["overdue", "Overdue"],
  ["court_proposed", "Court proposed"],
  ["closed", "Ended"],
  ["outbox", "Outbox: letters and SMS waiting"],
];

export function NoticesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const view = params.get("view") ?? "all";
  /** @param {Record<string, string | undefined>} next */
  const update = (next) => {
    const merged = { ...Object.fromEntries(params), ...next };
    if (!("page" in next)) delete merged.page;
    setParams(
      /** @type {Record<string, string>} */ (
        Object.fromEntries(Object.entries(merged).filter(([, v]) => v))
      ),
      { replace: true },
    );
  };

  return (
    <Page
      title="Penalty notices"
      description="Notices and warning letters: posting, service, due dates and court."
    >
      <Panel>
        <div className="grid gap-3 border-b border-border p-4 sm:flex">
          {view !== "outbox" ? (
            <div className="relative sm:max-w-xs sm:flex-1">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <Input
                aria-label="Search notices"
                placeholder="Notice, case or plate"
                className="pl-9"
                defaultValue={params.get("q") ?? ""}
                onChange={(e) => update({ q: e.target.value || undefined })}
              />
            </div>
          ) : null}
          <Select
            aria-label="Which notices"
            className="sm:w-72"
            value={view}
            onChange={(e) => update({ view: e.target.value })}
          >
            {VIEWS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
          {view !== "outbox" ? (
            <Select
              aria-label="Kind"
              className="sm:w-48"
              value={params.get("kind") ?? ""}
              onChange={(e) => update({ kind: e.target.value || undefined })}
            >
              <option value="">Notices and warnings</option>
              <option value="penalty">Penalty notices</option>
              <option value="warning">Warning letters</option>
            </Select>
          ) : null}
        </div>
        {view === "outbox" ? (
          <Outbox />
        ) : (
          <NoticeTable
            view={view}
            q={params.get("q") ?? undefined}
            kind={params.get("kind") ?? undefined}
            page={Number(params.get("page") ?? 1) || 1}
            onSelect={(id) => navigate(`/notices/${id}`)}
            onPage={(p) => update({ page: String(p) })}
          />
        )}
      </Panel>
    </Page>
  );
}

/**
 * @param {{ view: string, q?: string, kind?: string, page: number, onSelect: (id: string) => void, onPage: (p: number) => void }} props
 */
function NoticeTable({ view, q, kind, page, onSelect, onPage }) {
  const list = useNotices({ view, q, kind, page });
  return (
    <NoticeList
      query={list}
      onSelect={onSelect}
      onPage={onPage}
      empty={{ title: "No notices", description: "Nothing matches these filters." }}
    />
  );
}

/** Letters to print and post, and texts waiting for the SMS gateway (N7). */
function Outbox() {
  const outbox = useOutbox({});
  if (outbox.isPending) return <Skeleton className="m-4 h-40" />;
  if (outbox.isError) return <p className="p-4 text-sm text-danger">{outbox.error.message}</p>;
  if (!outbox.data.items.length)
    return (
      <EmptyState
        icon={<Mail />}
        title="Nothing waiting"
        description="Letters and SMS to send appear here."
      />
    );
  return (
    <>
      <p className="border-b border-border px-4 py-2 text-xs text-text-muted">
        Letters leave when the station marks the notice as posted. SMS messages wait here until the
        SMS service is connected.
      </p>
      <ul className="divide-y divide-border text-sm">
        {outbox.data.items.map((m) => (
          <li
            key={m.id}
            className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="flex items-center gap-2">
              {m.channel === "post" ? (
                <Mail className="size-4 text-text-muted" aria-label="Letter" />
              ) : (
                <MessageSquare className="size-4 text-text-muted" aria-label="SMS" />
              )}
              <Link to={`/notices/${m.noticeId}`} className="font-mono text-action hover:underline">
                {m.noticeNumber}
              </Link>
              <Badge>{m.kind}</Badge>
              <span className="truncate text-text-muted">{m.to}</span>
            </span>
            <span className="text-xs text-text-muted">{formatDateTime(m.createdAt)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}
