import { api } from "./api";

const BASE = "/api/notifications";

export function listNotifications({
  q = "",
  status = "", // "unread" | "read" | ""
  type = "",   // "system" | "report" | "violation" | ""
  page = 1,
  limit = 10,
} = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);
  if (type) params.set("type", type);
  params.set("page", String(page));
  params.set("limit", String(limit));

  return api.get(`${BASE}?${params.toString()}`);
}

export function markNotificationRead(id, is_read = true) {
  return api.patch(`${BASE}/${id}`, { is_read });
}

export function markAllRead() {
  return api.patch(`${BASE}/mark-all-read`, {});
}

export function deleteNotification(id) {
  return api.del(`${BASE}/${id}`);
}