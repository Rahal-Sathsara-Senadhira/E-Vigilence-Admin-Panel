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
import { Card, Button, Select, Label, ErrorState, EmptyState } from "../../components/ui";

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
      return `${base} border-red-300 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-200`;
    if (t === "report")
      return `${base} border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-200`;
    return `${base} border-slate-300 dark:border-slate-800 bg-slate-100 dark:bg-slate-950/60 text-slate-700 dark:text-slate-200`;
  }

  return (
    <div className="grid gap-4">
      {/* Header / Filters */}
      <Card
        title="Notifications"
        subtitle="Track system updates, violations, and reports."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={onMarkAllRead} disabled={loading || items.length === 0} icon={CheckCheck} title="Mark all as read">
              Mark all read
            </Button>
            <Button variant="secondary" onClick={() => load({ page: 1 })} disabled={loading} icon={RefreshCcw}>
              Refresh
            </Button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label>Search</Label>
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 focus-within:border-brand-blue">
              <Search className="h-4 w-4 text-slate-600 dark:text-slate-400" />
              <input
                value={q}
                onChange={(e) => {
                  setPage(1);
                  setQ(e.target.value);
                }}
                placeholder="Search title or message..."
                className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 outline-none"
              />
            </div>
          </div>

          <Select
            label="Type"
            value={type}
            onChange={(e) => {
              setPage(1);
              setType(e.target.value);
            }}
          >
            <option value="">All</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Select
            label="Status"
            value={status}
            onChange={(e) => {
              setPage(1);
              setStatus(e.target.value);
            }}
          >
            <option value="">All</option>
            {STATUS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>

          <Select
            label="Rows"
            value={limit}
            onChange={(e) => {
              setPage(1);
              setLimit(Number(e.target.value));
            }}
          >
            {[5, 10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>

          <div className="flex items-end">
            <div className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2 text-sm text-slate-800 dark:text-slate-200">
              Unread: <span className="text-slate-900 dark:text-slate-100 font-semibold">{unreadCount}</span>
            </div>
          </div>
        </div>

        {error && <div className="mt-3"><ErrorState message={error} /></div>}
      </Card>

      {/* List */}
      <Card>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-400">
            Showing <span className="font-bold text-slate-900 dark:text-slate-200">{items.length}</span>
            {total ? (
              <>
                {" "}
                of <span className="font-bold text-slate-900 dark:text-slate-200">{total}</span>
              </>
            ) : null}
          </p>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1 || loading} icon={ChevronLeft}>
              Prev
            </Button>

            <div className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Page <span className="font-bold text-slate-900 dark:text-slate-100">{page}</span> /{" "}
              <span className="font-bold text-slate-900 dark:text-slate-100">{totalPages}</span>
            </div>

            <Button variant="ghost" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages || loading}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="mt-3 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {loading ? (
            <div className="px-3 py-6 text-sm font-medium text-slate-700 dark:text-slate-400">Loading...</div>
          ) : items.length === 0 ? (
            <EmptyState icon={Bell} title="No notifications found." />
          ) : (
            items.map((n) => (
              <div
                key={n.id || n._id}
                className={`border-b border-slate-200 dark:border-slate-800 px-3 py-3 ${
                  !n.is_read ? "bg-blue-50/60 dark:bg-slate-950/30" : ""
                }`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={badgeForType(n.type || "system")}>
                        {n.type || "system"}
                      </span>

                      {!n.is_read ? (
                        <span className="rounded-lg border border-brand-blue/40 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 text-xs text-brand-blue dark:text-blue-200">
                          unread
                        </span>
                      ) : null}

                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate">
                        {n.title || "Notification"}
                      </p>
                    </div>

                    {n.message ? (
                      <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-300">{n.message}</p>
                    ) : null}

                    <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-500">
                      {formatTime(n.createdAt || n.created_at || n.time)}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="ghost" onClick={() => onToggleRead(n)} icon={Check} title="Toggle read/unread">
                      {n.is_read ? "Mark unread" : "Mark read"}
                    </Button>

                    <Button variant="danger" onClick={() => onDelete(n)} icon={Trash2} title="Delete">
                      Delete
                    </Button>
                  </div>
                </div>

                {/* optional action link */}
                {n.link ? (
                  <a
                    href={n.link}
                    className="mt-2 inline-block text-sm text-brand-blue dark:text-blue-300 hover:underline"
                  >
                    Open related item →
                  </a>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
