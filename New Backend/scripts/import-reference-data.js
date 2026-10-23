// Imports the territorial divisions and the police stations (docs/19 N1).
//
//   npm run import-reference-data              # dry run: shows what would change
//   npm run import-reference-data -- --apply   # writes
//
// - Divisions: data/police-divisions.json (Sri Lanka Police Performance
//   Report 2024). Matched to existing divisions by name.
// - Offences: data/offence-schedule.json (Gazette 2054/9; Act No. 10 of
//   2019 — to be confirmed by HQ legal). Version 1 of each missing offence;
//   existing offences are never changed (HQ edits create new versions).
// - Stations: data/osm-police-stations.json (© OpenStreetMap contributors,
//   ODbL). Matched to existing stations by OSM id, then by name. New
//   stations are UNVERIFIED with a *suggested* division (nearest division
//   headquarters); an HQ administrator confirms each one.
//
// Safe to run again: nothing is duplicated, and verified stations are never
// changed.

import fs from "node:fs";
import { loadEnv } from "#src/config/env.js";
import { recordAudit } from "#src/core/audit/audit.js";
import { connectDatabase, disconnectDatabase } from "#src/core/db/connection.js";
import { distanceKm, toPoint } from "#src/core/geo.js";
import { OffenceVersion } from "#src/modules/offences/offences.model.js";
import { publishPublicSchedule } from "#src/modules/offences/offences.service.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";

const apply = process.argv.includes("--apply");
const read = (/** @type {string} */ file) =>
  JSON.parse(fs.readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const divisionsFile = read("police-divisions.json");
const stationsFile = read("osm-police-stations.json");
const offencesFile = read("offence-schedule.json");

/** "Kandy Division" → "kandy"; "Kandy Police Station" → "kandy". @param {string} s */
const key = (s) =>
  String(s)
    .toLowerCase()
    .replace(/\(.*?\)|police|station|division|headquarters|[^a-z]/g, "");
/** "Mt. Lavinia" → "MT-LAVINIA". @param {string} s */
const codeOf = (s) =>
  String(s)
    .replace(/police station|division/gi, "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);

const env = loadEnv();
await connectDatabase({ uri: env.MONGODB_URI, dbName: env.MONGODB_DB_NAME });
await Promise.all([Division.syncIndexes(), Station.syncIndexes(), OffenceVersion.syncIndexes()]);

const counts = {
  divisionsCreated: 0,
  divisionsUpdated: 0,
  stationsCreated: 0,
  stationsMatched: 0,
  stationsSkipped: 0,
};

try {
  // 1. Divisions
  const existingDivisions = await Division.find();
  const usedDivisionCodes = new Set(existingDivisions.map((d) => d.code));
  /** @type {{ _id: any, name: string, anchor: { lat: number, lng: number } }[]} */
  const anchors = [];
  for (const d of divisionsFile.divisions) {
    const match = existingDivisions.find((e) => key(e.name) === key(d.name));
    if (match) {
      counts.divisionsUpdated += 1;
      if (apply) {
        match.name = d.name;
        match.range = d.range;
        match.province = d.province;
        match.anchor = d.anchor;
        await match.save();
      }
      anchors.push({ _id: match._id, name: d.name, anchor: d.anchor });
    } else {
      let code = codeOf(d.name);
      while (usedDivisionCodes.has(code)) code = `${code}-2`;
      usedDivisionCodes.add(code);
      counts.divisionsCreated += 1;
      if (apply) {
        const created = await Division.create({ ...d, code });
        anchors.push({ _id: created._id, name: d.name, anchor: d.anchor });
      }
    }
  }

  /** Nearest division headquarters within 60 km, as a suggestion. @param {number} lat @param {number} lng */
  const suggest = (lat, lng) => {
    let best = null;
    let bestKm = 60;
    for (const a of anchors) {
      const km = distanceKm({ lat, lng }, a.anchor);
      if (km < bestKm) {
        best = a._id;
        bestKm = km;
      }
    }
    return best;
  };

  // 2. Stations
  const existingStations = await Station.find();
  const usedCodes = new Set(existingStations.map((s) => s.code));
  for (const o of stationsFile.stations) {
    const byOsm = existingStations.find((s) => s.osmId === o.osmId);
    const byName = byOsm
      ? null
      : existingStations.find((s) => {
          if (s.osmId || key(s.name) !== key(o.name)) return false;
          const [lng, lat] = s.location?.coordinates ?? [];
          return lat === undefined || distanceKm({ lat, lng }, o) < 5;
        });
    const match = byOsm ?? byName;
    if (match) {
      if (match.verified) {
        counts.stationsSkipped += 1;
        continue;
      }
      counts.stationsMatched += 1;
      if (apply) {
        match.osmId = o.osmId;
        if (!match.location) match.location = toPoint(o.lat, o.lng);
        if (!match.divisionId && !match.suggestedDivisionId)
          match.suggestedDivisionId = suggest(o.lat, o.lng);
        if (!match.address && o.address) match.address = o.address;
        if (!match.phone && o.phone) match.phone = o.phone;
        await match.save();
      }
      continue;
    }
    let code = codeOf(o.name);
    while (usedCodes.has(code)) code = `${code}-2`;
    usedCodes.add(code);
    counts.stationsCreated += 1;
    if (apply) {
      await Station.create({
        name: o.name,
        code,
        location: toPoint(o.lat, o.lng),
        suggestedDivisionId: suggest(o.lat, o.lng),
        address: o.address || null,
        phone: o.phone || null,
        source: "osm",
        osmId: o.osmId,
        verified: false,
      });
    }
  }

  // 3. Offences
  const existingCodes = new Set(await OffenceVersion.distinct("code"));
  const missing = offencesFile.offences.filter(
    (/** @type {any} */ o) => !existingCodes.has(o.code),
  );
  counts.offencesCreated = missing.length;
  if (apply && missing.length) {
    const now = new Date();
    await OffenceVersion.insertMany(
      missing.map((/** @type {any} */ o) => ({
        ...o,
        version: 1,
        demeritPoints: null,
        active: true,
        effectiveFrom: now,
        effectiveTo: null,
        current: true,
        source: offencesFile.source,
        changedBy: "Initial import",
        reason: "Initial schedule",
      })),
    );
  }
  if (apply) await publishPublicSchedule();

  if (apply) {
    await recordAudit({
      actor: { kind: "system", name: "Reference data import" },
      action: "organisation.imported",
      summary: `Divisions: ${counts.divisionsCreated} added, ${counts.divisionsUpdated} updated. Stations: ${counts.stationsCreated} added (unverified), ${counts.stationsMatched} matched, ${counts.stationsSkipped} verified left as they are. Offences: ${counts.offencesCreated} added.`,
    });
  }
  console.log(apply ? "Imported:" : "Dry run — nothing written. Would do:", counts);
  if (!apply) console.log("Run again with --apply to write.");
} finally {
  await disconnectDatabase();
}
