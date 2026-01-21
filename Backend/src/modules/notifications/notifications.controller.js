import {
  createNotification,
  listNotifications,
  markAsRead,
} from "./notifications.service.js";

export async function listNotificationsHandler(req, res, next) {
  try {
    const { limit, unread } = req.query;

    const rows = await listNotifications({
      limit: limit ? Number(limit) : 50,
      onlyUnread: unread === "1" || unread === "true",
    });

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

export async function createNotificationHandler(req, res, next) {
  try {
    const { type, title, message, related_id } = req.body;

    if (!type || !title || !message) {
      return res.status(400).json({ error: "type, title, message are required" });
    }

    const row = await createNotification({ type, title, message, related_id });
    res.status(201).json({ data: row });
  } catch (err) {
    next(err);
  }
}

export async function markAsReadHandler(req, res, next) {
  try {
    const row = await markAsRead(req.params.id);
    if (!row) return res.status(404).json({ error: "Notification not found" });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
}
