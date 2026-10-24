// Investigation on the case record — docs/04 §6: vehicle and owner, driver,
// evidence review, statements, evidence. The investigating officer and the
// OIC record work (`can.work`); everyone else reads.

import { Car, CheckCircle2, CircleX, FileText, Flag, ScanSearch, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { EvidenceStrip } from "@/domain/evidence/index.js";
import {
  DRIVER_BASIS,
  FLAG_LABELS,
  PersonPicker,
  useFlagVehicle,
} from "@/features/registers/index.js";
import { ApiError } from "@/lib/api.js";
import { formatDateTime } from "@/lib/format.js";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Field,
  Input,
  Panel,
  Select,
  Textarea,
  cn,
} from "@/ui/index.js";
import { useCaseAction, useUploadCaseEvidence, useVehicleCheck } from "../api.js";

/** @typedef {import("../api.js").CaseRecord} CaseRecord */
/** @typedef {"trace" | "driver" | "review" | "statement" | "flag" | null} Open */

/** Today as a date input value, in Sri Lanka. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Colombo" });

const REVIEW = [
  ["plateReadable", "The plate is readable"],
  ["vehicleMatches", "The vehicle's type and colour match the registry"],
  ["timePlaceConsistent", "Time and place are consistent with the report"],
  ["noEditing", "No sign of editing or AI generation"],
  ["offenceVisible", "The offence is visible"],
];

/** Form errors from the API. @param {unknown} err */
const errorsOf = (err) =>
  err instanceof ApiError && Object.keys(err.fields).length
    ? err.fields
    : { root: err instanceof Error ? err.message : "Please try again." };

