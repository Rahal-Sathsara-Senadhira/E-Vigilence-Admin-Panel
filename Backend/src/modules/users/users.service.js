import { query } from "../../db/pool.js";

export async function createUser(data) {
  const res = await query(
    `INSERT INTO users (name, email, role, station_id)
     VALUES ($1,$2,$3,$4)
     RETURNING *`,
    [
      data.name,
      data.email,
      data.role,
      data.station_id ?? null,
    ]
  );
  return res.rows[0];
}

export async function listUsers() {
  const res = await query(
    `SELECT
       u.*,
       rs.name AS station_name
     FROM users u
     LEFT JOIN regional_stations rs ON rs.id = u.station_id
     ORDER BY u.created_at DESC`
  );
  return res.rows;
}

export async function updateUser(id, patch) {
  const fields = [];
  const values = [];
  let i = 1;

  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k}=$${i++}`);
    values.push(v);
  }

  values.push(id);

  const res = await query(
    `UPDATE users
     SET ${fields.join(", ")}
     WHERE id=$${i}
     RETURNING *`,
    values
  );

  return res.rows[0];
}
