// Mobile-app import — docs/11.
//
// The app writes `reports` and `report_replies`; this job reads them and
// never writes to them (one writer per collection, §3) — its position is
// kept in our own `app_sync_state`. Each app report becomes a report here
// once (by source id); its evidence files are downloaded into our own
// storage, so the police copy can't be deleted from the app (§4).

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import { VEHICLE_TYPES, normalizePhone, normalizePlate, type VehicleType } from "@ev/shared";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { Types, type Connection } from "mongoose";
import { systemContext } from "../../common/context";
import { ENV, type Env } from "../../config/env";
import { EvidenceService } from "../evidence/evidence.service";
import { OffencesService } from "../offences/offences.service";
import { ReportsService, type AppReportInput } from "../reports/reports.service";

const BATCH = 25;
const DOWNLOAD_TIMEOUT_MS = 2 * 60_000;
/** Reports older than this when the import first runs are not fetched (they'd be rejected as too old). */
const FIRST_RUN_LOOKBACK_DAYS = 30;

interface Cursor {
  _id: "reports" | "report_replies";
  lastCreatedAt: Date;
  lastId: Types.ObjectId;
}

/** The app's `reports` document — loose, because the app owns its shape (docs/11 §4, §9). */
interface AppMedia {
  url?: string | null;
  kind?: string | null;
  capturedInApp?: boolean | null;
  capturedAt?: Date | string | null;
}
interface AppReport {
  _id: Types.ObjectId;
  createdAt?: Date;
  userId?: Types.ObjectId | string | null;
  clientReportId?: string | null;
  offenceIds?: string[] | null;
  issueType?: string | null;
  occurredAt?: Date | string | null;
  dateTime?: Date | string | null;
  latitude?: number | null;
  longitude?: number | null;
  address?: string | null;
  location?: string | null;
  vehicleNumber?: string | null;
  vehicleType?: string | null;
  vehicleModel?: string | null;
  description?: string | null;
  additionalDetails?: string | null;
  evidence?: AppMedia[] | null;
  voiceNote?: AppMedia | null;
  evidencePath?: string | null;
}
interface AppReply {
  _id: Types.ObjectId;
  createdAt?: Date;
  reportId?: Types.ObjectId | string | null;
  userId?: Types.ObjectId | string | null;
  answer?: string | null;
  text?: string | null;
}

export interface SyncResult {
  imported: number;
  skipped: number;
  replies: number;
}

