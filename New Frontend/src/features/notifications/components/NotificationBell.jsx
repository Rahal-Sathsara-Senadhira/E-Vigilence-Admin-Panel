// The bell in the top bar: the unread count, and the latest notifications
// when opened. Choosing one marks it read and opens what it is about (N1).

import { Bell, CheckCheck, ListChecks } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { Menu, MenuItem, MenuLabel, MenuSeparator, Skeleton } from "@/ui/index.js";
import { useMarkAllRead, useMarkRead, useNotifications, useUnreadCount } from "../api.js";
import { NotificationLine } from "./NotificationLine.jsx";

export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const unread = useUnreadCount().data?.unread ?? 0;
  const latest = useNotifications({ page: 1, pageSize: 8 }, { enabled: open });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const label = unread ? `Notifications, ${unread} unread` : "Notifications";

  return (
    <Menu
      onOpenChange={setOpen}
      className="w-[min(24rem,calc(100vw-1rem))] p-1.5"
      trigger={
        <button
          type="button"
          aria-label={label}
          title={label}
          className="relative grid size-9 place-items-center rounded-lg text-text-muted hover:bg-sunken hover:text-text"
        >
          <Bell className="size-5" aria-hidden />
          {unread ? (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-panel"
            >
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </button>
      }
    >
      <MenuLabel>
        <span className="text-sm font-semibold text-text">Notifications</span>
        {unread ? <span className="ml-2 text-xs text-text-muted">{unread} unread</span> : null}
      </MenuLabel>
      <div className="max-h-[60vh] overflow-y-auto">
        {latest.isPending ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : latest.isError ? (
          <p className="px-2.5 py-3 text-sm text-danger">{latest.error.message}</p>
        ) : latest.data.items.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-sm text-text-muted">
            Nothing yet. You will be told here when something needs you.
          </p>
        ) : (
          latest.data.items.map((n) => (
            <MenuItem
              key={n.id}
              onSelect={() => {
                if (!n.read) markRead.mutate(n.id);
                navigate(n.link ?? "/notifications");
              }}
            >
              <NotificationLine n={n} compact />
            </MenuItem>
          ))
        )}
      </div>
      <MenuSeparator />
      {unread ? (
        <MenuItem icon={<CheckCheck />} onSelect={() => markAll.mutate()}>
          Mark all as read
        </MenuItem>
      ) : null}
      <MenuItem icon={<ListChecks />} onSelect={() => navigate("/notifications")}>
        See all notifications
      </MenuItem>
    </Menu>
  );
}
