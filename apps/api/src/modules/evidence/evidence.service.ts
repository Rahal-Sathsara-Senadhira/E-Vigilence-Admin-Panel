// Evidence — docs/10 §3.
//
// Every file: the ORIGINAL is kept untouched with its SHA-256 fingerprint
// (D06-4); a VIEWING copy is made for everyday review (compressed video and
// long audio; photos and short audio use the original); every step is in the
// item's chain of custody. Files are never edited or replaced (E1).

import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  EVIDENCE_MAX_ANY,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_KINDS,
  formatBytes,
  type CustodyEventView,
  type EvidenceKind,
  type EvidenceView,
} from "@ev/shared";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { Types, type ClientSession, type Connection, type Model } from "mongoose";
import { requireUser, type ActionContext } from "../../common/context";
import { ApiError, badRequest, forbidden, notFound } from "../../common/errors";
import { AuditService } from "../audit/audit.service";
import { TimeLimitsService } from "../settings/time-limits.service";
import { CustodyEvent, EvidenceItem, type EvidenceItemDocument } from "./evidence.schema";
import { compressAudio, compressVideo, ffmpegPath } from "./media";
import { sniffMime } from "./sniff";
import { EVIDENCE_STORAGE, type EvidenceStorage } from "./storage";

/** Audio above this size gets a compressed viewing copy; smaller audio plays as is. */
const AUDIO_COMPRESS_FROM = 5 * 1024 * 1024;
const MAINTENANCE_MS = 15 * 60_000;

type Lean = EvidenceItem & { _id: Types.ObjectId };

interface ReportAccess {
  _id: Types.ObjectId;
  reportNumber: string;
  stationId: Types.ObjectId | null;
}

