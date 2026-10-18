import React from "react";
import { FormSection, Field } from "./formUi";
import { inputClass, inputState } from "./formStyles";
import { toLocalInput, MAX_INCIDENT_AGE_DAYS, DESCRIPTION_MAX } from "../../../utils/complaint";

const QUICK_TIMES = [
  { label: "Just now", minutes: 0 },
  { label: "30 min ago", minutes: 30 },
  { label: "1 hour ago", minutes: 60 },
  { label: "3 hours ago", minutes: 180 },
];

export default function IncidentSection({ form, set, errors, complete }) {
  const now = new Date();
  const min = new Date(now.getTime() - MAX_INCIDENT_AGE_DAYS * 86400000);
  const len = form.description.trim().length;

  return (
    <FormSection
      id="incident"
      step={2}
      title="Incident"
      subtitle="When it happened and what the reporter saw."
      complete={complete}
    >
      <div className="space-y-5">
        <Field
          label="Date and time of the incident"
          htmlFor="occurredAt"
          required
          error={errors.occurredAt}
          hint={`Not when it was reported — when it happened. Up to ${MAX_INCIDENT_AGE_DAYS} days ago.`}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              id="occurredAt"
              type="datetime-local"
              value={form.occurredAt}
              min={toLocalInput(min)}
              max={toLocalInput(now)}
              onChange={(e) => set({ occurredAt: e.target.value })}
              className={`${inputClass} ${inputState(errors.occurredAt)} sm:max-w-xs`}
            />
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TIMES.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => set({ occurredAt: toLocalInput(Date.now() - q.minutes * 60000) })}
                  className="h-8 rounded-lg border border-line bg-raised px-2.5 text-xs font-medium text-ink hover:border-primary/50 hover:text-primary"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field
          label="What happened"
          htmlFor="description"
          required
          error={errors.description}
          hint="What the reporter saw, direction of travel, anything that helps the station act on it."
        >
          <textarea
            id="description"
            rows={4}
            value={form.description}
            maxLength={DESCRIPTION_MAX}
            onChange={(e) => set({ description: e.target.value })}
            placeholder="e.g. Rider without a helmet, heading towards Kollupitiya junction at high speed, carrying a passenger."
            className={`${inputClass} ${inputState(errors.description)} h-auto resize-y py-2.5 leading-relaxed`}
          />
          <p className="mt-1 text-right text-xs tabular-nums text-muted">
            {len} / {DESCRIPTION_MAX}
          </p>
        </Field>
      </div>
    </FormSection>
  );
}
