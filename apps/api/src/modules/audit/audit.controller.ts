import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { AuditService } from "./audit.service";

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  action: z.string().trim().max(100).optional(),
  targetType: z.string().trim().max(50).optional(),
  targetId: z.string().trim().max(50).optional(),
});

@Controller("audit")
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @RequirePermission("audit.view")
  list(@Ctx() ctx: ActionContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.audit.list(ctx, query);
  }

  /** Runs the chain check now (HQ and dev — national audit scope). */
  @Get("verify")
  @RequirePermission("audit.view", { scope: "all" })
  async verify(@Ctx() ctx: ActionContext) {
    const status = await this.audit.verifyChain();
    await this.audit.record(ctx, {
      action: "audit.chain_checked",
      summary: status.ok
        ? `Chain intact (${status.checked} entries)`
        : `Chain broken at entry ${status.brokenAtSeq}`,
    });
    return status;
  }
}
