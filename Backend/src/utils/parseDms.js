function dmsToDecimal(deg, min, sec, dir) {
  const d = Number(deg);
  const m = Number(min);
  const s = Number(sec);

  let dec = d + m / 60 + s / 3600;
  if (dir === "S" || dir === "W") dec *= -1;
  return dec;
}

function parseOne(part) {
  const re = /(\d+)\s*°\s*(\d+)\s*'\s*([\d.]+)\s*"\s*([NSEW])/i;
  const match = part.match(re);
  if (!match) return null;

  const [, deg, min, sec, dirRaw] = match;
  const dir = dirRaw.toUpperCase();
  return dmsToDecimal(deg, min, sec, dir);
}

export function parseDms(input) {
  if (typeof input !== "string") return null;

  const parts = input.trim().split(/\s+/);
  if (parts.length < 2) return null;

  const lat = parseOne(parts[0]);
  const lng = parseOne(parts[1]);

  if (typeof lat !== "number" || Number.isNaN(lat)) return null;
  if (typeof lng !== "number" || Number.isNaN(lng)) return null;

  return { lat, lng };
}

function toDmsPart(value, positive, negative) {
  const dir = value >= 0 ? positive : negative;
  const abs = Math.abs(value);
  let deg = Math.floor(abs);
  let min = Math.floor((abs - deg) * 60);
  let sec = Number((((abs - deg) * 60 - min) * 60).toFixed(1));
  // Rounding can push seconds/minutes to 60 - carry it over.
  if (sec >= 60) { sec = 0; min += 1; }
  if (min >= 60) { min = 0; deg += 1; }
  const mm = String(min).padStart(2, "0");
  const ss = sec < 10 ? `0${sec.toFixed(1)}` : sec.toFixed(1);
  return `${deg}°${mm}'${ss}"${dir}`;
}

/**
 * Decimal degrees -> the DMS text this app stores in location.dms, e.g.
 * `6°55'30.2"N 79°51'42.6"E`. Round-trips through parseDms(). Returns null
 * when either value is missing or out of range.
 */
export function formatDms(lat, lng) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return `${toDmsPart(lat, "N", "S")} ${toDmsPart(lng, "E", "W")}`;
}
