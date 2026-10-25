// Record a report — docs/02 §3, §7. HQ records WhatsApp messages and phone
// calls into the triage queue; a station records phone calls, walk-ins and
// officers' observations and opens its case at once.

import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { ApiError } from "@/lib/api.js";
import { scopeOf } from "@/lib/permissions.js";
import { useCurrentUser } from "@/lib/session-context.js";
import { Alert, Button, Field, Input, Page, Panel, Select, Textarea } from "@/ui/index.js";
import { useRecordReport } from "../api.js";
import { OffencePicker } from "../components/OffencePicker.jsx";
import { VEHICLE_TYPES } from "../lib/labels.js";

/** Now, as a datetime-local value. */
function nowLocal() {
  const d = new Date();
  const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function NewReportPage() {
  const user = useCurrentUser();
  const navigate = useNavigate();
  const record = useRecordReport();
  const atHq = scopeOf(user, "reports.record") === "N";
  const channels = atHq
    ? [
        ["whatsapp", "WhatsApp message"],
        ["phone", "Phone call"],
      ]
    : [
        ["walk_in", "Walk-in at the station"],
        ["phone", "Phone call to the station"],
        ["officer", "I saw it myself (officer)"],
      ];
  const [v, setV] = useState({
    channel: channels[0]?.[0] ?? "phone",
    reporterKind: "named",
    name: "",
    phone: "",
    occurredAt: nowLocal(),
    address: "",
    vehicleNumber: "",
    plateUnknown: false,
    vehicleType: "",
    offenceCodes: /** @type {string[]} */ ([]),
    description: "",
    injuries: false,
  });
  const [errors, setErrors] = useState(/** @type {Record<string, string>} */ ({}));
  /** @param {keyof typeof v} k */
  const set = (k) => (/** @type {any} */ e) =>
    setV({
      ...v,
      [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e,
    });
  const officer = v.channel === "officer";

  async function submit(/** @type {import("react").FormEvent} */ e) {
    e.preventDefault();
    setErrors({});
    try {
      const created = await record.mutateAsync({
        channel: v.channel,
        reporter:
          officer || v.reporterKind === "anonymous"
            ? { kind: "anonymous" }
            : { kind: "named", name: v.name, phone: v.phone || undefined },
        occurredAt: new Date(v.occurredAt).toISOString(),
        address: v.address || undefined,
        vehicleNumber: v.plateUnknown ? undefined : v.vehicleNumber || undefined,
        plateUnknown: v.plateUnknown,
        vehicleType: v.vehicleType || undefined,
        offenceCodes: v.offenceCodes,
        description: v.description,
        injuries: v.injuries,
      });
      navigate(`/reports/${created.id}`, { replace: true });
    } catch (err) {
      setErrors(
        err instanceof ApiError && Object.keys(err.fields).length
          ? Object.fromEntries(
              Object.entries(err.fields).map(([k, m]) => [k.replace(/^reporter\./, ""), m]),
            )
          : { root: err instanceof Error ? err.message : "Please try again." },
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  return (
    <Page
      title="New report"
      description={
        atHq
          ? "Record a report received by WhatsApp or phone. It goes to the triage queue."
          : "Record a report at your station. It opens your station's case at once; HQ reviews it."
      }
      className="max-w-3xl"
      back={
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Reports
        </Link>
      }
    >
      <Alert tone="warning" className="mb-5">
        If someone is in danger right now, call 119.
      </Alert>
      <form onSubmit={submit} noValidate className="grid gap-6">
        {errors.root ? <Alert tone="danger">{errors.root}</Alert> : null}

        <Panel title="How it arrived">
          <div className="grid gap-4 p-5">
            <Field label="Channel" error={errors.channel}>
              {({ invalid, ...p }) => (
                <Select {...p} invalid={invalid} value={v.channel} onChange={set("channel")}>
                  {channels.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            {officer ? (
              <p className="text-sm text-text-muted">
                Another officer or the OIC confirms your own observation before the case opens.
              </p>
            ) : (
              <>
                <fieldset className="flex gap-5 text-sm">
                  <legend className="sr-only">Reporter</legend>
                  {[
                    ["named", "Reporter gave their name"],
                    ["anonymous", "Anonymous"],
                  ].map(([k, l]) => (
                    <label key={k} className="flex items-center gap-2 text-text">
                      <input
                        type="radio"
                        name="kind"
                        className="accent-[var(--ev-action)]"
                        checked={v.reporterKind === k}
                        onChange={() => setV({ ...v, reporterKind: k })}
                      />
                      {l}
                    </label>
                  ))}
                </fieldset>
                {v.reporterKind === "named" ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Reporter's name" error={errors.name}>
                      {({ invalid, ...p }) => (
                        <Input {...p} invalid={invalid} value={v.name} onChange={set("name")} />
                      )}
                    </Field>
                    <Field
                      label="Phone (optional)"
                      hint="So HQ can ask questions."
                      error={errors.phone}
                    >
                      {({ invalid, ...p }) => (
                        <Input
                          {...p}
                          invalid={invalid}
                          type="tel"
                          value={v.phone}
                          onChange={set("phone")}
                        />
                      )}
                    </Field>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </Panel>

        <Panel title="What happened">
          <div className="grid gap-4 p-5">
            <Field label="Offences" error={errors.offenceCodes}>
              {(p) => (
                <OffencePicker
                  id={p.id}
                  invalid={p.invalid}
                  value={v.offenceCodes}
                  onChange={set("offenceCodes")}
                  vehicleType={v.vehicleType}
                />
              )}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="When" error={errors.occurredAt}>
                {({ invalid, ...p }) => (
                  <Input
                    {...p}
                    invalid={invalid}
                    type="datetime-local"
                    max={nowLocal()}
                    value={v.occurredAt}
                    onChange={set("occurredAt")}
                  />
                )}
              </Field>
              <Field label="Where" hint="Road, landmark or junction." error={errors.address}>
                {({ invalid, ...p }) => (
                  <Input {...p} invalid={invalid} value={v.address} onChange={set("address")} />
                )}
              </Field>
            </div>
            <Field label="Description" hint="10 to 2000 characters." error={errors.description}>
              {({ invalid, ...p }) => (
                <Textarea
                  {...p}
                  invalid={invalid}
                  rows={4}
                  value={v.description}
                  onChange={set("description")}
                />
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ev-action)]"
                checked={v.injuries}
                onChange={set("injuries")}
              />
              Someone was hurt (urgent)
            </label>
          </div>
        </Panel>

        <Panel title="Vehicle">
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Plate" hint="e.g. WP CAB-1234" error={errors.vehicleNumber}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  disabled={v.plateUnknown}
                  className="font-mono uppercase"
                  value={v.vehicleNumber}
                  onChange={set("vehicleNumber")}
                />
              )}
            </Field>
            <Field label="Type">
              {(p) => (
                <Select {...p} value={v.vehicleType} onChange={set("vehicleType")}>
                  <option value="">Not known</option>
                  {Object.entries(VEHICLE_TYPES).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <label className="flex items-center gap-2 text-sm text-text sm:col-span-2">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ev-action)]"
                checked={v.plateUnknown}
                onChange={set("plateUnknown")}
              />
              Plate unknown
            </label>
          </div>
        </Panel>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => navigate("/reports")}>Cancel</Button>
          <Button type="submit" variant="primary" loading={record.isPending}>
            Record report
          </Button>
        </div>
        <p className="text-right text-xs text-text-muted">
          You can add photos, video or audio on the next screen.
        </p>
      </form>
    </Page>
  );
}
