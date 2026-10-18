import React from "react";
import { Phone, Footprints, ShieldCheck, MoreHorizontal } from "lucide-react";
import { FormSection, Field, Segmented, Checkbox } from "./formUi";
import { inputClass, inputState } from "./formStyles";
import { CHANNELS, normalizePhone, formatPhone } from "../../../utils/complaint";

const ICONS = { phone: Phone, walk_in: Footprints, officer: ShieldCheck, other: MoreHorizontal };

export default function SourceSection({ form, set, errors, complete }) {
  const phone = normalizePhone(form.callerMobile);
  const callerRequired = form.channel === "phone" && !form.callerAnonymous;

  return (
    <FormSection
      id="source"
      step={1}
      title="Source"
      subtitle="How the complaint reached you and who reported it."
      complete={complete}
    >
      <div className="space-y-5">
        <Field label="Received via" required error={errors.channel}>
          <Segmented
            name="Received via"
            value={form.channel}
            onChange={(channel) => set({ channel })}
            options={CHANNELS.map((c) => ({ ...c, icon: ICONS[c.value] }))}
            error={errors.channel}
          />
        </Field>

        <Checkbox
          id="callerAnonymous"
          checked={form.callerAnonymous}
          onChange={(callerAnonymous) => set({ callerAnonymous })}
          label="Caller wants to stay anonymous"
          description="No name or number is recorded."
        />

        {!form.callerAnonymous ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Caller name" htmlFor="callerName" hint="Optional">
              <input
                id="callerName"
                value={form.callerName}
                onChange={(e) => set({ callerName: e.target.value })}
                maxLength={100}
                autoComplete="off"
                placeholder="e.g. Nimal Perera"
                className={`${inputClass} ${inputState(false)}`}
              />
            </Field>
            <Field
              label="Caller mobile"
              htmlFor="callerMobile"
              required={callerRequired}
              error={errors.callerMobile}
              hint={phone ? `Saved as ${formatPhone(phone)}` : "Sri Lankan number — only HQ can see it"}
            >
              <input
                id="callerMobile"
                type="tel"
                inputMode="tel"
                value={form.callerMobile}
                onChange={(e) => set({ callerMobile: e.target.value })}
                autoComplete="off"
                placeholder="077 123 4567"
                className={`${inputClass} ${inputState(errors.callerMobile)}`}
              />
            </Field>
          </div>
        ) : null}
      </div>
    </FormSection>
  );
}
