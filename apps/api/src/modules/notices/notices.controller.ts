import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  disputeSchema,
  nominationSchema,
  publicLookupSchema,
  recordPostingSchema,
  reserveSchema,
  reviewDisputeSchema,
  reviewNominationSchema,
  serviceFailedSchema,
  withdrawSchema,
} from "@ev/shared";
import type { Request } from "express";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ApiError, notFound } from "../../common/errors";
import { ZodPipe } from "../../common/zod.pipe";
import { Public, RequirePermission } from "../auth/auth.decorators";
import { NoticesService, type NoticeView } from "./notices.service";
import { OutboxService } from "./outbox.service";

type Out<T extends z.ZodType> = z.output<T>;

const listQuery = z.object({
  view: z
    .enum([
      "all",
      "to_post",
      "nominations",
      "disputes",
      "overdue",
      "court_proposed",
      "service_failed",
    ])
    .default("all"),
  q: z.string().trim().max(50).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

// docs/07 D07-1: 5 failed look-ups per 10 minutes per device/IP, then a short block.
const FAILED_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;
const failures = new Map<string, number[]>();
function assertNotBlocked(ip: string) {
  const now = Date.now();
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  failures.set(ip, recent);
  if (recent.length >= FAILED_LIMIT)
    throw new ApiError(
      429,
      "rate_limited",
      "Too many attempts. Please wait 10 minutes and try again.",
    );
}
function recordFailure(ip: string) {
  failures.set(ip, [...(failures.get(ip) ?? []), Date.now()]);
}

@Controller()
export class NoticesController {
  constructor(
    private readonly notices: NoticesService,
    private readonly outbox: OutboxService,
  ) {}

  // ── Staff ─────────────────────────────────────────────────────────────

  @Get("notices")
  @RequirePermission("notices.view")
  list(@Ctx() ctx: ActionContext, @Query(new ZodPipe(listQuery)) q: Out<typeof listQuery>) {
    return this.notices.list(ctx, { ...q, view: q.view as NoticeView });
  }

  @Get("notices/:id")
  @RequirePermission("notices.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.notices.get(ctx, id);
  }

  @Get("cases/:id/notices")
  @RequirePermission("notices.view")
  forCase(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.notices.listForCase(ctx, id);
  }

  @Post("notices/:id/post")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  post(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(recordPostingSchema)) b: Out<typeof recordPostingSchema>,
  ) {
    return this.notices.post(ctx, id, b);
  }

  @Post("notices/:id/service-failed")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  serviceFailed(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(serviceFailedSchema)) b: Out<typeof serviceFailedSchema>,
  ) {
    return this.notices.serviceFailed(ctx, id, b.reason);
  }

  @Post("notices/:id/reserve")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  reserve(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reserveSchema)) b: Out<typeof reserveSchema>,
  ) {
    return this.notices.reserve(ctx, id, b);
  }

  @Post("notices/:id/withdraw")
  @HttpCode(200)
  @RequirePermission("notices.withdraw")
  withdraw(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(withdrawSchema)) b: Out<typeof withdrawSchema>,
  ) {
    return this.notices.withdraw(ctx, id, b.reason);
  }

  /** A nomination received by post or at the counter. */
  @Post("notices/:id/nomination")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  nominate(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(nominationSchema)) b: Out<typeof nominationSchema>,
  ) {
    return this.notices.nominate(ctx, id, b);
  }

  @Post("notices/:id/nomination/review")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  reviewNomination(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reviewNominationSchema)) b: Out<typeof reviewNominationSchema>,
  ) {
    return this.notices.reviewNomination(ctx, id, b);
  }

  /** A dispute received by post or at the counter. */
  @Post("notices/:id/dispute")
  @HttpCode(200)
  @RequirePermission("notices.serve")
  dispute(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(disputeSchema)) b: Out<typeof disputeSchema>,
  ) {
    return this.notices.dispute(ctx, id, b);
  }

  @Post("notices/:id/dispute/review")
  @HttpCode(200)
  @RequirePermission("notices.reviewDispute")
  reviewDispute(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reviewDisputeSchema)) b: Out<typeof reviewDisputeSchema>,
  ) {
    return this.notices.reviewDispute(ctx, id, b);
  }

  @Post("notices/:id/court")
  @HttpCode(200)
  @RequirePermission("court.record")
  court(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.notices.confirmCourt(ctx, id);
  }

  /** Letters and SMS held until go-live (docs/15 D15-3). */
  @Get("outbox")
  @RequirePermission("notices.withdraw")
  outboxList(@Query(new ZodPipe(pageQuery)) q: Out<typeof pageQuery>) {
    return this.outbox.list(q.page, q.pageSize);
  }

  // ── Public: the addressee, with the notice number and their ID number ──

  @Post("public/notices/lookup")
  @Public()
  @HttpCode(200)
  async lookup(
    @Req() req: Request,
    @Body(new ZodPipe(publicLookupSchema)) b: Out<typeof publicLookupSchema>,
  ) {
    const n = await this.findPublic(req, b);
    return this.notices.publicView(n);
  }

  @Post("public/notices/nominate")
  @Public()
  @HttpCode(200)
  async publicNominate(
    @Req() req: Request,
    @Body(new ZodPipe(publicLookupSchema.and(nominationSchema)))
    b: Out<typeof publicLookupSchema> & Out<typeof nominationSchema>,
  ) {
    const n = await this.findPublic(req, b);
    return this.notices.nominate(null, String(n._id), b);
  }

  @Post("public/notices/dispute")
  @Public()
  @HttpCode(200)
  async publicDispute(
    @Req() req: Request,
    @Body(new ZodPipe(publicLookupSchema.and(disputeSchema)))
    b: Out<typeof publicLookupSchema> & Out<typeof disputeSchema>,
  ) {
    const n = await this.findPublic(req, b);
    return this.notices.dispute(null, String(n._id), b);
  }

  private async findPublic(req: Request, b: { noticeNumber: string; idNumber: string }) {
    const ip = req.ip ?? "unknown";
    assertNotBlocked(ip);
    const n = await this.notices.publicLookup(b.noticeNumber, b.idNumber);
    if (!n) {
      recordFailure(ip);
      throw notFound("No notice matches that number and ID number. Check both and try again.");
    }
    return n;
  }
}
