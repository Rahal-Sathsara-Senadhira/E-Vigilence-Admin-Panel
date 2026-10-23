// /api/v1/auth — docs/20 §9.

import { Router } from "express";
import { publicRoute, signedIn } from "#src/core/access/guards.js";
import { createRateLimiter } from "#src/core/http/rate-limit.js";
import { body } from "#src/core/http/validate.js";
import { createAuthController } from "./auth.controller.js";
import {
  changePasswordSchema,
  firstPasswordSchema,
  mfaSetupConfirmSchema,
  mfaSetupStartSchema,
  signInSchema,
  verifyMfaSchema,
} from "./auth.schemas.js";

// Per network address, on top of the per-account lock (docs/20 §9).
export const signInLimiter = createRateLimiter({
  max: 30,
  windowMs: 15 * 60_000,
  message: "Too many sign-in attempts from this network. Wait 15 minutes and try again.",
});

/**
 * @param {import("./auth.service.js").AuthService} auth
 * @param {{ secureCookies: boolean }} options
 */
export function authRoutes(auth, options) {
  const c = createAuthController(auth, options);
  const limited = signInLimiter.middleware;
  const router = Router();

  router.post("/sign-in", publicRoute(), limited, body(signInSchema), c.signIn);
  router.post("/mfa/verify", publicRoute(), limited, body(verifyMfaSchema), c.verifyMfa);
  router.post(
    "/password/first",
    publicRoute(),
    limited,
    body(firstPasswordSchema),
    c.setFirstPassword,
  );
  router.post(
    "/mfa/setup/start",
    publicRoute(),
    limited,
    body(mfaSetupStartSchema),
    c.startMfaSetup,
  );
  router.post(
    "/mfa/setup/confirm",
    publicRoute(),
    limited,
    body(mfaSetupConfirmSchema),
    c.confirmMfaSetup,
  );
  router.post("/refresh", publicRoute(), c.refresh);
  router.post("/sign-out", publicRoute(), c.signOut);

  router.get("/me", signedIn(), c.me);
  router.post("/password", signedIn(), body(changePasswordSchema), c.changePassword);
  router.get("/sessions", signedIn(), c.sessions);
  router.post("/sign-out-everywhere", signedIn(), c.signOutEverywhere);

  return router;
}