@Injectable()
export class EvidenceService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(EvidenceService.name);
  private queue: Promise<unknown> = Promise.resolve();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @InjectModel(EvidenceItem.name) private readonly items: Model<EvidenceItem>,
    @InjectModel(CustodyEvent.name) private readonly custody: Model<CustodyEvent>,
    @InjectConnection() private readonly conn: Connection,
    @Inject(EVIDENCE_STORAGE) private readonly storage: EvidenceStorage,
    private readonly limits: TimeLimitsService,
    private readonly audit: AuditService,
  ) {}

  // ── Receiving ─────────────────────────────────────────────────────────

  /**
   * Streams an upload to a temporary file while fingerprinting it, checks its
   * real type and size, stores the original, and queues a viewing copy.
   */
  async receive(
    ctx: ActionContext,
    body: Readable,
    meta: {
      fileName: string;
      declaredSize: number | null;
      capturedAt: Date | null;
      capturedInApp?: boolean;
    },
  ): Promise<EvidenceView> {
    const me = uploaderOf(ctx);
    if (meta.declaredSize !== null && meta.declaredSize > EVIDENCE_MAX_ANY)
      throw tooLarge(EVIDENCE_MAX_ANY);

    const dir = join(tmpdir(), "ev-uploads");
    await mkdir(dir, { recursive: true });
    const tempPath = join(dir, `${Date.now()}-${randomBytes(6).toString("hex")}`);

    let head = Buffer.alloc(0);
    let size = 0;
    const hash = createHash("sha256");
    try {
      await new Promise<void>((resolve, reject) => {
        const out = createWriteStream(tempPath);
        body.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (head.length < 32) head = Buffer.concat([head, chunk]).subarray(0, 32);
          if (size > EVIDENCE_MAX_ANY) {
            body.unpipe(out);
            out.destroy();
            reject(tooLarge(EVIDENCE_MAX_ANY));
            body.resume();
            return;
          }
          hash.update(chunk);
        });
        body.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve());
        body.pipe(out);
      });

      if (size === 0) throw badRequest("empty_file", "The file is empty.");
      const mime = sniffMime(head);
      const kind: EvidenceKind | undefined = mime ? EVIDENCE_MIME_KINDS[mime] : undefined;
      if (!mime || !kind) {
        throw new ApiError(
          415,
          "unsupported_file",
          "Only photos (JPEG, PNG, WebP), videos (MP4, MOV) and audio recordings can be added as evidence.",
        );
      }
      if (size > EVIDENCE_MAX_BYTES[kind]) throw tooLarge(EVIDENCE_MAX_BYTES[kind], kind);

      const sha256 = hash.digest("hex");
      const id = new Types.ObjectId();
      const year = new Date().getUTCFullYear();
      const originalKey = `originals/${year}/${id}`;
      await this.storage.putFile(originalKey, tempPath, mime);

      const needsCopy = kind === "video" || (kind === "audio" && size > AUDIO_COMPRESS_FROM);
      const original = { storageKey: originalKey, size, mime, sha256 };
      await this.items.create({
        _id: id,
        kind,
        status: needsCopy ? "processing" : "ready",
        originalName: sanitiseName(meta.fileName),
        original,
        originalRetained: true,
        viewing: needsCopy ? null : original,
        compressed: false,
        capturedInApp: meta.capturedInApp ?? false,
        capturedAt: meta.capturedAt,
        uploadedBy: me.id,
        uploadedByName: me.name,
      });
      await this.addCustody(
        id,
        "received",
        { actor: me.name, actorId: me.id, role: me.role },
        null,
        `${kind}, ${formatBytes(size)}, ${mime}, SHA-256 ${sha256}`,
      );

      if (needsCopy) {
        const job = this.queue.then(() => this.makeViewingCopy(id, kind, tempPath));
        this.queue = job.catch(() => undefined);
      } else {
        await rm(tempPath, { force: true });
      }
      return this.view((await this.items.findById(id).lean<Lean>())!);
    } catch (err) {
      await rm(tempPath, { force: true });
      throw err;
    }
  }

  /** Resolves when queued viewing copies are done — for tests and shutdown. */
  whenIdle() {
    return this.queue;
  }

  private async makeViewingCopy(id: Types.ObjectId, kind: EvidenceKind, inputPath: string) {
    const outPath = `${inputPath}.view.${kind === "video" ? "mp4" : "m4a"}`;
    const system = { actor: "System", actorId: null, role: null };
    try {
      if (!ffmpegPath()) throw new Error("ffmpeg is not available");
      await (kind === "video"
        ? compressVideo(inputPath, outPath)
        : compressAudio(inputPath, outPath));
      const { size } = await stat(outPath);
      const sha256 = await sha256File(outPath);
      const mime = kind === "video" ? "video/mp4" : "audio/mp4";
      const key = `viewing/${new Date().getUTCFullYear()}/${id}.${kind === "video" ? "mp4" : "m4a"}`;
      await this.storage.putFile(key, outPath, mime);
      await this.items.updateOne(
        { _id: id },
        {
          $set: {
            status: "ready",
            compressed: true,
            viewing: { storageKey: key, size, mime, sha256 },
          },
        },
      );
      await this.addCustody(
        id,
        "processed",
        system,
        null,
        `Viewing copy ${formatBytes(size)}, SHA-256 ${sha256}`,
      );
    } catch (err) {
      // The original stays the evidence; reviewers watch it directly.
      const item = await this.items.findById(id).lean<Lean>();
      await this.items.updateOne(
        { _id: id },
        {
          $set: {
            status: "failed",
            processingError: (err as Error).message.slice(0, 500),
            viewing: item?.original ?? null,
          },
        },
      );
      await this.addCustody(
        id,
        "processed",
        system,
        null,
        `Viewing copy failed; the original is shown instead (${(err as Error).message.slice(0, 200)})`,
      );
      this.logger.warn(`Evidence ${id}: viewing copy failed — ${(err as Error).message}`);
    } finally {
      await rm(inputPath, { force: true });
      await rm(outPath, { force: true });
    }
  }

  // ── Attaching ─────────────────────────────────────────────────────────

  /**
   * Attaches the uploader's own, not-yet-attached files to a report — in the
   * report's transaction. Anyone else's file, or one already used, is refused.
   */
  async claim(
    ctx: ActionContext,
    ids: string[],
    report: { _id: Types.ObjectId; reportNumber: string },
    session: ClientSession,
  ) {
    if (ids.length === 0) return [];
    const me = uploaderOf(ctx);
    const oids = [...new Set(ids)].map((i) => new Types.ObjectId(i));
    const res = await this.items.updateMany(
      { _id: { $in: oids }, uploadedBy: me.id, reportId: null },
      { $set: { reportId: report._id, claimedAt: new Date() } },
      { session },
    );
    if (res.modifiedCount !== oids.length) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: {
          evidenceIds:
            "Some files can't be attached — they were uploaded by someone else, are already on a report, or were deleted.",
        },
      });
    }
    for (const oid of oids) {
      await this.addCustody(
        oid,
        "attached",
        { actor: me.name, actorId: me.id, role: me.role },
        null,
        `Attached to report ${report.reportNumber}`,
        session,
      );
    }
    return oids;
  }

  /** Attaches the uploader's own unattached files to a case (investigation evidence, statements). */
  async claimForCase(
    ctx: ActionContext,
    ids: string[],
    caseRef: { _id: Types.ObjectId; caseNumber: string },
    session: ClientSession,
  ) {
    if (ids.length === 0) return [];
    const me = uploaderOf(ctx);
    const oids = [...new Set(ids)].map((i) => new Types.ObjectId(i));
    const res = await this.items.updateMany(
      { _id: { $in: oids }, uploadedBy: me.id, reportId: null, caseId: null },
      { $set: { caseId: caseRef._id, claimedAt: new Date() } },
      { session },
    );
    if (res.modifiedCount !== oids.length) {
      throw new ApiError(400, "validation", "Check the highlighted fields.", {
        fields: {
          evidenceIds:
            "Some files can't be attached — they were uploaded by someone else, are already attached, or were deleted.",
        },
      });
    }
    for (const oid of oids) {
      await this.addCustody(
        oid,
        "attached",
        { actor: me.name, actorId: me.id, role: me.role },
        null,
        `Attached to case ${caseRef.caseNumber}`,
        session,
      );
    }
    return oids;
  }

  async listForCase(ctx: ActionContext, caseId: string): Promise<EvidenceView[]> {
    await this.caseReadable(ctx, caseId);
    const rows = await this.items
      .find({ caseId: new Types.ObjectId(caseId) })
      .sort({ createdAt: 1 })
      .lean<Lean[]>();
    return rows.map((r) => this.view(r));
  }

  // ── Reading ───────────────────────────────────────────────────────────

  async listForReport(ctx: ActionContext, reportId: string): Promise<EvidenceView[]> {
    await this.reportReadable(ctx, reportId);
    const rows = await this.items
      .find({ reportId: new Types.ObjectId(reportId) })
      .sort({ createdAt: 1 })
      .lean<Lean[]>();
    return rows.map((r) => this.view(r));
  }

  async get(ctx: ActionContext, id: string): Promise<EvidenceView> {
    return this.view(await this.readable(ctx, id));
  }

  /** The viewing copy, for everyday review. */
  async openViewing(ctx: ActionContext, id: string) {
    const item = await this.readable(ctx, id);
    if (!item.viewing?.storageKey)
      throw new ApiError(409, "processing", "The viewing copy is still being prepared.");
    const stream = await this.storage.read(item.viewing.storageKey);
    if (!stream) throw notFound("File not found in storage.");
    return { stream, mime: item.viewing.mime, size: item.viewing.size };
  }

  /** The untouched original — HQ only, with a reason; logged in custody and the audit log (D10-1). */
  async openOriginal(ctx: ActionContext, id: string, reason: string) {
    const me = requireUser(ctx);
    const item = await this.readable(ctx, id);
    if (!item.originalRetained || !item.original.storageKey) {
      throw new ApiError(
        410,
        "original_not_retained",
        "The original of this item was not retained (uploaded before originals were kept).",
      );
    }
    const stream = await this.storage.read(item.original.storageKey);
    if (!stream) throw notFound("File not found in storage.");
    await this.addCustody(
      item._id,
      "original_accessed",
      { actor: me.name, actorId: me.id, role: me.role },
      reason,
      null,
    );
    await this.audit.record(ctx, {
      action: "evidence.original_accessed",
      summary: `Original evidence file opened (${item.kind})`,
      reason,
      target: { type: "evidence", id: String(item._id), label: item.originalName },
    });
    const ext = extensionOf(item.original.mime);
    return {
      stream,
      mime: item.original.mime,
      size: item.original.size,
      fileName: `evidence-${item._id}-original${ext}`,
    };
  }

  async custodyOf(ctx: ActionContext, id: string): Promise<CustodyEventView[]> {
    const item = await this.readable(ctx, id);
    const rows = await this.custody.find({ evidenceId: item._id }).sort({ at: 1 }).lean();
    return rows.map((c) => ({
      at: c.at.toISOString(),
      event: c.event,
      actor: c.actor,
      reason: c.reason ?? null,
      detail: c.detail ?? null,
    }));
  }

  // ── Time limits (docs/09 §4 System) ───────────────────────────────────

  /** Deletes uploads never attached to a report within the limit. */
  async deleteUnclaimed(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - (await this.limits.msAt("system.unclaimedUploads")));
    const stale = await this.items
      .find({ reportId: null, caseId: null, createdAt: { $lt: cutoff } })
      .lean<Lean[]>();
    for (const item of stale) {
      if (item.original.storageKey) await this.storage.delete(item.original.storageKey);
      if (item.viewing?.storageKey && item.viewing.storageKey !== item.original.storageKey)
        await this.storage.delete(item.viewing.storageKey);
      await this.addCustody(
        item._id,
        "deleted",
        { actor: "System", actorId: null, role: null },
        null,
        "Never attached to a report",
      );
      await this.items.deleteOne({ _id: item._id, reportId: null, caseId: null });
    }
    return stale.length;
  }

  /** Marks viewing copies stuck in processing as failed; the original is shown instead. */
  async failStuckProcessing(now = new Date()): Promise<number> {
    const cutoff = new Date(
      now.getTime() - (await this.limits.msAt("system.stuckVideoProcessing")),
    );
    const stuck = await this.items
      .find({ status: "processing", updatedAt: { $lt: cutoff } })
      .lean<Lean[]>();
    for (const item of stuck) {
      await this.items.updateOne(
        { _id: item._id, status: "processing" },
        {
          $set: {
            status: "failed",
            processingError: "Processing did not finish in time",
            viewing: item.original,
          },
        },
      );
      await this.addCustody(
        item._id,
        "processed",
        { actor: "System", actorId: null, role: null },
        null,
        "Viewing copy timed out; the original is shown instead",
      );
    }
    return stuck.length;
  }

  // Phase 5 moves this to the job scheduler.
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    this.timer = setInterval(() => {
      Promise.all([this.deleteUnclaimed(), this.failStuckProcessing()]).catch((err) =>
        this.logger.error(err),
      );
    }, MAINTENANCE_MS);
    this.timer.unref();
  }

  async onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
    await this.queue;
  }

  // ── Helpers ───────────────────────────────────────────────────────────

  private async readable(ctx: ActionContext, id: string): Promise<Lean> {
    const me = requireUser(ctx);
    if (!Types.ObjectId.isValid(id)) throw notFound("Evidence not found.");
    const item = await this.items.findById(id).lean<Lean>();
    if (!item) throw notFound("Evidence not found.");
    if (!item.reportId && !item.caseId) {
      // Not yet attached: only the person who uploaded it.
      if (item.uploadedBy !== me.id) throw notFound("Evidence not found.");
      return item;
    }
    if (item.reportId) await this.reportReadable(ctx, String(item.reportId));
    else await this.caseReadable(ctx, String(item.caseId));
    if (me.role === "dev") {
      await this.audit.record(ctx, {
        action: "support.evidence_viewed",
        summary: "Viewed evidence for support",
        target: { type: "evidence", id: String(item._id), label: item.originalName },
      });
    }
    return item;
  }

  /** Same rule as reports: HQ and dev all, station staff their own station's reports. */
  private async reportReadable(ctx: ActionContext, reportId: string): Promise<ReportAccess> {
    if (!Types.ObjectId.isValid(reportId)) throw notFound("Report not found.");
    const report = await this.conn
      .collection<ReportAccess>("incident_reports")
      .findOne(
        { _id: new Types.ObjectId(reportId) },
        { projection: { reportNumber: 1, stationId: 1 } },
      );
    if (!report) throw notFound("Report not found.");
    if (ctx.scope === "station" && String(report.stationId) !== requireUser(ctx).stationId)
      throw notFound("Report not found.");
    if (ctx.scope === "assigned") throw forbidden();
    return report;
  }

  /** HQ and dev all cases; station staff their station's. */
  private async caseReadable(ctx: ActionContext, caseId: string) {
    if (!Types.ObjectId.isValid(caseId)) throw notFound("Case not found.");
    const c = await this.conn
      .collection<{ _id: Types.ObjectId; stationId: Types.ObjectId | null }>("cases")
      .findOne({ _id: new Types.ObjectId(caseId) }, { projection: { stationId: 1 } });
    if (!c) throw notFound("Case not found.");
    if (ctx.scope !== "all" && String(c.stationId) !== requireUser(ctx).stationId)
      throw notFound("Case not found.");
    return c;
  }

  private async addCustody(
    evidenceId: Types.ObjectId,
    event: CustodyEvent["event"],
    who: { actor: string; actorId: string | null; role: string | null },
    reason: string | null,
    detail: string | null,
    session?: ClientSession,
  ) {
    await this.custody.create([{ evidenceId, at: new Date(), event, ...who, reason, detail }], {
      session,
    });
  }

  private view(item: Lean | EvidenceItemDocument): EvidenceView {
    return {
      id: String(item._id),
      kind: item.kind,
      status: item.status,
      originalName: item.originalName,
      original: {
        size: item.original.size,
        mime: item.original.mime,
        sha256: item.original.sha256,
        retained: item.originalRetained,
      },
      viewing: item.viewing
        ? { size: item.viewing.size, mime: item.viewing.mime, compressed: item.compressed }
        : null,
      capturedInApp: item.capturedInApp,
      uploadedAt: item.createdAt.toISOString(),
      uploadedBy: item.uploadedByName,
      reportId: item.reportId ? String(item.reportId) : null,
      caseId: item.caseId ? String(item.caseId) : null,
      integrity:
        item.integrityCheckedAt && item.integrityOk !== null
          ? { ok: item.integrityOk, checkedAt: item.integrityCheckedAt.toISOString() }
          : null,
    };
  }
}

