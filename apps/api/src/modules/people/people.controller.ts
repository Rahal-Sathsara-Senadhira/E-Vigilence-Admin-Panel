import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { normalizePlate, personSchema, personSearchSchema, vehicleFlagSchema } from "@ev/shared";
import { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { badRequest, notFound } from "../../common/errors";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { PeopleService } from "./people.service";

const contactSchema = z.object({
  address: z.string().trim().min(5, "Enter the full postal address.").max(300),
  phone: z.string().trim().max(20).optional(),
});

@Controller()
export class PeopleController {
  constructor(private readonly people: PeopleService) {}

  /** Search before adding someone, so nobody is entered twice (docs/04 P1). Returns masked summaries. */
  @Get("persons/search")
  @RequirePermission("cases.investigate")
  search(@Query(new ZodPipe(personSearchSchema)) query: z.output<typeof personSearchSchema>) {
    return this.people.findMatches(query);
  }

  @Post("persons")
  @RequirePermission("cases.investigate")
  create(
    @Ctx() ctx: ActionContext,
    @Body(new ZodPipe(personSchema)) body: z.output<typeof personSchema>,
  ) {
    return this.people.create(ctx, body);
  }

  @Get("persons/:id")
  @RequirePermission("persons.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.people.get(ctx, id);
  }

  @Patch("persons/:id/contact")
  @RequirePermission("cases.investigate")
  async contact(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(contactSchema)) body: z.output<typeof contactSchema>,
  ) {
    await this.people.updateAddress(ctx, id, body.address, body.phone || null);
    return this.people.get(ctx, id);
  }

  @Get("vehicles")
  @RequirePermission("cases.view")
  async byPlate(@Query("plate") plate: string) {
    const canonical = normalizePlate(plate ?? "");
    if (!canonical)
      throw badRequest("invalid_plate", "Enter a Sri Lankan plate, e.g. WP CAB-1234.");
    const v = await this.people.findVehicleByPlate(canonical);
    if (!v) throw notFound("This vehicle hasn't been traced yet.");
    return v;
  }

  @Get("vehicles/:id")
  @RequirePermission("cases.view")
  vehicle(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.people.getVehicle(ctx, id);
  }

  /** suspected_false_plate / reported_stolen (docs/04 §8). */
  @Post("vehicles/:id/flags")
  @HttpCode(200)
  @RequirePermission("cases.investigate")
  flag(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(vehicleFlagSchema)) body: z.output<typeof vehicleFlagSchema>,
  ) {
    return this.people.setVehicleFlag(ctx, id, body);
  }
}
