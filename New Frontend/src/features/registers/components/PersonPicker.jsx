// Find a person by NIC, licence or business registration number — or add
// them when they aren't recorded (docs/04 P1: search before create, so the
// same person isn't entered twice).

import { Plus, Search, UserRound } from "lucide-react";
import { useState } from "react";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Field, Input, Select, cn } from "@/ui/index.js";
import { searchPersons, useCreatePerson } from "../api.js";

/** @typedef {{ id: string, name: string }} Picked */

const KINDS = [
  ["nic", "NIC"],
  ["licence", "Driving licence"],
  ["brn", "Business registration"],
];

/**
 * @param {{ value: Picked | null, onChange: (p: Picked | null) => void, label?: string }} props
 */
export function PersonPicker({ value, onChange, label = "Person" }) {
  const [kind, setKind] = useState("nic");
  const [term, setTerm] = useState("");
  const [results, setResults] = useState(
    /** @type {import("../api.js").PersonRow[] | null} */ (null),
  );
  const [error, setError] = useState(/** @type {string | null} */ (null));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  async function find() {
    setError(null);
    setBusy(true);
    try {
      const found = await searchPersons({ [kind]: term.trim() });
      setResults(found.items);
    } catch (err) {
      setError(
        err instanceof ApiError ? (Object.values(err.fields)[0] ?? err.message) : "Search failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (value) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-sm">
        <span className="flex items-center gap-2 text-text">
          <UserRound className="size-4 text-text-muted" aria-hidden /> {value.name}
        </span>
        <Button size="sm" onClick={() => onChange(null)}>
          Change
        </Button>
      </div>
    );
  }

  if (adding) {
    return (
      <NewPerson
        initial={{
          [kind === "nic" ? "nic" : kind === "licence" ? "licenceNumber" : "businessRegNo"]:
            term.trim(),
        }}
        organisation={kind === "brn"}
        onCancel={() => setAdding(false)}
        onCreated={(p) => {
          setAdding(false);
          onChange(p);
        }}
        onExisting={(id, name) => {
          setAdding(false);
          onChange({ id, name });
        }}
      />
    );
  }

  return (
    <fieldset className="grid gap-2">
      <legend className="mb-1.5 text-sm font-medium text-text">{label}</legend>
      <div className="flex gap-2">
        <Select
          aria-label="Search by"
          className="w-44 shrink-0"
          value={kind}
          onChange={(e) => setKind(e.target.value)}
        >
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </Select>
        <Input
          aria-label="Number"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (term.trim()) void find();
            }
          }}
        />
        <Button
          icon={<Search className="size-4" />}
          loading={busy}
          disabled={!term.trim()}
          onClick={find}
        >
          Find
        </Button>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      {results ? (
        <ul className="divide-y divide-border rounded-lg border border-border text-sm">
          {results.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onChange({ id: p.id, name: p.name })}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-sunken"
              >
                <span className="text-text">{p.name}</span>
                <span className="font-mono text-xs text-text-muted">
                  {p.nic ?? p.licenceNumber ?? p.businessRegNo}
                  {p.town ? ` · ${p.town}` : ""}
                </span>
              </button>
            </li>
          ))}
          <li>
            <button
              type="button"
              onClick={() => setAdding(true)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-action hover:bg-sunken",
              )}
            >
              <Plus className="size-4" aria-hidden />
              {results.length
                ? "Someone else — add a new person"
                : "Not recorded — add this person"}
            </button>
          </li>
        </ul>
      ) : (
        <p className="text-xs text-text-muted">
          Search first, so the same person isn&apos;t recorded twice.
        </p>
      )}
    </fieldset>
  );
}

/**
 * @param {{ initial: Record<string, string>, organisation: boolean, onCancel: () => void,
 *   onCreated: (p: Picked) => void, onExisting: (id: string, name: string) => void }} props
 */
function NewPerson({ initial, organisation, onCancel, onCreated, onExisting }) {
  const create = useCreatePerson();
  const [v, setV] = useState({
    type: organisation ? "organisation" : "individual",
    name: "",
    nic: "",
    licenceNumber: "",
    businessRegNo: "",
    address: "",
    phone: "",
    ...initial,
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  const [existing, setExisting] = useState(
    /** @type {{ id: string, name: string, message: string } | null} */ (null),
  );
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) => setV({ ...v, [k]: e.target.value });

  async function save() {
    setErrors({});
    setExisting(null);
    try {
      const p = await create.mutateAsync(
        Object.fromEntries(Object.entries(v).filter(([, x]) => x !== "")),
      );
      onCreated({ id: p.id, name: p.name });
    } catch (err) {
      if (err instanceof ApiError) {
        const { matchId, matchName, ...fields } = err.fields;
        setErrors({ ...fields, ...(Object.keys(fields).length ? {} : { root: err.message }) });
        if (matchId)
          setExisting({ id: matchId, name: matchName ?? "Recorded person", message: err.message });
      } else setErrors({ root: "Please try again." });
    }
  }

  const org = v.type === "organisation";
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3">
      <p className="text-sm font-medium text-text">New person</p>
      {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}
      {existing ? (
        <Alert tone="warning">
          {existing.message}{" "}
          <button
            type="button"
            className="font-medium text-action underline"
            onClick={() => onExisting(existing.id, existing.name)}
          >
            Use that record
          </button>
        </Alert>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          {(p) => (
            <Select {...p} value={v.type} onChange={set("type")}>
              <option value="individual">Individual</option>
              <option value="organisation">Organisation (company, government…)</option>
            </Select>
          )}
        </Field>
        <Field label={org ? "Organisation name" : "Full name"} error={errors.name}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.name} onChange={set("name")} />
          )}
        </Field>
        {org ? (
          <Field label="Business registration no." error={errors.businessRegNo}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                value={v.businessRegNo}
                onChange={set("businessRegNo")}
              />
            )}
          </Field>
        ) : (
          <>
            <Field label="NIC" hint="Old: 9 digits + V/X · new: 12 digits" error={errors.nic}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  className="font-mono uppercase"
                  value={v.nic}
                  onChange={set("nic")}
                />
              )}
            </Field>
            <Field label="Driving licence (optional)" error={errors.licenceNumber}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  className="font-mono uppercase"
                  value={v.licenceNumber}
                  onChange={set("licenceNumber")}
                />
              )}
            </Field>
          </>
        )}
        <Field label="Phone (optional)" error={errors.phone}>
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} type="tel" value={v.phone} onChange={set("phone")} />
          )}
        </Field>
        <Field
          label="Address"
          hint="Needed to serve a penalty notice."
          error={errors.address}
          className="sm:col-span-2"
        >
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} value={v.address} onChange={set("address")} />
          )}
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          loading={create.isPending}
          disabled={v.name.trim().length < 2}
          onClick={save}
        >
          Add person
        </Button>
      </div>
    </div>
  );
}