/** The signed-in user, or the system job (mobile-app import) acting on its own. */
function uploaderOf(ctx: ActionContext) {
  if (ctx.user)
    return { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role as string | null };
  return {
    id: `system:${ctx.actor.label ?? "job"}`,
    name: "System (mobile app import)",
    role: null,
  };
}

function tooLarge(max: number, kind?: EvidenceKind) {
  return new ApiError(
    413,
    "file_too_large",
    `${kind ? kind[0]!.toUpperCase() + kind.slice(1) + "s" : "Files"} can be up to ${formatBytes(max)}.`,
  );
}

const FORBIDDEN_NAME_CHARS = ["\\", "/", ":", "*", "?", '"', "<", ">", "|"];

function sanitiseName(name: string) {
  // Path separators, characters Windows forbids, and control characters become "_".
  const cleaned = [...name]
    .map((ch) => (ch.charCodeAt(0) < 32 || FORBIDDEN_NAME_CHARS.includes(ch) ? "_" : ch))
    .join("")
    .trim()
    .slice(0, 150);
  return cleaned || "evidence";
}

function extensionOf(mime: string) {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/x-msvideo": ".avi",
    "video/mpeg": ".mpg",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/aac": ".aac",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
  };
  return map[mime] ?? "";
}

async function sha256File(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}
