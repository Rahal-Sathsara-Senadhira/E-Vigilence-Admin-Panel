// src/pages/station/AssignedViolations.jsx
import React from "react";
import { api } from "../../services/api";
import EvidenceViewer from "../../components/EvidenceViewer";
import { MapPin, Clock, User, AlertCircle } from "lucide-react";

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

      // ✅ API returns: { violations: [...] }
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
        <h2 className="text-lg font-semibold text-slate-100">
          Assigned Violations
        </h2>
        <p className="text-sm text-slate-400">
          Only cases assigned to your station
        </p>
      </div>

      {loading ? <Box>Loading…</Box> : null}
      {error ? <ErrorBox>{error}</ErrorBox> : null}

      {!loading && !error && items.length === 0 ? (
        <Box>No assigned cases yet.</Box>
      ) : null}

      <div className="grid gap-3">
        {items.map((v) => (
          <div
            key={v._id}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 overflow-hidden"
          >
            {/* Header with title and status */}
            <div className="border-b border-slate-800 bg-slate-900/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-100">
                    {v.title}
                  </h3>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    {v.type && (
                      <span className="px-2 py-1 rounded-lg bg-slate-800/50 text-slate-300">
                        {v.type}
                      </span>
                    )}
                    <span className="px-2 py-1 rounded-lg bg-slate-800/50 text-slate-300">
                      Status: {v.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Case Details Grid */}
            <div className="p-4 border-b border-slate-800 grid grid-cols-2 gap-3 md:grid-cols-4">
              {v.location && (
                <div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> Location
                  </p>
                  <p className="text-sm text-slate-200 mt-1">
                    {v.location?.lat?.toFixed(4)}, {v.location?.lng?.toFixed(4)}
                  </p>
                </div>
              )}
              {v.createdAt && (
                <div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Reported
                  </p>
                  <p className="text-sm text-slate-200 mt-1">
                    {new Date(v.createdAt).toLocaleDateString()}
                  </p>
                </div>
              )}
              {v.reported_by && (
                <div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <User className="h-3 w-3" /> Reporter
                  </p>
                  <p className="text-sm text-slate-200 mt-1">
                    {v.reported_by}
                  </p>
                </div>
              )}
              <div>
                <p className="text-xs text-slate-400">Case ID</p>
                <p className="text-sm text-slate-200 mt-1 font-mono">
                  {v._id?.slice(-8) || "—"}
                </p>
              </div>
            </div>

            {/* Violation Description */}
            {v.description && (
              <div className="p-4 border-b border-slate-800">
                <h4 className="text-sm font-semibold text-slate-100 mb-2">
                  📋 Incident Description
                </h4>
                <p className="text-sm text-slate-300 leading-relaxed">
                  {v.description}
                </p>
              </div>
            )}

            {/* Evidence Viewer */}
            <div className="p-4 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-slate-100 mb-3">
                📸 Evidence Materials
              </h4>
              <EvidenceViewer
                images={v.images || []}
                videos={v.videos || []}
                audios={v.audios || []}
              />
            </div>

            {/* Investigation Notes */}
            <div className="p-4 border-b border-slate-800">
              <h4 className="text-sm font-semibold text-slate-100 mb-3">
                📝 Investigation Notes
              </h4>
              <textarea
                defaultValue={v.stationNote || ""}
                placeholder="Add your investigation findings, observations, and actions taken..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-100 outline-none focus:border-cyan-600 focus:bg-slate-950/50 transition"
                rows={4}
                onBlur={(e) =>
                  updateViolation(v._id, { stationNote: e.target.value })
                }
              />
              <p className="text-xs text-slate-500 mt-2">
                💾 Auto-saves when you click outside the box
              </p>
            </div>

            {/* Action Buttons */}
            <div className="p-4 bg-slate-950/50 flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2">
                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "under_review" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200 hover:bg-slate-950/80 hover:border-cyan-600 disabled:opacity-60 transition"
                >
                  ⏳ Under Review
                </button>

                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "resolved" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-2 text-xs text-emerald-200 hover:bg-emerald-950/30 hover:border-emerald-600 disabled:opacity-60 transition"
                >
                  ✅ Resolved
                </button>

                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "dismissed" })}
                  className="inline-flex items-center gap-2 rounded-xl border border-red-800/60 bg-red-950/20 px-3 py-2 text-xs text-red-200 hover:bg-red-950/30 hover:border-red-600 disabled:opacity-60 transition"
                >
                  ❌ Dismissed
                </button>
              </div>

              {savingId === v._id && (
                <div className="text-xs text-cyan-400">Saving...</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Box({ children }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-slate-200">
      {children}
    </div>
  );
}

function ErrorBox({ children }) {
  return (
    <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-4 text-sm text-red-200">
      {children}
    </div>
  );
}