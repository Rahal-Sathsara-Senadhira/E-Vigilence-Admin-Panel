// The addressee's two responses — naming the driver (docs/05 §6.2) and
// disputing (§6.3). The same fields online and at the station counter.

import { Field, Input, Select, Textarea } from "@/ui/index.js";
import { DISPUTE_GROUNDS } from "../lib/labels.js";

/** @typedef {import("../lib/responses.js").DriverValue} DriverValue */
/** @typedef {import("../lib/responses.js").DisputeValue} DisputeValue */

/**
 * Errors from the API come as "driver.nic"; the form shows them by field.
 * @param {Record<string, string>} errors @param {string} k
 */
const err = (errors, k) => errors[`driver.${k}`] ?? errors[k];

/**
 * @param {{ value: DriverValue, onChange: (v: DriverValue) => void, errors: Record<string, string> }} props
 */
export function DriverFields({ value, onChange, errors }) {
  /** @param {keyof DriverValue} k */
  const set = (k) => (/** @type {any} */ e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Driver's full name" error={err(errors, "name")} className="sm:col-span-2">
        {({ invalid, ...p }) => (
          <Input {...p} invalid={invalid} value={value.name} onChange={set("name")} />
        )}
      </Field>
      <Field label="NIC" hint="Or the driving licence number" error={err(errors, "nic")}>
        {({ invalid, ...p }) => (
          <Input
            {...p}
            invalid={invalid}
            className="font-mono uppercase"
            value={value.nic}
            onChange={set("nic")}
          />
        )}
      </Field>
      <Field label="Driving licence number" error={err(errors, "licenceNumber")}>
        {({ invalid, ...p }) => (
          <Input
            {...p}
            invalid={invalid}
            className="font-mono uppercase"
            value={value.licenceNumber}
            onChange={set("licenceNumber")}
          />
        )}
      </Field>
      <Field label="Driver's address" error={err(errors, "address")} className="sm:col-span-2">
        {({ invalid, ...p }) => (
          <Input {...p} invalid={invalid} value={value.address} onChange={set("address")} />
        )}
      </Field>
      <Field label="Driver's phone (optional)" error={err(errors, "phone")}>
        {({ invalid, ...p }) => (
          <Input {...p} invalid={invalid} type="tel" value={value.phone} onChange={set("phone")} />
        )}
      </Field>
    </div>
  );
}

/**
 * @param {{ value: DisputeValue, onChange: (v: DisputeValue) => void, errors: Record<string, string> }} props
 */
export function DisputeFields({ value, onChange, errors }) {
  return (
    <div className="grid gap-3">
      <Field label="Grounds" error={errors.grounds}>
        {({ invalid, ...p }) => (
          <Select
            {...p}
            invalid={invalid}
            value={value.grounds}
            onChange={(e) => onChange({ ...value, grounds: e.target.value })}
          >
            <option value="">Choose…</option>
            {Object.entries(DISPUTE_GROUNDS).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field
        label="Your reasons"
        hint="Be specific: dates, places, documents you can show."
        error={errors.explanation}
      >
        {({ invalid, ...p }) => (
          <Textarea
            {...p}
            invalid={invalid}
            rows={4}
            value={value.explanation}
            onChange={(e) => onChange({ ...value, explanation: e.target.value })}
          />
        )}
      </Field>
    </div>
  );
}