@Injectable()
export class AppSyncService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AppSyncService.name);
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<SyncResult> | null = null;

  constructor(
    @InjectConnection() private readonly conn: Connection,
    @Inject(ENV) private readonly env: Env,
    private readonly reports: ReportsService,
    private readonly evidence: EvidenceService,
    private readonly offences: OffencesService,
  ) {}

  /** One pass: new reports, then new replies. Concurrent calls share the same pass. */
  run(): Promise<SyncResult> {
    this.running ??= (async () => {
      try {
        const { imported, skipped } = await this.importReports();
        const replies = await this.importReplies();
        return { imported, skipped, replies };
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  // ── Reports ───────────────────────────────────────────────────────────

  private async importReports() {
    let imported = 0;
    let skipped = 0;
    for (;;) {
      const cursor = await this.cursor("reports");
      const batch = await this.conn
        .collection<AppReport>("reports")
        .find(after(cursor))
        .sort({ createdAt: 1, _id: 1 })
        .limit(BATCH)
        .toArray();
      if (batch.length === 0) break;

      for (const doc of batch) {
        const exists = await this.conn
          .collection("incident_reports")
          .countDocuments({ sourceReportId: doc._id }, { limit: 1 });
        if (exists) {
          skipped++;
        } else {
          const id = await this.reports.receiveFromApp(await this.normalise(doc));
          if (id) imported++;
          else skipped++;
        }
        await this.advance("reports", doc);
      }
      if (batch.length < BATCH) break;
    }
    return { imported, skipped };
  }

  private async normalise(doc: AppReport): Promise<AppReportInput> {
    const userId = doc.userId ? String(doc.userId) : null;
    const user =
      userId && Types.ObjectId.isValid(userId)
        ? await this.conn
            .collection("users")
            .findOne({ _id: new Types.ObjectId(userId) }, { projection: { name: 1, phone: 1 } })
        : null;

    const rawPlate = (doc.vehicleNumber ?? "").trim();
    const plate = normalizePlate(rawPlate);
    const flags: string[] = [];
    if (rawPlate && !plate) flags.push("plate_unrecognised");

    const { codes, text } = await this.offenceCodes(doc);
    const lat = typeof doc.latitude === "number" ? doc.latitude : null;
    const lng = typeof doc.longitude === "number" ? doc.longitude : null;
    const occurred = toDate(doc.occurredAt) ?? toDate(doc.dateTime) ?? doc.createdAt ?? new Date();

    const evidenceIds: string[] = [];
    for (const media of mediaOf(doc)) {
      const id = await this.download(media);
      if (id) evidenceIds.push(id);
      else if (!flags.includes("evidence_download_failed")) flags.push("evidence_download_failed");
    }

    return {
      sourceReportId: doc._id,
      clientReportId: doc.clientReportId ?? null,
      userId,
      reporterName: (user?.name as string | undefined) ?? null,
      reporterPhone: normalizePhone(user?.phone) ?? null,
      receivedAt: doc.createdAt ?? new Date(),
      occurredAt: occurred,
      location: lat !== null && lng !== null ? { lat, lng } : null,
      address: (doc.address ?? doc.location ?? "").trim().slice(0, 300),
      vehicleNumber: plate,
      vehicleType: vehicleTypeOf(doc.vehicleType),
      vehicleDescription:
        [doc.vehicleModel?.trim(), rawPlate && !plate ? `Plate as entered: ${rawPlate}` : null]
          .filter(Boolean)
          .join(" · ") || null,
      offenceCodes: codes,
      offenceText: text,
      description:
        (doc.description ?? doc.additionalDetails ?? "").trim().slice(0, 2000) ||
        "(No description given)",
      evidenceIds,
      flags,
    };
  }

  /** offenceIds from the published schedule (new contract), else the old free-text issueType matched by name (§9). */
  private async offenceCodes(doc: AppReport): Promise<{ codes: string[]; text: string | null }> {
    if (Array.isArray(doc.offenceIds) && doc.offenceIds.length > 0) {
      return { codes: doc.offenceIds.map(String).slice(0, 5), text: null };
    }
    const text = doc.issueType?.trim() || null;
    if (!text) return { codes: [], text: null };
    const wanted = text.toLowerCase();
    const match = (await this.offences.list()).find(
      (o) =>
        o.code.toLowerCase() === wanted ||
        o.publicName.toLowerCase() === wanted ||
        o.name.toLowerCase() === wanted,
    );
    return { codes: match ? [match.code] : [], text };
  }

  private async download(media: AppMedia): Promise<string | null> {
    const url = this.resolveUrl(media.url ?? "");
    if (!url) return null;
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        redirect: "error",
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const length = Number(res.headers.get("content-length"));
      const view = await this.evidence.receive(
        systemContext("mobile-app-import"),
        Readable.fromWeb(res.body as unknown as WebReadableStream),
        {
          fileName: decodeURIComponent(url.pathname.split("/").pop() || "evidence"),
          declaredSize: Number.isFinite(length) ? length : null,
          capturedAt: toDate(media.capturedAt),
          capturedInApp: media.capturedInApp === true,
        },
      );
      return view.id;
    } catch (err) {
      this.logger.warn(`Evidence download failed (${url.host}): ${(err as Error).message}`);
      return null;
    }
  }

  /** Only HTTPS, only allowed hosts — never internal addresses (SSRF). */
  private resolveUrl(raw: string): URL | null {
    if (!raw) return null;
    let url: URL;
    try {
      url = new URL(raw, this.env.APP_MEDIA_BASE_URL);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const allowed = this.env.APP_MEDIA_ALLOWED_HOSTS;
    if (allowed.length > 0) {
      const ok = allowed.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
      return ok && url.protocol === "https:" ? url : null;
    }
    // No allow-list (development only — production requires one): HTTPS to a
    // public host name, never an IP address or localhost.
    if (url.protocol !== "https:" || isIP(host) || host === "localhost" || host.endsWith(".local"))
      return null;
    return url;
  }

  // ── Replies (report_replies) ──────────────────────────────────────────

  private async importReplies() {
    let applied = 0;
    for (;;) {
      const cursor = await this.cursor("report_replies");
      const batch = await this.conn
        .collection<AppReply>("report_replies")
        .find(after(cursor))
        .sort({ createdAt: 1, _id: 1 })
        .limit(BATCH)
        .toArray();
      if (batch.length === 0) break;
      for (const reply of batch) {
        const answer = (reply.answer ?? reply.text ?? "").trim();
        const reportId = reply.reportId ? String(reply.reportId) : "";
        if (answer && Types.ObjectId.isValid(reportId)) {
          const ok = await this.reports.applyAppReply(
            new Types.ObjectId(reportId),
            reply.userId ? String(reply.userId) : null,
            answer,
          );
          if (ok) applied++;
        }
        await this.advance("report_replies", reply);
      }
      if (batch.length < BATCH) break;
    }
    return applied;
  }

  // ── Position ──────────────────────────────────────────────────────────

  private async cursor(id: Cursor["_id"]): Promise<Cursor> {
    const state = this.conn.collection<Cursor>("app_sync_state");
    const found = await state.findOne({ _id: id });
    if (found) return found;
    const start: Cursor = {
      _id: id,
      lastCreatedAt: new Date(Date.now() - FIRST_RUN_LOOKBACK_DAYS * 86_400_000),
      lastId: new Types.ObjectId("000000000000000000000000"),
    };
    await state.updateOne({ _id: id }, { $setOnInsert: start }, { upsert: true });
    return start;
  }

  private async advance(id: Cursor["_id"], doc: { _id: Types.ObjectId; createdAt?: Date }) {
    await this.conn
      .collection<Cursor>("app_sync_state")
      .updateOne(
        { _id: id },
        { $set: { lastCreatedAt: doc.createdAt ?? new Date(0), lastId: doc._id } },
      );
  }

  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test" || this.env.APP_SYNC_INTERVAL_SECONDS === 0) return;
    this.timer = setInterval(() => {
      this.run().catch((err) => this.logger.error(err));
    }, this.env.APP_SYNC_INTERVAL_SECONDS * 1000);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.running?.catch(() => undefined);
  }
}

function after(c: Cursor) {
  return {
    $or: [
      { createdAt: { $gt: c.lastCreatedAt } },
      { createdAt: c.lastCreatedAt, _id: { $gt: c.lastId } },
    ],
  };
}

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mediaOf(doc: AppReport): AppMedia[] {
  const list = [...(doc.evidence ?? [])];
  if (doc.voiceNote?.url) list.push(doc.voiceNote);
  if (doc.evidencePath && list.length === 0) list.push({ url: doc.evidencePath });
  return list.filter((m) => !!m?.url).slice(0, 10);
}

const VEHICLE_WORDS: [RegExp, VehicleType][] = [
  [/motor ?(bike|cycle)|^bike|scooter/i, "motorcycle"],
  [/three|tuk|trishaw|3 ?wheel/i, "three_wheeler"],
  [/bus/i, "bus"],
  [/lorry|truck|tipper/i, "lorry"],
  [/van|jeep|suv/i, "van"],
  [/tractor/i, "tractor"],
  [/car|sedan|hatch/i, "car"],
];

function vehicleTypeOf(raw: string | null | undefined): VehicleType {
  const v = (raw ?? "").trim();
  if ((VEHICLE_TYPES as readonly string[]).includes(v)) return v as VehicleType;
  return VEHICLE_WORDS.find(([rx]) => rx.test(v))?.[1] ?? "other";
}
