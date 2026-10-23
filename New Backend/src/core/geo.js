// Geography helpers: distances, the Sri Lanka bounding box, and checks for
// station areas given as GeoJSON polygons.

/** Sri Lanka with a margin for its waters. */
export const SRI_LANKA = { minLat: 5.7, maxLat: 10.1, minLng: 79.4, maxLng: 82.1 };

/** @param {number} lat @param {number} lng */
export const insideSriLanka = (lat, lng) =>
  lat >= SRI_LANKA.minLat &&
  lat <= SRI_LANKA.maxLat &&
  lng >= SRI_LANKA.minLng &&
  lng <= SRI_LANKA.maxLng;

/**
 * Great-circle distance in kilometres.
 * @param {{ lat: number, lng: number }} a @param {{ lat: number, lng: number }} b
 */
export function distanceKm(a, b) {
  const rad = (/** @type {number} */ d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** A GeoJSON point from a latitude and longitude. @param {number} lat @param {number} lng */
export const toPoint = (lat, lng) => ({
  type: /** @type {const} */ ("Point"),
  coordinates: [lng, lat],
});

/**
 * Why a GeoJSON area is not usable, or null when it is. Accepts a Polygon,
 * a MultiPolygon, or a Feature / FeatureCollection holding exactly one.
 * @param {any} input
 * @returns {{ area: { type: "Polygon" | "MultiPolygon", coordinates: any[] } | null, problem: string | null }}
 */
export function readArea(input) {
  let geometry = input;
  if (geometry?.type === "FeatureCollection") {
    const shapes = (geometry.features ?? []).filter((/** @type {any} */ f) =>
      ["Polygon", "MultiPolygon"].includes(f?.geometry?.type),
    );
    if (shapes.length !== 1) {
      return { area: null, problem: "The file must contain exactly one area (one polygon)." };
    }
    geometry = shapes[0].geometry;
  } else if (geometry?.type === "Feature") {
    geometry = geometry.geometry;
  }
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return { area: null, problem: "The area must be a GeoJSON Polygon or MultiPolygon." };
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0)
    return { area: null, problem: "The area is empty." };
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || polygon.length === 0)
      return { area: null, problem: "The area is empty." };
    for (const ring of polygon) {
      if (!Array.isArray(ring) || ring.length < 4) {
        return { area: null, problem: "Each outline needs at least 3 corners." };
      }
      const [first, last] = [ring[0], ring.at(-1)];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        return { area: null, problem: "Each outline must end where it starts." };
      }
      for (const point of ring) {
        const [lng, lat] = point ?? [];
        if (typeof lng !== "number" || typeof lat !== "number" || !insideSriLanka(lat, lng)) {
          return {
            area: null,
            problem: "The area must lie within Sri Lanka (coordinates as [longitude, latitude]).",
          };
        }
      }
    }
  }
  return { area: { type: geometry.type, coordinates: geometry.coordinates }, problem: null };
}
