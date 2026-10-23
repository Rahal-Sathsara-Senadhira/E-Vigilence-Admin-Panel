// Time limits — docs/09 §3–4. Later phases ask this service for the limit of
// an item: `msAt("case.accept", dispatch.sentAt)`.

import { Injectable } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import {
  TIME_LIMITS,
  TIME_LIMIT_BY_KEY,
  formatLimit,
  isTimeLimitKey,
  toMilliseconds,
  type TimeLimitChangeView,
  type TimeLimitKey,
  type TimeLimitView,
} from "@ev/shared";
import type { Connection, Model } from "mongoose";
import { requireUser, type ActionContext } from "../../common/context";
import { badRequest, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { AuditService } from "../audit/audit.service";
import { SettingVersion } from "./setting-version.schema";

@Injectable()
export class TimeLimitsService {
  constructor(
    @InjectModel(SettingVersion.name) private readonly versions: Model<SettingVersion>,
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TimeLimitView[]> {
    const latest = await this.versions.aggregate<{ _id: string; doc: SettingVersion }>([
      { $match: { key: { $in: TIME_LIMITS.map((t) => t.key) } } },
      { $sort: { effectiveFrom: -1 } },
      { $group: { _id: "$key", doc: { $first: "$$ROOT" } } },
    ]);
    const byKey = new Map(latest.map((l) => [l._id, l.doc]));
    return TIME_LIMITS.map((def) => {
      const v = byKey.get(def.key);
      return {
        ...def,
        value: v?.value ?? def.default,
        effectiveFrom: v ? v.effectiveFrom.toISOString() : null,
        changedBy: v?.changedByName ?? null,
      };
    });
  }

  /** The value in force at `startedAt` (T2) — never a later change. */
  async limitAt(key: TimeLimitKey, startedAt: Date = new Date()): Promise<number> {
    const v = await this.versions
      .findOne(
        { key, effectiveFrom: { $lte: startedAt } },
        { value: 1 },
        { sort: { effectiveFrom: -1 } },
      )
      .lean();
    return v?.value ?? TIME_LIMIT_BY_KEY[key].default;
  }

  /** The limit as a duration in milliseconds, for an item that started at `startedAt`. */
  async msAt(key: TimeLimitKey, startedAt: Date = new Date()): Promise<number> {
    return toMilliseconds(TIME_LIMIT_BY_KEY[key].unit, await this.limitAt(key, startedAt));
  }

  async update(
    ctx: ActionContext,
    key: string,
    value: number,
    reason: string,
  ): Promise<TimeLimitView> {
    if (!isTimeLimitKey(key)) throw notFound("Unknown time limit.");
    const def = TIME_LIMIT_BY_KEY[key];
    if (value < def.min || value > def.max) {
      throw badRequest(
        "out_of_range",
        `Choose between ${formatLimit(def.unit, def.min)} and ${formatLimit(def.unit, def.max)}.`,
      );
    }
    const current = await this.limitAt(key);
    if (value === current) throw badRequest("no_change", "That is already the current value.");
    const me = requireUser(ctx);

    await inTransaction(this.conn, async (session) => {
      await this.versions.create(
        [
          {
            key,
            value,
            previous: current,
            effectiveFrom: new Date(),
            changedBy: me.id,
            changedByName: me.name,
            reason,
          },
        ],
        { session },
      );
      await this.audit.record(
        ctx,
        {
          action: "settings.time_limit_changed",
          summary: `${def.label}: ${formatLimit(def.unit, current)} → ${formatLimit(def.unit, value)} (applies to items that start from now)`,
          reason,
          target: { type: "time_limit", id: key, label: def.label },
        },
        session,
      );
    });

    const view = (await this.list()).find((t) => t.key === key);
    return view!;
  }

  async history(key: string): Promise<TimeLimitChangeView[]> {
    if (!isTimeLimitKey(key)) throw notFound("Unknown time limit.");
    const rows = await this.versions
      .find({ key }, null, { sort: { effectiveFrom: -1 }, limit: 50 })
      .lean();
    return rows.map((r) => ({
      value: r.value,
      previous: r.previous,
      effectiveFrom: r.effectiveFrom.toISOString(),
      changedBy: r.changedByName,
      reason: r.reason,
    }));
  }
}
