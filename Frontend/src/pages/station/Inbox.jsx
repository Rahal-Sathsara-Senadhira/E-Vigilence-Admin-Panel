// src/pages/station/Inbox.jsx
import React from "react";
import { api } from "../../services/api";

export default function Inbox() {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");
  const [dispatches, setDispatches] = React.useState([]);

  React.useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        setError("");
        setLoading(true);

        const res = await api.get("/api/dispatches/inbox");

        // ✅ supports BOTH:
        // 1) { dispatches: [...] }
        // 2) { data: { dispatches: [...] } }
        const payload = res?.data?.data ? res.data.data : res?.data;
        const items = payload?.dispatches || [];

        if (mounted) setDispatches(Array.isArray(items) ? items : []);
      } catch (e) {
        if (mounted) setError(e.message || "Failed to load inbox");
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Station Inbox</h2>
        <p className="text-sm text-slate-400">
          Dispatches sent to your police station
        </p>
      </div>

      {loading ? <Box>Loading…</Box> : null}
      {error ? <ErrorBox>{error}</ErrorBox> : null}

      {!loading && !error && dispatches.length === 0 ? (
        <Box>No dispatches yet.</Box>
      ) : null}

      <div className="grid gap-3">
        {dispatches.map((d) => (
          <div
            key={d._id}
            className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-400">Violation</div>
                <div className="text-slate-100 font-medium">
                  {d.violation?.title || "—"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Sent: {new Date(d.sentAt || d.createdAt).toLocaleString()}
                </div>
              </div>

              <span className="rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs text-slate-200">
                {d.status || "sent"}
              </span>
            </div>

            <div className="mt-3 text-sm text-slate-300">
              {d.violation?.description || "—"}
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