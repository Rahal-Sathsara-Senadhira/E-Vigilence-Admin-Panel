// Mobile-app import — docs/11 §8.
//
// The app writes `reports` and `report_replies`; this job reads them and
// never writes to them (one writer per collection, §3). Its position is kept
// in our own `app_import_state`. Each app report becomes a report here once
// (by the app's id, and by device + clientReportId for re-sent reports).
// Evidence is downloaded into our own storage on import, so the police copy
// can't be deleted from the app (§4).

import { isIP } from "node:net";
import { Readable } from "node:stream";
import mongoose from "mongoose";
import { insideSriLanka } from "#src/core/geo.js";
import { normalizePhone, normalizePlate } from "#src/core/srilanka.js";
import { receiveStream, storeFile } from "../evidence/index.js";
import {
  VEHICLE_TYPES,
  offenceNamed,
  reportableOffences,
  suggestPriority,
} from "../offences/index.js";
import { isSuspended } from "../reporters/index.js";
import { applyAppReply, receiveFromApp } from "../reports/index.js";

const BATCH = 25;
const DAY = 86_400_000;
const MAX_FILES = 10;
const DOWNLOAD_TIMEOUT_MS = 2 * 60_000;
/** The app's R2 links redirect once; more than this is refused. */
const MAX_REDIRECTS = 3;
/** Reports older than this when the import first runs aren't fetched: they'd be refused as too old. */
const FIRST_RUN_LOOKBACK_DAYS = 30;
/** A document that fails this many runs in a row is skipped and logged, so it can't block the rest. */
const MAX_ATTEMPTS = 5;
/** Clock drift allowed between the phone and the server. */
const FUTURE_SLACK_MS = 10 * 60_000;

/**
 * @typedef {object} AppMedia
 * @property {string | null} [url]
 * @property {string | null} [kind]
 * @property {boolean | null} [capturedInApp]
 * @property {Date | string | null} [capturedAt]
 */

/**
 * @typedef {object} Cursor
 * @property {"reports" | "report_replies"} _id
 * @property {Date} lastCreatedAt
 * @property {mongoose.Types.ObjectId} lastId
 * @property {string | null} [failedId]
 * @property {number} [failedCount]
 * @property {string[]} [skipped]
 */

/**
 * @typedef {object} ImportResult
 * @property {number} imported
 * @property {number} refused   imported and rejected at once (invalid, or a suspended account)
 * @property {number} duplicates
 * @property {number} replies
 * @property {number} failed
 */

/**
 * @param {{
 *   storage: import("#src/core/storage.js").Storage,
 *   env: Pick<import("#src/config/env.js").Env, "APP_MEDIA_BASE_URL" | "APP_MEDIA_ALLOWED_HOSTS">
 *     & Partial<Pick<import("#src/config/env.js").Env, "APP_MEDIA_KEY">>,
 *   logger: import("pino").Logger,
 *   fetch?: typeof globalThis.fetch,
 * }} deps
 */
