// src/pages/station/AssignedViolations.jsx
import React from "react";
import { api } from "../../services/api";

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

      // ✅ supports BOTH:
      // 1) { violations: [...] }
      // 2) { data: { violations: [...] } }
      const payload = res?.data?.data ? res.data.data : res?.data;
      const violations = payload?.violations || [];

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
            className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-slate-100 font-medium">{v.title}</div>
                <div className="mt-1 text-xs text-slate-400">
                  Status: <span className="text-slate-200">{v.status}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "under_review" })}
                  className="rounded-xl border border-slate-700 bg-slate-950/40 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-950/60 disabled:opacity-60"
                >
                  Under Review
                </button>

                <button
                  disabled={savingId === v._id}
                  onClick={() => updateViolation(v._id, { status: "closed" })}
                  className="rounded-xl border border-emerald-800/60 bg-emerald-950/20 px-3 py-1.5 text-xs text-emerald-200 hover:bg-emerald-950/30 disabled:opacity-60"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-2 text-sm text-slate-300">
              {v.description || "—"}
            </div>

            <div className="mt-3">
              <textarea
                defaultValue={v.stationNote || ""}
                placeholder="Station note (action taken, officer comment, etc.)"
                className="w-full rounded-xl border border-slate-800 bg-slate-950/30 p-3 text-sm text-slate-100 outline-none"
                rows={3}
                onBlur={(e) =>
                  updateViolation(v._id, { stationNote: e.target.value })
                }
              />
              <div className="mt-1 text-xs text-slate-500">
                Note saves when you click outside the box.
              </div>
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