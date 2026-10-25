// Data retention (docs/10 §6): what is due under each rule and what is held
// back, the switch — off until the schedule is confirmed by legal review
// (D10-8) — and the runs. Evidence files and personal data are removed;
// counts, dates and outcomes stay for statistics.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Lock, Play, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { api } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Badge, Button, Dialog, Page, Panel, ReasonDialog, Skeleton } from "@/ui/index.js";

/**
 * @typedef {{ id: string, number: string, since: string, reason: string | null }} Item
 * @typedef {{ key: string, label: string, keptFor: string, due: number, held: number, sample: Item[], heldSample: Item[] }} Rule
 * @typedef {{ enabled: boolean,
 *   history: { at: string, enabled: boolean, by: string, reason: string }[],
 *   runs: { id: string, trigger: string, by: string, startedAt: string, finishedAt: string | null,
 *     results: { rule: string, label: string, done: number, held: number, failed: number, problems: string[] }[] }[],
 *   preview: { at: string, rules: Rule[] } }} Overview
 */

export function RetentionPage() {
  const qc = useQueryClient();
  const overview = useQuery({
    queryKey: ["retention"],
    queryFn: () => /** @type {Promise<Overview>} */ (api("/retention")),
  });
  const done = () => qc.invalidateQueries({ queryKey: ["retention"] });
  const toggle = useMutation({
    /** @param {{ enabled: boolean, reason: string }} body */
    mutationFn: (body) => api("/retention/settings", { method: "PUT", body }),
    onSuccess: done,
  });
  const run = useMutation({
    mutationFn: () => api("/retention/run", { method: "POST", body: {} }),
    onSuccess: done,
  });
  const [asking, setAsking] = useState(/** @type {"on" | "off" | "run" | null} */ (null));

  if (overview.isPending)
    return (
      <Page title="Data retention">
        <Skeleton className="h-96" />
      </Page>
    );
  if (overview.isError)
    return (
      <Page title="Data retention">
        <Alert tone="danger">{overview.error.message}</Alert>
      </Page>
    );
  const o = overview.data;
  const due = o.preview.rules.reduce((s, r) => s + r.due, 0);

  return (
    <Page
      title="Data retention"
      description="How long records are kept (docs/10 §6). Nothing linked to an open dispute, court case or appeal is touched."
      actions={
        <div className="flex flex-wrap gap-2">
          {o.enabled ? (
            <>
              <Button
                variant="primary"
                icon={<Play className="size-4" />}
                disabled={due === 0}
                onClick={() => setAsking("run")}
              >
                Run now
              </Button>
              <Button icon={<Lock className="size-4" />} onClick={() => setAsking("off")}>
                Turn off
              </Button>
            </>
          ) : (
            <Button icon={<ShieldCheck className="size-4" />} onClick={() => setAsking("on")}>
              Turn on
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-5">
        {o.enabled ? (
          <Alert tone="info" title="On">
            Runs on the 1st of each month at 03:00 Sri Lanka time. Every record handled is listed in
            the audit log.
          </Alert>
        ) : (
          <Alert tone="warning" title="Off — nothing is deleted">
            The schedule is to be confirmed by the police&apos;s legal advisers against the Personal
            Data Protection Act No. 9 of 2022 (D10-8). Until then this page only shows what would be
            due.
          </Alert>
        )}
        {run.isError ? <Alert tone="danger">{run.error.message}</Alert> : null}

        <Panel title="The schedule" description={`As of ${formatDateTime(o.preview.at)}`}>
          <ul className="divide-y divide-border">
            {o.preview.rules.map((r) => (
              <RuleRow key={r.key} rule={r} />
            ))}
          </ul>
        </Panel>

        <Panel title="Runs">
          {o.runs.length === 0 ? (
            <p className="p-5 text-sm text-text-muted">No runs yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {o.runs.map((run) => (
                <li key={run.id} className="px-5 py-3 text-sm">
                  <p className="text-text">
                    {run.trigger === "monthly" ? "Monthly run" : `Run by ${run.by}`},{" "}
                    {formatDateTime(run.startedAt)}
                  </p>
                  <p className="text-xs text-text-muted">
                    {run.results
                      .map(
                        (x) =>
                          `${x.label}: ${x.done} done, ${x.held} held${x.failed ? `, ${x.failed} failed` : ""}`,
                      )
                      .join(" · ")}
                  </p>
                  {run.results
                    .flatMap((x) => x.problems)
                    .map((e) => (
                      <p key={e} className="text-xs text-danger">
                        {e}
                      </p>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {o.history.length ? (
          <Panel title="Changes">
            <ol className="grid gap-3 p-5">
              {o.history.map((h) => (
                <li key={h.at} className="border-l-2 border-border pl-3 text-sm">
                  <p className="text-text">
                    Turned {h.enabled ? "on" : "off"} — {h.reason}
                  </p>
                  <p className="text-xs text-text-muted">
                    {h.by} · {formatDateTime(h.at)}
                  </p>
                </li>
              ))}
            </ol>
          </Panel>
        ) : null}
      </div>

      {asking === "on" || asking === "off" ? (
        <ReasonDialog
          open
          onOpenChange={(v) => !v && setAsking(null)}
          title={asking === "on" ? "Turn data retention on" : "Turn data retention off"}
          description={
            asking === "on"
              ? "Only once the legal advisers have confirmed the schedule. From then, evidence files and personal data are removed monthly as the schedule says."
              : "Nothing more is removed until it is turned on again."
          }
          confirmLabel={asking === "on" ? "Turn on" : "Turn off"}
          danger={asking === "on"}
          minLength={10}
          onConfirm={(reason) => toggle.mutateAsync({ enabled: asking === "on", reason })}
        />
      ) : null}
      {asking === "run" ? (
        <Dialog
          open
          onOpenChange={(v) => !v && setAsking(null)}
          title="Run data retention now"
          footer={
            <>
              <Button onClick={() => setAsking(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={run.isPending}
                onClick={async () => {
                  await run.mutateAsync();
                  setAsking(null);
                }}
              >
                Delete and anonymise {due} records
              </Button>
            </>
          }
        >
          <p className="text-sm text-text">
            Evidence files of {due} records are deleted and their personal data removed. This
            can&apos;t be undone. Records under legal hold are left alone.
          </p>
        </Dialog>
      ) : null}
    </Page>
  );
}

/** @param {{ rule: Rule }} props */
function RuleRow({ rule: r }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="px-5 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-text">{r.label}</span>
          <span className="block text-xs text-text-muted">{r.keptFor}</span>
        </span>
        {r.held ? <Badge tone="warning">{r.held} on legal hold</Badge> : null}
        <Badge tone={r.due ? "action" : "neutral"}>{r.due} due</Badge>
      </button>
      {open && (r.sample.length || r.heldSample.length) ? (
        <ul className="mt-2 grid gap-1 text-xs">
          {r.sample.map((i) => (
            <li key={i.id} className="flex gap-3 text-text-muted">
              <span className="w-40 font-mono text-text">{i.number}</span>
              <span>since {formatDateTime(i.since)}</span>
            </li>
          ))}
          {r.heldSample.map((i) => (
            <li key={i.id} className="flex gap-3 text-warning">
              <span className="w-40 font-mono">{i.number}</span>
              <span>held: {i.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
