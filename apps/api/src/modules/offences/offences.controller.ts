import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { offenceCodeSchema, offenceVersionSchema } from "@ev/shared";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { OffencesService } from "./offences.service";

const listQuery = z.object({ includeInactive: z.enum(["true", "false"]).optional() });
const createBody = z.object({ code: offenceCodeSchema }).and(offenceVersionSchema);

@Controller("offences")
export class OffencesController {
  constructor(private readonly offences: OffencesService) {}

  @Get()
  @RequirePermission("offences.view")
  list(@Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.offences.list({ includeInactive: query.includeInactive === "true" });
  }

  /** Exactly what the mobile app sees (docs/11 §3) — for HQ to check before publishing changes. */
  @Get("public")
  @RequirePermission("offences.view")
  publicList() {
    return this.offences.publicList();
  }

  @Get(":code/history")
  @RequirePermission("offences.view")
  history(@Param("code") code: string) {
    return this.offences.history(code);
  }

  @Post()
  @RequirePermission("offences.manage")
  create(
    @Ctx() ctx: ActionContext,
    @Body(new ZodPipe(createBody)) body: z.output<typeof createBody>,
  ) {
    const { code, ...input } = body;
    return this.offences.create(ctx, code, input);
  }

  @Put(":code")
  @RequirePermission("offences.manage")
  update(
    @Ctx() ctx: ActionContext,
    @Param("code") code: string,
    @Body(new ZodPipe(offenceVersionSchema)) body: z.output<typeof offenceVersionSchema>,
  ) {
    return this.offences.update(ctx, code, body);
  }
}
