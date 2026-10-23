// CSRF protection (docs/19 §6). Browsers can't add a custom header to a
// cross-site form post, so requiring it on every change blocks forged
// requests. Combined with the SameSite=Strict refresh cookie.

import { forbidden } from "../errors.js";

export const CSRF_HEADER = "x-requested-with";
export const CSRF_VALUE = "e-vigilance";
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

/** @type {import("express").RequestHandler} */
export const requireCsrfHeader = (req, _res, next) => {
  if (SAFE.has(req.method) || req.get(CSRF_HEADER) === CSRF_VALUE) return next();
  next(forbidden("This request is missing a security header. Reload the page and try again."));
};
