import React from "react";
import { Search, X, Check } from "lucide-react";
import { FormSection, Field } from "./formUi";
import { inputClass, inputState } from "./formStyles";
import { appliesTo } from "./useComplaintForm";

const SEVERITY = {
  minor: "bg-raised text-muted",
  moderate: "bg-st-pending/15 text-ink",
  severe: "bg-st-rejected/15 text-st-rejected",
};

const fine = (n) => (typeof n === "number" ? `Rs. ${n.toLocaleString()}` : "No fine set");

// Offences come only from the Violation Catalog (no free text), filtered to
// active entries that apply to the chosen vehicle type.
export default function OffencesSection({ form, set, errors, complete, catalog, catalogById, loadError }) {
  const [query, setQuery] = React.useState("");

  const options = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (catalog || [])
      .filter((c) => c.isActive !== false && appliesTo(c, form.vehicleType))
      .filter(
        (c) =>
          !q ||
          c.name.toLowerCase().includes(q) ||
          String(c.legalCode || "").toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, query, form.vehicleType]);

  const selected = new Set(form.violations);
  const toggle = (id) =>
    set({ violations: selected.has(id) ? form.violations.filter((x) => x !== id) : [...form.violations, id] });

  return (
    <FormSection
      id="offences"
      step={4}
      title="Offences"
      subtitle={
        form.vehicleType
          ? `Offences that apply to a ${form.vehicleType}. Each one is fined separately.`
          : "Pick the vehicle type first to narrow the list. Each offence is fined separately."
      }
      complete={complete}
    >
      <Field error={errors.violations || loadError}>
        {form.violations.length > 0 ? (
          <div className="mb-3 flex flex-wrap gap-2">
            {form.violations.map((id) => {
              const entry = catalogById.get(id);
              const wrong = entry && !appliesTo(entry, form.vehicleType);
              return (
                <span
                  key={id}
                  className={`inline-flex items-center gap-1.5 rounded-full border py-1 pl-3 pr-1 text-sm font-medium ${
                    wrong
                      ? "border-st-rejected/50 bg-st-rejected/10 text-st-rejected"
                      : "border-primary/40 bg-primary/10 text-ink"
                  }`}
                >
                  {entry?.name ?? "Unknown offence"}
                  <button
                    type="button"
                    onClick={() => toggle(id)}
                    aria-label={`Remove ${entry?.name ?? "offence"}`}
                    className="rounded-full p-0.5 hover:bg-ink/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
        ) : null}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search offences or legal codes…"
            aria-label="Search offences"
            className={`${inputClass} ${inputState(errors.violations)} pl-9`}
          />
        </div>

        <ul
          className="mt-2 max-h-72 divide-y divide-line overflow-y-auto rounded-xl border border-line"
          aria-label="Offences"
        >
          {options.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted">
              {catalog?.length ? "No matching offences." : "Loading the Violation Catalog…"}
            </li>
          ) : (
            options.map((c) => {
              const id = String(c.id || c._id);
              const on = selected.has(id);
              return (
                <li key={id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(id)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-raised focus-visible:bg-raised focus-visible:outline-none ${
                      on ? "bg-primary/5" : ""
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                        on ? "border-primary bg-primary text-white" : "border-line bg-surface"
                      }`}
                    >
                      {on ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                      {c.legalCode ? <span className="block text-xs text-muted">{c.legalCode}</span> : null}
                    </span>
                    {c.severity ? (
                      <span
                        className={`hidden rounded-full px-2 py-0.5 text-xs font-medium capitalize sm:inline ${
                          SEVERITY[c.severity] || SEVERITY.minor
                        }`}
                      >
                        {c.severity}
                      </span>
                    ) : null}
                    <span
                      className={`w-24 shrink-0 text-right text-sm tabular-nums ${
                        typeof c.fineAmount === "number" ? "font-semibold text-ink" : "text-attention-ink"
                      }`}
                    >
                      {fine(c.fineAmount)}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </Field>
    </FormSection>
  );
}
