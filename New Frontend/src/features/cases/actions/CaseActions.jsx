// Dialogs for case actions (docs/03 §5, §6). The server decides what is
// allowed; these only collect what it needs.

import { Search } from "lucide-react";
import { useState } from "react";
import { useDebouncedValue } from "@/lib/hooks/useDebouncedValue.js";
import { Alert, Badge, Button, Dialog, Field, Input, Select, Textarea, cn } from "@/ui/index.js";
import { useCaseAction, useCaseOfficers, useStationChoices } from "../api.js";

/** @typedef {import("../api.js").CaseRecord} CaseRecord */

/** @param {unknown} err */
const messageOf = (err) => (err instanceof Error ? err.message : "Please try again.");

/**
 * HQ sends the case to a station: the automatic choice (area, then nearest),
 * or a station of HQ's choosing with a reason.
 * @param {{ c: CaseRecord, open: boolean, onOpenChange: (o: boolean) => void, onDone: (msg: string) => void }} props
 */
export function DispatchDialog({ c, open, onOpenChange, onDone }) {
  const action = useCaseAction(c.id);
  const [mode, setMode] = useState(
    /** @type {"auto" | "manual"} */ (c.can.autoDispatch ? "auto" : "manual"),
  );
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim(), 250);
  const stations = useStationChoices(c.id, q, open && mode === "manual");
  const [stationId, setStationId] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));

  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({
        action: "dispatch",
        body: mode === "auto" ? { mode } : { mode, stationId, reason },
      });
      onOpenChange(false);
      onDone(c.station ? "Case re-dispatched." : "Case dispatched.");
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      title={c.station ? "Re-dispatch case" : "Dispatch case"}
      description={
        c.station
          ? `Now at ${c.station.name}. The station's work so far stays on the case; its officer is cleared.`
          : "Send the case to the station that will investigate it."
      }
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={mode === "manual" && (!stationId || reason.trim().length < 5)}
            onClick={submit}
          >
            Dispatch
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        {c.disputed ? (
          <Alert tone="warning" title="Disputed jurisdiction">
            Two stations returned this case. Choose the station yourself — it can&apos;t be returned
            again.
          </Alert>
        ) : null}
        <fieldset className="grid gap-2 text-sm">
          <legend className="sr-only">How to choose the station</legend>
          {[
            ["auto", "Automatic", "The station whose area contains the place, else the nearest."],
            ["manual", "Choose the station", "With a reason, recorded on the case."],
          ].map(([k, l, hint]) => {
            const disabled = k === "auto" && !c.can.autoDispatch;
            return (
              <label
                key={k}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border p-3",
                  mode === k && "border-action bg-action-soft",
                  disabled && "opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="mode"
                  className="mt-1 accent-[var(--ev-action)]"
                  checked={mode === k}
                  disabled={disabled}
                  onChange={() => setMode(/** @type {"auto" | "manual"} */ (k))}
                />
                <span>
                  <span className="block font-medium text-text">{l}</span>
                  <span className="text-text-muted">
                    {disabled
                      ? c.disputed
                        ? "Not for a disputed case."
                        : "The case has no map position."
                      : hint}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>
        {mode === "manual" ? (
          <>
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-muted"
                aria-hidden
              />
              <Input
                aria-label="Find a station"
                placeholder="Find a station"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul
              role="listbox"
              aria-label="Stations, nearest first"
              className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border"
            >
              {(stations.data?.items ?? []).map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={stationId === s.id}
                    disabled={s.current}
                    onClick={() => setStationId(s.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunken disabled:opacity-50",
                      stationId === s.id && "bg-action-soft hover:bg-action-soft",
                    )}
                  >
                    <span className="text-text">{s.name}</span>
                    <span className="flex items-center gap-1.5">
                      {s.current ? <Badge>Current</Badge> : null}
                      {!s.verified ? <Badge tone="warning">Not verified</Badge> : null}
                      {s.distanceKm !== null ? (
                        <span className="text-xs text-text-muted tabular-nums">
                          {s.distanceKm} km
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
              {stations.data && stations.data.items.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-text-muted">No station found.</li>
              ) : null}
            </ul>
            <Field label="Reason" hint="Recorded on the case and in the audit log.">
              {({ invalid, ...p }) => (
                <Textarea
                  {...p}
                  invalid={invalid}
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </Field>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The OIC (or a supervisor) sets the investigating officer.
 * @param {{ c: CaseRecord, open: boolean, onOpenChange: (o: boolean) => void, onDone: (msg: string) => void }} props
 */
export function AssignOfficerDialog({ c, open, onOpenChange, onDone }) {
  const action = useCaseAction(c.id);
  const officers = useCaseOfficers(c.id, open);
  const [officerId, setOfficerId] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState(/** @type {string | null} */ (null));

  async function submit() {
    setError(null);
    try {
      await action.mutateAsync({
        action: "officer",
        body: { officerId, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      onOpenChange(false);
      onDone("Investigating officer set.");
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Investigating officer"
      description="One officer is responsible for the case. They and the OIC record the work."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="primary"
            loading={action.isPending}
            disabled={!officerId}
            onClick={submit}
          >
            Assign
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field label="Officer">
          {(p) => (
            <Select {...p} value={officerId} onChange={(e) => setOfficerId(e.target.value)}>
              <option value="">Choose…</option>
              {(officers.data?.items ?? []).map((o) => (
                <option key={o.id} value={o.id} disabled={o.id === c.officer?.id}>
                  {o.name}
                  {o.serviceNumber ? ` (${o.serviceNumber})` : ""}
                  {o.role === "station_oic" ? " — OIC" : ""}
                  {o.id === c.officer?.id ? " — current" : ""}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Note (optional)" hint="e.g. why the officer changes.">
          {({ invalid, ...p }) => (
            <Input
              {...p}
              invalid={invalid}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
