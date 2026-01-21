import { api } from "./api";

export const listNotifications = () =>
  api.get("/api/notifications");

export const markNotificationRead = (id) =>
  api.patch(`/api/notifications/${id}/read`);
