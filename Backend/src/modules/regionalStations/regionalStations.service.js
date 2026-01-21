import { query } from "../../db/pool.js";

export async function createStation(data) {
  const res = await query(
    `INSERT INTO regional_stations
     (name, code, region, address, phone, email, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    [
      data.name,
      data.code ?? null,
      data.region ?? null,
      data.address ?? null,
      data.phone ?? null,
      data.email ?? null,
      data.latitude,
      data.longitude,
    ]
  );
  return res.rows[0];
}

export async function listStations() {
  const res = await query(
    `SELECT * FROM regional_stations ORDER BY created_at DESC`
  );
  return res.rows;
}
