// src/pages/station/AssignedViolations.jsx
import React from "react";
import { api } from "../../services/api";
import EvidenceViewer from "../../components/EvidenceViewer";
import {
  MapPin,
  Clock,
  User,
  FileText,
  Camera,
  StickyNote,
  Hourglass,
  CheckCircle2,
  XCircle,
  ClipboardList,
} from "lucide-react";
import { Card, Badge, LoadingState, ErrorState, EmptyState } from "../../components/ui";

export default function AssignedViolations() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [items, setItems] = React.useState([]);
  const [savingId, setSavingId] = React.useState("");

  async function load() {
    try {
      setError("");
      setLoading(true);

      const res = await api.get("/api/violations/assigned/me");

      // API returns: { violations: [...] }
      const violations = res?.violations || [];

      setItems(Array.isArray(violations) ? violations : []);
    } catch (e) {
      setError(e.message || "Failed to load assigned violations");
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load();
  }, []);

  async function updateViolation(id, patch) {
    try {
      setSavingId(id);
      await api.patch(`/api/violations/${id}/station-update`, patch);
      await load();
    } catch (e) {
      alert(e.message || "Update failed");
    } finally {
      setSavingId("");
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Assigned Violations
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Only cases assigned to your station
        </p>
      </div>

      {loading ? <Card><LoadingState /></Card> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error && items.length === 0 ? (
        <Card>
          <EmptyState icon={ClipboardList} title="No assigned cases yet." />
        </Card>
      ) : null}

      <div className="grid gap-3">
        {items.map((v) => (
          <Card key={v._id} className="!p-0 overflow-hidden">
            {/* Header with title and status */}
            <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    {v.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-2 text-xs">
                    {v.type && <Badge tone="neutral">{v.type}</Badge>}
                    <Badge tone="neutral">Status: {v.status}</Badge>
                  </div>
                </div>
              </div>
            </div>

            {/* Case Details Grid */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-3 md:grid-cols-4">
              {v.location && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                    {v.location?.lat?.toFixed(4) ?? "—"}, {v.location?.lng?.toFixed(4) ?? "—"}
                  </p>
                </div>
              )}
              {v.createdAt && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Reported
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {v.reported_by && (
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <User className="h-3 w-3" /> Reporter
                  </p>
                  <p className="text-sm text-slate-800 dark:text-slate-200 mt-1">
                    {v.reported_by}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Case ID</p>
                <p className="text-sm text-slate-800 dark:text-slate-200 mt-1 font-mono">
                  {v._id?.slice(-8) || "—"}
                </p>
              </div>
            </div>

            {/* Violation Description */}
            {v.description && (
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-brand-blue" /> Incident Description
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                  {v.description}
                </p>
              </div>
            )}

            {/* Evidence Viewer */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <Camera className="h-4 w-4 text-brand-blue" /> Evidence Materials
              </h4>
              <EvidenceViewer
                images={v.images || []}
                videos={v.videos || []}
                audios={v.audios || []}
              />
            </div>

            {/* Investigation Notes */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-brand-blue" /> Investigation Notes
              </h4>
              <textarea
                defaultValue={v.stationNote || ""}
                placeholder="Add your investigation findings, observations, and actions taken..."
                className="w-full rounded-xl border border-slate-300 dark:border-slate-800 bg-white dark:bg-slate-950/30 p-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:border-brand-blue transition"
                rows={4}
                onBlur={(e) =>
                  updateViolation(v._id, { stationNote: e.target.value })
                }
              />
              <p className="text-xs text-slate-500 mt-2">
                Auto-saves when you click outside the box
              </p>
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950/50 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2">
                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "in_review" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950/60 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:border-brand-blue hover:text-brand-blue dark:hover:border-blue-600 disabled:opacity-60 transition"
                >
                  <Hourglass className="h-3.5 w-3.5" /> Under Review
                </button>

                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "resolved" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-300 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-200 hover:border-emerald-600 disabled:opacity-60 transition"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
                </button>

                {/* Backend statuses are open|pending|in_review|resolved|verified|rejected —
                    this used to send "dismissed", which isn't one of them and would fail
                    every time it was clicked. */}
                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "rejected" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-300 dark:border-red-800/60 bg-red-50 dark:bg-red-950/20 px-3 py-2 text-xs text-red-700 dark:text-red-200 hover:border-red-600 disabled:opacity-60 transition"
                >
                  <XCircle className="h-3.5 w-3.5" /> Rejected
                </button>
              </div>

              {savingId === v._id && (
                <div className="text-xs text-brand-blue dark:text-blue-400">Saving...</div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
