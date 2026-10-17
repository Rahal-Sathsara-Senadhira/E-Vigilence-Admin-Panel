import { HttpError } from "./httpError.js";

// Evidence a staff member attaches must point at storage this system
// controls — otherwise "at least one evidence file" (required to verify,
// i.e. to issue a fine) could be satisfied by any link at all.
//
// Accepted:
//   - this backend's own evidence routes (/api/evidence/<id>,
//     /api/evidence/r2/<key>) on this server's host or a local dev host
//   - the citizen app's GridFS route (/api/media/<id>), same hosts — both
//     apps share the GridFS bucket (see Frontend/src/utils/evidenceUrl.js)
//   - Cloudinary (res.cloudinary.com), where uploads go when configured
//   - any extra host listed in EVIDENCE_ALLOWED_HOSTS (comma-separated),
//     e.g. the citizen app's public API or R2 domain
//
// Only applied to URLs newly attached through the staff API; evidence that
// arrives with an imported citizen report is kept as-is.

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);
const OWN_EVIDENCE_PATH = /^\/api\/(evidence\/(r2\/)?[A-Za-z0-9_-]+|media\/[a-f0-9]{24})$/i;

function extraAllowedHosts() {
  return new Set(
    String(process.env.EVIDENCE_ALLOWED_HOSTS || "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAllowedEvidenceUrl(url, requestHost) {
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  const host = parsed.hostname.toLowerCase();
  if (extraAllowedHosts().has(host) || extraAllowedHosts().has(parsed.host.toLowerCase())) {
    return true;
  }
  if (host === "res.cloudinary.com") return true;

  const ownHost = String(requestHost || "").toLowerCase();
  const isOwnHost = parsed.host.toLowerCase() === ownHost || LOCAL_HOSTS.has(host);
  return isOwnHost && OWN_EVIDENCE_PATH.test(parsed.pathname);
}

// Throws 400 listing any URL in `next` that isn't already in `existing` and
// isn't on allowed storage.
export function assertAllowedEvidence(next, existing, requestHost) {
  const kept = new Set((Array.isArray(existing) ? existing : []).map(String));
  const rejected = (Array.isArray(next) ? next : [])
    .map(String)
    .filter((url) => !kept.has(url) && !isAllowedEvidenceUrl(url, requestHost));

  if (rejected.length > 0) {
    throw new HttpError(
      400,
      `Evidence must be uploaded through this system — not accepted: ${rejected.join(", ")}`
    );
  }
}
