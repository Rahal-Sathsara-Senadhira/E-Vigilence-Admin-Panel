import React from "react";
import { CheckCircle2 } from "lucide-react";
import { FormSection, Field, Checkbox } from "./formUi";
import { inputClass, inputState } from "./formStyles";
import { normalizePlate } from "../../../utils/complaint";
import { VEHICLE_TYPES } from "../../../utils/violationOptions";

export default function VehicleSection({ form, set, errors, complete }) {
  const plate = normalizePlate(form.vehicleNumber);

  return (
    <FormSection
      id="vehicle"
      step={3}
      title="Vehicle"
      subtitle="The vehicle involved."
      complete={complete}
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Plate number"
            htmlFor="vehicleNumber"
            required={!form.plateUnknown}
            error={errors.vehicleNumber}
            hint={plate ? null : "Sri Lankan plates only — e.g. WP CAB-1234, CAB-1234, 250-1234"}
          >
            <div className="relative">
              <input
                id="vehicleNumber"
                value={form.plateUnknown ? "" : form.vehicleNumber}
                onChange={(e) => set({ vehicleNumber: e.target.value })}
                disabled={form.plateUnknown}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={form.plateUnknown ? "Plate not known" : "WP CAB-1234"}
                className={`${inputClass} ${inputState(errors.vehicleNumber)} pr-10 font-mono uppercase tracking-wider`}
              />
              {plate && !form.plateUnknown ? (
                <CheckCircle2
                  className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-st-verified"
                  aria-label="Valid plate"
                />
              ) : null}
            </div>
            {plate && !form.plateUnknown ? (
              <p className="mt-1.5 text-xs text-muted">
                Saved as{" "}
                <span className="rounded border border-ink/60 px-1 font-mono font-bold text-ink">{plate}</span>
              </p>
            ) : null}
          </Field>

          <div className="flex items-end pb-2.5">
            <Checkbox
              id="plateUnknown"
              checked={form.plateUnknown}
              onChange={(plateUnknown) => set({ plateUnknown })}
              label="Plate number unknown"
              description="e.g. the reporter couldn't read it"
            />
          </div>
        </div>

        <Field label="Vehicle type" required error={errors.vehicleType}>
          <div
            role="radiogroup"
            aria-label="Vehicle type"
            className={`flex flex-wrap gap-2 ${errors.vehicleType ? "rounded-xl p-1 ring-2 ring-st-rejected/30" : ""}`}
          >
            {VEHICLE_TYPES.map((t) => {
              const active = form.vehicleType === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => set({ vehicleType: t })}
                  className={`h-9 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                    active
                      ? "border-primary bg-primary text-white"
                      : "border-line bg-surface text-ink hover:border-primary/50 hover:bg-raised"
                  }`}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Make / model" htmlFor="vehicleModel" hint="Optional">
            <input
              id="vehicleModel"
              value={form.vehicleModel}
              onChange={(e) => set({ vehicleModel: e.target.value })}
              maxLength={60}
              placeholder="e.g. Honda Dio"
              className={`${inputClass} ${inputState(false)}`}
            />
          </Field>
          <Field label="Colour" htmlFor="vehicleColor" hint="Optional">
            <input
              id="vehicleColor"
              value={form.vehicleColor}
              onChange={(e) => set({ vehicleColor: e.target.value })}
              maxLength={30}
              placeholder="e.g. Red"
              className={`${inputClass} ${inputState(false)}`}
            />
          </Field>
        </div>
      </div>
    </FormSection>
  );
}
