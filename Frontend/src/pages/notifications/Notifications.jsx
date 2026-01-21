import React from "react";
import { Bell } from "lucide-react";
import {
  listNotifications,
  markNotificationRead,
} from "../../services/notificationsApi";

export default function Notifications() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  async function load() {
    setLoading(true);
    const res = await listNotifications();
    setItems(res.data || []);
    setLoading(false);
  }

  React.useEffect(() => {
    load();
  }, []);

  async function markRead(n) {
    if (n.is_read) return;
    await markNotificationRead(n.id);
    load();
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="h-4 w-4 text-cyan-400" />
        <p className="text-sm font-medium text-slate-200">
          Notifications
        </p>
      </div>

      {loading ? (
        <p className="text-slate-300">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-slate-400">No notifications.</p>
      ) : (
        <div className="divide-y divide-slate-800">
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => markRead(n)}
              className={[
                "cursor-pointer p-3 rounded-xl",
                n.is_read
                  ? "opacity-60"
                  : "bg-slate-800/40 hover:bg-slate-800/60",
              ].join(" ")}
            >
              <p className="text-sm text-slate-100 font-medium">
                {n.title}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {n.message}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {new Date(n.created_at).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
