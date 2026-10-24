// A vehicle's record — docs/04 §3: registry details, owners over time,
// checks, flags and cases.

import { ArrowLeft, TriangleAlert } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { formatDateTime } from "@/lib/format.js";
import { Alert, Badge, Page, Panel, Skeleton } from "@/ui/index.js";
import { useVehicle } from "../api.js";
import { FLAG_LABELS } from "../lib/labels.js";

export function VehiclePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const vehicle = useVehicle(id);
  const v = vehicle.data;

  return (
    <Page
      title={v ? v.plate : "Vehicle"}
      description={
        v
          ? [v.colour, v.make, v.model, v.type?.replace("_", "-")].filter(Boolean).join(" ")
          : undefined
      }
      className="max-w-4xl"
      back={
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden /> Back
        </button>
      }
    >
      {vehicle.isPending ? (
        <Skeleton className="h-64" />
      ) : vehicle.isError || !v ? (
        <Alert tone="danger">{vehicle.error?.message ?? "Not found."}</Alert>
      ) : (
        <div className="grid gap-5">
          {v.flags.map((f) => (
            <Alert
              key={f.type}
              tone="danger"
              title={FLAG_LABELS[/** @type {keyof typeof FLAG_LABELS} */ (f.type)] ?? f.type}
            >
              {f.note}
              {f.reference ? ` · Ref. ${f.reference}` : ""}
              {f.since ? ` · since ${formatDateTime(f.since)}` : ""} — {f.by},{" "}
              {formatDateTime(f.at)}
            </Alert>
          ))}
          <Panel title="Owners" description="Added from registry checks; earlier owners are kept.">
            <ul className="divide-y divide-border text-sm">
              {[...v.ownership].reverse().map((o, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between"
                >
                  <span>
                    {o.personId ? (
                      <Link to={`/persons/${o.personId}`} className="text-action hover:underline">
                        {o.name}
                      </Link>
                    ) : (
                      <span className="text-text-muted">Recorded owner</span>
                    )}
                    {!o.to ? (
                      <Badge tone="success" className="ml-2">
                        Current
                      </Badge>
                    ) : null}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDateTime(o.from)} – {o.to ? formatDateTime(o.to) : "now"}
                    {o.dmtReference ? ` · DMT ${o.dmtReference}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Cases">
            <ul className="divide-y divide-border text-sm">
              {v.cases.map((c) => (
                <li key={c.caseId} className="flex items-center justify-between gap-3 px-5 py-3">
                  <Link to={`/cases/${c.caseId}`} className="font-mono text-action hover:underline">
                    {c.caseNumber}
                  </Link>
                  <span className="text-xs text-text-muted">{formatDateTime(c.occurredAt)}</span>
                </li>
              ))}
            </ul>
          </Panel>
          <Panel title="Registry checks">
            <ul className="divide-y divide-border text-sm">
              {[...v.checks].reverse().map((c, i) => (
                <li
                  key={i}
                  className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:justify-between"
                >
                  <span className="text-text">
                    DMT {c.dmtReference}
                    {c.caseNumber ? (
                      <span className="ml-2 font-mono text-xs text-text-muted">{c.caseNumber}</span>
                    ) : null}
                  </span>
                  <span className="text-xs text-text-muted">
                    {c.by} · {formatDateTime(c.at)}
                  </span>
                </li>
              ))}
            </ul>
          </Panel>
          {v.flags.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-text-muted">
              <TriangleAlert className="size-3.5" aria-hidden /> No flags. Officers flag a suspected
              false plate or a stolen vehicle from the case.
            </p>
          ) : null}
        </div>
      )}
    </Page>
  );
}
