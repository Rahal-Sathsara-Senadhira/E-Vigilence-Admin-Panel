// src/utils/dms.js
// Supports: 6°07'11.7"N  and 80°12'50.8"E

export function decimalToDmsLat(lat) {
  return decimalToDms(lat, true);
}

export function decimalToDmsLng(lng) {
  return decimalToDms(lng, false);
}

function decimalToDms(value, isLat) {
  if (typeof value !== "number" || Number.isNaN(value)) return "";

  const dir = isLat ? (value >= 0 ? "N" : "S") : value >= 0 ? "E" : "W";
  const abs = Math.abs(value);

  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = (minFloat - min) * 60;

  const secFixed = Number(sec.toFixed(1)); // 1 decimal like 11.7

  const mm = String(min).padStart(2, "0");
  const ss = secFixed < 10 ? `0${secFixed}` : String(secFixed);

  return `${deg}°${mm}'${ss}"${dir}`;
}

// Parse: 6°07'11.7"N  or  6 07 11.7 N
export function parseDmsOne(input) {
  if (!input) return null;
  const s = String(input).trim().toUpperCase();

  const re =
    /^(\d{1,3})\s*(?:°|\s)\s*(\d{1,2})\s*(?:'|\s)\s*([\d.]+)\s*(?:"|\s)\s*([NSEW])$/;

  const m = s.match(re);
  if (!m) return null;

  const deg = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const dir = m[4];

  if ([deg, min, sec].some((n) => Number.isNaN(n))) return null;
  if (min < 0 || min >= 60) return null;
  if (sec < 0 || sec >= 60) return null;

  let dec = deg + min / 60 + sec / 3600;
  if (dir === "S" || dir === "W") dec = -dec;

  return dec;
}

export function parseDmsPair(latDms, lngDms) {
  const lat = parseDmsOne(latDms);
  const lng = parseDmsOne(lngDms);
  if (lat == null || lng == null) return null;
  return { lat, lng };
}