/** @param {{ c: CaseRecord }} props */
export function Investigation({ c }) {
  const inv = c.investigation;
  const upload = useUploadCaseEvidence(c.id);
  const [open, setOpen] = useState(/** @type {Open} */ (null));
  const close = () => setOpen(null);
  const work = c.can.work;

  return (
    <Panel
      title="Investigation"
      description={
        work
          ? "Record what you find. Your first piece of work starts the investigation."
          : "Recorded by the investigating officer and the OIC."
      }
    >
      <div className="grid divide-y divide-border">
        <Section
          icon={<Car />}
          title="Vehicle and registered owner"
          action={
            work ? (
              <Button size="sm" onClick={() => setOpen("trace")}>
                {inv.vehicle ? "Trace again" : "Trace vehicle"}
              </Button>
            ) : null
          }
        >
          {inv.vehicle ? (
            <div className="grid gap-1 text-sm">
              <p>
                <Link
                  to={`/vehicles/${inv.vehicle.id}`}
                  className="font-mono text-action hover:underline"
                >
                  {inv.vehicle.plate}
                </Link>
                {inv.vehicle.flags.map((f) => (
                  <Badge key={f} tone="danger" className="ml-2">
                    <Flag className="size-3" aria-hidden />
                    {FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (f)] ?? f}
                  </Badge>
                ))}
              </p>
              <p className="text-text-muted">
                Owner on the offence date:{" "}
                {inv.owner ? (
                  <PersonName p={inv.owner} />
                ) : (
                  <span className="text-warning">not known</span>
                )}
              </p>
              {work ? (
                <button
                  type="button"
                  onClick={() => setOpen("flag")}
                  className="w-fit text-xs text-text-muted underline hover:text-text"
                >
                  Flag a false plate or stolen vehicle
                </button>
              ) : null}
            </div>
          ) : (
            <Empty>Not traced yet.</Empty>
          )}
        </Section>

        <Section
          icon={<UserRound />}
          title="Driver"
          action={
            work ? (
              <Button size="sm" onClick={() => setOpen("driver")}>
                {inv.driver ? "Change" : "Identify driver"}
              </Button>
            ) : null
          }
        >
          {inv.driver ? (
            <p className="text-sm">
              <PersonName p={inv.driver} />
              <span className="text-text-muted">
                {" "}
                ·{" "}
                {DRIVER_BASIS[/** @type {keyof typeof DRIVER_BASIS} */ (inv.driver.basis)] ??
                  inv.driver.basis}
              </span>
            </p>
          ) : (
            <Empty>
              Not identified. For a remote report the owner is addressed and can name the driver.
            </Empty>
          )}
        </Section>

        <Section
          icon={<ScanSearch />}
          title="Evidence review"
          action={
            work ? (
              <Button size="sm" onClick={() => setOpen("review")}>
                {inv.review ? "Review again" : "Review evidence"}
              </Button>
            ) : null
          }
        >
          {inv.review ? (
            <div className="grid gap-1.5 text-sm">
              <ul className="grid gap-1">
                {REVIEW.map(([k, l]) => {
                  const ok = inv.review?.[/** @type {"plateReadable"} */ (k)];
                  return (
                    <li
                      key={k}
                      className={cn("flex items-center gap-2", ok ? "text-text" : "text-danger")}
                    >
                      {ok ? (
                        <CheckCircle2 className="size-4 text-success" aria-label="Yes" />
                      ) : (
                        <CircleX className="size-4" aria-label="No" />
                      )}
                      {l}
                    </li>
                  );
                })}
              </ul>
              {inv.review.note ? <p className="text-text-muted">“{inv.review.note}”</p> : null}
              <p className="text-xs text-text-muted">
                {inv.review.by} · {formatDateTime(inv.review.at)}
              </p>
            </div>
          ) : (
            <Empty>Not reviewed yet.</Empty>
          )}
        </Section>

        <Section
          icon={<FileText />}
          title="Statements"
          action={
            work ? (
              <Button size="sm" onClick={() => setOpen("statement")}>
                Add statement
              </Button>
            ) : null
          }
        >
          {inv.statements.length ? (
            <ul className="grid gap-3 text-sm">
              {inv.statements.map((s, i) => (
                <li key={i}>
                  <p className="text-text">
                    <Badge className="mr-2 capitalize">{s.role}</Badge>
                    <PersonName p={s} />
                    <span className="text-xs text-text-muted">
                      {" "}
                      · taken {formatDateTime(s.takenAt)}
                    </span>
                  </p>
                  <p className="mt-1 whitespace-pre-line text-text-muted">{s.summary}</p>
                  {s.evidenceId ? (
                    <p className="mt-1 text-xs text-text-muted">Scan or recording attached.</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>No statements.</Empty>
          )}
        </Section>

        <Section icon={<FileText />} title="Evidence added during investigation">
          <EvidenceStrip items={inv.evidence} upload={work ? upload : null} />
        </Section>
      </div>

      {open === "trace" ? <TraceDialog c={c} onClose={close} /> : null}
      {open === "driver" ? <DriverDialog c={c} onClose={close} /> : null}
      {open === "review" ? <ReviewDialog c={c} onClose={close} /> : null}
      {open === "statement" ? <StatementDialog c={c} onClose={close} /> : null}
      {open === "flag" && inv.vehicle ? (
        <FlagDialog vehicleId={inv.vehicle.id} onClose={close} />
      ) : null}
    </Panel>
  );
}

/** @param {{ icon: import("react").ReactElement, title: string, action?: import("react").ReactNode, children: import("react").ReactNode }} props */
function Section({ icon, title, action, children }) {
  return (
    <section className="grid gap-2 px-5 py-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium text-text [&_svg]:size-4 [&_svg]:text-text-muted">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** @param {{ children: import("react").ReactNode }} props */
const Empty = ({ children }) => <p className="text-sm text-text-muted">{children}</p>;

/** A person on the case — a link for those who may open people. @param {{ p: { id: string | null, name: string } }} props */
function PersonName({ p }) {
  return p.id ? (
    <Link to={`/persons/${p.id}`} className="text-action hover:underline">
      {p.name}
    </Link>
  ) : (
    <span className="text-text">{p.name}</span>
  );
}

/**
 * A dialog that posts one investigation action.
 * @param {{ title: string, description?: string, submitLabel: string, busy: boolean, disabled?: boolean,
 *   onSubmit: () => void, onClose: () => void, error?: string, children: import("react").ReactNode }} props
 */
function ActionDialog({
  title,
  description,
  submitLabel,
  busy,
  disabled,
  onSubmit,
  onClose,
  error,
  children,
}) {
  return (
    <Dialog
      open
      size="md"
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={disabled} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {children}
      </div>
    </Dialog>
  );
}

/** @param {{ c: CaseRecord, onClose: () => void }} props */
function TraceDialog({ c, onClose }) {
  const action = useCaseAction(c.id);
  const check = useVehicleCheck(c.id, true);
  const known = check.data?.vehicle ?? null;
  const [owner, setOwner] = useState(/** @type {{ id: string, name: string } | null} */ (null));
  const [v, setV] = useState({
    plate: c.facts.vehicleNumber ?? "",
    vehicleType: c.facts.vehicleType ?? "",
    make: "",
    model: "",
    colour: "",
    dmtReference: "",
    checkedOn: today(),
    ownerFrom: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });

  /** @param {string} name @param {object} [body] */
  async function run(name, body) {
    setErrors({});
    try {
      await action.mutateAsync({ action: name, body });
      onClose();
    } catch (err) {
      setErrors(errorsOf(err));
    }
  }

  return (
    <ActionDialog
      title="Trace the vehicle"
      description="Record what the registry (DMT) shows. The owner on the offence date is responsible; after a sale, that may be the previous owner."
      submitLabel="Record trace"
      busy={action.isPending}
      disabled={!owner || !v.dmtReference.trim() || !v.ownerFrom}
      onClose={onClose}
      error={errors.root}
      onSubmit={() =>
        run("trace", {
          ...Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
          ownerId: owner?.id,
        })
      }
    >
      {known ? (
        <Alert
          tone={check.data?.reusable ? "info" : "warning"}
          title={`${known.plate} is in the register`}
        >
          {[known.colour, known.make, known.model].filter(Boolean).join(" ")}
          {known.ownerOnOffenceDate
            ? ` · owner on the offence date: ${known.ownerOnOffenceDate.name}`
            : ""}
          {" · last checked "}
          {formatDateTime(known.lastCheckedAt)}.
          {check.data?.reusable ? (
            <span className="mt-2 block">
              <Button size="sm" loading={action.isPending} onClick={() => run("trace/reuse")}>
                Use this trace
              </Button>
            </span>
          ) : (
            " Too long ago to reuse — check the registry again."
          )}
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plate" error={errors.plate}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              className="font-mono uppercase"
              value={v.plate}
              onChange={set("plate")}
            />
          )}
        </Field>
        <Field label="Type">
          {(p) => (
            <Select {...p} value={v.vehicleType} onChange={set("vehicleType")}>
              <option value="">—</option>
              {[
                "motorcycle",
                "three_wheeler",
                "car",
                "van",
                "bus",
                "lorry",
                "tractor",
                "other",
              ].map((t) => (
                <option key={t} value={t}>
                  {t.replace("_", "-")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Make">{(p) => <Input {...p} value={v.make} onChange={set("make")} />}</Field>
        <Field label="Model">
          {(p) => <Input {...p} value={v.model} onChange={set("model")} />}
        </Field>
        <Field label="Colour">
          {(p) => <Input {...p} value={v.colour} onChange={set("colour")} />}
        </Field>
        <Field label="DMT reference" error={errors.dmtReference}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.dmtReference} onChange={set("dmtReference")} />
          )}
        </Field>
        <Field label="Checked on" error={errors.checkedOn}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              type="date"
              max={today()}
              value={v.checkedOn}
              onChange={set("checkedOn")}
            />
          )}
        </Field>
        <Field label="Owner registered since" error={errors.ownerFrom}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              type="date"
              max={today()}
              value={v.ownerFrom}
              onChange={set("ownerFrom")}
            />
          )}
        </Field>
      </div>
      <PersonPicker label="Registered owner" value={owner} onChange={setOwner} />
      {errors.ownerId ? <p className="text-sm text-danger">{errors.ownerId}</p> : null}
    </ActionDialog>
  );
}

/** @param {{ c: CaseRecord, onClose: () => void }} props */
function DriverDialog({ c, onClose }) {
  const action = useCaseAction(c.id);
  const [person, setPerson] = useState(/** @type {{ id: string, name: string } | null} */ (null));
  const [basis, setBasis] = useState("statement");
  const [note, setNote] = useState("");
  const [error, setError] = useState(/** @type {string | undefined} */ (undefined));
  return (
    <ActionDialog
      title="Identify the driver"
      submitLabel="Save driver"
      busy={action.isPending}
      disabled={!person}
      onClose={onClose}
      error={error}
      onSubmit={async () => {
        try {
          await action.mutateAsync({
            action: "driver",
            body: { personId: person?.id, basis, ...(note.trim() ? { note: note.trim() } : {}) },
          });
          onClose();
        } catch (err) {
          setError(Object.values(errorsOf(err))[0]);
        }
      }}
    >
      <PersonPicker label="Driver" value={person} onChange={setPerson} />
      <Field label="How was the driver identified?">
        {(p) => (
          <Select {...p} value={basis} onChange={(e) => setBasis(e.target.value)}>
            {Object.entries(DRIVER_BASIS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
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

/** @param {{ c: CaseRecord, onClose: () => void }} props */
function ReviewDialog({ c, onClose }) {
  const action = useCaseAction(c.id);
  const prev = c.investigation.review;
  const [answers, setAnswers] = useState(
    /** @type {Record<string, boolean | null>} */ (
      Object.fromEntries(REVIEW.map(([k]) => [k, prev ? /** @type {any} */ (prev)[k] : null]))
    ),
  );
  const [note, setNote] = useState(prev?.note ?? "");
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const complete = Object.values(answers).every((a) => a !== null);
  return (
    <ActionDialog
      title="Evidence review"
      description="Answer each point from the photos, video or audio on the case."
      submitLabel="Save review"
      busy={action.isPending}
      disabled={!complete}
      onClose={onClose}
      error={errors.root}
      onSubmit={async () => {
        setErrors({});
        try {
          await action.mutateAsync({
            action: "review",
            body: { ...answers, ...(note.trim() ? { note: note.trim() } : {}) },
          });
          onClose();
        } catch (err) {
          setErrors(errorsOf(err));
        }
      }}
    >
      <ul className="grid gap-2">
        {REVIEW.map(([k, l]) => (
          <li
            key={k}
            className="flex flex-col gap-1.5 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="text-sm text-text">{l}</span>
            <span className="flex gap-4 text-sm">
              {[
                [true, "Yes"],
                [false, "No"],
              ].map(([val, label]) => (
                <label key={String(label)} className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name={k}
                    className="accent-[var(--ev-action)]"
                    checked={answers[k] === val}
                    onChange={() => setAnswers({ ...answers, [k]: /** @type {boolean} */ (val) })}
                  />
                  {label}
                </label>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <Field
        label="Note"
        hint={
          Object.values(answers).includes(false)
            ? "Required: explain what didn't check out."
            : "Optional."
        }
        error={errors.note}
      >
        {({ invalid, ...p }) => (
          <Textarea
            {...p}
            invalid={invalid}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        )}
      </Field>
    </ActionDialog>
  );
}

/** @param {{ c: CaseRecord, onClose: () => void }} props */
function StatementDialog({ c, onClose }) {
  const action = useCaseAction(c.id);
  const [person, setPerson] = useState(/** @type {{ id: string, name: string } | null} */ (null));
  const [v, setV] = useState({
    role: "owner",
    name: "",
    takenAt: today(),
    summary: "",
    evidenceId: "",
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });
  return (
    <ActionDialog
      title="Add a statement"
      description="A written summary; attach the signed scan or recording by adding it to the case's evidence first."
      submitLabel="Save statement"
      busy={action.isPending}
      disabled={
        v.summary.trim().length < 10 ||
        (!person && v.role !== "witness") ||
        (v.role === "witness" && !person && !v.name.trim())
      }
      onClose={onClose}
      error={errors.root}
      onSubmit={async () => {
        setErrors({});
        try {
          await action.mutateAsync({
            action: "statements",
            body: {
              role: v.role,
              takenAt: v.takenAt,
              summary: v.summary,
              ...(person ? { personId: person.id } : { name: v.name }),
              ...(v.evidenceId ? { evidenceId: v.evidenceId } : {}),
            },
          });
          onClose();
        } catch (err) {
          setErrors(errorsOf(err));
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From the">
          {(p) => (
            <Select {...p} value={v.role} onChange={set("role")}>
              <option value="owner">Owner</option>
              <option value="driver">Driver</option>
              <option value="witness">Witness</option>
            </Select>
          )}
        </Field>
        <Field label="Taken on" error={errors.takenAt}>
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              type="date"
              max={today()}
              value={v.takenAt}
              onChange={set("takenAt")}
            />
          )}
        </Field>
      </div>
      <PersonPicker label="Who gave it" value={person} onChange={setPerson} />
      {v.role === "witness" && !person ? (
        <Field
          label="…or a witness's name"
          hint="Witnesses needn't be in the register."
          error={errors.name}
        >
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.name} onChange={set("name")} />
          )}
        </Field>
      ) : null}
      <Field label="Summary" error={errors.summary}>
        {({ invalid, ...p }) => (
          <Textarea {...p} invalid={invalid} rows={4} value={v.summary} onChange={set("summary")} />
        )}
      </Field>
      {c.investigation.evidence.length ? (
        <Field label="Attached file (optional)" error={errors.evidenceId}>
          {(p) => (
            <Select {...p} value={v.evidenceId} onChange={set("evidenceId")}>
              <option value="">None</option>
              {c.investigation.evidence.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.originalName ?? e.kind} · {formatDateTime(e.uploadedAt)}
                </option>
              ))}
            </Select>
          )}
        </Field>
      ) : null}
    </ActionDialog>
  );
}

/** @param {{ vehicleId: string, onClose: () => void }} props */
function FlagDialog({ vehicleId, onClose }) {
  const flag = useFlagVehicle(vehicleId);
  const [v, setV] = useState({ type: "suspected_false_plate", note: "", reference: "", since: "" });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });
  return (
    <ActionDialog
      title="Flag the vehicle"
      description="A false plate or a stolen vehicle means no notice goes to the registered owner. HQ is told."
      submitLabel="Add flag"
      busy={flag.isPending}
      disabled={v.note.trim().length < 5}
      onClose={onClose}
      error={errors.root}
      onSubmit={async () => {
        setErrors({});
        try {
          await flag.mutateAsync(Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")));
          onClose();
        } catch (err) {
          setErrors(errorsOf(err));
        }
      }}
    >
      <Field label="Flag" error={errors.type}>
        {(p) => (
          <Select {...p} value={v.type} onChange={set("type")}>
            {Object.entries(FLAG_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="What you found" error={errors.note}>
        {({ invalid, ...p }) => (
          <Textarea {...p} invalid={invalid} rows={2} value={v.note} onChange={set("note")} />
        )}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Complaint reference (optional)">
          {(p) => <Input {...p} value={v.reference} onChange={set("reference")} />}
        </Field>
        {v.type === "reported_stolen" ? (
          <Field label="Stolen on" error={errors.since}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                type="date"
                max={today()}
                value={v.since}
                onChange={set("since")}
              />
            )}
          </Field>
        ) : null}
      </div>
    </ActionDialog>
  );
}
