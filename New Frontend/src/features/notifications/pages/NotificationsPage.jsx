// Notifications — everything the bell has told you, kept 90 days (D09-6).

import { BellOff, CheckCheck } from "lucide-react";
import { Link, useSearchParams } from "react-router";
import { Button, EmptyState, Page, Pagination, Panel, Skeleton, cn } from "@/ui/index.js";
import { useMarkAllRead, useMarkRead, useNotifications } from "../api.js";
import { NotificationLine } from "../components/NotificationLine.jsx";

const FILTERS = /** @type {const} */ ([
  ["all", "All"],
  ["unread", "Unread"],
]);

export function NotificationsPage() {
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get("show") === "unread";
  const page = Number(params.get("page") ?? 1) || 1;
  const list = useNotifications({ unread: unreadOnly, page });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const unread = list.data?.unread ?? 0;

  return (
    <Page
      title="Notifications"
      description="What needs you, and time limits missed. Kept for 90 days."
      actions={
        unread ? (
          <Button
            icon={<CheckCheck className="size-4" />}
            loading={markAll.isPending}
            onClick={() => markAll.mutate()}
          >
            Mark all as read
          </Button>
        ) : null
      }
    >
      <Panel>
        <div className="flex gap-1 border-b border-border p-3" role="tablist">
          {FILTERS.map(([key, label]) => {
            const active = (key === "unread") === unreadOnly;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() =>
                  setParams(key === "unread" ? { show: "unread" } : {}, { replace: true })
                }
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm",
                  active
                    ? "bg-action-soft font-medium text-action"
                    : "text-text-muted hover:bg-sunken",
                )}
              >
                {label}
                {key === "unread" && unread ? ` (${unread})` : ""}
              </button>
            );
          })}
        </div>
        {list.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        ) : list.isError ? (
          <p className="p-4 text-sm text-danger">{list.error.message}</p>
        ) : list.data.items.length === 0 ? (
          <EmptyState
            icon={<BellOff />}
            title={unreadOnly ? "Nothing unread" : "No notifications"}
            description="You will be told here when something needs you."
          />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {list.data.items.map((n) => {
                const read = () => !n.read && markRead.mutate(n.id);
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link
                        to={n.link}
                        onClick={read}
                        className="block px-4 py-3 hover:bg-sunken sm:px-5"
                      >
                        <NotificationLine n={n} />
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={read}
                        className="block w-full px-4 py-3 text-left hover:bg-sunken sm:px-5"
                      >
                        <NotificationLine n={n} />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              noun="notifications"
              onPage={(p) =>
                setParams({ ...(unreadOnly ? { show: "unread" } : {}), page: String(p) })
              }
            />
          </>
        )}
      </Panel>
    </Page>
  );
}
