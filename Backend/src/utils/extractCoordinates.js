import { parseDms } from "./parseDms.js";

// Pulls a lat/lng pair out of free-text location typed by a citizen, e.g.
//   "Latitude: 8.5874\nLongitude: 81.2152"
//   "Hapugala, Galle, Sri Lanka\n6.079369, 80.191963"
//   "DMS: 8°35'14.6\"N 81°12'54.7\"E"
// The citizen app only fills report.latitude/longitude when "Use my current
// location" is pressed; anyone who types the location instead leaves them
// null, which used to make "Dispatch nearest" impossible. Returns null when
// no plausible pair is found — never guesses from a bare place name.

function valid(lat, lng) {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

export function extractCoordinates(text) {
  if (typeof text !== "string" || !text.trim()) return null;

  // 1) Labelled values: "Latitude: 8.5874" / "Lng = 81.2"
  const latLabel = /\blat(?:itude)?\s*[:=]?\s*(-?\d{1,2}(?:\.\d+)?)/i.exec(text);
  const lngLabel = /\b(?:lng|lon|long|longitude)\s*[:=]?\s*(-?\d{1,3}(?:\.\d+)?)/i.exec(text);
  if (latLabel && lngLabel) {
    const lat = Number(latLabel[1]);
    const lng = Number(lngLabel[1]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 2) Decimal pair: "6.079369, 80.191963" (needs real decimals, so street
  //    numbers like "139/E, 12" can't match)
  const pair = /(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/.exec(text);
  if (pair) {
    const lat = Number(pair[1]);
    const lng = Number(pair[2]);
    if (valid(lat, lng)) return { lat, lng };
  }

  // 3) DMS anywhere in the text: 8°35'14.6"N 81°12'54.7"E
  const dms = text.match(/\d+\s*°\s*\d+\s*'\s*[\d.]+\s*"\s*[NS]\s+\d+\s*°\s*\d+\s*'\s*[\d.]+\s*"\s*[EW]/i);
  if (dms) {
    const parsed = parseDms(dms[0]);
    if (parsed && valid(parsed.lat, parsed.lng)) return parsed;
  }

  return null;
}
