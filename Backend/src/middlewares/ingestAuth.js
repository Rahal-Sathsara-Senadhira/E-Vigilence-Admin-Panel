// Machine-to-machine auth for the separate citizen-reporting backend to push
// violations into this system. Not a user session — no JWT, no cookie — just
// a shared secret in a header, checked against an env var.
//
// Fails closed: if INGEST_API_KEY isn't configured at all, every request is
// rejected rather than silently accepted (same spirit as the JWT_SECRET
// production guard in config/env.js).

export function requireIngestKey(req, res, next) {
  const configuredKey = process.env.INGEST_API_KEY;

  if (!configuredKey) {
    return res
      .status(401)
      .json({ message: "Ingestion is not configured on this server" });
  }

  const providedKey = req.headers["x-ingest-key"];

  if (!providedKey || providedKey !== configuredKey) {
    return res.status(401).json({ message: "Invalid or missing ingest key" });
  }

  next();
}
