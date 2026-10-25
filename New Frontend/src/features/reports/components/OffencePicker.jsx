// Choose offences from the schedule — never free text (docs/02 §4).

import { Check, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useOffences } from "@/features/offences/index.js";
import { Badge, Input, cn } from "@/ui/index.js";

/**
 * Whether an offence can be committed with this vehicle type. Same rule as
 * the backend (offences/index.js): no vehicle types = every vehicle; an
 * unknown or "other" vehicle fits any offence.
 * @param {{ vehicleTypes: string[] }} offence @param {string | null | undefined} vehicleType
 */
const appliesToVehicle = (offence, vehicleType) =>
  !vehicleType ||
  vehicleType === "other" ||
  !offence.vehicleTypes?.length ||
  offence.vehicleTypes.includes(vehicleType);

/**
 * With `vehicleType`, only offences that can apply to it are offered ("No
 * helmet" isn't listed for a car); one already chosen that doesn't fit is
 * shown in red, to remove or to correct the vehicle type.
 * @param {{ value: string[], onChange: (codes: string[]) => void, invalid?: boolean, id?: string, vehicleType?: string | null }} props
 */
export function OffencePicker({ value, onChange, invalid, id, vehicleType }) {
  const offences = useOffences({ status: "active" });
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const all = (offences.data ?? []).filter((o) => appliesToVehicle(o, vehicleType));
    const needle = q.trim().toLowerCase();
    return needle
      ? all.filter((o) =>
          [o.code, o.name, o.publicName, o.legalReference].some((s) =>
            s.toLowerCase().includes(needle),
          ),
        )
      : all;
  }, [offences.data, q, vehicleType]);
  const byCode = new Map((offences.data ?? []).map((o) => [o.code, o]));
  const misfits = value.some((c) => {
    const o = byCode.get(c);
    return o ? !appliesToVehicle(o, vehicleType) : false;
  });
  /** @param {string} code */
  const toggle = (code) =>
    onChange(value.includes(code) ? value.filter((c) => c !== code) : [...value, code]);

  return (
    <div className={cn("rounded-lg border", invalid ? "border-danger" : "border-border-strong")}>
      {value.length ? (
        <div className="flex flex-wrap gap-1.5 border-b border-border p-2">
          {value.map((code) => {
            const o = byCode.get(code);
            const misfit = o ? !appliesToVehicle(o, vehicleType) : false;
            return (
              <Badge key={code} tone={misfit ? "danger" : "action"} className="pr-1">
                {o?.name ?? code}
                <button
                  type="button"
                  onClick={() => toggle(code)}
                  aria-label={`Remove ${byCode.get(code)?.name ?? code}`}
                  className="grid size-4 place-items-center rounded-full hover:bg-action/15"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
          {misfits ? (
            <p className="w-full text-xs text-danger">
              In red: doesn&apos;t apply to this vehicle type. Remove it, or correct the vehicle
              type.
            </p>
          ) : null}
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
