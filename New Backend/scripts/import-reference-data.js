// Imports the territorial divisions and the police stations (docs/19 N1).
//
//   npm run import-reference-data              # dry run: shows what would change
//   npm run import-reference-data -- --apply   # writes
//   npm run import-reference-data -- --only=courts --apply   # just some parts
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
// - Courts: data/courts.json (Ministry of Justice court list; addresses and
//   phone numbers from public directory listings — verify with the Judicial
//   Service Commission). Only the courts that sit as Magistrate's Courts
//   (D06-1); a court HQ already has is matched by name and only its empty
//   fields are filled.
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
import { Court } from "#src/modules/court/court.model.js";
import { Division, Station } from "#src/modules/organisation/organisation.model.js";
import { DISTRICTS } from "#src/core/srilanka.js";

const apply = process.argv.includes("--apply");
/** --only=courts (or divisions,stations,offences,courts): just those parts. */
const only = process.argv
  .find((a) => a.startsWith("--only="))
  ?.slice(7)
  .split(",")
  .map((s) => s.trim());
const runs = (/** @type {string} */ part) => !only || only.includes(part);
const read = (/** @type {string} */ file) =>
  JSON.parse(fs.readFileSync(new URL(`../data/${file}`, import.meta.url), "utf8"));
const divisionsFile = read("police-divisions.json");
const stationsFile = read("osm-police-stations.json");
const offencesFile = read("offence-schedule.json");
const courtsFile = read("courts.json");

/**
 * The courts that sit as Magistrate's Courts (D06-1), by the file's type,
 * with the code prefix each gets ("MC-COLOMBO"). The file's other courts
 * (Supreme, Appeal, High, District, Labour) don't hear traffic cases.
 */
const MAGISTRATE_COURTS =
  /** @type {Record<string, { type: (typeof import("#src/modules/court/court.model.js").COURT_TYPES)[number], prefix: string }>} */ ({
    "Magistrate's Court": { type: "magistrate", prefix: "MC" },
    "District & Magistrate's Court": { type: "district_magistrate", prefix: "DMC" },
    "Circuit Magistrate's Court": { type: "circuit_magistrate", prefix: "CMC" },
    "Children's Magistrate's Court": { type: "children_magistrate", prefix: "CHMC" },
  });

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
      if (runs("divisions")) counts.divisionsUpdated += 1;
      if (apply && runs("divisions")) {
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
      if (!runs("divisions")) continue;
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
  if (runs("stations")) {
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
  }

  // 3. Offences
  if (runs("offences")) {
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
  }

  // 4. Courts: those that sit as Magistrate's Courts. One HQ already has
  // (same name) is never changed, only its empty fields are filled.
  if (runs("courts")) {
    counts.courtsCreated = 0;
    counts.courtsFilled = 0;
    counts.courtsWithoutDistrict = [];
    const existingCourts = await Court.find();
    const usedCourtCodes = new Set(existingCourts.map((c) => c.code));
    const sameName = (/** @type {string} */ a, /** @type {string} */ b) =>
      a.toLowerCase().replace(/[^a-z]/g, "") === b.toLowerCase().replace(/[^a-z]/g, "");
    for (const c of courtsFile.courts) {
      const kind = MAGISTRATE_COURTS[c.court_type];
      if (!kind) continue;
      const district = DISTRICTS.includes(c.district) ? c.district : null;
      if (!district) counts.courtsWithoutDistrict.push(c.name);
      const fields = {
        type: kind.type,
        district,
        address: c.address || null,
        phone: c.phone || null,
      };
      const match = existingCourts.find((e) => sameName(e.name, c.name));
      if (match) {
        const blanks = Object.entries(fields).filter(
          ([k, v]) => v && !(/** @type {any} */ (match)[k]),
        );
        if (blanks.length) {
          counts.courtsFilled += 1;
          if (apply) {
            for (const [k, v] of blanks) match.set(k, v);
            await match.save();
          }
        }
        continue;
      }
      let code = `${kind.prefix}-${codeOf(c.town)}`.slice(0, 20);
      while (usedCourtCodes.has(code)) code = `${code.slice(0, 18)}-2`;
      usedCourtCodes.add(code);
      counts.courtsCreated += 1;
      if (apply) await Court.create({ name: c.name, code, ...fields, isActive: true });
    }
  }

  if (apply) {
    await recordAudit({
      actor: { kind: "system", name: "Reference data import" },
      action: "organisation.imported",
      summary: `Divisions: ${counts.divisionsCreated} added, ${counts.divisionsUpdated} updated. Stations: ${counts.stationsCreated} added (unverified), ${counts.stationsMatched} matched, ${counts.stationsSkipped} verified left as they are. Offences: ${counts.offencesCreated} added. Courts: ${counts.courtsCreated} added, ${counts.courtsFilled} filled in.`,
    });
  }
  console.log(apply ? "Imported:" : "Dry run — nothing written. Would do:", counts);
  if (!apply) console.log("Run again with --apply to write.");
} finally {
  await disconnectDatabase();
}