export function createAppImport({ storage, env, logger, fetch = globalThis.fetch }) {
  /** @type {Promise<ImportResult> | null} */
  let running = null;

  const db = () => {
    const d = mongoose.connection.db;
    if (!d) throw new Error("Database not connected.");
    return d;
  };
  /** Our own collection: where the import has got to. */
  const state = () =>
    /** @type {import("mongodb").Collection<Cursor>} */ (db().collection("app_import_state"));

  // ── Position ──────────────────────────────────────────────────────────

  /** @param {Cursor["_id"]} id @returns {Promise<Cursor>} */
  async function cursor(id) {
    const found = /** @type {Cursor | null} */ (await state().findOne({ _id: id }));
    if (found) return found;
    const start = {
      _id: id,
      lastCreatedAt: new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * DAY),
      lastId: new mongoose.Types.ObjectId("000000000000000000000000"),
      failedId: null,
      failedCount: 0,
      skipped: [],
    };
    await state().updateOne({ _id: id }, { $setOnInsert: start }, { upsert: true });
    return start;
  }

  /** @param {Cursor["_id"]} id @param {{ _id: any, createdAt?: Date }} doc */
  async function advance(id, doc) {
    await state().updateOne(
      { _id: id },
      {
        $set: {
          lastCreatedAt: doc.createdAt ?? new Date(0),
          lastId: doc._id,
          failedId: null,
          failedCount: 0,
        },
      },
    );
  }

  /**
   * Records a failure. Returns true when the document has failed too often
   * and should be skipped (the cursor then moves past it).
   * @param {Cursor} c @param {{ _id: any }} doc @param {unknown} err
   */
  async function failed(c, doc, err) {
    const count = c.failedId === String(doc._id) ? (c.failedCount ?? 0) + 1 : 1;
    const giveUp = count >= MAX_ATTEMPTS;
    logger.error(
      { err, collection: c._id, appId: String(doc._id), attempt: count },
      giveUp
        ? "Mobile-app import: skipping a document after repeated failures"
        : "Mobile-app import failed; will retry",
    );
    await state().updateOne(
      { _id: c._id },
      giveUp
        ? { $push: { skipped: String(doc._id) } }
        : { $set: { failedId: String(doc._id), failedCount: count } },
    );
    return giveUp;
  }

  /** @param {Cursor} c */
  const after = (c) => ({
    $or: [
      { createdAt: { $gt: c.lastCreatedAt } },
      { createdAt: c.lastCreatedAt, _id: { $gt: c.lastId } },
    ],
  });

  // ── Reports ───────────────────────────────────────────────────────────

  async function importReports() {
    const result = { imported: 0, refused: 0, duplicates: 0, failed: 0 };
    for (;;) {
      const c = await cursor("reports");
      const batch = await db()
        .collection("reports")
        .find(after(c))
        .sort({ createdAt: 1, _id: 1 })
        .limit(BATCH)
        .toArray();
      for (const doc of batch) {
        try {
          const outcome = await importOne(doc);
          result[outcome]++;
        } catch (err) {
          result.failed++;
          // Stop here and retry next run, unless this one keeps failing.
          if (!(await failed(c, doc, err))) return result;
        }
        await advance("reports", doc);
      }
      if (batch.length < BATCH) return result;
    }
  }

  /** @param {any} doc @returns {Promise<"imported" | "refused" | "duplicates">} */
  async function importOne(doc) {
    const userId = doc.userId ? String(doc.userId) : null;
    const clientReportId = doc.clientReportId ? String(doc.clientReportId).slice(0, 100) : null;
    if (await alreadyImported(doc._id, userId, clientReportId)) return "duplicates";

    const input = await normalise(doc, userId, clientReportId);
    /** @type {import("../reports/app-reports.js").StoredAppFile[]} */
    const files = [];
    try {
      for (const media of mediaOf(doc)) {
        const stored = await download(media);
        if (!stored) {
          if (!input.flags.includes("evidence_download_failed"))
            input.flags.push("evidence_download_failed");
          continue;
        }
        files.push(stored);
        if (!stored.capturedInApp && !input.flags.includes("not_captured_in_app"))
          input.flags.push("not_captured_in_app");
      }
      const created = await receiveFromApp(input, files);
      if (!created) {
        await removeFiles(files);
        return "duplicates";
      }
      return input.rejection ? "refused" : "imported";
    } catch (err) {
      await removeFiles(files);
      throw err;
    } finally {
      await Promise.all(files.map((f) => f.file.cleanUp()));
    }
  }

  /** @param {any} appId @param {string | null} userId @param {string | null} clientReportId */
  async function alreadyImported(appId, userId, clientReportId) {
    /** @type {any[]} */
    const or = [{ "source.appReportId": appId }];
    if (userId && clientReportId)
      or.push({ "source.userId": userId, "source.clientReportId": clientReportId });
    return Boolean(
      await db()
        .collection("police_reports")
        .findOne({ $or: or }, { projection: { _id: 1 } }),
    );
  }

  /** @param {import("../reports/app-reports.js").StoredAppFile[]} files */
  async function removeFiles(files) {
    await Promise.all(files.map((f) => storage.remove(f.key).catch(() => {})));
  }

  /**
   * The app's document in our terms (docs/11 §4, §9). Problems that make the
   * report unusable become a rejection the citizen is told about; smaller
   * ones become flags for triage.
   * @param {any} doc @param {string | null} userId @param {string | null} clientReportId
   * @returns {Promise<import("../reports/app-reports.js").AppReportInput>}
   */
  async function normalise(doc, userId, clientReportId) {
    /** @type {string[]} */
    const flags = [];
    /** @type {import("../reports/app-reports.js").AppReportInput["rejection"]} */
    let rejection = null;
    const refuse = (/** @type {NonNullable<typeof rejection>} */ reason) => {
      rejection ??= reason;
    };

    const user = userId ? await citizen(userId) : null;
    if (user?.suspended) refuse("account_suspended");

    const receivedAt = toDate(doc.createdAt) ?? new Date();
    let occurredAt = toDate(doc.occurredAt) ?? toDate(doc.dateTime) ?? receivedAt;
    if (occurredAt.getTime() > receivedAt.getTime() + FUTURE_SLACK_MS) {
      flags.push("time_in_future");
      occurredAt = receivedAt;
    }
    if (receivedAt.getTime() - occurredAt.getTime() > 30 * DAY) refuse("too_old");

    const lat = typeof doc.latitude === "number" ? doc.latitude : null;
    const lng = typeof doc.longitude === "number" ? doc.longitude : null;
    const location = lat !== null && lng !== null ? { lat, lng } : null;
    if (location && !insideSriLanka(location.lat, location.lng)) refuse("outside_jurisdiction");

    let description = String(doc.description ?? doc.additionalDetails ?? "").trim();
    /** @type {{ code: string, severity: string }[]} */
    let offences = [];
    if (Array.isArray(doc.offenceIds) && doc.offenceIds.length) {
      offences = await reportableOffences(doc.offenceIds.map(String));
      if (!offences.length) refuse("not_an_offence");
    } else if (doc.issueType && String(doc.issueType).trim()) {
      // The old app's free text (docs/11 §9): matched to the schedule, or
      // left for triage to decide.
      const text = String(doc.issueType).trim().slice(0, 200);
      const match = await offenceNamed(text);
      if (match) offences = [match];
      else {
        flags.push("offence_not_recognised");
        description = `${description}\n\n(Offence as entered in the app: "${text}")`.trim();
      }
    } else {
      refuse("not_an_offence");
    }

    const rawPlate = String(doc.vehicleNumber ?? "")
      .trim()
      .slice(0, 30);
    const plate = normalizePlate(rawPlate);
    if (rawPlate && !plate) flags.push("plate_unrecognised");
    const vehicleDescription =
      [
        doc.vehicleModel ? String(doc.vehicleModel).trim().slice(0, 100) : null,
        rawPlate && !plate ? `Plate as entered: ${rawPlate}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

    const injuries = doc.injuries === true;
    return {
      appReportId: doc._id,
      clientReportId,
      userId,
      reporterName: user?.name ?? null,
      reporterPhone: user?.phone ?? null,
      receivedAt,
      occurredAt,
      location,
      address:
        String(doc.address ?? doc.location ?? "")
          .trim()
          .slice(0, 300) || null,
      vehicleNumber: plate,
      vehicleType: vehicleTypeOf(doc.vehicleType),
      vehicleDescription,
      offenceCodes: offences.map((o) => o.code),
      description: description.slice(0, 2000) || "(No description given)",
      injuries,
      priority: suggestPriority(offences, injuries),
      flags,
      rejection,
    };
  }

  /**
   * The citizen's name and phone from the app's accounts, and whether their
   * reward account is suspended (docs/11 §6).
   * @param {string} userId
   */
  async function citizen(userId) {
    const [user, suspended] = await Promise.all([
      mongoose.isValidObjectId(userId)
        ? db()
            .collection("users")
            .findOne(
              { _id: new mongoose.Types.ObjectId(userId) },
              { projection: { name: 1, fullName: 1, phone: 1, phoneNumber: 1 } },
            )
        : null,
      isSuspended(userId),
    ]);
    const name = user?.name ?? user?.fullName;
    return {
      name: typeof name === "string" ? name.trim().slice(0, 120) || null : null,
      phone: normalizePhone(user?.phone ?? user?.phoneNumber ?? null),
      suspended: Boolean(suspended),
    };
  }

  /**
   * Downloads one file into our storage, or null if it can't be fetched or
   * isn't acceptable evidence (the report is flagged instead).
   * @param {AppMedia} media
   * @returns {Promise<import("../reports/app-reports.js").StoredAppFile | null>}
   */
  async function download(media) {
    const url = resolveUrl(media.url ?? "");
    if (!url) {
      logger.warn("Mobile-app import: evidence address not allowed or not valid");
      return null;
    }
    /** @type {import("../evidence/receive-upload.js").ReceivedFile | null} */
    let file = null;
    try {
      const res = await fetchFollowing(url);
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const name = decodeURIComponent(url.pathname.split("/").pop() || "") || null;
      file = await receiveStream(Readable.fromWeb(/** @type {any} */ (res.body)), name);
      const key = await storeFile(storage, file);
      return {
        key,
        file,
        capturedInApp: media.capturedInApp === true,
        capturedAt: toDate(media.capturedAt),
      };
    } catch (err) {
      await file?.cleanUp();
      logger.warn(
        { host: url.host, reason: err instanceof Error ? err.message : String(err) },
        "Mobile-app import: evidence download failed",
      );
      return null;
    }
  }

  /**
   * Fetches a file, following redirects by hand: the app answers its R2
   * links with a redirect to a short-lived signed address. Every hop must
   * pass `resolveUrl`, and the media key goes only to the first one (the
   * app), never on to the storage host.
   * @param {URL} first
   */
  async function fetchFollowing(first) {
    const signal = AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS);
    let url = first;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const headers =
        hop === 0 && env.APP_MEDIA_KEY ? { "X-Media-Key": env.APP_MEDIA_KEY } : undefined;
      const res = await fetch(url, { signal, headers, redirect: "manual" });
      if (res.status < 300 || res.status >= 400) return res;
      const next = resolveUrl(new URL(res.headers.get("location") ?? "", url).href);
      if (!next) throw new Error("redirected to an address that is not allowed");
      url = next;
    }
    throw new Error("too many redirects");
  }

  /**
   * HTTPS only, and only to the allowed hosts — never an internal address
   * (server-side request forgery). Without an allow-list (development only;
   * production requires one), any public host name, but no IP addresses.
   * @param {string} raw
   */
  function resolveUrl(raw) {
    if (!raw) return null;
    /** @type {URL} */
    let url;
    try {
      url = new URL(raw, env.APP_MEDIA_BASE_URL);
    } catch {
      return null;
    }
    if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    const allowed = env.APP_MEDIA_ALLOWED_HOSTS;
    if (allowed.length) {
      return allowed.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h)) ? url : null;
    }
    if (isIP(host.replace(/^\[|\]$/g, "")) || host === "localhost" || !host.includes("."))
      return null;
    if (/\.(local|internal|localhost)$/.test(host)) return null;
    return url;
  }

  // ── Replies ───────────────────────────────────────────────────────────

  async function importReplies() {
    let applied = 0;
    for (;;) {
      const c = await cursor("report_replies");
      const batch = await db()
        .collection("report_replies")
        .find(after(c))
        .sort({ createdAt: 1, _id: 1 })
        .limit(BATCH)
        .toArray();
      for (const reply of batch) {
        const answer = String(reply.answer ?? reply.text ?? "").trim();
        const reportId = reply.reportId ? String(reply.reportId) : "";
        if (answer && mongoose.isValidObjectId(reportId)) {
          try {
            const ok = await applyAppReply({
              appReportId: new mongoose.Types.ObjectId(reportId),
              userId: reply.userId ? String(reply.userId) : null,
              answer,
            });
            if (ok) applied++;
          } catch (err) {
            if (!(await failed(c, reply, err))) return applied;
          }
        }
        await advance("report_replies", reply);
      }
      if (batch.length < BATCH) return applied;
    }
  }

  return {
    /** One pass: new reports, then new replies. Concurrent calls share one pass. */
    run() {
      running ??= (async () => {
        try {
          const reports = await importReports();
          const replies = await importReplies();
          return { ...reports, replies };
        } finally {
          running = null;
        }
      })();
      return running;
    },
  };
}

/** @param {unknown} v */
function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The report's files, old and new app shapes. @param {any} doc @returns {AppMedia[]} */
function mediaOf(doc) {
  /** @type {AppMedia[]} */
  const list = Array.isArray(doc.evidence) ? [...doc.evidence] : [];
  if (doc.voiceNote?.url) list.push(doc.voiceNote);
  if (doc.evidencePath && list.length === 0) list.push({ url: doc.evidencePath });
  return list.filter((m) => typeof m?.url === "string" && m.url).slice(0, MAX_FILES);
}

/** @type {[RegExp, string][]} */
const VEHICLE_WORDS = [
  [/motor ?(bike|cycle)|^bike|scooter/i, "motorcycle"],
  [/three|tuk|trishaw|3 ?wheel/i, "three_wheeler"],
  [/bus/i, "bus"],
  [/lorry|truck|tipper/i, "lorry"],
  [/van|jeep|suv/i, "van"],
  [/tractor/i, "tractor"],
  [/car|sedan|hatch/i, "car"],
];

/** @param {unknown} raw */
function vehicleTypeOf(raw) {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/** @type {readonly string[]} */ (VEHICLE_TYPES).includes(v)) return v;
  return VEHICLE_WORDS.find(([rx]) => rx.test(v))?.[1] ?? "other";
}
