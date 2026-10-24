// Demerit points (docs/08): the switch and thresholds — changed by HQ
// administrators with a reason, never retroactive (D08-1) — and, for HQ
// supervisors, the drivers at a threshold.

import { Save } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import { can } from "@/lib/permissions.js";
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
  Skeleton,
  Textarea,
  cn,
} from "@/ui/index.js";
import { useDemeritSettings, useSaveDemeritSettings, useStandings } from "./api.js";

export function DemeritPage() {
  const user = useCurrentUser();
  const settings = useDemeritSettings();
  return (
    <Page
      title="Demerit points"
      description="Points per offence are set on the offence schedule. The system flags drivers and records referrals; it never suspends a licence."
    >
      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        {settings.isPending ? (
          <Skeleton className="h-72" />
        ) : settings.isError ? (
          <Alert tone="danger">{settings.error.message}</Alert>
        ) : (
          <Settings
            key={settings.data.history[0]?.effectiveFrom ?? "default"}
            current={settings.data.current}
            history={settings.data.history}
            editable={can(user, "demerit.manage")}
          />
        )}
        {can(user, "demerit.refer") ? <Drivers /> : null}
      </div>
    </Page>
  );
}

/**
 * @param {{ current: import("./api.js").DemeritSettings, history: any[], editable: boolean }} props
 */
function Settings({ current, history, editable }) {
  const save = useSaveDemeritSettings();
  const [v, setV] = useState({ ...current, reason: "" });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  return (
    <Panel title="The scheme">
      <form
        className="grid gap-3 p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          setErrors({});
          try {
            await save.mutateAsync(v);
          } catch (err) {
            setErrors(
              err instanceof ApiError && Object.keys(err.fields).length
                ? err.fields
                : { root: err instanceof Error ? err.message : "Please try again." },
            );
          }
        }}
      >
        <Badge tone={current.enabled ? "success" : "neutral"} className="w-fit">
          {current.enabled ? "On — points are recorded" : "Off — no points are recorded"}
        </Badge>
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        {editable ? (
          <>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ev-action)]"
                checked={v.enabled}
                onChange={(e) => setV({ ...v, enabled: e.target.checked })}
              />
              Record demerit points (applies to outcomes from now on)
            </label>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Warning at" error={errors.warnAt}>
                {({ invalid, ...p }) => (
                  <Input
                    {...p}
                    invalid={invalid}
                    type="number"
                    min={1}
                    value={String(v.warnAt)}
                    onChange={(e) => setV({ ...v, warnAt: Number(e.target.value) })}
                  />
                )}
              </Field>
              <Field label="Referral at" error={errors.referAt}>
                {({ invalid, ...p }) => (
                  <Input
                    {...p}
                    invalid={invalid}
                    type="number"
                    min={1}
                    value={String(v.referAt)}
                    onChange={(e) => setV({ ...v, referAt: Number(e.target.value) })}
                  />
                )}
              </Field>
            </div>
            <Field label="Reason" error={errors.reason}>
              {({ invalid, ...p }) => (
                <Textarea
                  {...p}
                  invalid={invalid}
                  rows={2}
                  value={v.reason}
                  onChange={(e) => setV({ ...v, reason: e.target.value })}
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
                Save
              </Button>
            </div>
          </>
        ) : (
          <p className="text-sm text-text-muted">
            Warning at {current.warnAt} points; referral to the Department of Motor Traffic at{" "}
            {current.referAt}.
          </p>
        )}
      </form>
      {history.length ? (
        <ol className="grid gap-3 border-t border-border p-5">
          {history.map((h) => (
            <li key={h.effectiveFrom} className="border-l-2 border-border pl-3 text-sm">
              <p className="text-text">
                {h.enabled ? "On" : "Off"} · warning {h.warnAt} · referral {h.referAt} — {h.reason}
              </p>
              <p className="text-xs text-text-muted">
                {h.changedBy} · from {formatDateTime(h.effectiveFrom)}
              </p>
            </li>
          ))}
        </ol>
      ) : null}
    </Panel>
  );
}

function Drivers() {
  const [params, setParams] = useSearchParams();
  const flag = params.get("flag") === "approaching" ? "approaching" : "threshold";
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useStandings({ flag, page }, true);
  return (
    <Panel title="Drivers">
      <div className="flex gap-1 border-b border-border p-3" role="tablist">
        {[
          ["threshold", "At the suspension threshold"],
          ["approaching", "Approaching"],
        ].map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={flag === k}
            onClick={() => setParams(k === "threshold" ? {} : { flag: k }, { replace: true })}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              flag === k
                ? "bg-action-soft font-medium text-action"
                : "text-text-muted hover:bg-sunken",
            )}
          >
            {l}
          </button>
        ))}
      </div>
      {list.isPending ? (
        <Skeleton className="m-4 h-40" />
      ) : list.isError ? (
        <p className="p-4 text-sm text-danger">{list.error.message}</p>
      ) : list.data.items.length === 0 ? (
        <EmptyState
          title="No drivers here"
          description="Drivers appear when their points reach a threshold."
        />
      ) : (
        <>
          <ul className="divide-y divide-border">
            {list.data.items.map((d) => (
              <li key={d.personId}>
                <Link
                  to={`/persons/${d.personId}`}
                  className="flex items-center gap-3 px-5 py-3 hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-text">{d.name}</span>
                    <span className="block text-xs text-text-muted">
                      {d.licenceNumber ? `Licence ${d.licenceNumber} · ` : ""}flagged{" "}
                      {formatDateTime(d.flaggedAt)}
                    </span>
                  </span>
                  {flag === "threshold" ? (
                    <Badge tone={d.referred ? "success" : "danger"}>
                      {d.referred ? "Referred" : "To refer"}
                    </Badge>
                  ) : null}
                  <span className="w-12 text-right font-semibold tabular-nums">{d.total}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Pagination
            page={list.data.page}
            pageSize={list.data.pageSize}
            total={list.data.total}
            noun="drivers"
            onPage={(p) =>
              setParams({ ...(flag === "approaching" ? { flag } : {}), page: String(p) })
            }
          />
        </>
      )}
    </Panel>
  );
}
