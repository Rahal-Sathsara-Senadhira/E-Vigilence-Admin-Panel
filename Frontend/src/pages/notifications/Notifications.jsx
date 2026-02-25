import React from "react";
import {
  Search,
  RefreshCcw,
  CheckCheck,
  Check,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Bell,
} from "lucide-react";

import {
  listNotifications,
  markNotificationRead,
  markAllRead,
  deleteNotification,
} from "../../services/notificationsApi";

const TYPES = ["system", "violation", "report"];
const STATUS = ["unread", "read"];

export default function Notifications() {
  const [items, setItems] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState("");

  // filters
  const [q, setQ] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [type, setType] = React.useState("");

  // pagination
  const [page, setPage] = React.useState(1);
  const [limit, setLimit] = React.useState(10);
  const [total, setTotal] = React.useState(0);
  const totalPages = Math.max(1, Math.ceil(total / limit));

  async function load(next = {}) {
    try {
      setLoading(true);
      setError("");

      const res = await listNotifications({
        q,
        status,
        type,
        page,
        limit,
        ...next,
      });

      // supports: { data: [...], meta:{total,page,limit} } OR { notifications:[...], total } OR [...]
      const arr =
        Array.isArray(res) ? res :
        Array.isArray(res?.data) ? res.data :
        Array.isArray(res?.notifications) ? res.notifications :
        [];

      const nextTotal =
        res?.meta?.total ??
        res?.total ??
        (Array.isArray(res) ? res.length : arr.length);

      const nextPage = res?.meta?.page ?? res?.page ?? page;
      const nextLimit = res?.meta?.limit ?? res?.limit ?? limit;

      setItems(arr);
      setTotal(Number(nextTotal) || 0);
      setPage(Number(nextPage) || page);
      setLimit(Number(nextLimit) || limit);
    } catch (e) {
      setError(e?.message || "Failed to load notifications");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    load({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, status, type, page, limit]);

  const unreadCount = items.filter((x) => !x.is_read).length;

  async function onMarkAllRead() {
    try {
      await markAllRead();
      await load();
    } catch (e) {
      setError(e?.message || "Failed to mark all as read");
    }
  }

  async function onToggleRead(n) {
    try {
      const id = n.id || n._id;
      await markNotificationRead(id, !n.is_read);
      // optimistic update
      setItems((prev) =>
        prev.map((x) =>
          (x.id || x._id) === id ? { ...x, is_read: !n.is_read } : x
        )
      );
    } catch (e) {
      setError(e?.message || "Failed to update notification");
    }
  }

  async function onDelete(n) {
    const id = n.id || n._id;
    const ok = confirm("Delete this notification?");
    if (!ok) return;

    try {
      await deleteNotification(id);
      const remaining = items.length - 1;
      if (remaining <= 0 && page > 1) setPage((p) => p - 1);
      else await load();
    } catch (e) {
      setError(e?.message || "Failed to delete notification");
    }
  }

  function formatTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString();
  }

  function badgeForType(t) {
    const base =
      "inline-flex items-center rounded-lg border px-2 py-1 text-xs";
    if (t === "violation")
      return `${base} border-red-900/60 bg-red-950/30 text-red-200`;
    if (t === "report")
      return `${base} border-amber-900/60 bg-amber-950/30 text-amber-200`;
    return `${base} border-slate-800 bg-slate-950/60 text-slate-200`;
  }

  return (
    <div className="grid gap-4">
      {/* Header / Filters */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-slate-100 font-semibold text-lg">Notifications</p>
            <p className="text-slate-400 text-sm">
              Track system updates, violations, and reports.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={onMarkAllRead}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-800 bg-emerald-600/15 px-3 py-2 text-emerald-200"
              disabled={loading || items.length === 0}
              title="Mark all as read"
            >
              <CheckCheck className="h-4 w-4" /> Mark all read
            </button>

            <button
              onClick={() => load({ page: 1 })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-slate-200"
              disabled={loading}
            >
              <RefreshCcw className="h-4 w-4" /> Refresh
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Search</Label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Search title or message..."
                className="w-full bg-transparent text-sm text-slate-100 outline-none"
              />
            </div>
          </div>

          <div>
            <Label>Type</Label>
            <select
              value={type}
              onChange={(e) => {
                setPage(1);
                setType(e.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Status</Label>
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              <option value="">All</option>
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label>Rows</Label>
            <select
              value={limit}
              onChange={(e) => {
                setPage(1);
                setLimit(Number(e.target.value));
              }}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            >
              {[5, 10, 20, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <div className="w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-200">
              Unread: <span className="text-slate-100 font-semibold">{unreadCount}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-400">
            Showing <span className="text-slate-200">{items.length}</span>
            {total ? (
              <>
                {" "}
                of <span className="text-slate-200">{total}</span>
              </>
            ) : null}
          </p>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" /> Prev
            </button>

            <div className="text-sm text-slate-300">
              Page <span className="text-slate-100 font-medium">{page}</span> /{" "}
              <span className="text-slate-100 font-medium">{totalPages}</span>
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200 disabled:opacity-50"
            >
              Next <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-800">
          {loading ? (
            <div className="px-3 py-6 text-sm text-slate-400">Loading...</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-10 text-sm text-slate-400">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                No notifications found.
              </div>
            </div>
          ) : (
            items.map((n) => (
              <div
                key={n.id || n._id}
                className={`border-b border-slate-800 px-3 py-3 ${
                  !n.is_read ? "bg-slate-950/30" : ""
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={badgeForType(n.type || "system")}>
                        {n.type || "system"}
                      </span>

                      {!n.is_read ? (
                        <span className="rounded-lg border border-cyan-800 bg-cyan-600/15 px-2 py-1 text-xs text-cyan-200">
                          unread
                        </span>
                      ) : null}

                      <p className="text-slate-100 font-medium truncate">
                        {n.title || "Notification"}
                      </p>
                    </div>

                    {n.message ? (
                      <p className="mt-1 text-sm text-slate-300">{n.message}</p>
                    ) : null}

                    <p className="mt-1 text-xs text-slate-500">
                      {formatTime(n.createdAt || n.created_at || n.time)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onToggleRead(n)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-200"
                      title="Toggle read/unread"
                    >
                      <Check className="h-4 w-4" />
                      {n.is_read ? "Mark unread" : "Mark read"}
                    </button>

                    <button
                      onClick={() => onDelete(n)}
                      className="inline-flex items-center gap-2 rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-200"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </button>
                  </div>
                </div>

                {/* optional action link */}
                {n.link ? (
                  <a
                    href={n.link}
                    className="mt-2 inline-block text-sm text-cyan-200 hover:underline"
                  >
                    Open related item →
                  </a>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <p className="text-sm text-slate-400">{children}</p>;
}