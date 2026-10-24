// A person's demerit points (docs/08 §6–§8): the current total against the
// thresholds, the flag, the ledger, and — at the threshold — HQ's referral
// to the Department of Motor Traffic. The system never suspends a licence.

import { AlertTriangle, Send } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Badge, Button, Dialog, Field, Input, Panel, cn } from "@/ui/index.js";
import { usePersonPoints, useRecordReferral } from "./api.js";

const FLAG = {
  approaching: ["Approaching suspension", "warning"],
  threshold: ["Suspension threshold reached", "danger"],
};

/** @param {{ personId: string }} props */
export function PersonPoints({ personId }) {
  const user = useCurrentUser();
  const points = usePersonPoints(personId);
  const [referring, setReferring] = useState(false);
  if (points.isPending || points.isError) return null;
  const p = points.data;
  // Nothing to show while the scheme is off and no points were ever recorded.
  if (!p.enabled && p.entries.length === 0) return null;
  const flag = p.flag === "none" ? null : FLAG[p.flag];
  const pct = Math.min(100, (p.total / p.referAt) * 100);

  return (
    <Panel
      title="Demerit points"
      actions={
        p.flag === "threshold" && !p.referral && can(user, "demerit.refer") ? (
          <Button
            size="sm"
            variant="primary"
            icon={<Send className="size-4" />}
            onClick={() => setReferring(true)}
          >
            Record DMT referral
          </Button>
        ) : null
      }
    >
      <div className="grid gap-3 p-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-semibold tabular-nums text-text">{p.total}</span>
          <span className="text-sm text-text-muted">
            of {p.referAt} (warning at {p.warnAt}) · points expire 24 months after the offence
          </span>
          {flag ? (
            <Badge tone={/** @type {any} */ (flag[1])}>
              <AlertTriangle className="size-3" aria-hidden /> {flag[0]}
            </Badge>
          ) : null}
        </div>
        <div className="relative h-2 rounded-full bg-sunken" aria-hidden>
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full",
              p.flag === "threshold"
                ? "bg-danger"
                : p.flag === "approaching"
                  ? "bg-warning"
                  : "bg-action",
            )}
            style={{ width: `${pct}%` }}
          />
          <span
            className="absolute -top-1 h-4 w-px bg-text-muted"
            style={{ left: `${(p.warnAt / p.referAt) * 100}%` }}
          />
        </div>
        {!p.enabled ? (
          <p className="text-xs text-text-muted">
            The scheme is off: no new points are recorded; these expire as normal.
          </p>
        ) : null}
        {p.referral ? (
          <Alert tone="info" title="Referred to the Department of Motor Traffic">
            {p.referral.reference}, {formatDateTime(p.referral.referredOn)} · recorded by{" "}
            {p.referral.by}
          </Alert>
        ) : null}
      </div>
      {p.entries.length ? (
        <ul className="divide-y divide-border border-t border-border text-sm">
          {p.entries.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5",
                e.expired && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "w-12 font-semibold tabular-nums",
                  e.points < 0 ? "text-text-muted" : "text-text",
                )}
              >
                {e.points > 0 ? `+${e.points}` : e.points}
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  to={
                    e.source.type === "notice" ? `/notices/${e.source.id}` : `/court/${e.source.id}`
                  }
                  className="font-mono text-[13px] hover:underline"
                >
                  {e.source.number}
                </Link>
                <span className="text-text-muted"> · {e.offenceCodes.join(", ")}</span>
                {e.reason ? (
                  <span className="block text-xs text-text-muted">Removed: {e.reason}</span>
                ) : null}
              </span>
              <span className="text-xs text-text-muted">
                {e.expired ? "expired" : "expires"} {formatDateTime(e.expiresAt).split(",")[0]}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {referring ? <Referral personId={personId} onClose={() => setReferring(false)} /> : null}
    </Panel>
  );
}

/** @param {{ personId: string, onClose: () => void }} props */
function Referral({ personId, onClose }) {
  const refer = useRecordReferral(personId);
  const [v, setV] = useState({ reference: "", referredOn: new Date().toISOString().slice(0, 10) });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Record the DMT referral"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={refer.isPending}
            onClick={async () => {
              setErrors({});
              try {
                await refer.mutateAsync(v);
                onClose();
              } catch (err) {
                setErrors(
                  err instanceof ApiError && Object.keys(err.fields).length
                    ? err.fields
                    : { root: err instanceof Error ? err.message : "Please try again." },
                );
              }
            }}
          >
            Record referral
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="text-sm text-text-muted">
          The Department of Motor Traffic decides on suspension; this records that the driver was
          referred.
        </p>
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="DMT reference" error={errors.reference}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              value={v.reference}
              onChange={(e) => setV({ ...v, reference: e.target.value })}
            />
          )}
        </Field>
        <Field label="Referred on" error={errors.referredOn}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              type="date"
              value={v.referredOn}
              onChange={(e) => setV({ ...v, referredOn: e.target.value })}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
