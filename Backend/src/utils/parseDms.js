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
