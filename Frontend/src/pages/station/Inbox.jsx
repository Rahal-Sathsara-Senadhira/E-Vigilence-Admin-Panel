// src/pages/station/Inbox.jsx
import React from "react";
import { Inbox as InboxIcon } from "lucide-react";
import { api } from "../../services/api";
import { Card, Badge, LoadingState, ErrorState, EmptyState } from "../../components/ui";

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

        // API returns: { dispatches: [...] }
        const items = res?.dispatches || [];

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
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Station Inbox</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Dispatches sent to your police station
        </p>
      </div>

      {loading ? <Card><LoadingState /></Card> : null}
      {error ? <ErrorState message={error} /> : null}

      {!loading && !error && dispatches.length === 0 ? (
        <Card>
          <EmptyState icon={InboxIcon} title="No dispatches yet." />
        </Card>
      ) : null}

      <div className="grid gap-3">
        {dispatches.map((d) => (
          <Card key={d._id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">Violation</div>
                <div className="text-slate-900 dark:text-slate-100 font-medium">
                  {d.violation?.title || "—"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Sent: {new Date(d.sentAt || d.createdAt).toLocaleString()}
                </div>
              </div>

              <Badge tone="neutral">{d.status || "sent"}</Badge>
            </div>

            <div className="mt-3 text-sm text-slate-700 dark:text-slate-300">
              {d.violation?.description || "—"}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
