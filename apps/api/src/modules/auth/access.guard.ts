// One global guard for every request (docs/01 R3, R4; docs/17 §5):
//   1. Public endpoints pass.
//   2. Otherwise a valid access token is required, and the session and the
//      account are re-checked in the database — a deactivated, transferred
//      or signed-out user loses access on their next request.
//   3. The endpoint's permission is looked up in the shared matrix. An
//      endpoint that declares no access rule is refused (deny by default).

import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { InjectModel } from "@nestjs/mongoose";
import { isStaffRole, scopeOf, type Scope } from "@ev/shared";
import type { Model } from "mongoose";
import type { EvRequest } from "../../common/context";
import { ApiError, forbidden, unauthorized } from "../../common/errors";
import { StaffUser } from "../users/user.schema";
import {
  ALLOW_PASSWORD_CHANGE_PENDING_KEY,
  PERMISSION_KEY,
  PUBLIC_KEY,
  SIGNED_IN_KEY,
  type PermissionRequirement,
} from "./auth.decorators";
import { SessionsService } from "./sessions.service";
import { TokensService } from "./tokens.service";

const SCOPE_RANK: Record<Scope, number> = { assigned: 1, station: 2, all: 3 };

@Injectable()
export class AccessGuard implements CanActivate {
  private readonly logger = new Logger(AccessGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    private readonly sessions: SessionsService,
    @InjectModel(StaffUser.name) private readonly users: Model<StaffUser>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const read = <T>(key: string) => this.reflector.getAllAndOverride<T | undefined>(key, targets);

    if (read<boolean>(PUBLIC_KEY)) return true;

    const req = context.switchToHttp().getRequest<EvRequest>();
    await this.authenticate(req);
    const user = req.auth!.user;

    if (user.mustChangePassword && !read<boolean>(ALLOW_PASSWORD_CHANGE_PENDING_KEY)) {
      throw forbidden("Change your temporary password to continue.", "password_change_required");
    }

    const requirement = read<PermissionRequirement>(PERMISSION_KEY);
    if (requirement) {
      const scope = scopeOf(user.role, requirement.permission);
      if (!scope) throw forbidden();
      if (requirement.scope && SCOPE_RANK[scope] < SCOPE_RANK[requirement.scope]) throw forbidden();
      req.grantScope = scope;
      return true;
    }

    if (read<boolean>(SIGNED_IN_KEY)) return true;

    this.logger.error(`No access rule on ${context.getClass().name}.${context.getHandler().name}`);
    throw forbidden("This endpoint has no access rule.", "no_access_rule");
  }

  private async authenticate(req: EvRequest) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) throw unauthorized();

    const claims = await this.tokens.verifyAccess(token);
    if (!claims) throw unauthorized("Your session has expired.", "token_expired");

    const [session, user] = await Promise.all([
      this.sessions.findActive(claims.sessionId),
      this.users.findOne({ _id: claims.userId, staff: true }).lean(),
    ]);
    if (!session || String(session.userId) !== claims.userId) {
      throw unauthorized("Your session has ended. Please sign in again.", "session_expired");
    }
    if (!user || !user.active || !isStaffRole(user.role)) {
      throw new ApiError(401, "account_inactive", "This account is no longer active.");
    }

    req.auth = {
      sessionId: claims.sessionId,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        stationId: user.stationId ? String(user.stationId) : null,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
