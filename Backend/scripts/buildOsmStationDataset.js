// Rebuilds src/seeds/data/osmPoliceStations.json. Cleans the raw Overpass export (amenity=police in Sri Lanka) into the
// station dataset committed to the repo. Run from Backend/:
//   1. Download: POST to https://overpass-api.de/api/interpreter with
//      [out:json];area["ISO3166-1"="LK"][admin_level=2]->.lk;
//      nwr(area.lk)["amenity"="police"];out center tags;
//   2. node scripts/buildOsmStationDataset.js <raw.json> src/seeds/data/osmPoliceStations.json
import fs from "fs";
import { normalizeSriLankanPhone } from "../src/utils/phone.js";
import { distanceKm } from "../src/utils/geo.js";
import { isInSriLanka } from "../src/utils/complaintOptions.js";

const [, , rawPath, outPath] = process.argv;
const raw = JSON.parse(fs.readFileSync(rawPath, "utf8"));

const NOT_A_STATION =
  /\b(post|special task|stf|tourist|traffic|check ?point|barrier|camp|academy|training|college|kennel|mounted|riot|field force|office|quarters|barracks|headquarters|hospital|cid|intelligence|museum|band|sports|division|mess|commission|point|bureau|superintendent|detective|inspector|dig|ssp|asp|branch|investigation|security check)\b/i;
const GENERIC = /^(sri lanka )?police( station| post)?$/i;

function cleanName(n) {
  let s = n
    .replace(/\b(poice|pollice|polics|plice|pilice)\b/gi, "Police")
    .replace(/\b(staion|statoin|sation|statiion|staton)\b/gi, "Station")
    .replace(/^[^\p{L}]+|[^\p{L})]+$/gu, "") // stray leading/trailing punctuation
    .replace(/^sri lanka\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // "Police - Matara", "Police ,Narammala", "Police Station Hemmathagama"
  s = s.replace(/^police(\s+station)?\s*[-–,:]*\s*(?=\p{L})/iu, "");
  s = s.replace(/\s*[-–,]\s*/g, " ").trim();
  // "Police Station Borella" / "Borella Police" → "Borella Police Station"
  s = s.replace(/^police station\s*[-–:]?\s*(.+)$/i, "$1 Police Station");
  s = s.replace(/\bpolice\s*$/i, "Police Station");
  if (!/police station/i.test(s)) s = `${s} Police Station`;
  s = s.replace(/(police station\s*){2,}/gi, "Police Station");
  return s
    .split(" ")
    .map((w) => (w.length > 1 && w === w.toUpperCase() && /[A-Z]{2,}/.test(w) ? w : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

const key = (name) => name.toLowerCase().replace(/police station|[^a-z]/g, "");

const candidates = [];
let skipped = { noName: 0, generic: 0, notStation: 0, outside: 0 };

for (const e of raw.elements) {
  const t = e.tags || {};
  const rawName = (t["name:en"] || t.name || "").trim();
  const lat = e.lat ?? e.center?.lat;
  const lng = e.lon ?? e.center?.lon;
  if (!rawName) { skipped.noName++; continue; }
  if (GENERIC.test(rawName)) { skipped.generic++; continue; }
  if (NOT_A_STATION.test(rawName)) { skipped.notStation++; continue; }
  if (!isInSriLanka(lat, lng)) { skipped.outside++; continue; }

  // Too short / not a place name once "Police Station" is removed (e.g. "N",
  // "Sub", "CCD" = Colombo Crime Division).
  const base = cleanName(rawName).replace(/\s*Police Station$/, "");
  if (base.length < 4 || /^(ccd|sub|new|old)$/i.test(base)) { skipped.notStation++; continue; }

  const phone = normalizeSriLankanPhone(t.phone || t["contact:phone"] || "");
  const addr = [t["addr:street"], t["addr:city"]].filter(Boolean).join(", ");
  candidates.push({
    name: cleanName(rawName),
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    osmId: `${e.type}/${e.id}`,
    phone: phone || "",
    address: addr,
    tagCount: Object.keys(t).length,
  });
}

// Same station mapped twice (node + building, or two nodes): same name key
// within 1 km — keep the better-tagged one.
candidates.sort((a, b) => b.tagCount - a.tagCount);
const kept = [];
let dupes = 0;
for (const c of candidates) {
  const dup = kept.find((k) => key(k.name) === key(c.name) && distanceKm(k, c) < 1);
  if (dup) { dupes++; continue; }
  kept.push(c);
}
kept.sort((a, b) => a.name.localeCompare(b.name));
kept.forEach((k) => delete k.tagCount);

const out = {
  source: "OpenStreetMap contributors, via the Overpass API (amenity=police, Sri Lanka)",
  license: "ODbL 1.0 — https://opendatacommons.org/licenses/odbl/ — attribution: © OpenStreetMap contributors",
  retrievedAt: raw.osm3s?.timestamp_osm_base || null,
  note: "Cleaned: police posts, checkpoints, traffic/STF/office/HQ sites and unnamed or generic entries removed; duplicates within 1 km merged. Imported as UNVERIFIED stations — HQ must confirm name, pin and division.",
  stations: kept,
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 1) + "\n");
console.log(`raw ${raw.elements.length} | skipped`, skipped, `| duplicates merged ${dupes} | kept ${kept.length}`);
console.log(kept.slice(0, 8).map((k) => `${k.name} (${k.lat}, ${k.lng})`).join("\n"));
