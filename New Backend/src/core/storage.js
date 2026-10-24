// File storage for evidence — docs/10 §3. Two drivers with one interface:
//   r2     Cloudflare R2 (S3 API), every key under R2_PREFIX
//   local  a folder on disk — development and tests
// Files are written once and never changed (E1).

import { AwsClient } from "aws4fetch";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

/**
 * @typedef {object} Storage
 * @property {"r2" | "local"} driver
 * @property {(key: string, filePath: string, contentType: string) => Promise<void>} putFile
 * @property {(key: string) => Promise<{ stream: import("node:stream").Readable, size: number | null }>} get
 * @property {(key: string) => Promise<void>} remove
 */

/**
 * @param {{ driver: "r2" | "local", localDir?: string, r2?: { endpoint: string, accessKey: string, secretKey: string, bucket: string, prefix: string } }} options
 * @returns {Storage}
 */
export function createStorage(options) {
  if (options.driver === "r2")
    return r2Storage(/** @type {NonNullable<typeof options.r2>} */ (options.r2));
  return localStorage(options.localDir ?? path.resolve(".data/evidence"));
}

/** @param {string} root @returns {Storage} */
function localStorage(root) {
  /** Keys never escape the folder. @param {string} key */
  const fileOf = (key) => {
    const full = path.resolve(root, key);
    if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid storage key.");
    return full;
  };
  return {
    driver: "local",
    async putFile(key, filePath) {
      const target = fileOf(key);
      await mkdir(path.dirname(target), { recursive: true });
      await pipeline(createReadStream(filePath), createWriteStream(target, { flags: "wx" }));
    },
    async get(key) {
      const target = fileOf(key);
      const info = await stat(target);
      return { stream: createReadStream(target), size: info.size };
    },
    async remove(key) {
      await rm(fileOf(key), { force: true });
    },
  };
}

/** @param {{ endpoint: string, accessKey: string, secretKey: string, bucket: string, prefix: string }} c @returns {Storage} */
function r2Storage(c) {
  const client = new AwsClient({
    accessKeyId: c.accessKey,
    secretAccessKey: c.secretKey,
    service: "s3",
    region: "auto",
  });
  const urlOf = (/** @type {string} */ key) =>
    `${c.endpoint.replace(/\/$/, "")}/${encodeURIComponent(c.bucket)}/${(c.prefix + key).split("/").map(encodeURIComponent).join("/")}`;
  return {
    driver: "r2",
    async putFile(key, filePath, contentType) {
      const { size } = await stat(filePath);
      const res = await client.fetch(urlOf(key), {
        method: "PUT",
        // A file stream with a known length: R2 needs Content-Length.
        body: /** @type {any} */ (Readable.toWeb(createReadStream(filePath))),
        headers: {
          "content-type": contentType,
          "content-length": String(size),
          "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
        },
        // @ts-ignore — Node's fetch needs this for a streamed body
        duplex: "half",
      });
      if (!res.ok) throw new Error(`Storage refused the file (${res.status}).`);
    },
    async get(key) {
      const res = await client.fetch(urlOf(key));
      if (!res.ok || !res.body)
        throw new Error(`Storage couldn't return the file (${res.status}).`);
      const size = Number(res.headers.get("content-length")) || null;
      return { stream: Readable.fromWeb(/** @type {any} */ (res.body)), size };
    },
    async remove(key) {
      const res = await client.fetch(urlOf(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404)
        throw new Error(`Storage couldn't delete the file (${res.status}).`);
    },
  };
}
