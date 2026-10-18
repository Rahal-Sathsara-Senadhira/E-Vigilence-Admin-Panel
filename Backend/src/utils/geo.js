// Great-circle distance in kilometres between two {lat, lng} points.
export function distanceKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (d) => (d * Math.PI) / 180;

// Area of one closed [lng, lat] ring in km² (spherical excess approximation,
// accurate to well under 1% at station-jurisdiction scale).
function ringAreaKm2(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    sum += toRadians(lng2 - lng1) * (2 + Math.sin(toRadians(lat1)) + Math.sin(toRadians(lat2)));
  }
  return Math.abs((sum * EARTH_RADIUS_KM * EARTH_RADIUS_KM) / 2);
}

function polygonAreaKm2(rings) {
  const [outer, ...holes] = rings;
  return ringAreaKm2(outer) - holes.reduce((s, h) => s + ringAreaKm2(h), 0);
}

// Area of a GeoJSON Polygon / MultiPolygon in km².
export function geoJsonAreaKm2(geometry) {
  if (geometry?.type === "Polygon") return polygonAreaKm2(geometry.coordinates);
  if (geometry?.type === "MultiPolygon") {
    return geometry.coordinates.reduce((s, poly) => s + polygonAreaKm2(poly), 0);
  }
  return 0;
}

// Problems with a jurisdiction shape, as human-readable strings (empty =
// valid): right type, closed rings of at least 4 positions, [lng, lat]
// order, every vertex inside `isInside(lat, lng)`.
export function validateJurisdiction(geometry, isInside) {
  const problems = [];
  if (!geometry || !["Polygon", "MultiPolygon"].includes(geometry.type)) {
    return ["Jurisdiction must be a Polygon or MultiPolygon"];
  }
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || polygons.length === 0) return ["Jurisdiction has no shape"];

  for (const rings of polygons) {
    if (!Array.isArray(rings) || rings.length === 0) {
      problems.push("A polygon has no outline");
      continue;
    }
    for (const ring of rings) {
      if (!Array.isArray(ring) || ring.length < 4) {
        problems.push("Each outline needs at least 3 distinct corners");
        continue;
      }
      const [first, last] = [ring[0], ring[ring.length - 1]];
      if (first[0] !== last[0] || first[1] !== last[1]) problems.push("Each outline must be closed");
      const bad = ring.some(
        (p) => !Array.isArray(p) || !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || !isInside(p[1], p[0])
      );
      if (bad) problems.push("Every corner must be a valid point inside Sri Lanka");
    }
  }
  return [...new Set(problems)];
}
