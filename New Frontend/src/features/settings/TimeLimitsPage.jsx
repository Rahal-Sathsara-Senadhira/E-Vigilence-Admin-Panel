// Time limits — docs/09. HQ administrator only. A change applies to items
// that start after it; existing deadlines never move (docs/09 T2).

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil } from "lucide-react";
import { useState } from "react";
import { ApiError, api } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Page,
  Panel,
  Skeleton,
  Textarea,
} from "@/ui/index.js";

/**
 * @typedef {object} TimeLimit
 * @property {string} key
 * @property {string} group
 * @property {string} label
 * @property {"minutes" | "hours" | "days" | "months" | "count"} unit
 * @property {string} responsible
 * @property {string} onBreach
 * @property {number} defaultValue
 * @property {number} max
 * @property {number} value
 * @property {string | null} changedAt
 * @property {{ value: number, effectiveFrom: string, changedBy: string, reason: string }[]} history
 */

/** "2 hours", "1 day", "5" (count). @param {number} n @param {TimeLimit["unit"]} unit */
const amount = (n, unit) =>
  unit === "count" ? String(n) : `${n} ${n === 1 ? unit.replace(/s$/, "") : unit}`;

export function TimeLimitsPage() {
  const limits = useQuery({
    queryKey: ["settings", "time-limits"],
    queryFn: () => /** @type {Promise<TimeLimit[]>} */ (api("/settings/time-limits")),
  });
  const [editing, setEditing] = useState(/** @type {TimeLimit | null} */ (null));

  const groups = new Map();
  for (const l of limits.data ?? []) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);

  return (
    <Page
      title="Time limits"
      description="How long each step may take before it is overdue. Calendar time, around the clock. A change applies to items that start after it — existing deadlines don't move."
    >
      {limits.isPending ? (
        <Skeleton className="h-96" />
      ) : limits.isError ? (
        <Alert tone="danger">{limits.error.message}</Alert>
      ) : (
        <div className="grid gap-6">
          {[...groups.entries()].map(([group, items]) => (
            <Panel key={group} title={group}>
              <ul className="divide-y divide-border">
                {
                  /** @type {TimeLimit[]} */ (items).map((l) => (
                    <li
                      key={l.key}
                      className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-text">{l.label}</p>
                        <p className="text-[13px] text-text-muted">
                          {l.responsible !== "—" ? `${l.responsible} · ` : ""}On breach:{" "}
                          {l.onBreach}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-[15px] font-semibold tabular-nums text-text">
                            {amount(l.value, l.unit)}
                          </p>
                          {l.value !== l.defaultValue ? (
                            <p className="text-xs text-text-muted">
                              Default {amount(l.defaultValue, l.unit)}
                            </p>
                          ) : null}
                        </div>
                        {l.value !== l.defaultValue ? <Badge tone="action">Changed</Badge> : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Change: ${l.label}`}
                          icon={<Pencil className="size-4" />}
                          onClick={() => setEditing(l)}
                        />
                      </div>
                    </li>
                  ))
                }
              </ul>
            </Panel>
          ))}
        </div>
      )}
      {editing ? <ChangeDialog limit={editing} onClose={() => setEditing(null)} /> : null}
    </Page>
  );
}

/** @param {{ limit: TimeLimit, onClose: () => void }} props */
function ChangeDialog({ limit, onClose }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(String(limit.value));
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const save = useMutation({
    mutationFn: () =>
      api(`/settings/time-limits/${limit.key}`, {
        method: "PUT",
        body: { value: Number(value), reason },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["settings", "time-limits"] });
      onClose();
    },
    onError: (err) =>
      setErrors(
        err instanceof ApiError && Object.keys(err.fields).length
          ? err.fields
          : { root: err instanceof Error ? err.message : "Please try again." },
      ),
  });

  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={limit.label}
      description="The new value applies to items that start from now on."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field
          label={limit.unit === "count" ? "Number" : `Length (${limit.unit})`}
          hint={`Default ${amount(limit.defaultValue, limit.unit)}. Up to ${limit.max}.`}
          error={errors.value}
        >
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              autoFocus
              inputMode="numeric"
              className="max-w-32 tabular-nums"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </Field>
        <Field label="Reason" hint="Recorded with the change." error={errors.reason}>
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
        {limit.history.length ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-text">
              <History className="size-4" aria-hidden /> Earlier changes
            </p>
            <ol className="grid gap-2 text-[13px]">
              {limit.history.map((h) => (
                <li key={h.effectiveFrom} className="border-l-2 border-border pl-3 text-text-muted">
                  <span className="font-medium text-text">{amount(h.value, limit.unit)}</span> from{" "}
                  {formatDateTime(h.effectiveFrom)} · {h.changedBy} — {h.reason}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
