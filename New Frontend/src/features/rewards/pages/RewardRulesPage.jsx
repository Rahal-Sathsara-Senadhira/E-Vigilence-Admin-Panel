// Reward rules (docs/16 §5, §6): points by severity, points for particular
// offences, warnings, and the money rules. HQ administrators change them
// with a reason; a change applies to cases decided after it. Others read.

import { ArrowLeft, Save } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useOffences } from "@/features/offences/index.js";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Button, Field, Input, Page, Panel, Skeleton, Textarea } from "@/ui/index.js";
import { useRewardRules, useSaveRewardRules } from "../api.js";

/** @typedef {import("../api.js").RewardRules} Rules */

export function RewardRulesPage() {
  const user = useCurrentUser();
  const rules = useRewardRules();
  const back = (
    <Link
      to="/rewards"
      className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
    >
      <ArrowLeft className="size-4" aria-hidden /> Rewards
    </Link>
  );
  return (
    <Page
      title="Reward rules"
      description="A change applies to cases decided after it; points already earned keep their rules."
      className="max-w-[1100px]"
      back={back}
    >
      {rules.isPending ? (
        <Skeleton className="h-96" />
      ) : rules.isError ? (
        <Alert tone="danger">{rules.error.message}</Alert>
      ) : (
        <RulesForm
          key={rules.data.history[0]?.effectiveFrom ?? "default"}
          current={rules.data.current}
          history={rules.data.history}
          editable={can(user, "rewards.manageRules")}
        />
      )}
    </Page>
  );
}

/**
 * @param {{ current: Rules, history: { effectiveFrom: string, changedBy: string, reason: string }[], editable: boolean }} props
 */
function RulesForm({ current, history, editable }) {
  const offences = useOffences({ status: "active" });
  const save = useSaveRewardRules();
  const [v, setV] = useState(current);
  const [overrides, setOverrides] = useState(
    () => new Map(current.offencePoints.map((o) => [o.code, String(o.points)])),
  );
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [saved, setSaved] = useState(false);

  /** @param {keyof Rules["severityPoints"]} k */
  const severity = (k) => ({
    value: String(v.severityPoints[k]),
    onChange: (/** @type {any} */ e) =>
      setV({ ...v, severityPoints: { ...v.severityPoints, [k]: Number(e.target.value) } }),
  });
  /** @param {"warningPoints" | "rupeesPer100Points" | "minPayoutPoints" | "monthlyCapRupees" | "dailyEarningReports"} k */
  const number = (k) => ({
    value: String(v[k]),
    onChange: (/** @type {any} */ e) => setV({ ...v, [k]: Number(e.target.value) }),
  });
  const rows = useMemo(
    () => [...(offences.data ?? [])].sort((a, b) => a.code.localeCompare(b.code)),
    [offences.data],
  );

  const field = {
    type: "number",
    min: 0,
    inputMode: /** @type {const} */ ("numeric"),
    disabled: !editable,
  };

  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setErrors({});
        setSaved(false);
        try {
          await save.mutateAsync({
            ...v,
            offencePoints: [...overrides]
              .filter(([, p]) => p !== "")
              .map(([code, p]) => ({ code, points: Number(p) })),
            reason,
          });
          setReason("");
          setSaved(true);
        } catch (err) {
          setErrors(
            err instanceof ApiError && Object.keys(err.fields).length
              ? err.fields
              : { root: err instanceof Error ? err.message : "Please try again." },
          );
        }
      }}
    >
      {saved ? (
        <Alert tone="success">Saved. The new rules apply to cases decided from now.</Alert>
      ) : null}
      {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Points" description="A case earns its highest offence's points, not the sum.">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Minor offence">
              {(p) => <Input {...p} {...field} {...severity("minor")} />}
            </Field>
            <Field label="Moderate offence">
              {(p) => <Input {...p} {...field} {...severity("moderate")} />}
            </Field>
            <Field label="Severe offence">
              {(p) => <Input {...p} {...field} {...severity("severe")} />}
            </Field>
            <Field label="Warning" hint="Confirmed when the warning is issued">
              {(p) => <Input {...p} {...field} {...number("warningPoints")} />}
            </Field>
          </div>
          <p className="border-t border-border px-5 py-3 text-xs text-text-muted">
            Lead report 100% · a later report adding evidence 25% · a plain duplicate nothing.
          </p>
        </Panel>
        <Panel title="Money and limits" description="Simulated until a funding source is approved.">
          <div className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label="Rupees per 100 points">
              {(p) => <Input {...p} {...field} {...number("rupeesPer100Points")} />}
            </Field>
            <Field label="Minimum payout (points)">
              {(p) => <Input {...p} {...field} {...number("minPayoutPoints")} />}
            </Field>
            <Field label="Monthly cap per citizen (Rs)">
              {(p) => <Input {...p} {...field} {...number("monthlyCapRupees")} />}
            </Field>
            <Field label="Earning reports per day">
              {(p) => <Input {...p} {...field} {...number("dailyEarningReports")} />}
            </Field>
          </div>
        </Panel>
      </div>

      <Panel
        title="Points for particular offences"
        description="Leave blank to use the severity's points."
      >
        {offences.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : (
          <ul className="max-h-[420px] divide-y divide-border overflow-y-auto">
            {rows.map((o) => (
              <li key={o.code} className="flex items-center gap-3 px-5 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-mono text-[13px] text-text">{o.code}</span>
                  <span className="ml-2 text-text-muted">{o.name}</span>
                  <span className="ml-2 text-xs text-text-faint">{o.severity}</span>
                </span>
                <div className="w-24 shrink-0">
                  <Input
                    aria-label={`Points for ${o.code}`}
                    {...field}
                    placeholder={String(v.severityPoints[o.severity])}
                    value={overrides.get(o.code) ?? ""}
                    onChange={(e) => {
                      const next = new Map(overrides);
                      next.set(o.code, e.target.value);
                      setOverrides(next);
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editable ? (
        <Panel title="Save a new version">
          <div className="grid gap-3 p-5">
            <Field label="Reason for the change" error={errors.reason}>
              {({ invalid, ...p }) => (
                <Textarea
                  {...p}
                  invalid={invalid}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
            <div>
              <Button
                type="submit"
                variant="primary"
                icon={<Save className="size-4" />}
                loading={save.isPending}
              >
                Save rules
              </Button>
            </div>
          </div>
        </Panel>
      ) : null}

      <Panel title="Changes">
        {history.length === 0 ? (
          <p className="p-5 text-sm text-text-muted">The agreed defaults (docs/16) are in force.</p>
        ) : (
          <ol className="grid gap-3 p-5">
            {history.map((h) => (
              <li key={h.effectiveFrom} className="border-l-2 border-border pl-3 text-sm">
                <p className="text-text">{h.reason}</p>
                <p className="text-xs text-text-muted">
                  {h.changedBy} · from {formatDateTime(h.effectiveFrom)}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </form>
  );
}
