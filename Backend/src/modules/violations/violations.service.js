import { query } from "../../db/pool.js";

export async function createViolation(data) {
  const sql = `
    INSERT INTO violations
      (title, description, category, status, location_text, lat_dms, lng_dms, latitude, longitude)
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    RETURNING *;
  `;

  const params = [
    data.title,
    data.description ?? null,
    data.category ?? null,
    data.status ?? "open",
    data.location_text ?? null,
    data.lat_dms ?? null,
    data.lng_dms ?? null,
    data.latitude,
    data.longitude,
  ];

  const result = await query(sql, params);
  return result.rows[0];
}

export async function getViolations(filters) {
  const where = [];
  const params = [];
  let i = 1;

  if (filters.status) {
    where.push(`status = $${i++}`);
    params.push(filters.status);
  }

  if (filters.category) {
    where.push(`category = $${i++}`);
    params.push(filters.category);
  }

  if (filters.q) {
    where.push(`(title ILIKE $${i} OR description ILIKE $${i})`);
    params.push(`%${filters.q}%`);
    i++;
  }

  // Optional bbox for map viewport: minLng,minLat,maxLng,maxLat
  if (filters.bbox?.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = filters.bbox;
    where.push(`longitude BETWEEN $${i} AND $${i + 1}`);
    params.push(minLng, maxLng);
    i += 2;

    where.push(`latitude BETWEEN $${i} AND $${i + 1}`);
    params.push(minLat, maxLat);
    i += 2;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const listSql = `
    SELECT *
    FROM violations
    ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${i} OFFSET $${i + 1};
  `;
  const listParams = [...params, limit, offset];

  const countSql = `
    SELECT COUNT(*)::int AS total
    FROM violations
    ${whereSql};
  `;

  const [listRes, countRes] = await Promise.all([
    query(listSql, listParams),
    query(countSql, params),
  ]);

  return {
    items: listRes.rows,
    total: countRes.rows[0]?.total ?? 0,
    limit,
    offset,
  };
}

export async function getViolationById(id) {
  const res = await query(`SELECT * FROM violations WHERE id = $1;`, [id]);
  return res.rows[0] || null;
}

export async function updateViolation(id, patch) {
  const fields = [];
  const params = [];
  let i = 1;

  const set = (col, val) => {
    fields.push(`${col} = $${i++}`);
    params.push(val);
  };

  if (patch.title !== undefined) set("title", patch.title);
  if (patch.description !== undefined) set("description", patch.description ?? null);
  if (patch.category !== undefined) set("category", patch.category ?? null);
  if (patch.status !== undefined) set("status", patch.status);

  if (patch.location_text !== undefined) set("location_text", patch.location_text ?? null);
  if (patch.lat_dms !== undefined) set("lat_dms", patch.lat_dms ?? null);
  if (patch.lng_dms !== undefined) set("lng_dms", patch.lng_dms ?? null);
  if (patch.latitude !== undefined) set("latitude", patch.latitude);
  if (patch.longitude !== undefined) set("longitude", patch.longitude);

  if (!fields.length) {
    const current = await getViolationById(id);
    return current;
  }

  params.push(id);
  const sql = `
    UPDATE violations
    SET ${fields.join(", ")}
    WHERE id = $${i}
    RETURNING *;
  `;

  const res = await query(sql, params);
  return res.rows[0] || null;
}

export async function deleteViolation(id) {
  const res = await query(`DELETE FROM violations WHERE id = $1 RETURNING id;`, [id]);
  return res.rows[0] || null;
}
