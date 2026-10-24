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

/** The polygons of a Polygon or MultiPolygon, as lists of rings. @param {{ type: string, coordinates: any[] }} area */
const polygonsOf = (area) => (area.type === "Polygon" ? [area.coordinates] : area.coordinates);

/** Ray casting: is [lng, lat] inside the ring? @param {number[][]} ring @param {number} lng @param {number} lat */
function inRing(ring, lng, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi = 0, yi = 0] = ring[i] ?? [];
    const [xj = 0, yj = 0] = ring[j] ?? [];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Whether a station's area contains a point — inside the outer ring and
 * outside every hole.
 * @param {{ type: string, coordinates: any[] }} area @param {number} lat @param {number} lng
 */
export function areaContains(area, lat, lng) {
  return polygonsOf(area).some(
    (/** @type {number[][][]} */ [outer, ...holes]) =>
      Boolean(outer) &&
      inRing(/** @type {number[][]} */ (outer), lng, lat) &&
      !holes.some((h) => inRing(h, lng, lat)),
  );
}

/**
 * Approximate size of an area in km² (equirectangular; good enough to
 * compare station areas, docs/03 §5.1).
 * @param {{ type: string, coordinates: any[] }} area
 */
export function areaSizeKm2(area) {
  const ringArea = (/** @type {number[][]} */ ring) => {
    const lat0 = ((ring[0]?.[1] ?? 0) * Math.PI) / 180;
    const kx = 111.32 * Math.cos(lat0);
    const ky = 110.57;
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi = 0, yi = 0] = ring[i] ?? [];
      const [xj = 0, yj = 0] = ring[j] ?? [];
      sum += xj * kx * (yi * ky) - xi * kx * (yj * ky);
    }
    return Math.abs(sum) / 2;
  };
  return polygonsOf(area).reduce(
    (total, /** @type {number[][][]} */ [outer, ...holes]) =>
      total + (outer ? ringArea(outer) : 0) - holes.reduce((h, ring) => h + ringArea(ring), 0),
    0,
  );
}
