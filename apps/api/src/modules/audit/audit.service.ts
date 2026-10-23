import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import type { AuditActor, AuditChainStatus, AuditEntryView } from "@ev/shared";
import type { ClientSession, QueryFilter, Model } from "mongoose";
import type { ActionContext } from "../../common/context";
import { AuditEntry } from "./audit.schema";
import { GENESIS_HASH, entryHash } from "./hash";

export interface AuditInput {
  action: string;
  summary: string;
  target?: { type: string; id: string | null; label?: string | null } | null;
  reason?: string | null;
}

const MAX_RETRIES = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

// Actions dev may read: technical events, never views of personal data
// (docs/10 §4.4).
const TECHNICAL_ACTION_PREFIXES = ["auth.", "user.", "settings.", "system.", "audit."];

function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

@Injectable()
export class AuditService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(AuditService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastStatus: AuditChainStatus | null = null;

  constructor(@InjectModel(AuditEntry.name) private readonly entries: Model<AuditEntry>) {}

  /**
   * Appends one entry to the chain. Pass the transaction `session` when the
   * entry belongs to a change, so both are saved or neither is.
   *
   * Ordering: the next entry takes the last entry's seq + 1. `seq` is unique,
   * so if two writers race, one insert fails and retries on the new tail —
   * the chain can never fork.
   */
  async record(
    ctx: Pick<ActionContext, "actor" | "source">,
    input: AuditInput,
    session?: ClientSession,
  ) {
    // Inside a transaction the transaction's own retry handles conflicts.
    if (session) return this.append(ctx, input, session);
    // Outside one, writes from this process queue up; other API instances
    // are handled by the unique `seq` plus retries.
    const run = this.queue.then(() => this.append(ctx, input));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private queue: Promise<unknown> = Promise.resolve();

  private async append(
    ctx: Pick<ActionContext, "actor" | "source">,
    input: AuditInput,
    session?: ClientSession,
  ) {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(5 + Math.random() * 20 * attempt);
      const last = await this.entries
        .findOne({}, { seq: 1, hash: 1 }, { sort: { seq: -1 }, session })
        .lean();

      const entry = {
        seq: (last?.seq ?? 0) + 1,
        at: new Date(),
        actor: normaliseActor(ctx.actor),
        action: input.action,
        target: input.target
          ? { type: input.target.type, id: input.target.id, label: input.target.label ?? null }
          : null,
        summary: input.summary,
        reason: input.reason ?? null,
        source: { ip: ctx.source.ip ?? null, app: ctx.source.app ?? null },
        prevHash: last?.hash ?? GENESIS_HASH,
      };

      try {
        await this.entries.create([{ ...entry, hash: entryHash(entry) }], { session });
        return;
      } catch (err) {
        // Inside a transaction a conflict aborts the transaction; the caller's
        // withTransaction() retries the whole unit.
        if (isDuplicateKey(err) && !session) continue;
        throw err;
      }
    }
    throw new Error("Could not append to the audit log after several attempts");
  }

  /** Recomputes every hash in order. Any edit, deletion or insertion breaks it. */
  async verifyChain(): Promise<AuditChainStatus> {
    let expectedSeq = 1;
    let prevHash = GENESIS_HASH;
    let checked = 0;
    let brokenAtSeq: number | null = null;

    const cursor = this.entries
      .find({}, null, { sort: { seq: 1 } })
      .lean()
      .cursor();
    for await (const e of cursor) {
      checked++;
      const recomputed = entryHash({
        seq: e.seq,
        at: e.at,
        actor: normaliseActor(e.actor as AuditActor),
        action: e.action,
        target: e.target
          ? { type: e.target.type, id: e.target.id ?? null, label: e.target.label ?? null }
          : null,
        summary: e.summary,
        reason: e.reason ?? null,
        source: { ip: e.source?.ip ?? null, app: e.source?.app ?? null },
        prevHash: e.prevHash,
      });
      if (e.seq !== expectedSeq || e.prevHash !== prevHash || e.hash !== recomputed) {
        brokenAtSeq = e.seq;
        break;
      }
      prevHash = e.hash;
      expectedSeq++;
    }
    await cursor.close();

    const status = {
      ok: brokenAtSeq === null,
      checked,
      brokenAtSeq,
      checkedAt: new Date().toISOString(),
    };
    this.lastStatus = status;
    return status;
  }

  get lastChainStatus() {
    return this.lastStatus;
  }

  async list(
    ctx: ActionContext,
    opts: {
      page: number;
      pageSize: number;
      action?: string;
      targetType?: string;
      targetId?: string;
    },
  ) {
    const filter: QueryFilter<AuditEntry> = {};
    if (ctx.scope === "station") filter["actor.stationId"] = ctx.user?.stationId ?? "__none__";
    if (ctx.user?.role === "dev") {
      filter.action = {
        $regex: `^(${TECHNICAL_ACTION_PREFIXES.map((p) => p.replace(".", "\\.")).join("|")})`,
      };
    }
    if (opts.action) filter.action = opts.action;
    if (opts.targetType) filter["target.type"] = opts.targetType;
    if (opts.targetId) filter["target.id"] = opts.targetId;

    const [items, total] = await Promise.all([
      this.entries
        .find(filter, null, {
          sort: { seq: -1 },
          skip: (opts.page - 1) * opts.pageSize,
          limit: opts.pageSize,
        })
        .lean(),
      this.entries.countDocuments(filter),
    ]);

    return {
      items: items.map((e): AuditEntryView => ({
        seq: e.seq,
        at: e.at.toISOString(),
        actor: e.actor as AuditActor,
        action: e.action,
        target: e.target
          ? { type: e.target.type, id: e.target.id ?? null, label: e.target.label ?? null }
          : null,
        summary: e.summary,
        reason: e.reason ?? null,
        source: { ip: e.source?.ip ?? null, app: e.source?.app ?? null },
        hash: e.hash,
      })),
      total,
      page: opts.page,
      pageSize: opts.pageSize,
    };
  }

  // Daily chain check (docs/10 §4.2). Phase 5 moves this to the job
  // scheduler and alerts HQ and the developers through notifications.
  onApplicationBootstrap() {
    if (process.env.NODE_ENV === "test") return;
    const run = () =>
      this.verifyChain()
        .then((s) => {
          if (!s.ok) this.logger.error(`Audit chain broken at entry ${s.brokenAtSeq}`);
        })
        .catch((err) => this.logger.error(err));
    setTimeout(run, 10_000).unref();
    this.timer = setInterval(run, DAY_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    if (this.timer) clearInterval(this.timer);
  }
}

function normaliseActor(a: AuditActor) {
  return {
    kind: a.kind,
    userId: a.userId ?? null,
    role: a.role ?? null,
    stationId: a.stationId ?? null,
    label: a.label ?? null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
