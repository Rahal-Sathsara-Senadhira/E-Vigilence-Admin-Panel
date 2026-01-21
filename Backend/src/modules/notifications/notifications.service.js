import { query } from "../../db/pool.js";

export async function createNotification({ type, title, message, related_id }) {
  const res = await query(
    `INSERT INTO notifications (type, title, message, related_id)
     VALUES ($1,$2,$3,$4)
     RETURNING *;`,
    [type, title, message, related_id ?? null]
  );
  return res.rows[0];
}

export async function listNotifications({ limit = 50, onlyUnread = false } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const res = await query(
    `SELECT *
     FROM notifications
     WHERE ($1::boolean = false OR is_read = false)
     ORDER BY created_at DESC
     LIMIT $2;`,
    [onlyUnread, lim]
  );

  return res.rows;
}

export async function markAsRead(id) {
  const res = await query(
    `UPDATE notifications
     SET is_read = true
     WHERE id = $1
     RETURNING *;`,
    [id]
  );
  return res.rows[0] || null;
}
