// Inputs shared by "record a report" and "accept".

import { formatRupees, isInSriLanka, type OffenceView, type Severity } from "@ev/shared";
import { Input, cn } from "@ev/ui";
import { Check, Search } from "lucide-react";
import { useId, useMemo, useState } from "react";

const SEVERITY_LABELS: Record<Severity, string> = {
  severe: "Severe — court",
  moderate: "Moderate",
  minor: "Minor",
};
/** Most serious first. */
const SEVERITY_ORDER: readonly Severity[] = ["severe", "moderate", "minor"];

/** Pick up to `max` offences from the schedule, searchable, grouped by severity. */
export function OffencePicker({
  offences,
  value,
  onChange,
  max = 5,
  invalid,
}: {
  offences: OffenceView[];
  value: string[];
  onChange: (codes: string[]) => void;
  max?: number;
  invalid?: boolean;
}) {
  const [q, setQ] = useState("");
  const listId = useId();
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return offences.filter(
      (o) =>
        !term ||
        o.name.toLowerCase().includes(term) ||
        o.publicName.toLowerCase().includes(term) ||
        o.code.toLowerCase().includes(term),
    );
  }, [offences, q]);

  const toggle = (code: string) => {
    if (value.includes(code)) onChange(value.filter((c) => c !== code));
    else if (value.length < max) onChange([...value, code]);
  };

  return (
    <div className={cn("rounded-lg border bg-surface", invalid ? "border-danger" : "border-line")}>
      <div className="relative border-b border-line p-2">
        <Search className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-muted" />
        <Input
          aria-label="Search offences"
          aria-controls={listId}
          placeholder="Search offences"
          className="h-9 border-0 pl-9 focus:ring-0"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div id={listId} className="max-h-64 overflow-y-auto p-1">
        {SEVERITY_ORDER.map((sev) => {
          const group = filtered.filter((o) => o.severity === sev);
          if (group.length === 0) return null;
          return (
            <div key={sev} className="mb-1">
              <p className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-muted uppercase">
                {SEVERITY_LABELS[sev]}
              </p>
              {group.map((o) => {
                const on = value.includes(o.code);
                const full = !on && value.length >= max;
                return (
                  <button
                    type="button"
                    key={o.code}
                    disabled={full}
                    aria-pressed={on}
                    onClick={() => toggle(o.code)}
                    className={cn(
                      "flex w-full items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-50",
                      on ? "bg-primary/10" : "hover:bg-raised",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                        on ? "border-primary bg-primary text-primary-ink" : "border-line",
                      )}
                    >
                      {on ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-ink">{o.name}</span>
                      <span className="text-xs text-muted">
                        <span className="font-mono">{o.code}</span> ·{" "}
                        {o.outcome === "court" ? "Court" : formatRupees(o.spotFine)}
                        {o.citizenReportable ? "" : " · officers only"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })}
        {filtered.length === 0 ? (
          <p className="p-3 text-sm text-muted">No offence matches “{q}”.</p>
        ) : null}
      </div>
      <p className="border-t border-line px-3 py-2 text-xs text-muted tabular-nums">
        {value.length} of up to {max} selected
      </p>
    </div>
  );
}

/** "6.9344, 79.8428" or "6.9344 79.8428" → {lat, lng}. Accepts what map apps copy. */
export function parseCoordinates(text: string): { lat: number; lng: number } | null {
  const m = /(-?\d{1,2}\.\d+)\s*[,\s]\s*(-?\d{2,3}\.\d+)/.exec(text);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return isInSriLanka(lat, lng) ? { lat, lng } : null;
}

export function formatCoordinates(p: { lat: number; lng: number } | null | undefined) {
  return p ? `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}` : "";
}

/** ISO → value for <input type="datetime-local"> in the browser's time zone. */
export function toLocalInput(iso: string | Date): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}
