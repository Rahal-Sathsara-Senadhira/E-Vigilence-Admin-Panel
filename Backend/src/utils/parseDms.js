function normalize(str) {
  return String(str || "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/º/g, "°")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'");
}

// Parse single DMS like: 6°07'11.7"N OR 80°12'50.8"E
export function parseSingleDms(dmsInput) {
  const raw = normalize(dmsInput);

  // Also accept decimal like "6.1199N" or "-6.1199"
  const decMatch = raw.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*([NSEW]))?$/i);
  if (decMatch) {
    let value = Number(decMatch[1]);
    const hemi = (decMatch[2] || "").toUpperCase();
    if (Number.isNaN(value)) throw new Error("Invalid decimal coordinate.");

    if (hemi === "S" || hemi === "W") value = -Math.abs(value);
    if (hemi === "N" || hemi === "E") value = Math.abs(value);

    return { value, hemi };
  }

  // DMS regex
  // Examples:
  // 6°07'11.7"N
  // 6 ° 07 ' 11.7 " N
  const re =
    /^(\d{1,3})\s*°\s*(\d{1,2})\s*'\s*(\d{1,2}(?:\.\d+)?)\s*"?\s*([NSEW])$/i;

  const m = raw.match(re);
  if (!m) {
    throw new Error(
      "Invalid DMS format. Example: 6°07'11.7\"N or 80°12'50.8\"E"
    );
  }

  const deg = Number(m[1]);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  const hemi = m[4].toUpperCase();

  if ([deg, min, sec].some((x) => Number.isNaN(x))) {
    throw new Error("DMS values are not numbers.");
  }
  if (min < 0 || min >= 60 || sec < 0 || sec >= 60) {
    throw new Error("Minutes/seconds must be in valid range (0-59).");
  }

  let value = deg + min / 60 + sec / 3600;

  if (hemi === "S" || hemi === "W") value = -value;

  return { value, hemi };
}

// Parse combined string like: 6°07'11.7"N 80°12'50.8"E
export function parseLocationText(locationText) {
  const raw = normalize(locationText);

  // Find two DMS coordinates inside the string
  const tokenRe =
    /(\d{1,3}\s*°\s*\d{1,2}\s*'\s*\d{1,2}(?:\.\d+)?\s*"?\s*[NSEW])/gi;

  const tokens = raw.match(tokenRe) || [];

  if (tokens.length < 2) {
    // Try split by comma or space for two items
    const parts = raw.split(/[,\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      // Maybe they typed "6°07'11.7\"N,80°12'50.8\"E"
      const joined = [parts[0], parts.slice(1).join(" ")].join(" ");
      const tokens2 = joined.match(tokenRe) || [];
      if (tokens2.length >= 2) tokens.splice(0, tokens.length, ...tokens2);
    }
  }

  if (tokens.length < 2) {
    throw new Error(
      "Location must include both latitude and longitude in DMS. Example: 6°07'11.7\"N 80°12'50.8\"E"
    );
  }

  const a = normalize(tokens[0]);
  const b = normalize(tokens[1]);

  const p1 = parseSingleDms(a);
  const p2 = parseSingleDms(b);

  // Decide which is lat/lng based on hemisphere if possible
  const isLat1 = p1.hemi === "N" || p1.hemi === "S";
  const isLng1 = p1.hemi === "E" || p1.hemi === "W";

  let lat, lng, latDms, lngDms;

  if (isLat1) {
    lat = p1.value;
    lng = p2.value;
    latDms = a;
    lngDms = b;
  } else if (isLng1) {
    lat = p2.value;
    lng = p1.value;
    latDms = b;
    lngDms = a;
  } else {
    // fallback: first is lat, second is lng
    lat = p1.value;
    lng = p2.value;
    latDms = a;
    lngDms = b;
  }

  // validate ranges
  if (lat < -90 || lat > 90) throw new Error("Latitude out of range (-90..90).");
  if (lng < -180 || lng > 180) throw new Error("Longitude out of range (-180..180).");

  return { latitude: lat, longitude: lng, latDms, lngDms };
}
