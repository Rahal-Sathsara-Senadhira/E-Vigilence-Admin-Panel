import { query } from "../../db/pool.js";

export async function getSettings() {
  const res = await query(`SELECT * FROM settings LIMIT 1;`);
  return res.rows[0];
}

export async function updateSettings(patch) {
  const fields = [];
  const values = [];
  let i = 1;

  for (const [k, v] of Object.entries(patch)) {
    fields.push(`${k}=$${i++}`);
    values.push(v);
  }

  const res = await query(
    `UPDATE settings
     SET ${fields.join(", ")}, updated_at = NOW()
     RETURNING *;`,
    values
  );

  return res.rows[0];
}
