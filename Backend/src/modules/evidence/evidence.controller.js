import { getGridFSFileInfo, openGridFSDownloadStream } from "../../utils/gridfsStorage.js";
import { getR2Object } from "../../utils/r2Upload.js";
import { HttpError } from "../../utils/httpError.js";

// Public by design — same trust model as a Cloudinary URL (an unguessable
// id is the access control), so <img>/<video>/<audio> tags can use it
// directly without attaching auth headers or cookies cross-origin.
export async function serveEvidence(req, res) {
  const { id } = req.params;

  const file = await getGridFSFileInfo(id);
  if (!file) throw new HttpError(404, "Evidence file not found");

  res.setHeader("Content-Type", file.metadata?.contentType || file.contentType || "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  // Helmet defaults Cross-Origin-Resource-Policy to "same-origin", which
  // silently blocks the browser (not curl/Postman, which don't enforce it)
  // from loading this in an <img>/<video>/<audio> tag when the frontend
  // runs on a different port than this API — the normal case in dev
  // (5173+ vs 8081) and often in prod too. This endpoint is public by
  // design (see the comment above), so cross-origin embedding is exactly
  // the intended use.
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  const range = req.headers.range;

  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : file.length - 1;

    res.status(206);
    res.setHeader("Content-Range", `bytes ${start}-${end}/${file.length}`);
    res.setHeader("Content-Length", end - start + 1);

    openGridFSDownloadStream(id, { start, end: end + 1 })
      .on("error", () => res.destroy())
      .pipe(res);
    return;
  }

  res.setHeader("Content-Length", file.length);
  openGridFSDownloadStream(id)
    .on("error", () => res.destroy())
    .pipe(res);
}

// Proxies a private R2 object back through this backend — see
// utils/evidenceStorage.js for why the bucket stays private instead of
// using a public bucket URL / custom domain.
export async function serveR2Evidence(req, res) {
  const { encodedKey } = req.params;

  let key;
  try {
    key = Buffer.from(encodedKey, "base64url").toString("utf8");
  } catch {
    throw new HttpError(404, "Evidence file not found");
  }

  let object;
  try {
    object = await getR2Object(key, req.headers.range);
  } catch (err) {
    if (err?.name === "NoSuchKey") throw new HttpError(404, "Evidence file not found");
    throw err;
  }

  res.setHeader("Content-Type", object.ContentType || "application/octet-stream");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  if (object.ContentRange) {
    res.status(206);
    res.setHeader("Content-Range", object.ContentRange);
  }
  if (object.ContentLength != null) {
    res.setHeader("Content-Length", object.ContentLength);
  }

  // In Node.js (this backend's runtime), GetObjectCommand's Body is already
  // a Node Readable stream — pipes directly, no conversion needed.
  object.Body.on("error", () => res.destroy()).pipe(res);
}
