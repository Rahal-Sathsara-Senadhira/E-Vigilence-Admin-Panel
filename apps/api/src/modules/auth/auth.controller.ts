import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  changePasswordSchema,
  loginSchema,
  mfaSetupSchema,
  mfaVerifySchema,
  type ChangePasswordInput,
  type LoginInput,
  type LoginResult,
  type MfaVerifyInput,
} from "@ev/shared";
import type { CookieOptions, Request, Response } from "express";
import { ENV, type Env } from "../../config/env";
import { Ctx, requireUser, type ActionContext, type EvRequest } from "../../common/context";
import { forbidden } from "../../common/errors";
import { ZodPipe } from "../../common/zod.pipe";
import { AllowWhilePasswordChangePending, Public, SignedIn } from "./auth.decorators";
import { AuthService, type IssuedSession } from "./auth.service";

export const REFRESH_COOKIE = "ev_rt";
const COOKIE_PATH = "/api/v1/auth";

// Sign-in attempts per IP per minute, on top of the per-account lock.
const SIGN_IN_LIMIT = {
  default: { limit: process.env.NODE_ENV === "test" ? 1_000 : 10, ttl: 60_000 },
};

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("login")
  @Public()
  @HttpCode(200)
  @Throttle(SIGN_IN_LIMIT)
  async login(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
  ): Promise<LoginResult> {
    const outcome = await this.auth.login(ctx, body, userAgentOf(req));
    if (outcome.status !== "signedIn") return outcome;
    return { status: "signedIn", session: this.issue(res, outcome.issued) };
  }

  @Post("mfa/verify")
  @Public()
  @HttpCode(200)
  @Throttle(SIGN_IN_LIMIT)
  async verifyMfa(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
  ): Promise<LoginResult> {
    const issued = await this.auth.verifyMfa(ctx, body.challengeToken, body.code, userAgentOf(req));
    return { status: "signedIn", session: this.issue(res, issued) };
  }

  @Post("mfa/setup")
  @Public()
  @HttpCode(200)
  @Throttle(SIGN_IN_LIMIT)
  beginMfaSetup(@Body(new ZodPipe(mfaSetupSchema)) body: { challengeToken: string }) {
    return this.auth.beginMfaSetup(body.challengeToken);
  }

  @Post("mfa/setup/confirm")
  @Public()
  @HttpCode(200)
  @Throttle(SIGN_IN_LIMIT)
  async completeMfaSetup(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(mfaVerifySchema)) body: MfaVerifyInput,
  ): Promise<LoginResult> {
    const issued = await this.auth.completeMfaSetup(
      ctx,
      body.challengeToken,
      body.code,
      userAgentOf(req),
    );
    return { status: "signedIn", session: this.issue(res, issued) };
  }

  /** Exchanges the refresh cookie for a new access token, rotating the cookie. */
  @Post("refresh")
  @Public()
  @HttpCode(200)
  async refresh(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertSameSiteRequest(req);
    try {
      return this.issue(res, await this.auth.refresh(ctx, req.cookies?.[REFRESH_COOKIE]));
    } catch (err) {
      if ((err as { getStatus?: () => number }).getStatus?.() === 401) this.clear(res);
      throw err;
    }
  }

  @Post("logout")
  @Public()
  @HttpCode(204)
  async logout(
    @Ctx() ctx: ActionContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertSameSiteRequest(req);
    await this.auth.logout(ctx, req.cookies?.[REFRESH_COOKIE]);
    this.clear(res);
  }

  @Get("me")
  @SignedIn()
  @AllowWhilePasswordChangePending()
  me(@Ctx() ctx: ActionContext) {
    return this.auth.me(requireUser(ctx).id);
  }

  @Post("change-password")
  @SignedIn()
  @AllowWhilePasswordChangePending()
  @HttpCode(200)
  @Throttle(SIGN_IN_LIMIT)
  async changePassword(
    @Ctx() ctx: ActionContext,
    @Req() req: EvRequest,
    @Res({ passthrough: true }) res: Response,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    const issued = await this.auth.changePassword(ctx, requireUser(ctx), req.auth!.sessionId, body);
    return this.issue(res, issued);
  }

  private cookieOptions(expires?: Date): CookieOptions {
    return {
      httpOnly: true,
      secure: this.env.COOKIE_SECURE,
      sameSite: "strict",
      path: COOKIE_PATH,
      ...(expires ? { expires } : {}),
    };
  }

  private issue(res: Response, issued: IssuedSession) {
    res.cookie(REFRESH_COOKIE, issued.refreshToken, this.cookieOptions(issued.refreshExpiresAt));
    return issued.payload;
  }

  private clear(res: Response) {
    res.clearCookie(REFRESH_COOKIE, this.cookieOptions());
  }
}

function userAgentOf(req: Request) {
  return req.headers["user-agent"] ?? null;
}

/**
 * The cookie routes need a custom header that a cross-site form or image
 * can't send (and CORS refuses for other origins) — together with
 * SameSite=Strict this blocks cross-site request forgery.
 */
function assertSameSiteRequest(req: Request) {
  if (req.headers["x-requested-with"] !== "e-vigilance") {
    throw forbidden("Missing request header.", "csrf_header_missing");
  }
}
