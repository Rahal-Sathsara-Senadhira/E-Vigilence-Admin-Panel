// Choose offences from the schedule — never free text (docs/02 §4).

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useOffences } from "@/features/offences/index.js";
import { Badge, Input, cn } from "@/ui/index.js";

/**
 * @param {{ value: string[], onChange: (codes: string[]) => void, invalid?: boolean, id?: string }} props
 */
export function OffencePicker({ value, onChange, invalid, id }) {
  const offences = useOffences({ status: "active" });
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const all = offences.data ?? [];
    const needle = q.trim().toLowerCase();
    return needle
      ? all.filter((o) =>
          [o.code, o.name, o.publicName, o.legalReference].some((s) =>
            s.toLowerCase().includes(needle),
          ),
        )
      : all;
  }, [offences.data, q]);
  const byCode = new Map((offences.data ?? []).map((o) => [o.code, o]));
  /** @param {string} code */
  const toggle = (code) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className={cn("rounded-lg border", invalid ? "border-danger" : "border-border-strong")}>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {value.map((code) => (
            <Badge key={code} tone="action" className="pr-1">
              {byCode.get(code)?.name ?? code}
              <button
                type="button"
                onClick={() => toggle(code)}
                aria-label={`Remove ${byCode.get(code)?.name ?? code}`}
                className="grid size-4 place-items-center rounded-full hover:bg-action/15"
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="relative border-b border-border">
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
          aria-hidden
        />
        <Input
          id={id}
          aria-label="Search offences"
          placeholder="Search offences"
          className="rounded-none border-0 pl-9 focus:shadow-none"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul
        className="max-h-56 overflow-y-auto py-1"
        role="listbox"
        aria-multiselectable="true"
        aria-label="Offences"
      >
        {offences.isPending ? (
          <li className="px-3 py-2 text-sm text-text-muted">Loading offences…</li>
        ) : null}
        {list.map((o) => {
          const selected = value.includes(o.code);
          return (
            <li key={o.code} role="option" aria-selected={selected}>
              <button
                type="button"
                onClick={() => toggle(o.code)}
                className="flex w-full items-start gap-2.5 px-3 py-2 text-left text-sm hover:bg-sunken"
              >
                <span
                  className={cn(
                    "mt-0.5 grid size-4 shrink-0 place-items-center rounded border",
                    selected ? "border-action bg-action text-action-ink" : "border-border-strong",
                  )}
                >
                  {selected ? <Check className="size-3" /> : null}
                </span>
                <span className="min-w-0">
                  <span className="block text-text">{o.name}</span>
                  <span className="block text-xs text-text-muted">
                    <span className="font-mono">{o.code}</span> ·{" "}
                    {o.spotFine !== null
                      ? `Rs ${o.spotFine.toLocaleString("en-LK")}`
                      : "Court only"}
                    {o.severity === "severe" ? " · severe" : ""}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
