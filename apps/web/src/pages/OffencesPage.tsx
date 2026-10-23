// The offence schedule — docs/14 D14-8. Every staff member can read it; HQ
// changes create a new version (with a reason) that applies from now on, so
// older notices keep their fines.

import {
  OFFENCE_OUTCOMES,
  SEVERITIES,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  formatRupees,
  type OffenceView,
  type PublicOffence,
  type Severity,
} from "@ev/shared";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Field,
  Input,
  PageHeader,
  Select,
  Skeleton,
  Table,
  Tag,
  Td,
  Textarea,
  Th,
  Tr,
} from "@ev/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Pencil, Smartphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../auth/AuthProvider";
import { ApiError, api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { useOffences } from "../lib/reports";

const SEVERITY_LABELS: Record<Severity, string> = {
  severe: "Severe",
  moderate: "Moderate",
  minor: "Minor",
};

export function OffencesPage() {
  const { allowed } = useAuth();
  const canEdit = allowed("offences.manage");
  const offences = useOffences({ includeInactive: true });
  const [editing, setEditing] = useState<OffenceView | null>(null);
  const [history, setHistory] = useState<OffenceView | null>(null);
  const [showPublic, setShowPublic] = useState(false);

  return (
    <>
      <PageHeader
        title="Offence schedule"
        description="Offences, fines and how each is dealt with. A change is a new version from now on — older notices keep their fines."
        actions={
          <Button icon={<Smartphone className="size-4" />} onClick={() => setShowPublic(true)}>
            What the app shows
          </Button>
        }
      />
      <div className="mb-4">
        <Alert tone="info" title="To be confirmed by HQ legal before go-live">
          Seeded from Extraordinary Gazette 2054/9 (2018 spot fines) and the Motor Traffic
          (Amendment) Act No. 10 of 2019.
        </Alert>
      </div>
      <Card>
        {offences.isPending ? (
          <Skeleton className="m-4 h-96" />
        ) : offences.isError ? (
          <div className="p-4">
            <Alert tone="danger">{(offences.error as Error).message}</Alert>
          </div>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Offence</Th>
                <Th>Law</Th>
                <Th>Outcome</Th>
                <Th>Severity</Th>
                <Th>Citizens</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {offences.data.map((o) => (
                <Tr key={o.code} className={o.active ? "" : "opacity-60"}>
                  <Td>
                    <p className="font-medium">{o.name}</p>
                    <p className="text-xs text-muted">
                      <span className="font-mono">{o.code}</span> · version {o.version}
                      {o.active ? "" : " · inactive"}
                    </p>
                  </Td>
                  <Td className="text-muted">{o.legalReference}</Td>
                  <Td className="whitespace-nowrap tabular-nums">
                    {o.outcome === "court" ? "Court" : formatRupees(o.spotFine)}
                  </Td>
                  <Td>
                    <Tag>{SEVERITY_LABELS[o.severity]}</Tag>
                  </Td>
                  <Td className="text-muted">
                    {o.citizenReportable ? o.publicName : "Officers only"}
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1">
                      {o.version > 1 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`History of ${o.code}`}
                          icon={<History className="size-4" />}
                          onClick={() => setHistory(o)}
                        />
                      ) : null}
                      {canEdit ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Change ${o.code}`}
                          icon={<Pencil className="size-4" />}
                          onClick={() => setEditing(o)}
                        />
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      {editing ? <EditOffenceDialog offence={editing} onClose={() => setEditing(null)} /> : null}
      {history ? <HistoryDialog offence={history} onClose={() => setHistory(null)} /> : null}
      {showPublic ? <PublicDialog onClose={() => setShowPublic(false)} /> : null}
    </>
  );
}

function EditOffenceDialog({ offence, onClose }: { offence: OffenceView; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: offence.name,
    legalReference: offence.legalReference,
    outcome: offence.outcome,
    spotFine: offence.spotFine === null ? "" : String(offence.spotFine),
    severity: offence.severity,
    vehicleTypes: offence.vehicleTypes,
    citizenReportable: offence.citizenReportable,
    publicName: offence.publicName,
    publicDescription: offence.publicDescription,
    active: offence.active,
    reason: "",
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      api<OffenceView>(`/offences/${offence.code}`, {
        method: "PUT",
        body: {
          ...form,
          spotFine: form.outcome === "court" ? null : Number(form.spotFine),
          demeritPoints: offence.demeritPoints,
        },
      }),
    onSuccess: (o) => {
      void queryClient.invalidateQueries({ queryKey: ["offences"] });
      toast.success(`${o.code} is now version ${o.version}, in force from now.`);
      onClose();
    },
  });
  const err =
    save.error instanceof ApiError
      ? (Object.values(save.error.fields)[0] ?? save.error.message)
      : (save.error as Error | null)?.message;

  return (
    <Dialog
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={`Change ${offence.code}`}
      description="Saves a new version that applies from now. Notices already issued keep the old fine."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={save.isPending}
            disabled={form.reason.trim().length < 5}
            onClick={() => save.mutate()}
          >
            Save new version
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {err ? (
          <div className="sm:col-span-2">
            <Alert tone="danger">{err}</Alert>
          </div>
        ) : null}
        <Field label="Name" className="sm:col-span-2">
          {(p) => <Input {...p} value={form.name} onChange={(e) => set("name", e.target.value)} />}
        </Field>
        <Field label="Legal reference">
          {(p) => (
            <Input
              {...p}
              value={form.legalReference}
              onChange={(e) => set("legalReference", e.target.value)}
            />
          )}
        </Field>
        <Field label="Outcome">
          {(p) => (
            <Select
              {...p}
              value={form.outcome}
              onChange={(e) => set("outcome", e.target.value as typeof form.outcome)}
            >
              {OFFENCE_OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {o === "court" ? "Court only" : "Spot fine"}
                </option>
              ))}
            </Select>
          )}
        </Field>
        {form.outcome === "spot_fine" ? (
          <Field label="Spot fine (Rs)">
            {(p) => (
              <Input
                {...p}
                type="number"
                min={1}
                className="tabular-nums"
                value={form.spotFine}
                onChange={(e) => set("spotFine", e.target.value)}
              />
            )}
          </Field>
        ) : null}
        <Field label="Severity" hint="Severe suggests P1 and the highest reward tier.">
          {(p) => (
            <Select
              {...p}
              value={form.severity}
              onChange={(e) => set("severity", e.target.value as Severity)}
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium text-ink">
            Vehicles (none ticked = any vehicle)
          </legend>
          <div className="flex flex-wrap gap-3">
            {VEHICLE_TYPES.map((v) => (
              <label key={v} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--ev-primary)]"
                  checked={form.vehicleTypes.includes(v)}
                  onChange={(e) =>
                    set(
                      "vehicleTypes",
                      e.target.checked
                        ? [...form.vehicleTypes, v]
                        : form.vehicleTypes.filter((x) => x !== v),
                    )
                  }
                />
                {VEHICLE_TYPE_LABELS[v]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ev-primary)]"
            checked={form.citizenReportable}
            onChange={(e) => set("citizenReportable", e.target.checked)}
          />
          Citizens can report it in the app
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4 accent-[var(--ev-primary)]"
            checked={form.active}
            onChange={(e) => set("active", e.target.checked)}
          />
          Active
        </label>
        <Field label="Name in the app">
          {(p) => (
            <Input
              {...p}
              value={form.publicName}
              onChange={(e) => set("publicName", e.target.value)}
            />
          )}
        </Field>
        <Field label="Description in the app">
          {(p) => (
            <Input
              {...p}
              value={form.publicDescription}
              onChange={(e) => set("publicDescription", e.target.value)}
            />
          )}
        </Field>
        <Field
          label="Reason for the change"
          hint="e.g. the gazette notification number."
          className="sm:col-span-2"
        >
          {(p) => (
            <Textarea
              {...p}
              rows={2}
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

function HistoryDialog({ offence, onClose }: { offence: OffenceView; onClose: () => void }) {
  const history = useQuery({
    queryKey: ["offence-history", offence.code],
    queryFn: () => api<OffenceView[]>(`/offences/${offence.code}/history`),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={`${offence.code} — versions`}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {history.isPending ? (
        <Skeleton className="h-24" />
      ) : (
        <ol className="space-y-3 border-l-2 border-line pl-4">
          {history.data?.map((v) => (
            <li key={v.version} className="text-sm">
              <p className="font-medium text-ink">
                Version {v.version} · {v.outcome === "court" ? "Court" : formatRupees(v.spotFine)}
              </p>
              <p className="text-xs text-muted">From {formatDateTime(v.effectiveFrom)}</p>
            </li>
          ))}
        </ol>
      )}
    </Dialog>
  );
}

function PublicDialog({ onClose }: { onClose: () => void }) {
  const list = useQuery({
    queryKey: ["offences-public"],
    queryFn: () => api<PublicOffence[]>("/offences/public"),
  });
  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="What the mobile app shows"
      description="Names and descriptions only — citizens never see fines or legal references."
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {list.isPending ? (
        <Skeleton className="h-40" />
      ) : (
        <ul className="divide-y divide-line">
          {list.data?.map((o) => (
            <li key={o.code} className="py-2.5 text-sm">
              <p className="font-medium text-ink">{o.name}</p>
              <p className="text-muted">{o.description}</p>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
