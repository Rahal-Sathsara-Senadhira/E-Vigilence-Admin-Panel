// Frontend/src/services/policeStationsApi.js

const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") || "";

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