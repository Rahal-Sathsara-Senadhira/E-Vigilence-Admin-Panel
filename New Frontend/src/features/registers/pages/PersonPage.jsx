// A person's record — docs/04 §4. Opening it is logged (docs/10); the
// page says so. Corrections need a reason (V5).

import { ArrowLeft, Eye, Pencil } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "@/lib/api.js";
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
import { PersonPoints } from "@/features/demerit/index.js";
import { usePerson, useUpdatePerson } from "../api.js";

const ROLES = { owner: "Owner", driver: "Driver", statement: "Gave a statement" };

export function PersonPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const person = usePerson(id);
  const [editing, setEditing] = useState(false);

  return (
    <Page
      title={person.data?.name ?? "Person"}
      description={
        person.data
          ? person.data.type === "organisation"
            ? "Organisation"
            : "Individual"
          : undefined
      }
      className="max-w-4xl"
      back={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      }
      actions={
        person.data?.can.edit ? (
          <Button icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Correct details
          </Button>
        ) : null
      }
    >
      {person.isPending ? (
        <Skeleton className="h-64" />
      ) : person.isError ? (
        <Alert tone="danger">{person.error.message}</Alert>
      ) : (
        <div className="grid gap-5">
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <Eye className="size-3.5" aria-hidden /> Your opening of this record is logged.
          </p>
          <Panel title="Details">
            <dl className="grid gap-x-6 gap-y-4 p-5 text-sm sm:grid-cols-2">
              {person.data.type === "organisation" ? (
                <Item label="Business registration no.">{person.data.businessRegNo ?? "—"}</Item>
              ) : (
                <>
                  <Item label="NIC">
                    <span className="font-mono">{person.data.nic ?? "—"}</span>
                  </Item>
                  <Item label="Driving licence">
                    <span className="font-mono">{person.data.licenceNumber ?? "—"}</span>
                  </Item>
                </>
              )}
              <Item label="Phone">{person.data.phone ?? "—"}</Item>
              <Item label="Address">
                {person.data.address ?? (
                  <span className="text-warning">Not recorded — needed for a notice</span>
                )}
              </Item>
              <Item label="Recorded">
                {formatDateTime(person.data.createdAt)} by {person.data.createdBy}
              </Item>
            </dl>
          </Panel>
          <PersonPoints personId={id} />
          <Panel title="Cases">
            {person.data.cases.length ? (
              <ul className="divide-y divide-border text-sm">
                {person.data.cases.map((c) => (
                  <li
                    key={`${c.caseId}-${c.role}`}
                    className="flex items-center justify-between gap-3 px-5 py-3"
                  >
                    <Link
                      to={`/cases/${c.caseId}`}
                      className="font-mono text-action hover:underline"
                    >
                      {c.caseNumber}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      <Badge>{ROLES[/** @type {keyof typeof ROLES} */ (c.role)] ?? c.role}</Badge>
                      {formatDateTime(c.occurredAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-5 text-sm text-text-muted">Not linked to a case yet.</p>
            )}
          </Panel>
          {person.data.vehicles.length ? (
            <Panel title="Vehicles owned">
              <ul className="divide-y divide-border text-sm">
                {person.data.vehicles.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link
                      to={`/vehicles/${v.id}`}
                      className="font-mono text-action hover:underline"
                    >
                      {v.plate}
                    </Link>
                    <span className="text-xs text-text-muted">
                      {formatDateTime(v.from)} – {v.to ? formatDateTime(v.to) : "now"}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {person.data.changes.length ? (
            <Panel title="Corrections">
              <ul className="divide-y divide-border text-sm">
                {person.data.changes.map((c, i) => (
                  <li key={i} className="px-5 py-3">
                    <p className="text-text">
                      {c.fields.join(", ")} — {c.reason}
                    </p>
                    <p className="text-xs text-text-muted">
                      {c.by} · {formatDateTime(c.at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
          {editing ? <EditPerson person={person.data} onClose={() => setEditing(false)} /> : null}
        </div>
      )}
    </Page>
  );
}

/** @param {{ person: import("../api.js").Person, onClose: () => void }} props */
function EditPerson({ person, onClose }) {
  const update = useUpdatePerson(person.id);
  const [v, setV] = useState({
    name: person.name,
    address: person.address ?? "",
    phone: person.phone ?? "",
    licenceNumber: person.licenceNumber ?? "",
    reason: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });

  async function save() {
    setErrors({});
    try {
      await update.mutateAsync(v);
      onClose();
    } catch (err) {
      setErrors(
        err instanceof ApiError && Object.keys(err.fields).length
          ? err.fields
          : { root: err instanceof Error ? err.message : "Please try again." },
      );
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title="Correct details"
      description="The reason is kept with the record and in the audit log."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={update.isPending} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
        <Field label="Name" error={errors.name}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.name} onChange={set("name")} />
          )}
        </Field>
        <Field label="Address" error={errors.address}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.address} onChange={set("address")} />
          )}
        </Field>
        <Field label="Phone" error={errors.phone}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.phone} onChange={set("phone")} />
          )}
        </Field>
        {person.type === "individual" ? (
          <Field label="Driving licence" error={errors.licenceNumber}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                value={v.licenceNumber}
                onChange={set("licenceNumber")}
              />
            )}
          </Field>
        ) : null}
        <Field label="Reason" error={errors.reason}>
          {({ invalid, ...p }) => (
            <Textarea {...p} invalid={invalid} rows={2} value={v.reason} onChange={set("reason")} />
          )}
        </Field>
      </div>
    </Dialog>
  );
}

/** @param {{ label: string, children: import("react").ReactNode }} props */
function Item({ label: l, children }) {
  return (
    <div>
      <dt className="text-xs font-medium text-text-muted">{l}</dt>
      <dd className="mt-1 text-text">{children}</dd>
    </div>
  );
}
