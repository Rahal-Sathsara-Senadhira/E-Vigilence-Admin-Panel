import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { updateTimeLimitSchema } from "@ev/shared";
import type { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission, SignedIn } from "../auth/auth.decorators";
import { TimeLimitsService } from "./time-limits.service";

@Controller("settings/time-limits")
export class SettingsController {
  constructor(private readonly limits: TimeLimitsService) {}

  /** Every staff member may see the limits they work to. */
  @Get()
  @SignedIn()
  list() {
    return this.limits.list();
  }

  @Get(":key/history")
  @SignedIn()
  history(@Param("key") key: string) {
    return this.limits.history(key);
  }

  /** HQ only, with a reason; applies to items that start after the change (D09-8). */
  @Put(":key")
  @RequirePermission("settings.timeLimits")
  update(
    @Ctx() ctx: ActionContext,
    @Param("key") key: string,
    @Body(new ZodPipe(updateTimeLimitSchema)) body: z.output<typeof updateTimeLimitSchema>,
  ) {
    return this.limits.update(ctx, key, body.value, body.reason);
  }
}
