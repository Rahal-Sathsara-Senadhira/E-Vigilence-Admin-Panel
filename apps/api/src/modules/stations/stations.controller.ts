import { Controller, Get, Query } from "@nestjs/common";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { StationsService } from "./stations.service";

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  divisionId: z.string().optional(),
});

@Controller()
export class StationsController {
  constructor(private readonly stations: StationsService) {}

  @Get("stations")
  @RequirePermission("stations.view")
  list(@Ctx() ctx: ActionContext, @Query(new ZodPipe(listQuery)) query: z.infer<typeof listQuery>) {
    return this.stations.list(ctx, query);
  }

  @Get("divisions")
  @RequirePermission("stations.view")
  divisions() {
    return this.stations.listDivisions();
  }
}
