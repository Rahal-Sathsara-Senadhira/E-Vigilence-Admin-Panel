// Management reports (docs/12 §7): make a report for a period and scope, and
// every run — scheduled or asked for — with its PDF and CSV and their
// fingerprints. Figures follow the dashboard's definitions (D12-7).

import { CalendarClock, Download, FileText, Play } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { useDivisions } from "@/features/organisation/index.js";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { useCurrentUser } from "@/lib/session-context.js";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Field,
  Input,
  Page,
  Pagination,
  Panel,
  Select,
  Skeleton,
} from "@/ui/index.js";
import { downloadRun, useReportRuns, useRequestReport } from "./api.js";

const PERIODS = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom range"],
];
const EVERY = {
  daily: "every day at 06:00",
  weekly: "on Mondays at 06:00",
  monthly: "on the 1st of each month at 06:00",
};

export function ManagementReportsPage() {
  const [params, setParams] = useSearchParams();
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useReportRuns({ page });

  return (
    <Page
      title="Management reports"
      description="PDF and CSV, made from the same definitions as the dashboard. Scheduled reports run at 06:00 Sri Lanka time."
    >
      {list.isPending ? (
        <Skeleton className="h-80" />
      ) : list.isError ? (
        <Alert tone="danger">{list.error.message}</Alert>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_minmax(0,1fr)]">
          {list.data.canRequest ? (
            <MakeReport types={list.data.types} />
          ) : (
            <Panel title="Reports">
              <p className="p-5 text-sm text-text-muted">
                Your role reads reports; HQ makes them. Scheduled reports appear here as they run.
              </p>
            </Panel>
          )}
          <Panel title="Report runs">
            {list.data.items.length === 0 ? (
              <EmptyState
                icon={<FileText />}
                title="No reports yet"
                description="Scheduled reports appear here after 06:00; you can also make one now."
              />
            ) : (
              <>
                <ul className="divide-y divide-border">
                  {list.data.items.map((r) => (
                    <RunRow key={r.id} run={r} />
                  ))}
                </ul>
                <Pagination
                  page={list.data.page}
                  pageSize={list.data.pageSize}
                  total={list.data.total}
                  noun="reports"
                  onPage={(p) => setParams({ page: String(p) })}
                />
              </>
            )}
          </Panel>
        </div>
      )}
    </Page>
  );
}

/** @param {{ types: import("./api.js").ReportType[] }} props */
function MakeReport({ types }) {
  const user = useCurrentUser();
  const national = ["N", "R"].includes(user.permissions["managementReports.view"] ?? "");
  const divisions = useDivisions();
  const request = useRequestReport();
  const [v, setV] = useState({
    type: types[0]?.key ?? "",
    period: "last_month",
    from: "",
    to: "",
    divisionId: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [done, setDone] = useState(false);
  const type = types.find((t) => t.key === v.type);

  return (
    <Panel title="Make a report">
      <form
        className="grid gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErrors({});
          setDone(false);
          try {
            await request.mutateAsync(
              Object.fromEntries(
                Object.entries({
                  ...v,
                  divisionId: type?.level === "any" ? v.divisionId : "",
                }).filter(([, x]) => x),
              ),
            );
            setDone(true);
          } catch (err) {
            setErrors(
              err instanceof ApiError && Object.keys(err.fields).length
                ? err.fields
                : { root: err instanceof Error ? err.message : "Please try again." },
            );
          }
        }}
      >
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        {done ? <Alert tone="success">Made — it is at the top of the list.</Alert> : null}
        <Field label="Report" error={errors.type} hint={type?.summary}>
          {({ invalid, ...p }) => (
            <Select
              {...p}
              invalid={invalid}
              value={v.type}
              onChange={(e) => setV({ ...v, type: e.target.value })}
            >
              {types.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.title}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Period">
          {(p) => (
            <Select
              {...p}
              value={v.period}
              onChange={(e) => setV({ ...v, period: e.target.value })}
            >
              {PERIODS.map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {v.period === "custom" ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="From" error={errors.from}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  type="date"
                  value={v.from}
                  onChange={(e) => setV({ ...v, from: e.target.value })}
                />
              )}
            </Field>
            <Field label="To" error={errors.to}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  type="date"
                  value={v.to}
                  onChange={(e) => setV({ ...v, to: e.target.value })}
                />
              )}
            </Field>
          </div>
        ) : null}
        {national && type?.level === "any" ? (
          <Field label="Area">
            {(p) => (
              <Select
                {...p}
                value={v.divisionId}
                onChange={(e) => setV({ ...v, divisionId: e.target.value })}
              >
                <option value="">All of Sri Lanka</option>
                {(divisions.data ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} division
                  </option>
                ))}
              </Select>
            )}
          </Field>
        ) : null}
        {type?.schedule ? (
          <p className="flex items-center gap-1.5 text-xs text-text-muted">
            <CalendarClock className="size-3.5" aria-hidden /> Also made {EVERY[type.schedule]}.
          </p>
        ) : null}
        <div>
          <Button
            type="submit"
            variant="primary"
            icon={<Play className="size-4" />}
            loading={request.isPending}
          >
            Make report
          </Button>
        </div>
      </form>
    </Panel>
  );
}

/** @param {{ run: import("./api.js").ReportRun }} props */
function RunRow({ run }) {
  const [busy, setBusy] = useState(/** @type {"pdf" | "csv" | null} */ (null));
  const [error, setError] = useState(/** @type {string | null} */ (null));
  /** @param {"pdf" | "csv"} format */
  const get = async (format) => {
    setBusy(format);
    setError(null);
    try {
      await downloadRun(run, format);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't download.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-text">{run.title}</span>
        <span className="block text-xs text-text-muted">
          {run.periodLabel} · {run.scope.label}
        </span>
        <span className="block text-xs text-text-faint">
          {run.trigger === "scheduled" ? "Scheduled" : `By ${run.requestedBy}`},{" "}
          {formatDateTime(run.createdAt)}
          {run.files.pdf ? (
            <span title={`PDF SHA-256 ${run.files.pdf.sha256}`}>
              {" "}
              · fingerprint {run.files.pdf.sha256.slice(0, 12)}…
            </span>
          ) : null}
        </span>
        {error ? <span className="block text-xs text-danger">{error}</span> : null}
        {run.status === "failed" ? (
          <span className="block text-xs text-danger">{run.error}</span>
        ) : null}
      </span>
      {run.status === "failed" ? (
        <Badge tone="danger">Failed</Badge>
      ) : (
        <span className="flex gap-2">
          <Button
            size="sm"
            icon={<Download className="size-4" />}
            loading={busy === "pdf"}
            onClick={() => get("pdf")}
          >
            PDF
          </Button>
          <Button
            size="sm"
            icon={<Download className="size-4" />}
            loading={busy === "csv"}
            onClick={() => get("csv")}
          >
            CSV
          </Button>
        </span>
      )}
    </li>
  );
}
