import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import {
  changeRoleSchema,
  createUserSchema,
  listUsersQuerySchema,
  reasonSchema,
  updateUserSchema,
} from "@ev/shared";
import type { z } from "zod";
import { Ctx, type ActionContext } from "../../common/context";
import { ZodPipe } from "../../common/zod.pipe";
import { RequirePermission } from "../auth/auth.decorators";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission("users.view")
  list(
    @Ctx() ctx: ActionContext,
    @Query(new ZodPipe(listUsersQuerySchema)) query: z.output<typeof listUsersQuerySchema>,
  ) {
    return this.users.list(ctx, query);
  }

  @Get(":id")
  @RequirePermission("users.view")
  get(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.users.get(ctx, id);
  }

  @Post()
  @RequirePermission("users.manage")
  create(
    @Ctx() ctx: ActionContext,
    @Body(new ZodPipe(createUserSchema)) body: z.output<typeof createUserSchema>,
  ) {
    return this.users.create(ctx, body);
  }

  @Patch(":id")
  @RequirePermission("users.manage")
  update(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(updateUserSchema)) body: z.output<typeof updateUserSchema>,
  ) {
    return this.users.update(ctx, id, body);
  }

  @Post(":id/role")
  @HttpCode(200)
  @RequirePermission("users.manage", { scope: "all" })
  changeRole(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(changeRoleSchema)) body: z.output<typeof changeRoleSchema>,
  ) {
    return this.users.changeRole(ctx, id, body);
  }

  @Post(":id/deactivate")
  @HttpCode(200)
  @RequirePermission("users.manage")
  deactivate(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.users.deactivate(ctx, id, body.reason);
  }

  @Post(":id/reactivate")
  @HttpCode(200)
  @RequirePermission("users.manage")
  reactivate(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.users.reactivate(ctx, id, body.reason);
  }

  @Post(":id/reset-password")
  @HttpCode(200)
  @RequirePermission("users.manage")
  resetPassword(@Ctx() ctx: ActionContext, @Param("id") id: string) {
    return this.users.resetPassword(ctx, id);
  }

  @Post(":id/reset-mfa")
  @HttpCode(200)
  @RequirePermission("users.manage", { scope: "all" })
  resetMfa(
    @Ctx() ctx: ActionContext,
    @Param("id") id: string,
    @Body(new ZodPipe(reasonSchema)) body: z.output<typeof reasonSchema>,
  ) {
    return this.users.resetMfa(ctx, id, body.reason);
  }
}
