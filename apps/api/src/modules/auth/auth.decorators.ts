// Every endpoint must say who may call it. The permission guard denies any
// endpoint that declares none of these (deny by default).

import { SetMetadata } from "@nestjs/common";
import type { Permission, Scope } from "@ev/shared";

export const PUBLIC_KEY = "ev:public";
export const SIGNED_IN_KEY = "ev:signedIn";
export const PERMISSION_KEY = "ev:permission";
export const ALLOW_PASSWORD_CHANGE_PENDING_KEY = "ev:allowPasswordChangePending";

/** No sign-in needed (health check, sign-in itself). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/** Any signed-in staff member (their own profile, sign out). */
export const SignedIn = () => SetMetadata(SIGNED_IN_KEY, true);

export interface PermissionRequirement {
  permission: Permission;
  /** Require at least this scope — e.g. "all" for national-only actions. */
  scope?: Scope;
}

/** A permission from the matrix in docs/01 §6. */
export const RequirePermission = (permission: Permission, opts: { scope?: Scope } = {}) =>
  SetMetadata(PERMISSION_KEY, { permission, scope: opts.scope } satisfies PermissionRequirement);

/** Still reachable while the user must change a temporary password. */
export const AllowWhilePasswordChangePending = () =>
  SetMetadata(ALLOW_PASSWORD_CHANGE_PENDING_KEY, true);
