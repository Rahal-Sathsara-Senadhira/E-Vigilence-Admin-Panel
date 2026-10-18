import React from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, AlertTriangle, Building2, Send, Save, Loader2, ExternalLink } from "lucide-react";
import StatusBadge from "../../../components/StatusBadge";

const CHECKLIST = [
  { key: "source", label: "Source" },
  { key: "incident", label: "Incident" },
  { key: "vehicle", label: "Vehicle" },
  { key: "offences", label: "Offences" },
  { key: "location", label: "Location" },
];

function jumpTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function SummaryPanel({
  f,
  evidence,
  nearestStation,
  duplicates,
  isStation,
  submitting,
  onSubmit,
}) {
  const evidenceDone = evidence.items.filter((i) => i.status === "done").length;
  const blockedByUploads = evidence.busy;

  return (
    <aside className="space-y-4 lg:sticky lg:top-0">
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Complaint title</p>
        <p className={`mt-1 font-semibold ${f.titlePreview ? "text-ink" : "text-muted"}`}>
          {f.titlePreview || "Fills in as you choose the vehicle and offences"}
        </p>

        <div className="mt-4 flex items-end justify-between border-t border-line pt-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Fine if verified</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">
              Rs. {f.fineTotal.toLocaleString()}
            </p>
          </div>
          <p className="text-xs text-muted">
            {f.selectedOffences.length} offence{f.selectedOffences.length === 1 ? "" : "s"}
          </p>
        </div>
        {f.finesMissing ? (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-attention-ink">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            An offence has no fine set in the catalog — it can be filed, but not verified until HQ sets one.
          </p>
        ) : null}

        <ul className="mt-4 space-y-1 border-t border-line pt-4">
          {CHECKLIST.map((c) => {
            const ok = f.sectionComplete[c.key];
            return (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => jumpTo(c.key)}
                  className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-raised"
                >
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 text-st-verified" />
                  ) : (
                    <Circle className={`h-4 w-4 ${f.showErrors ? "text-st-rejected" : "text-muted"}`} />
                  )}
                  <span className={ok ? "text-ink" : "text-muted"}>{c.label}</span>
                </button>
              </li>
            );
          })}
          <li className="flex items-center gap-2 px-1 py-1 text-sm">
            {evidenceDone > 0 ? (
              <CheckCircle2 className="h-4 w-4 text-st-verified" />
            ) : (
              <Circle className="h-4 w-4 text-muted" />
            )}
            <span className={evidenceDone > 0 ? "text-ink" : "text-muted"}>
              Evidence {evidenceDone > 0 ? `(${evidenceDone})` : "(optional)"}
            </span>
          </li>
        </ul>

        <div className="mt-4 space-y-2 border-t border-line pt-4">
          {isStation ? (
            <>
              <button
                type="button"
                disabled={submitting || blockedByUploads}
                onClick={() => onSubmit(null)}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Create complaint
              </button>
              <p className="text-center text-xs text-muted">It will be assigned to your station.</p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={submitting || blockedByUploads}
                onClick={() => onSubmit("nearest")}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Create &amp; dispatch
              </button>
              <button
                type="button"
                disabled={submitting || blockedByUploads}
                onClick={() => onSubmit(null)}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                Create without dispatching
              </button>
            </>
          )}
          {blockedByUploads ? (
            <p className="text-center text-xs text-muted">
              {evidence.uploading ? "Waiting for uploads to finish…" : "Compressing video — almost ready…"}
            </p>
          ) : evidence.failed > 0 ? (
            <p className="text-center text-xs text-st-rejected">
              {evidence.failed} file{evidence.failed === 1 ? "" : "s"} failed and won't be attached.
            </p>
          ) : null}
        </div>
      </div>

      {!isStation && nearestStation ? (
        <div className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Building2 className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Dispatch goes to</p>
            <p className="truncate font-semibold text-ink">{nearestStation.name}</p>
            {typeof nearestStation.distanceKm === "number" ? (
              <p className="text-xs text-muted">{nearestStation.distanceKm.toFixed(1)} km from the pin</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {duplicates.length > 0 ? (
        <div className="rounded-2xl border border-attention/50 bg-attention/10 p-4" role="status">
          <p className="flex items-center gap-2 text-sm font-semibold text-attention-ink">
            <AlertTriangle className="h-4 w-4" />
            {duplicates.length} similar complaint{duplicates.length === 1 ? "" : "s"} in the last 24 hours
          </p>
          <p className="mt-1 text-xs text-ink/80">Check these before filing — it may already be reported.</p>
          <ul className="mt-3 space-y-2">
            {duplicates.map((d) => (
              <li key={d.id} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-medium text-ink">{d.title}</p>
                  <StatusBadge status={d.status} />
                </div>
                <p className="mt-1 text-xs text-muted">
                  {d.reason}
                  {d.address ? ` · ${d.address}` : ""}
                </p>
                {!isStation ? (
                  <Link
                    to={`/violations/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Open in a new tab <ExternalLink className="h-3 w-3" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}
