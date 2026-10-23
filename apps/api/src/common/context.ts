// Who is acting and from where — passed from controllers to services so every
// write can record its actor (docs/01 R5) and source (docs/10 §4.1).

import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuditActor, Scope, StaffRole } from "@ev/shared";
import type { Request } from "express";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  stationId: string | null;
  mustChangePassword: boolean;
}

export interface RequestSource {
  ip: string | null;
  app: string | null;
}

export interface ActionContext {
  user: AuthenticatedUser | null;
  actor: AuditActor;
  source: RequestSource;
  /** Scope granted by the permission guard for this endpoint, when it has one. */
  scope: Scope | null;
}

export interface EvRequest extends Request {
  auth?: { user: AuthenticatedUser; sessionId: string };
  grantScope?: Scope | null;
}

const KNOWN_APPS = new Set(["web", "pay", "mobile"]);

export function sourceOf(req: Request): RequestSource {
  const app = String(req.headers["x-ev-app"] ?? "");
  return { ip: req.ip ?? null, app: KNOWN_APPS.has(app) ? app : "api" };
}

export function actorOf(user: AuthenticatedUser | null): AuditActor {
  if (!user) return { kind: "anonymous" };
  return { kind: "user", userId: user.id, role: user.role, stationId: user.stationId };
}

export function contextOf(req: EvRequest): ActionContext {
  const user = req.auth?.user ?? null;
  return { user, actor: actorOf(user), source: sourceOf(req), scope: req.grantScope ?? null };
}

/** Controller parameter: `@Ctx() ctx: ActionContext`. */
export const Ctx = createParamDecorator((_: unknown, host: ExecutionContext) =>
  contextOf(host.switchToHttp().getRequest<EvRequest>()),
);

/** A system job acting on its own (docs/01 §4.7). */
export function systemContext(job: string): ActionContext {
  return {
    user: null,
    actor: { kind: "system", label: job },
    source: { ip: null, app: "system" },
    scope: "all",
  };
}

/** Narrow `ctx.user` for endpoints that require sign-in. */
export function requireUser(ctx: ActionContext): AuthenticatedUser {
  if (!ctx.user) throw new Error("requireUser called on an unauthenticated context");
  return ctx.user;
}
