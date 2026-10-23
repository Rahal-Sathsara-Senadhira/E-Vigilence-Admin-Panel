import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { EvidenceService } from "./evidence.service";

const uploadQuery = z.object({
  fileName: z.string().trim().min(1).max(200),
  capturedAt: z.coerce.date().optional(),
});
const listQuery = z.object({ reportId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid report id.") });
const originalBody = z.object({ reason: z.string().trim().min(5, "Give a reason.").max(500) });

@Controller("evidence")
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  /**
   * Upload one file as the raw request body (Content-Type: application/octet-stream).
   * It is fingerprinted while it streams in; attach it by id when recording the report.
   */
  @Post()
  @RequirePermission("reports.record")
  upload(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Query(new ZodPipe(uploadQuery)) query: z.output<typeof uploadQuery>,
  ) {
    const length = Number(req.headers["content-length"]);
    return this.evidence.receive(ctx, req, {
      fileName: query.fileName,
      declaredSize: Number.isFinite(length) ? length : null,
      capturedAt: query.capturedAt ?? null,
    });
  }

  @Get()
  @RequirePermission("reports.view")
  list(
    @Ctx() ctx: ActionContext,
    @Query(new ZodPipe(listQuery)) query: z.output<typeof listQuery>,
  ) {
    return this.evidence.listForReport(ctx, query.reportId);
  }

  @Get(":id")
  @RequirePermission("reports.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.evidence.get(ctx, id);
  }

  /** The viewing copy, shown inline. */
  @Get(":id/view")
  @RequirePermission("reports.view")
  async view(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.evidence.openViewing(ctx, id);
    res.set({
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(file.stream);
  }

  /** The untouched original — HQ, with a reason (docs/10 D10-1). POST so the reason isn't in a URL. */
  @Post(":id/original")
  @HttpCode(200)
  @RequirePermission("evidence.viewOriginal")
  async original(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(originalBody)) body: z.output<typeof originalBody>,
    @Res({ passthrough: true }) res: Response,
  ) {
    const file = await this.evidence.openOriginal(ctx, id, body.reason);
    res.set({
      "Content-Type": file.mime,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(file.stream);
  }

  @Get(":id/custody")
  @RequirePermission("reports.view")
  custody(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.evidence.custodyOf(ctx, id);
  }
}
