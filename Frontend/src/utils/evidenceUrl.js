// Makes stored evidence URLs loadable from wherever this admin panel runs.
//
// Evidence URLs are stored as absolute links to whichever server created
// them, so some point at a developer's machine:
//   - citizen app, GridFS:  http://localhost:5050/api/media/<fileId>
//   - this app, run locally: http://localhost:8081/api/evidence/...
// Both apps share the same MongoDB and the same GridFS bucket ("evidence"),
// so this backend can serve those files itself at /api/evidence/<fileId>.
// Anything else (citizen R2 links, Cloudinary) is already public and is
// returned unchanged. Stored data is never modified.

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8081").replace(/\/+$/, "");

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function resolveEvidenceUrl(url) {
  if (typeof url !== "string" || !url) return url;

  let parsed;
  try {
    parsed = new URL(url, API_BASE);
  } catch {
    return url;
  }

  // Citizen app GridFS file -> the same file through this backend.
  const gridfs = /^\/api\/media\/([a-f0-9]{24})$/i.exec(parsed.pathname);
  if (gridfs) return `${API_BASE}/api/evidence/${gridfs[1]}`;

  // This backend's own evidence, saved with a local dev host baked in.
  if (parsed.pathname.startsWith("/api/evidence/") && LOCAL_HOSTS.has(parsed.hostname)) {
    return `${API_BASE}${parsed.pathname}`;
  }

  return url;
}

export const resolveEvidenceUrls = (urls) =>
  Array.isArray(urls) ? urls.map(resolveEvidenceUrl) : [];
