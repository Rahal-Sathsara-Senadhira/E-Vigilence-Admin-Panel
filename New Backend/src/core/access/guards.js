// Route guards — docs/20 R1 (deny by default), S6 (read-only roles).
//
// Every route uses exactly one of:
//   publicRoute()              anyone, signed in or not
//   signedIn()                 any signed-in user (their own profile, sign-out…)
//   requirePermission(name)    a permission from the matrix; sets req.scope
//
// `assertEveryRouteGuarded(app)` runs at start-up and refuses to start the
// server if any route has none of them.

import { forbidden, unauthorized } from "../errors.js";
import { isPermission, scopeOf } from "./permissions.js";
import { roleInfo } from "./roles.js";

const GUARD = Symbol("accessGuard");
const READS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * @param {import("express").RequestHandler} handler
 * @param {string} description
 */
function mark(handler, description) {
  /** @type {any} */ (handler)[GUARD] = description;
  return handler;
}

export const publicRoute = () => mark((_req, _res, next) => next(), "public");

export const signedIn = () =>
  mark((req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    next();
  }, "signed in");

/** @param {import("./permissions.js").Permission} permission */
export function requirePermission(permission) {
  if (!isPermission(permission)) throw new Error(`Unknown permission "${permission}".`);
  return mark((req, _res, next) => {
    if (!req.auth) return next(unauthorized());
    const scope = scopeOf(req.auth.role, permission);
    if (!scope) return next(forbidden());
    if (!READS.has(req.method) && (scope === "R" || roleInfo(req.auth.role).readOnly)) {
      return next(forbidden("Your role can view this but not change it."));
    }
    req.scope = scope;
    next();
  }, `permission ${permission}`);
}

/**
 * Lists every route without a guard. Walks Express 5's router tree.
 * @param {import("express").Express} app
 * @returns {string[]} "METHOD /path" for each unguarded route (paths relative to their router)
 */
export function unguardedRoutes(app) {
  /** @type {string[]} */
  const missing = [];
  /** @param {any} router @param {string} prefix */
  const walk = (router, prefix) => {
    for (const layer of router?.stack ?? []) {
      if (layer.route) {
        const guarded = layer.route.stack.some((/** @type {any} */ l) => l.handle?.[GUARD]);
        if (!guarded) {
          for (const method of Object.keys(layer.route.methods)) {
            missing.push(`${method.toUpperCase()} ${prefix}${layer.route.path}`);
          }
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle, prefix);
      }
    }
  };
  walk(/** @type {any} */ (app).router, "");
  return missing;
}

/** @param {import("express").Express} app */
export function assertEveryRouteGuarded(app) {
  const missing = unguardedRoutes(app);
  if (missing.length) {
    throw new Error(`These routes don't declare who may use them:\n  ${missing.join("\n  ")}`);
  }
}
