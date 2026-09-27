// Frontend/src/services/policeStationsApi.js

// Falls back to the backend's default port, matching services/api.js — an
// empty-string fallback here meant that with no VITE_API_BASE_URL set (the
// normal local-dev case), requests went to the Vite dev server's own origin
// instead of the backend, which SPA-fallbacks to index.html (200 OK, HTML)
// for any unmatched path — silently breaking every call with a JSON-parse
// error instead of a clear "can't reach the backend" failure.
const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "http://localhost:8081";

export async function fetchPoliceStations({ q = "", area = "" } = {}) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (area) params.set("area", area);

  const url = `${API_BASE}/api/police-stations${params.toString() ? `?${params}` : ""}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to load stations (${res.status})`);
  }

  const data = await res.json();

  // Accept BOTH response shapes:
  // 1) { stations: [...] }
  // 2) [ ... ]
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.stations)) return data.stations;

  return [];
}

// GET /api/police-stations/nearest?lat=..&lng=..&limit=1 returns an array of
// { name, area, lat, lng, distanceKm } sorted by distance — this returns
// just the closest one, or null if there's no station in range.
export async function getNearestStation(lat, lng) {
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    limit: "1",
  });

  const url = `${API_BASE}/api/police-stations/nearest?${params.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Failed to find nearest station (${res.status})`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : Array.isArray(data?.stations) ? data.stations : [];
  return list[0] || null;
}