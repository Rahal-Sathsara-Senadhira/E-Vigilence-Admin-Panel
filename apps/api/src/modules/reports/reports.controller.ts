import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import {
  acceptReportSchema,
  changePrioritySchema,
  createReportSchema,
  listReportsQuerySchema,
  mergeReportSchema,
  needsInfoSchema,
  reasonOnlySchema,
  rejectReportSchema,
  replySchema,
} from "@ev/shared";
import type { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { ReportsService } from "./reports.service";

@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** HQ records WhatsApp and phone reports; stations record walk-in, phone and officer reports. */
  @Post()
  @RequirePermission("reports.record")
  create(
    @Ctx() ctx: ActionContext,
    @Body(new ZodPipe(createReportSchema)) body: z.output<typeof createReportSchema>,
  ) {
    return this.reports.create(ctx, body);
  }

  @Get()
  @RequirePermission("reports.view")
  list(
    @Ctx() ctx: ActionContext,
    @Query(new ZodPipe(listReportsQuerySchema)) query: z.output<typeof listReportsQuerySchema>,
  ) {
    return this.reports.list(ctx, query);
  }

  @Get(":id")
  @RequirePermission("reports.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.get(ctx, id);
  }

  @Get(":id/matches")
  @RequirePermission("reports.triage")
  matches(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.matches(ctx, id);
  }

  @Post(":id/lock")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  lock(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.lock(ctx, id);
  }

  @Delete(":id/lock")
  @HttpCode(204)
  @RequirePermission("reports.triage")
  unlock(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.unlock(ctx, id);
  }

  @Post(":id/accept")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  accept(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(acceptReportSchema)) body: z.output<typeof acceptReportSchema>,
  ) {
    return this.reports.accept(ctx, id, body);
  }

  @Post(":id/merge")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  merge(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(mergeReportSchema)) body: z.output<typeof mergeReportSchema>,
  ) {
    return this.reports.merge(ctx, id, body.caseId, body.note ?? null);
  }

  @Post(":id/needs-info")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  needsInfo(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(needsInfoSchema)) body: z.output<typeof needsInfoSchema>,
  ) {
    return this.reports.needsInfo(ctx, id, body.question);
  }

  @Post(":id/reply")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  reply(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(replySchema)) body: z.output<typeof replySchema>,
  ) {
    return this.reports.recordReply(ctx, id, body.answer);
  }

  /** HQ for the queue and station review; a second officer or the OIC for officer observations. */
  @Post(":id/reject")
  @HttpCode(200)
  @RequirePermission("reports.record")
  reject(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(rejectReportSchema)) body: z.output<typeof rejectReportSchema>,
  ) {
    return this.reports.reject(ctx, id, body.reasonCode, body.note ?? null);
  }

  @Post(":id/reconsider")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  reconsider(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reasonOnlySchema)) body: z.output<typeof reasonOnlySchema>,
  ) {
    return this.reports.reconsider(ctx, id, body.reason);
  }

  @Post(":id/undo-merge")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  undoMerge(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reasonOnlySchema)) body: z.output<typeof reasonOnlySchema>,
  ) {
    return this.reports.undoMerge(ctx, id, body.reason);
  }

  @Post(":id/review")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  review(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.markReviewed(ctx, id);
  }

  @Post(":id/priority")
  @HttpCode(200)
  @RequirePermission("reports.triage")
  priority(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(changePrioritySchema)) body: z.output<typeof changePrioritySchema>,
  ) {
    return this.reports.changePriority(ctx, id, body.priority, body.reason);
  }

  /** Officer-observed report accepted by another officer or the OIC (docs/02 §7). */
  @Post(":id/station-accept")
  @HttpCode(200)
  @RequirePermission("reports.record", { scope: "station" })
  stationAccept(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.reports.stationAccept(ctx, id);
  }
}
