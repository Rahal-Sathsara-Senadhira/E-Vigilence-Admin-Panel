import React from "react";
import { api } from "../services/api";
import { isAdminRole } from "../utils/roles";

// Polls the lightweight unread-notifications count. Shared by Sidebar and
// Topbar so both badges stay in sync without duplicating the polling logic.
export default function useUnreadCount(role) {
  const [unread, setUnread] = React.useState(0);

  React.useEffect(() => {
    if (!isAdminRole(role)) return;

    let mounted = true;

    async function load() {
      try {
        const res = await api.get("/api/notifications/unread-count");
        if (mounted) setUnread(Number(res?.count) || 0);
      } catch {
        // ignore
      }
    }

    load();
    const t = setInterval(load, 30000);

    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, [role]);

  return unread;
}
