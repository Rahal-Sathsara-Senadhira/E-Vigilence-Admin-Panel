import { spawn, spawnSync } from "child_process";
import fs from "fs";
import ffmpegStatic from "ffmpeg-static";

// Shrinks evidence video/audio with ffmpeg so phone recordings (a minute of
// 4K is ~350 MB) become a few MB, while staying watchable and keeping the
// recording's own metadata (e.g. creation time) via -map_metadata.
//
// ffmpeg is found in this order: FFMPEG_PATH env var, the binary bundled by
// the ffmpeg-static package (downloaded by its install script), then
// `ffmpeg` on the PATH. If none works, evidence is stored uncompressed.

const VIDEO_MAX_SIDE = 1280; // 720p-class: plenty to read a plate, far smaller
const VIDEO_CRF = 28; // x264 quality (lower = better/bigger); 28 suits evidence review
const AUDIO_BITRATE = "96k";
const TIMEOUT_MS = 20 * 60 * 1000;

let resolvedPath;

export function ffmpegPath() {
  if (resolvedPath !== undefined) return resolvedPath;

  const candidates = [process.env.FFMPEG_PATH, ffmpegStatic, "ffmpeg"].filter(Boolean);
  resolvedPath = null;
  for (const candidate of candidates) {
    if (candidate !== "ffmpeg" && !fs.existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ["-version"], { stdio: "ignore", timeout: 10000 });
    if (probe.status === 0) {
      resolvedPath = candidate;
      break;
    }
  }
  if (!resolvedPath) {
    console.warn("⚠️  ffmpeg not found — evidence video/audio will be stored uncompressed");
  }
  return resolvedPath;
}

const toSeconds = (h, m, s) => Number(h) * 3600 + Number(m) * 60 + Number(s);

// Runs ffmpeg, reporting progress (0–1) parsed from its stderr.
function run(args, onProgress) {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath();
    if (!bin) return reject(new Error("ffmpeg is not available"));

    const proc = spawn(bin, ["-hide_banner", "-nostdin", "-y", ...args]);
    let duration = 0;
    let tail = "";

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Compression took too long"));
    }, TIMEOUT_MS);

    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      tail = (tail + text).slice(-4000);

      const d = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
      if (d) duration = toSeconds(d[1], d[2], d[3]);

      const t = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(text);
      if (t && duration > 0) onProgress?.(Math.min(1, toSeconds(t[1], t[2], t[3]) / duration));
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${tail.split("\n").slice(-3).join(" ").trim()}`));
    });
  });
}

// → H.264/AAC MP4, longest side at most VIDEO_MAX_SIDE (never upscaled),
// streamable (+faststart). Works for portrait and landscape.
export function compressVideo(input, output, onProgress) {
  const scale =
    `scale=w='if(gte(iw,ih),min(${VIDEO_MAX_SIDE},iw),-2)':` +
    `h='if(gte(iw,ih),-2,min(${VIDEO_MAX_SIDE},ih))'`;

  return run(
    [
      "-i", input,
      "-map", "0:v:0",
      "-map", "0:a:0?",
      "-map_metadata", "0",
      "-vf", scale,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", String(VIDEO_CRF),
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", AUDIO_BITRATE,
      "-movflags", "+faststart",
      output,
    ],
    onProgress
  );
}

// → AAC in an M4A container (plays everywhere, ~0.7 MB per minute).
export function compressAudio(input, output, onProgress) {
  return run(
    [
      "-i", input,
      "-vn",
      "-map_metadata", "0",
      "-c:a", "aac",
      "-b:a", AUDIO_BITRATE,
      "-movflags", "+faststart",
      output,
    ],
    onProgress
  );
}
