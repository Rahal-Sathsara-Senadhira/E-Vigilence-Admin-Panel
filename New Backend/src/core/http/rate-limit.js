// A small sliding-window limiter, per key (usually the client address).
//
// It lives in memory, which is correct for one API process. Before running
// more than one process, move the counts to MongoDB or Redis (TODO.md).

import { tooManyRequests } from "../errors.js";

/**
 * @param {{ max: number, windowMs: number, message: string }} options
 */
export function createRateLimiter({ max, windowMs, message }) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();

  /** Counts one attempt; throws once the limit is reached. @param {string} key */
  function hit(key, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      throw tooManyRequests(message);
    }
    recent.push(now);
    hits.set(key, recent);
  }

  /**
   * Refuses when the key is already at the limit, without counting this
   * attempt — for limits on failures only (count with `hit` on failure).
   * @param {string} key
   */
  function check(key, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) throw tooManyRequests(message);
  }

  /** Forgets everything — used by tests. */
  function reset() {
    hits.clear();
  }

  /**
   * Express middleware keyed by client address.
   * @param {import("express").Request} req @param {unknown} _res @param {import("express").NextFunction} next
   */
  const middleware = (req, _res, next) => {
    hit(req.ip ?? "unknown");
    next();
  };

  return { hit, check, reset, middleware };
}
