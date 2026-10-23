// Case actions — docs/03, docs/04 §6, docs/05 §3–4. Each dialog posts one
// action; the API checks the state, the role and separation of duties again.

import {
  EVIDENCE_REVIEW_ITEMS,
  NFA_REASONS,
  OUTCOMES,
  OUTCOME_LABELS,
  STATEMENT_FROM,
  VEHICLE_TYPES,
  VEHICLE_TYPE_LABELS,
  type CaseDetail,
  type EvidenceReviewItem,
  type NfaReason,
  type Outcome,
  type PersonSummary,
  type VehicleType,
} from "@ev/shared";
import { Alert, Button, Dialog, Field, Input, Select, Textarea, cn } from "@ev/ui";
import { useMutation } from "@tanstack/react-query";
import { Search, UserPlus } from "lucide-react";
import { useState } from "react";
import {
  OffencePicker,
  formatCoordinates,
  fromLocalInput,
  parseCoordinates,
  toLocalInput,
} from "../../components/reportFields";
import { ApiError, api } from "../../lib/api";
import { useCaseAction, useStationOfficers } from "../../lib/cases";
import { useStations } from "../../lib/queries";
import { useOffences } from "../../lib/reports";

export function errorText(err: unknown) {
  if (!err) return null;
  if (err instanceof ApiError && Object.keys(err.fields).length)
    return Object.values(err.fields).join(" ");
  return (err as Error).message;
}

export function ActionDialog({
  title,
  description,
  onClose,
  submit,
  submitLabel,
  disabled,
  pending,
  error,
  danger,
  size = "md",
  children,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  submit: () => void;
  submitLabel: string;
  disabled?: boolean;
  pending: boolean;
  error: unknown;
  danger?: boolean;
  size?: "sm" | "md" | "lg";
  children?: React.ReactNode;
}) {
  return (
    <Dialog
      open
      size={size}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={pending}
            disabled={disabled}
            onClick={submit}
          >
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error ? <Alert tone="danger">{errorText(error)}</Alert> : null}
        {children}
      </div>
    </Dialog>
  );
}

// ── Dispatch / return / officer ──────────────────────────────────────────

