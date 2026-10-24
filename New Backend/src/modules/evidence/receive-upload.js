// Receives one evidence file — from a multipart request (staff uploads) or
// any stream (the mobile-app import): streams it to a temporary file while
// computing its SHA-256 and reading its first bytes, so the real type and
// size are known before anything is stored.

import busboy from "busboy";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MAX_BYTES, sniffFileType } from "#src/core/file-type.js";
import { AppError, validationError } from "#src/core/errors.js";

const LARGEST = Math.max(...Object.values(MAX_BYTES));

/**
 * @typedef {object} ReceivedFile
 * @property {string} tempPath
 * @property {string} sha256
 * @property {number} size
 * @property {import("#src/core/file-type.js").FileType} type
 * @property {string | null} originalName
 * @property {() => Promise<void>} cleanUp
 * @property {Record<string, string>} [fields] text fields sent with the file (multipart forms)
 */

const tooLarge = () => new AppError(413, "too_large", "The file is larger than 500 MB.");

/**
 * Receives a file from a stream. Rejects files that aren't a photo, video
 * or audio by their content, and files over the limit for their kind.
 * @param {NodeJS.ReadableStream} stream
 * @param {string | null} originalName
 * @returns {Promise<ReceivedFile>}
 */
export async function receiveStream(stream, originalName) {
  const tempPath = path.join(os.tmpdir(), `ev-upload-${randomUUID()}`);
  const cleanUp = () => rm(tempPath, { force: true });
  const hash = createHash("sha256");
  /** @type {Buffer[]} */
  const head = [];
  let headLength = 0;
  let size = 0;
  const inspect = new Transform({
    transform(/** @type {Buffer} */ chunk, _enc, done) {
      size += chunk.length;
      if (size > LARGEST) {
        done(tooLarge());
        return;
      }
      hash.update(chunk);
      if (headLength < 64) {
        head.push(chunk.subarray(0, 64 - headLength));
        headLength += Math.min(chunk.length, 64 - headLength);
      }
      done(null, chunk);
    },
  });
  try {
    await pipeline(stream, inspect, createWriteStream(tempPath));
    const type = sniffFileType(Buffer.concat(head));
    if (!type)
      throw validationError({ file: "This isn't a photo, video or audio file we can accept." });
    if (size > MAX_BYTES[type.kind]) {
      const mb = MAX_BYTES[type.kind] / 1024 / 1024;
      throw new AppError(
        413,
        "too_large",
        `${type.kind[0]?.toUpperCase()}${type.kind.slice(1)}s can be up to ${mb} MB.`,
      );
    }
    return {
      tempPath,
      sha256: hash.digest("hex"),
      size,
      type,
      originalName: originalName?.slice(0, 200) || null,
      cleanUp,
    };
  } catch (err) {
    await cleanUp();
    throw err;
  }
}

/**
 * Receives the one file of a multipart form upload.
 * @param {import("express").Request} req
 * @returns {Promise<ReceivedFile>}
 */
export function receiveUpload(req) {
  return new Promise((resolve, reject) => {
    if (!req.is("multipart/form-data")) {
      reject(validationError({ file: "Send the file as a form upload." }));
      return;
    }
    /** @type {Promise<ReceivedFile> | null} */
    let received = null;
    /** @type {Record<string, string>} */
    const fields = {};
    // One byte over the largest limit, so `receiveStream` sees the overflow.
    const bb = busboy({
      headers: req.headers,
      limits: { files: 1, fileSize: LARGEST + 1, fields: 12, fieldSize: 4000 },
    });
    bb.on("file", (_field, file, info) => {
      received = receiveStream(file, info.filename ?? null);
      // Settled in "close"; avoid an unhandled rejection meanwhile.
      received.catch(() => {});
    });
    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    bb.on("error", (err) => reject(err));
    bb.on("close", () => {
      if (!received) reject(validationError({ file: "Choose a file to upload." }));
      else received.then((file) => resolve({ ...file, fields }), reject);
    });
    req.pipe(bb);
  });
}
