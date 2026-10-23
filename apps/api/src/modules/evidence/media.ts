// Viewing copies with ffmpeg (ported from the old system): phone video is
// shrunk to 720p-class H.264 so a minute of 4K (~350 MB) becomes a few MB,
// still clear enough to read a plate. The original is always kept as well
// (docs/10 §3.1, D06-4) — the viewing copy is only for everyday review.

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const VIDEO_MAX_SIDE = 1280;
const VIDEO_CRF = 28;
const AUDIO_BITRATE = "96k";
const TIMEOUT_MS = 20 * 60_000;

let resolved: string | null | undefined;

/** ffmpeg from FFMPEG_PATH, then the bundled ffmpeg-static binary, then the PATH. */
export function ffmpegPath(): string | null {
  if (resolved !== undefined) return resolved;
  let bundled: string | null;
  try {
    // Resolved from the API package folder (the working directory in dev, tests and the start script).
    bundled = createRequire(join(process.cwd(), "package.json"))("ffmpeg-static") as string | null;
  } catch {
    bundled = null;
  }
  resolved = null;
  for (const candidate of [process.env.FFMPEG_PATH, bundled, "ffmpeg"]) {
    if (!candidate) continue;
    if (candidate !== "ffmpeg" && !existsSync(candidate)) continue;
    if (spawnSync(candidate, ["-version"], { stdio: "ignore", timeout: 10_000 }).status === 0) {
      resolved = candidate;
      break;
    }
  }
  return resolved;
}

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath();
    if (!bin) return reject(new Error("ffmpeg is not available"));
    const proc = spawn(bin, ["-hide_banner", "-nostdin", "-y", ...args]);
    let tail = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Processing took too long"));
    }, TIMEOUT_MS);
    proc.stderr.on("data", (chunk: Buffer) => {
      tail = (tail + chunk.toString()).slice(-2000);
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${tail.split("\n").slice(-3).join(" ").trim()}`,
          ),
        );
    });
  });
}

/** → H.264/AAC MP4, longest side at most 1280 px (never upscaled), streamable. */
export function compressVideo(input: string, output: string) {
  const scale = `scale=w='if(gte(iw,ih),min(${VIDEO_MAX_SIDE},iw),-2)':h='if(gte(iw,ih),-2,min(${VIDEO_MAX_SIDE},ih))'`;
  return run([
    "-i",
    input,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "0",
    "-vf",
    scale,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(VIDEO_CRF),
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    output,
  ]);
}

/** → AAC in M4A (~0.7 MB per minute). */
export function compressAudio(input: string, output: string) {
  return run([
    "-i",
    input,
    "-vn",
    "-map_metadata",
    "0",
    "-c:a",
    "aac",
    "-b:a",
    AUDIO_BITRATE,
    "-movflags",
    "+faststart",
    output,
  ]);
}

/** Test helper: a short generated video, when ffmpeg is available. */
export function makeTestVideo(output: string, seconds = 1) {
  return run([
    "-f",
    "lavfi",
    "-i",
    `testsrc=size=1920x1080:rate=25:duration=${seconds}`,
    "-pix_fmt",
    "yuv420p",
    "-c:v",
    "libx264",
    output,
  ]);
}
