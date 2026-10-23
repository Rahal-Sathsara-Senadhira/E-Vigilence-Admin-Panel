// Add an offence, or change one — a change starts a new version and needs
// a reason (usually the gazette that made it). docs/14 §4.5.

import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { ApiError } from "@/lib/api.js";
import { Alert, Button, Field, Input, Select, Sheet, Textarea } from "@/ui/index.js";
import { SEVERITY_LABELS, VEHICLE_LABELS } from "./api.js";

/**
 * @param {{
 *   open: boolean,
 *   onOpenChange: (open: boolean) => void,
 *   offence?: import("./api.js").Offence,
 *   onSubmit: (body: object) => Promise<unknown>,
 * }} props
 */
export function OffenceForm({ open, onOpenChange, offence, onSubmit }) {
  const blank = () => ({
    code: offence?.code ?? "",
    name: offence?.name ?? "",
    legalReference: offence?.legalReference ?? "",
    outcome: offence?.outcome ?? "spot_fine",
    spotFine: typeof offence?.spotFine === "number" ? String(offence.spotFine) : "",
    severity: offence?.severity ?? "minor",
    vehicleTypes: offence?.vehicleTypes ?? [],
    citizenReportable: offence?.citizenReportable ?? true,
    publicName: offence?.publicName ?? "",
    publicDescription: offence?.publicDescription ?? "",
    active: offence?.active ?? true,
    reason: "",
  });
  const {
    register,
    handleSubmit,
    setError,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: blank() });
  useEffect(() => {
    if (open) reset(blank());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, offence]);
  const outcome = useWatch({ control, name: "outcome" });

  const submit = handleSubmit(async (v) => {
    const body = {
      ...(offence ? { active: v.active, reason: v.reason } : { code: v.code }),
      name: v.name,
      legalReference: v.legalReference,
      outcome: v.outcome,
      spotFine: v.outcome === "spot_fine" ? v.spotFine : null,
      severity: v.severity,
      demeritPoints: offence?.demeritPoints ?? null,
      vehicleTypes: v.vehicleTypes,
      citizenReportable: v.citizenReportable,
      publicName: v.publicName,
      publicDescription: v.publicDescription,
    };
    try {
      await onSubmit(body);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length) {
        for (const [f, message] of Object.entries(err.fields)) {
          setError(/** @type {any} */ (f), { type: "server", message });
        }
      } else {
        setError("root", { message: err instanceof Error ? err.message : "Please try again." });
      }
    }
  });

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={offence ? `Change ${offence.code}` : "New offence"}
      description={
        offence
          ? `Creates version ${offence.version + 1}. Version ${offence.version} is kept for notices already issued.`
          : "Check the legal reference and fine against the gazette."
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="primary" type="submit" form="offence-form" loading={isSubmitting}>
            {offence ? "Save new version" : "Add offence"}
          </Button>
        </>
      }
    >
      <form id="offence-form" onSubmit={submit} noValidate className="grid gap-5 p-5">
        {errors.root?.message ? <Alert tone="danger">{errors.root.message}</Alert> : null}
        {!offence ? (
          <Field label="Code" hint="e.g. MTA-157A" error={errors.code?.message}>
            {({ invalid, ...p }) => (
              <Input
                {...p}
                invalid={invalid}
                autoFocus
                className="font-mono uppercase"
                {...register("code")}
              />
            )}
          </Field>
        ) : null}
        <Field label="Offence (as in the law)" error={errors.name?.message}>
          {({ invalid, ...p }) => <Input {...p} invalid={invalid} {...register("name")} />}
        </Field>
        <Field
          label="Legal reference"
          hint="e.g. MTA s. 157A"
          error={errors.legalReference?.message}
        >
          {({ invalid, ...p }) => (
            <Input {...p} invalid={invalid} {...register("legalReference")} />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Dealt with by" error={errors.outcome?.message}>
            {({ invalid, ...p }) => (
              <Select {...p} invalid={invalid} {...register("outcome")}>
                <option value="spot_fine">Spot fine (penalty notice)</option>
                <option value="court">Court only</option>
              </Select>
            )}
          </Field>
          {outcome === "spot_fine" ? (
            <Field label="Spot fine (Rs)" error={errors.spotFine?.message}>
              {({ invalid, ...p }) => (
                <Input
                  {...p}
                  invalid={invalid}
                  inputMode="numeric"
                  className="tabular-nums"
                  {...register("spotFine")}
                />
              )}
            </Field>
          ) : null}
        </div>
        <Field
          label="Severity"
          hint="Sets the suggested priority of reports"
          error={errors.severity?.message}
        >
          {({ invalid, ...p }) => (
            <Select {...p} invalid={invalid} {...register("severity")}>
              {Object.entries(SEVERITY_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-text">Applies to</legend>
          <p className="mb-2 text-[13px] text-text-muted">Leave all unticked for any vehicle.</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(VEHICLE_LABELS).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-text">
                <input
                  type="checkbox"
                  value={k}
                  className="size-4 accent-[var(--ev-action)]"
                  {...register("vehicleTypes")}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-4 rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium text-text">For the public mobile app</legend>
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              className="size-4 accent-[var(--ev-action)]"
              {...register("citizenReportable")}
            />
            Citizens can report this offence
          </label>
          <Field label="Name citizens see" error={errors.publicName?.message}>
            {({ invalid, ...p }) => <Input {...p} invalid={invalid} {...register("publicName")} />}
          </Field>
          <Field label="Description citizens see" error={errors.publicDescription?.message}>
            {({ invalid, ...p }) => (
              <Textarea {...p} invalid={invalid} rows={2} {...register("publicDescription")} />
            )}
          </Field>
        </fieldset>
        {offence ? (
          <>
            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="size-4 accent-[var(--ev-action)]"
                {...register("active")}
              />
              In force (untick to stop using this offence for new reports and notices)
            </label>
            <Field
              label="Reason for the change"
              hint="e.g. the gazette number and date"
              error={errors.reason?.message}
            >
              {({ invalid, ...p }) => (
                <Textarea {...p} invalid={invalid} rows={2} {...register("reason")} />
              )}
            </Field>
          </>
        ) : null}
      </form>
    </Sheet>
  );
}