export function DispatchDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const stations = useStations();
  const [mode, setMode] = useState<"auto" | "manual">(
    c.flags.includes("disputed_jurisdiction") ? "manual" : "auto",
  );
  const [stationId, setStationId] = useState("");
  const [reason, setReason] = useState("");
  const action = useCaseAction(c.id, onClose);
  const disputed = c.flags.includes("disputed_jurisdiction");
  return (
    <ActionDialog
      title={c.stationId ? "Re-dispatch" : "Dispatch"}
      description="Automatic dispatch uses the station whose area contains the location, then the nearest station — skipping any that returned it."
      onClose={onClose}
      submitLabel="Dispatch"
      pending={action.isPending}
      error={action.error}
      disabled={mode === "manual" && (!stationId || reason.trim().length < 5)}
      submit={() =>
        action.mutate({ path: "dispatch", body: mode === "manual" ? { stationId, reason } : {} })
      }
    >
      {disputed ? (
        <Alert tone="warning">
          Returned twice — disputed jurisdiction. Choose the station yourself.
        </Alert>
      ) : null}
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            disabled={disputed}
            checked={mode === "auto"}
            onChange={() => setMode("auto")}
            className="accent-[var(--ev-primary)]"
          />
          Automatic
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            checked={mode === "manual"}
            onChange={() => setMode("manual")}
            className="accent-[var(--ev-primary)]"
          />
          Choose the station
        </label>
      </div>
      {mode === "manual" ? (
        <>
          <Field label="Station">
            {(p) => (
              <Select {...p} value={stationId} onChange={(e) => setStationId(e.target.value)}>
                <option value="">Choose a station</option>
                {stations.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Reason" hint="Required when HQ chooses the station.">
            {(p) => (
              <Textarea
                {...p}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            )}
          </Field>
        </>
      ) : null}
    </ActionDialog>
  );
}

export function ReturnDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Return to HQ"
      description="Only if this isn't your station's area. After two returns HQ chooses the station and it can't be returned again."
      onClose={onClose}
      submitLabel="Return to HQ"
      danger
      pending={action.isPending}
      error={action.error}
      disabled={reason.trim().length < 10}
      submit={() => action.mutate({ path: "return", body: { reason } })}
    >
      <Field label="Why it isn't your area" hint="At least 10 characters.">
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function AssignOfficerDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const officers = useStationOfficers(c.stationId, true);
  const [officerId, setOfficerId] = useState(c.investigatingOfficerId ?? "");
  const [note, setNote] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Investigating officer"
      description="One officer is responsible for the case. Only they and the OIC record work on it."
      onClose={onClose}
      submitLabel="Assign"
      pending={action.isPending}
      error={action.error}
      disabled={!officerId || officerId === c.investigatingOfficerId}
      submit={() =>
        action.mutate({ path: "officer", body: { officerId, note: note || undefined } })
      }
    >
      <Field label="Officer">
        {(p) => (
          <Select {...p} value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
            <option value="">Choose an officer</option>
            {officers.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Note (optional)">
        {(p) => <Input {...p} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </ActionDialog>
  );
}

// ── Investigation ────────────────────────────────────────────────────────

export function NoteDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [text, setText] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Add a note"
      onClose={onClose}
      submitLabel="Add note"
      pending={action.isPending}
      error={action.error}
      disabled={text.trim().length < 2}
      submit={() => action.mutate({ path: "notes", body: { text } })}
    >
      <Field label="Note" hint="Visible to the station and HQ.">
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function EvidenceReviewDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const initial = c.evidenceReview;
  const [items, setItems] = useState<Record<EvidenceReviewItem, boolean>>({
    plateReadable: initial?.plateReadable ?? false,
    vehicleMatches: initial?.vehicleMatches ?? false,
    timePlaceConsistent: initial?.timePlaceConsistent ?? false,
    notEdited: initial?.notEdited ?? false,
    offenceVisible: initial?.offenceVisible ?? false,
  });
  const [note, setNote] = useState(initial?.note ?? "");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Evidence review"
      description="Tick what holds. Anything you can't tick should shape the recommendation."
      onClose={onClose}
      submitLabel="Save review"
      pending={action.isPending}
      error={action.error}
      submit={() =>
        action.mutate({
          path: "evidence-review",
          method: "PUT",
          body: { ...items, note: note || undefined },
        })
      }
    >
      <ul className="space-y-2">
        {(Object.keys(EVIDENCE_REVIEW_ITEMS) as EvidenceReviewItem[]).map((k) => (
          <li key={k}>
            <label className="flex items-center gap-2.5 text-sm text-ink">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ev-primary)]"
                checked={items[k]}
                onChange={(e) => setItems({ ...items, [k]: e.target.checked })}
              />
              {EVIDENCE_REVIEW_ITEMS[k]}
            </label>
          </li>
        ))}
      </ul>
      <Field label="Note (optional)">
        {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </ActionDialog>
  );
}

export function FactsDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const offences = useOffences();
  const [codes, setCodes] = useState(c.offenceCodes);
  const [coords, setCoords] = useState(formatCoordinates(c.location));
  const [address, setAddress] = useState(c.address);
  const [occurredAt, setOccurredAt] = useState(toLocalInput(c.occurredAt));
  const [vehicleType, setVehicleType] = useState<VehicleType>(c.vehicleType);
  const [note, setNote] = useState("");
  const action = useCaseAction(c.id, onClose);
  const point = parseCoordinates(coords);
  const body = {
    ...(codes.join() !== c.offenceCodes.join() ? { offenceCodes: codes } : {}),
    ...(point && coords !== formatCoordinates(c.location) ? { location: point } : {}),
    ...(address !== c.address ? { address } : {}),
    ...(occurredAt !== toLocalInput(c.occurredAt)
      ? { occurredAt: fromLocalInput(occurredAt) }
      : {}),
    ...(vehicleType !== c.vehicleType ? { vehicleType } : {}),
    note,
  };
  return (
    <ActionDialog
      size="lg"
      title="Correct the facts"
      description="The reports keep what reporters said; the case holds what police conclude. Every correction is in the timeline."
      onClose={onClose}
      submitLabel="Save corrections"
      pending={action.isPending}
      error={action.error}
      disabled={note.trim().length < 5 || Object.keys(body).length === 1 || codes.length === 0}
      submit={() => action.mutate({ path: "facts", method: "PATCH", body })}
    >
      <OffencePicker offences={offences.data ?? []} value={codes} onChange={setCodes} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location (latitude, longitude)">
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              value={coords}
              onChange={(e) => setCoords(e.target.value)}
            />
          )}
        </Field>
        <Field label="When it happened">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          )}
        </Field>
        <Field label="Address" className="sm:col-span-2">
          {(p) => <Input {...p} value={address} onChange={(e) => setAddress(e.target.value)} />}
        </Field>
        <Field label="Vehicle type">
          {(p) => (
            <Select
              {...p}
              value={vehicleType}
              onChange={(e) => setVehicleType(e.target.value as VehicleType)}
            >
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_TYPE_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="What changed and why">
        {(p) => <Textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </ActionDialog>
  );
}

/** Find someone in the register, or add them (docs/04 §4, P1: search before create). */
export function PersonPicker({
  value,
  onChange,
}: {
  value: PersonSummary | null;
  onChange: (p: PersonSummary | null) => void;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonSummary[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    type: "individual" as "individual" | "organisation",
    name: "",
    nic: "",
    businessRegNo: "",
    licenceNumber: "",
    address: "",
    phone: "",
  });
  const search = useMutation({
    mutationFn: () => {
      const term = q.trim();
      const isNic = /^\d{9}[vVxX]$|^\d{12}$/.test(term.replace(/\s/g, ""));
      return api<PersonSummary[]>("/persons/search", {
        query: isNic ? { nic: term } : { q: term, licenceNumber: term, businessRegNo: term },
      });
    },
    onSuccess: setResults,
  });
  const create = useMutation({
    mutationFn: () =>
      api<PersonSummary>("/persons", {
        method: "POST",
        body: Object.fromEntries(Object.entries(form).filter(([, v]) => v !== "")),
      }),
    onSuccess: (p) => {
      onChange(p);
      setAdding(false);
    },
  });

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-line bg-raised px-3 py-2 text-sm">
        <span>
          <span className="font-medium text-ink">{value.name}</span>
          {value.nicMasked ? (
            <span className="ml-2 font-mono text-xs text-muted">{value.nicMasked}</span>
          ) : null}
          {!value.hasAddress ? <span className="ml-2 text-xs text-danger">no address</span> : null}
        </span>
        <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }
  if (adding) {
    return (
      <div className="space-y-3 rounded-lg border border-line p-3">
        {create.error ? <Alert tone="danger">{errorText(create.error)}</Alert> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type">
            {(p) => (
              <Select
                {...p}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as typeof form.type })}
              >
                <option value="individual">Person</option>
                <option value="organisation">Organisation</option>
              </Select>
            )}
          </Field>
          <Field label="Name">
            {(p) => (
              <Input
                {...p}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            )}
          </Field>
          {form.type === "individual" ? (
            <>
              <Field label="NIC">
                {(p) => (
                  <Input
                    {...p}
                    className="font-mono"
                    value={form.nic}
                    onChange={(e) => setForm({ ...form, nic: e.target.value })}
                  />
                )}
              </Field>
              <Field label="Driving licence (optional)">
                {(p) => (
                  <Input
                    {...p}
                    className="font-mono"
                    value={form.licenceNumber}
                    onChange={(e) => setForm({ ...form, licenceNumber: e.target.value })}
                  />
                )}
              </Field>
            </>
          ) : (
            <Field label="Business registration no.">
              {(p) => (
                <Input
                  {...p}
                  className="font-mono"
                  value={form.businessRegNo}
                  onChange={(e) => setForm({ ...form, businessRegNo: e.target.value })}
                />
              )}
            </Field>
          )}
          <Field label="Postal address" hint="Needed to serve a notice." className="sm:col-span-2">
            {(p) => (
              <Input
                {...p}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            )}
          </Field>
          <Field label="Phone (optional)">
            {(p) => (
              <Input
                {...p}
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            )}
          </Field>
        </div>
        <div className="flex justify-end gap-2">
          <Button size="sm" onClick={() => setAdding(false)}>
            Back to search
          </Button>
          <Button
            size="sm"
            variant="primary"
            loading={create.isPending}
            disabled={form.name.trim().length < 2}
            onClick={() => create.mutate()}
          >
            Add to register
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          aria-label="Search the register"
          placeholder="NIC, licence, registration number or name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) =>
            e.key === "Enter" && (e.preventDefault(), q.trim().length >= 3 && search.mutate())
          }
        />
        <Button
          icon={<Search className="size-4" />}
          disabled={q.trim().length < 3}
          loading={search.isPending}
          onClick={() => search.mutate()}
        >
          Search
        </Button>
      </div>
      {results ? (
        results.length === 0 ? (
          <p className="text-sm text-muted">Not in the register.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {results.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onChange(p)}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-raised"
                >
                  <span className="font-medium text-ink">{p.name}</span>
                  <span className="font-mono text-xs text-muted">{p.nicMasked}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        icon={<UserPlus className="size-4" />}
        onClick={() => setAdding(true)}
      >
        Not found? Add to the register
      </Button>
    </div>
  );
}

export function TraceDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [plate, setPlate] = useState(c.vehicleNumber ?? "");
  const [type, setType] = useState<VehicleType>(c.vehicleType);
  const [make, setMake] = useState(c.vehicle?.make ?? "");
  const [model, setModel] = useState(c.vehicle?.model ?? "");
  const [colour, setColour] = useState(c.vehicle?.colour ?? "");
  const [owner, setOwner] = useState<PersonSummary | null>(c.owner);
  const [dmtReference, setDmt] = useState("");
  const [ownedFrom, setOwnedFrom] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      size="lg"
      title="Vehicle trace"
      description="Record what you found through police channels. The owner on the offence date is responsible; earlier owners stay in the history."
      onClose={onClose}
      submitLabel="Save trace"
      pending={action.isPending}
      error={action.error}
      disabled={!owner || dmtReference.trim().length < 3 || !plate.trim()}
      submit={() =>
        action.mutate({
          path: "vehicle-trace",
          body: {
            plate,
            type,
            make,
            model,
            colour,
            ownerId: owner!.id,
            dmtReference,
            ownedFrom: ownedFrom ? fromLocalInput(ownedFrom) : undefined,
          },
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Plate">
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
            />
          )}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={type} onChange={(e) => setType(e.target.value as VehicleType)}>
              {VEHICLE_TYPES.map((v) => (
                <option key={v} value={v}>
                  {VEHICLE_TYPE_LABELS[v]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Colour">
          {(p) => <Input {...p} value={colour} onChange={(e) => setColour(e.target.value)} />}
        </Field>
        <Field label="Make">
          {(p) => <Input {...p} value={make} onChange={(e) => setMake(e.target.value)} />}
        </Field>
        <Field label="Model">
          {(p) => <Input {...p} value={model} onChange={(e) => setModel(e.target.value)} />}
        </Field>
        <Field label="DMT reference" hint="The look-up or record number.">
          {(p) => (
            <Input
              {...p}
              className="font-mono"
              value={dmtReference}
              onChange={(e) => setDmt(e.target.value)}
            />
          )}
        </Field>
      </div>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">Registered owner</p>
        <PersonPicker value={owner} onChange={setOwner} />
      </div>
      <Field label="Owner since (if the vehicle changed hands recently)">
        {(p) => (
          <Input
            {...p}
            type="datetime-local"
            value={ownedFrom}
            onChange={(e) => setOwnedFrom(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function DriverDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [driver, setDriver] = useState<PersonSummary | null>(c.driver);
  const [basis, setBasis] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Driver"
      description="When the driver is known (stopped, shown in the evidence, or admitted), the notice goes to them."
      onClose={onClose}
      submitLabel="Save"
      pending={action.isPending}
      error={action.error}
      disabled={!driver || basis.trim().length < 10}
      submit={() =>
        action.mutate({ path: "driver", method: "PUT", body: { driverId: driver!.id, basis } })
      }
    >
      <PersonPicker value={driver} onChange={setDriver} />
      <Field
        label="How the driver was identified"
        hint="e.g. statement of 21 Oct, face clearly visible in the video."
      >
        {(p) => (
          <Textarea {...p} rows={2} value={basis} onChange={(e) => setBasis(e.target.value)} />
        )}
      </Field>
    </ActionDialog>
  );
}

export function StatementDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [from, setFrom] = useState<(typeof STATEMENT_FROM)[number]>("owner");
  const [name, setName] = useState("");
  const [takenAt, setTakenAt] = useState(() => toLocalInput(new Date()));
  const [summary, setSummary] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Record a statement"
      onClose={onClose}
      submitLabel="Save statement"
      pending={action.isPending}
      error={action.error}
      disabled={name.trim().length < 2 || summary.trim().length < 10}
      submit={() =>
        action.mutate({
          path: "statements",
          body: { from, name, takenAt: fromLocalInput(takenAt), summary },
        })
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="From">
          {(p) => (
            <Select {...p} value={from} onChange={(e) => setFrom(e.target.value as typeof from)}>
              {STATEMENT_FROM.map((f) => (
                <option key={f} value={f}>
                  {f[0]!.toUpperCase() + f.slice(1)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Name">
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Taken at">
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              value={takenAt}
              onChange={(e) => setTakenAt(e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label="Summary">
        {(p) => (
          <Textarea {...p} rows={5} value={summary} onChange={(e) => setSummary(e.target.value)} />
        )}
      </Field>
    </ActionDialog>
  );
}

// ── Outcome ──────────────────────────────────────────────────────────────

function OutcomeFields({
  outcome,
  setOutcome,
  addressee,
  setAddressee,
  nfaReason,
  setNfaReason,
  c,
}: {
  outcome: Outcome;
  setOutcome: (o: Outcome) => void;
  addressee: "owner" | "driver";
  setAddressee: (a: "owner" | "driver") => void;
  nfaReason: NfaReason;
  setNfaReason: (r: NfaReason) => void;
  c: CaseDetail;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Outcome">
        {(p) => (
          <Select {...p} value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {OUTCOME_LABELS[o]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {outcome === "nfa" ? (
        <Field label="Reason">
          {(p) => (
            <Select
              {...p}
              value={nfaReason}
              onChange={(e) => setNfaReason(e.target.value as NfaReason)}
            >
              {(Object.keys(NFA_REASONS) as NfaReason[]).map((r) => (
                <option key={r} value={r}>
                  {NFA_REASONS[r]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : (
        <Field
          label="Addressed to"
          hint={c.driver ? undefined : "Identify the driver to address it to them."}
        >
          {(p) => (
            <Select
              {...p}
              value={addressee}
              onChange={(e) => setAddressee(e.target.value as "owner" | "driver")}
            >
              <option value="owner">Registered owner{c.owner ? ` — ${c.owner.name}` : ""}</option>
              <option value="driver" disabled={!c.driver}>
                Driver{c.driver ? ` — ${c.driver.name}` : ""}
              </option>
            </Select>
          )}
        </Field>
      )}
    </div>
  );
}

export function RecommendDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [outcome, setOutcome] = useState<Outcome>("penalty_notice");
  const [addressee, setAddressee] = useState<"owner" | "driver">(c.driver ? "driver" : "owner");
  const [nfaReason, setNfaReason] = useState<NfaReason>("insufficient_evidence");
  const [justification, setJustification] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Recommend an outcome"
      description="The OIC decides (HQ, if the OIC investigated). You can't decide your own recommendation."
      onClose={onClose}
      submitLabel="Recommend"
      pending={action.isPending}
      error={action.error}
      disabled={justification.trim().length < 10 || !c.readyToRecommend.ready}
      submit={() =>
        action.mutate({
          path: "recommend",
          body: { outcome, justification, ...(outcome === "nfa" ? { nfaReason } : { addressee }) },
        })
      }
    >
      {!c.readyToRecommend.ready ? (
        <Alert tone="warning" title="Not ready yet">
          {c.readyToRecommend.missing.join("; ")}.
        </Alert>
      ) : null}
      <OutcomeFields
        {...{ outcome, setOutcome, addressee, setAddressee, nfaReason, setNfaReason, c }}
      />
      <Field label="Justification">
        {(p) => (
          <Textarea
            {...p}
            rows={4}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function DecideDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const rec = c.recommendation!;
  const [mode, setMode] = useState<"approve" | "change" | "send_back">("approve");
  const [outcome, setOutcome] = useState<Outcome>(rec.outcome);
  const [addressee, setAddressee] = useState<"owner" | "driver">(rec.addressee ?? "owner");
  const [nfaReason, setNfaReason] = useState<NfaReason>(rec.nfaReason ?? "insufficient_evidence");
  const [text, setText] = useState("");
  const action = useCaseAction(c.id, onClose);
  const body =
    mode === "approve"
      ? { action: "approve", note: text || undefined }
      : mode === "send_back"
        ? { action: "send_back", reason: text }
        : {
            action: "change",
            outcome,
            reason: text,
            ...(outcome === "nfa" ? { nfaReason } : { addressee }),
          };
  return (
    <ActionDialog
      title="Decide"
      description={`Recommended by ${rec.by}: ${OUTCOME_LABELS[rec.outcome]}.`}
      onClose={onClose}
      submitLabel={mode === "approve" ? "Approve" : mode === "send_back" ? "Send back" : "Decide"}
      pending={action.isPending}
      error={action.error}
      disabled={mode !== "approve" && text.trim().length < 10}
      submit={() => action.mutate({ path: "decide", body })}
    >
      <blockquote className="rounded-lg border border-line bg-raised p-3 text-sm text-ink">
        {rec.justification}
      </blockquote>
      <div className="grid grid-cols-3 gap-2">
        {(["approve", "change", "send_back"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn(
              "rounded-lg border px-3 py-2 text-sm font-medium",
              mode === m
                ? "border-primary bg-primary/10 text-primary"
                : "border-line text-ink hover:bg-raised",
            )}
          >
            {m === "approve" ? "Approve" : m === "change" ? "Change outcome" : "Send back"}
          </button>
        ))}
      </div>
      {mode === "change" ? (
        <OutcomeFields
          {...{ outcome, setOutcome, addressee, setAddressee, nfaReason, setNfaReason, c }}
        />
      ) : null}
      <Field
        label={
          mode === "approve"
            ? "Note (optional)"
            : mode === "send_back"
              ? "What more is needed"
              : "Why you changed it"
        }
      >
        {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} />}
      </Field>
    </ActionDialog>
  );
}

export function ReasonCaseDialog({
  c,
  path,
  title,
  description,
  button,
  onClose,
  danger,
}: {
  c: CaseDetail;
  path: "override" | "reopen";
  title: string;
  description: string;
  button: string;
  onClose: () => void;
  danger?: boolean;
}) {
  const [reason, setReason] = useState("");
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title={title}
      description={description}
      onClose={onClose}
      submitLabel={button}
      danger={danger}
      pending={action.isPending}
      error={action.error}
      disabled={reason.trim().length < 10}
      submit={() => action.mutate({ path, body: { reason } })}
    >
      <Field
        label="Reason"
        hint="At least 10 characters; recorded in the timeline and the audit log."
      >
        {(p) => (
          <Textarea
            {...p}
            rows={3}
            autoFocus
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

export function MergeCaseDialog({ c, onClose }: { c: CaseDetail; onClose: () => void }) {
  const [number, setNumber] = useState("");
  const [reason, setReason] = useState("");
  const lookup = useMutation({
    mutationFn: () =>
      api<{ items: { id: string; caseNumber: string; status: string }[] }>("/cases", {
        query: { q: number.trim(), pageSize: 5 },
      }),
  });
  const target = lookup.data?.items.find(
    (x) => x.caseNumber.toUpperCase() === number.trim().toUpperCase() && x.id !== c.id,
  );
  const action = useCaseAction(c.id, onClose);
  return (
    <ActionDialog
      title="Merge into another case"
      description="Both cases must be undecided. This case's reports, evidence, notes and statements move; this case closes."
      onClose={onClose}
      submitLabel="Merge"
      danger
      pending={action.isPending}
      error={action.error}
      disabled={!target || reason.trim().length < 10}
      submit={() => action.mutate({ path: "merge", body: { intoCaseId: target!.id, reason } })}
    >
      <div className="flex gap-2">
        <Input
          aria-label="Case number"
          placeholder="TC-2026-000123"
          className="font-mono"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
        />
        <Button
          loading={lookup.isPending}
          disabled={number.trim().length < 6}
          onClick={() => lookup.mutate()}
        >
          Find
        </Button>
      </div>
      {lookup.isSuccess ? (
        target ? (
          <p className="text-sm text-ink">
            Merging into <span className="font-mono font-semibold">{target.caseNumber}</span> (
            {target.status}).
          </p>
        ) : (
          <p className="text-sm text-danger">No other case with that number.</p>
        )
      ) : null}
      <Field label="Reason">
        {(p) => (
          <Textarea {...p} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        )}
      </Field>
    </ActionDialog>
  );
}
