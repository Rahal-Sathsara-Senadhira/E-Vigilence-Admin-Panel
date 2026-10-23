// Reporter standing — docs/02 §10, D02-6. HQ can suspend a mobile-app
// account from reporting, lift a suspension, or clear a flag — always with
// a reason. The app enforces the suspension from `reward_accounts`
// (docs/11 §6); the import refuses reports from suspended accounts.

import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { InjectConnection, InjectModel } from "@nestjs/mongoose";
import { ABUSE_WINDOW_DAYS, reasonOnlySchema } from "@ev/shared";
import type { Connection, Model } from "mongoose";
import type { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { badRequest, notFound } from "../../common/errors";
import { inTransaction } from "../../common/transaction";
import { ZodPipe } from "../../common/zod.pipe";
import { AuditService } from "../audit/audit.service";
import { RequirePermission } from "../auth/auth.decorators";
import { ReporterRecord } from "./reporter-record.schema";

const KEY = /^(user:[a-f\d]{24}|phone:\+94\d{9})$/i;

@Controller("reporters")
export class ReportersController {
  constructor(
    @InjectModel(ReporterRecord.name) private readonly records: Model<ReporterRecord>,
    @InjectConnection() private readonly conn: Connection,
    private readonly audit: AuditService,
  ) {}

  @Get(":key")
  @RequirePermission("reports.triage")
  async get(@Param("key") key: string) {
    this.check(key);
    const r = await this.records.findOne({ key }).lean();
    const since = Date.now() - ABUSE_WINDOW_DAYS * 86_400_000;
    return {
      key,
      flagged: !!r?.flagged,
      suspended: !!r?.suspended,
      suspendedReason: r?.suspendedReason ?? null,
      abuseInWindow: (r?.abuse ?? []).filter((a) => a.at.getTime() >= since).length,
      abuseTotal: r?.abuse.length ?? 0,
    };
  }

  @Post(":key/suspend")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  suspend(
    @Ctx() ctx: ActionContext,
    @Param("key") key: string,
    @Body(new ZodPipe(reasonOnlySchema)) body: z.output<typeof reasonOnlySchema>,
  ) {
    this.check(key);
    if (!key.startsWith("user:"))
      throw badRequest("not_an_account", "Only mobile-app accounts can be suspended.");
    return this.set(
      ctx,
      key,
      { suspended: true, suspendedReason: body.reason, suspendedAt: new Date() },
      "reporter.suspended",
      "Suspended from reporting",
      body.reason,
    );
  }

  @Post(":key/lift")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  lift(
    @Ctx() ctx: ActionContext,
    @Param("key") key: string,
    @Body(new ZodPipe(reasonOnlySchema)) body: z.output<typeof reasonOnlySchema>,
  ) {
    this.check(key);
    return this.set(
      ctx,
      key,
      { suspended: false, suspendedReason: null, suspendedAt: null },
      "reporter.suspension_lifted",
      "Suspension lifted",
      body.reason,
    );
  }

  @Post(":key/unflag")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  unflag(
    @Ctx() ctx: ActionContext,
    @Param("key") key: string,
    @Body(new ZodPipe(reasonOnlySchema)) body: z.output<typeof reasonOnlySchema>,
  ) {
    this.check(key);
    return this.set(
      ctx,
      key,
      { flagged: false, flaggedAt: null },
      "reporter.unflagged",
      "Flag cleared",
      body.reason,
    );
  }

  private async set(
    ctx: ActionContext,
    key: string,
    fields: Partial<ReporterRecord>,
    action: string,
    summary: string,
    reason: string,
  ) {
    await inTransaction(this.conn, async (session) => {
      await this.records.updateOne({ key }, { $set: fields }, { upsert: true, session });
      if (key.startsWith("user:") && "suspended" in fields) {
        // What the app reads to block reporting (docs/11 §6).
        await this.conn.collection("reward_accounts").updateOne(
          { userId: key.slice(5) },
          {
            $set: {
              status: fields.suspended ? "suspended" : "active",
              statusReason: fields.suspended ? reason : null,
              statusAt: new Date(),
            },
          },
          { upsert: true, session },
        );
      }
      await this.audit.record(
        ctx,
        { action, summary, reason, target: { type: "reporter", id: key, label: null } },
        session,
      );
    });
    return this.get(key);
  }

  private check(key: string) {
    if (!KEY.test(key)) throw notFound("Unknown reporter.");
  }
}
