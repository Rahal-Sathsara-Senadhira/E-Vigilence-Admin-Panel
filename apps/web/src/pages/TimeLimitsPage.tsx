// Time limits — docs/09 §4. Every staff member sees the limits they work to;
// only HQ changes them, with a reason, and a change applies only to items
// that start afterwards (T2, D09-8).

import { zodResolver } from "@hookform/resolvers/zod";
import {
  formatLimit,
  updateTimeLimitSchema,
  type TimeLimitChangeView,
  type TimeLimitView,
} from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  PageHeader,
  Skeleton,
  Table,
  Tag,
  Td,
  Textarea,
  Th,
  Tr,
} from "@ev/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { useAuth } from "../auth/AuthProvider";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";

export function TimeLimitsPage() {
  const { allowed } = useAuth();
  const canEdit = allowed("settings.timeLimits");
  const [editing, setEditing] = useState<TimeLimitView | null>(null);
  const [viewing, setViewing] = useState<TimeLimitView | null>(null);
  const limits = useQuery({
    queryKey: ["time-limits"],
    queryFn: () => api<TimeLimitView[]>("/settings/time-limits"),
  });

  const groups = new Map<string, TimeLimitView[]>();
  for (const l of limits.data ?? []) groups.set(l.group, [...(groups.get(l.group) ?? []), l]);

  return (
    <>
      <PageHeader
        title="Time limits"
        description="Deadlines for every step, counted in calendar time. A change applies only to work that starts after it."
      />
      {!canEdit ? (
        <div className="mb-4">
          <Alert tone="info">Only HQ can change time limits.</Alert>
        </div>
      ) : null}

      {limits.isPending ? (
        <Skeleton className="h-96" />
      ) : limits.isError ? (
        <Alert tone="danger">{(limits.error as Error).message}</Alert>
      ) : (
        <div className="space-y-6">
          {[...groups.entries()].map(([group, rows]) => (
            <Card key={group}>
              <div className="border-b border-line px-5 py-3">
                <h2 className="text-base font-semibold text-ink">{group}</h2>
              </div>
              <Table fixed>
                <thead>
                  <tr>
                    <Th className="w-[40%]">Step</Th>
                    <Th className="w-[18%]">Who acts</Th>
                    <Th className="w-[20%]">Limit</Th>
                    <Th>Last change</Th>
                    <Th className="w-28">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((l) => (
                    <Tr key={l.key}>
                      <Td>
                        <p className="font-medium">{l.label}</p>
                        <p className="text-xs text-muted">Defined in docs {l.source}</p>
                      </Td>
                      <Td className="text-muted">{l.responsible}</Td>
                      <Td className="whitespace-nowrap tabular-nums">
                        <span className="font-medium">{formatLimit(l.unit, l.value)}</span>
                        {l.value !== l.default ? (
                          <Tag className="ml-2">Default {formatLimit(l.unit, l.default)}</Tag>
                        ) : null}
                      </Td>
                      <Td className="text-muted">
                        {l.effectiveFrom ? (
                          <>
                            {formatDateTime(l.effectiveFrom)}
                            <span className="block text-xs">by {l.changedBy}</span>
                          </>
                        ) : (
                          "Default"
                        )}
                      </Td>
                      <Td>
                        <div className="flex justify-end gap-1">
                          {l.effectiveFrom ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`History of ${l.label}`}
                              icon={<History className="size-4" />}
                              onClick={() => setViewing(l)}
                            />
                          ) : null}
                          {canEdit ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Change ${l.label}`}
                              icon={<Pencil className="size-4" />}
                              onClick={() => setEditing(l)}
                            />
                          ) : null}
                        </div>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          ))}
        </div>
      )}

      {editing ? <EditDialog limit={editing} onClose={() => setEditing(null)} /> : null}
      {viewing ? <HistoryDialog limit={viewing} onClose={() => setViewing(null)} /> : null}
    </>
  );
}

type EditIn = z.input<typeof updateTimeLimitSchema>;
type EditOut = z.output<typeof updateTimeLimitSchema>;

function EditDialog({ limit, onClose }: { limit: TimeLimitView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<EditIn, unknown, EditOut>({
    resolver: zodResolver(updateTimeLimitSchema),
    defaultValues: { value: limit.value, reason: "" },
  });
  const save = useMutation({
    mutationFn: (v: EditOut) =>
      api(`/settings/time-limits/${limit.key}`, { method: "PUT", body: v }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["time-limits"] });
      toast.success("Time limit changed. It applies to work that starts from now.");
      onClose();
    },
    onError: (err) => setError((err as Error).message),
  });
  const unitLabel =
    limit.unit === "count" ? "Number" : limit.unit[0]!.toUpperCase() + limit.unit.slice(1);

  return (
    <Dialog
      open
      size="sm"
      onOpenChange={(o) => !o && onClose()}
      title={limit.label}
      description="Work already under way keeps the limit it started with."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={form.handleSubmit((v) => save.mutate(v))}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field
          label={unitLabel}
          hint={`Between ${formatLimit(limit.unit, limit.min)} and ${formatLimit(limit.unit, limit.max)}. Default ${formatLimit(limit.unit, limit.default)}.`}
          error={form.formState.errors.value?.message}
        >
          {(p) => (
            <Input
              {...p}
              type="number"
              inputMode="numeric"
              min={limit.min}
              max={limit.max}
              className="w-32 tabular-nums"
              {...form.register("value")}
            />
          )}
        </Field>
        <Field
          label="Reason"
          hint="Recorded in the audit log."
          error={form.formState.errors.reason?.message}
        >
          {(p) => <Textarea {...p} rows={3} {...form.register("reason")} />}
        </Field>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ limit, onClose }: { limit: TimeLimitView; onClose: () => void }) {
  const history = useQuery({
    queryKey: ["time-limit-history", limit.key],
    queryFn: () => api<TimeLimitChangeView[]>(`/settings/time-limits/${limit.key}/history`),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`History — ${limit.label}`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {history.isPending ? (
        <Skeleton className="h-24" />
      ) : history.isError ? (
        <Alert tone="danger">{(history.error as Error).message}</Alert>
      ) : (
        <ol className="space-y-4">
          {history.data.map((h) => (
            <li key={h.effectiveFrom} className="border-l-2 border-line pl-4">
              <p className="text-sm font-medium text-ink tabular-nums">
                {formatLimit(limit.unit, h.previous)} → {formatLimit(limit.unit, h.value)}
              </p>
              <p className="text-xs text-muted">
                From {formatDateTime(h.effectiveFrom)} · {h.changedBy}
              </p>
              <p className="mt-1 text-sm text-ink">{h.reason}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}
