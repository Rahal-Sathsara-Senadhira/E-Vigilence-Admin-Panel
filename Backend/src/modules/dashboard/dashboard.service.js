import { query } from "../../db/pool.js";

export async function getDashboardSummary() {
  // KPIs
  const kpiSql = `
    SELECT
      (SELECT COUNT(*)::int FROM violations) AS total_violations,
      (SELECT COUNT(*)::int FROM violations WHERE status='open') AS open_violations,
      (SELECT COUNT(*)::int FROM violations WHERE status='in_review') AS in_review_violations,
      (SELECT COUNT(*)::int FROM violations WHERE status='resolved') AS resolved_violations,

      (SELECT COUNT(*)::int FROM regional_stations) AS total_stations,
      (SELECT COUNT(*)::int FROM users) AS total_users,

      (SELECT COUNT(*)::int FROM notifications WHERE is_read=false) AS unread_notifications
  `;

  // Latest violations
  const latestViolationsSql = `
    SELECT id, title, category, status, created_at
    FROM violations
    ORDER BY created_at DESC
    LIMIT 6;
  `;

  // Unread notifications
  const unreadNotificationsSql = `
    SELECT id, type, title, message, related_id, is_read, created_at
    FROM notifications
    WHERE is_read = false
    ORDER BY created_at DESC
    LIMIT 6;
  `;

  // Violations by category
  const byCategorySql = `
    SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*)::int AS count
    FROM violations
    GROUP BY COALESCE(category, 'uncategorized')
    ORDER BY count DESC
    LIMIT 6;
  `;

  // Last 7 days trend
  const last7DaysSql = `
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS count
    FROM violations
    WHERE created_at >= NOW() - INTERVAL '6 days'
    GROUP BY date_trunc('day', created_at)
    ORDER BY day ASC;
  `;

  const [kpi, latestV, unreadN, byCat, trend] = await Promise.all([
    query(kpiSql),
    query(latestViolationsSql),
    query(unreadNotificationsSql),
    query(byCategorySql),
    query(last7DaysSql),
  ]);

  return {
    kpis: kpi.rows[0],
    latestViolations: latestV.rows,
    unreadNotifications: unreadN.rows,
    byCategory: byCat.rows,
    trend7d: trend.rows,
  };
}
