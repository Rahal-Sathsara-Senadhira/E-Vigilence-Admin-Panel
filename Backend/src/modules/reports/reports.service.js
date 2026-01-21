import { query } from "../../db/pool.js";

export async function getViolationsSummary({ from, to, status, category }) {
  const where = [];
  const params = [];
  let i = 1;

  if (from) {
    where.push(`created_at >= $${i++}`);
    params.push(from);
  }
  if (to) {
    where.push(`created_at <= $${i++}`);
    params.push(to);
  }
  if (status) {
    where.push(`status = $${i++}`);
    params.push(status);
  }
  if (category) {
    where.push(`category = $${i++}`);
    params.push(category);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // KPIs
  const kpiSql = `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status='open')::int AS open,
      COUNT(*) FILTER (WHERE status='in_review')::int AS in_review,
      COUNT(*) FILTER (WHERE status='resolved')::int AS resolved
    FROM violations
    ${whereSql};
  `;

  // By category
  const byCategorySql = `
    SELECT
      COALESCE(category, 'uncategorized') AS category,
      COUNT(*)::int AS count
    FROM violations
    ${whereSql}
    GROUP BY COALESCE(category, 'uncategorized')
    ORDER BY count DESC;
  `;

  // By day
  const byDaySql = `
    SELECT
      to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
      COUNT(*)::int AS count
    FROM violations
    ${whereSql}
    GROUP BY date_trunc('day', created_at)
    ORDER BY day ASC;
  `;

  const [kpiRes, catRes, dayRes] = await Promise.all([
    query(kpiSql, params),
    query(byCategorySql, params),
    query(byDaySql, params),
  ]);

  return {
    kpis: kpiRes.rows[0],
    byCategory: catRes.rows,
    byDay: dayRes.rows,
  };
}

export async function getViolationsCsv({ from, to, status, category }) {
  const where = [];
  const params = [];
  let i = 1;

  if (from) {
    where.push(`created_at >= $${i++}`);
    params.push(from);
  }
  if (to) {
    where.push(`created_at <= $${i++}`);
    params.push(to);
  }
  if (status) {
    where.push(`status = $${i++}`);
    params.push(status);
  }
  if (category) {
    where.push(`category = $${i++}`);
    params.push(category);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const sql = `
    SELECT
      id,
      title,
      description,
      category,
      status,
      location_text,
      lat_dms,
      lng_dms,
      latitude,
      longitude,
      created_at,
      updated_at
    FROM violations
    ${whereSql}
    ORDER BY created_at DESC;
  `;

  const res = await query(sql, params);
  return res.rows;
}
