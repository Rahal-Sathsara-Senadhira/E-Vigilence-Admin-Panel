// Cross-origin calls from the admin panel's own address only (WEB_ORIGIN).
// Normally the panel reaches the API through its host's proxy (same
// origin, no CORS needed); this allows direct calls — large evidence
// uploads, which a proxy may cap. Credentials (cookies) are never allowed
// cross-origin: these calls carry the sign-in token in a header instead.

/** @param {string} origin @returns {import("express").RequestHandler} */
export function allowOrigin(origin) {
  return (req, res, next) => {
    if (req.get("origin") !== origin) return next();
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.method !== "OPTIONS") return next();
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "authorization, content-type, x-requested-with");
    res.setHeader("Access-Control-Max-Age", "600");
    res.status(204).end();
  };
}
