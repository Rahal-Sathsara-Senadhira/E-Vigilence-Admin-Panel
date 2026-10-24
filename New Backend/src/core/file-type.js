// What a file really is, from its first bytes — never from its name or the
// type the sender claims (docs/19 §6). Only these kinds are accepted.

/** @typedef {{ kind: "photo" | "video" | "audio", mime: string, ext: string }} FileType */

/** @param {Buffer} b @param {number} at @param {string} text */
const ascii = (b, at, text) => b.subarray(at, at + text.length).toString("latin1") === text;

/**
 * @param {Buffer} head at least the first 16 bytes
 * @returns {FileType | null}
 */
export function sniffFileType(head) {
  if (head.length < 12) return null;
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff)
    return { kind: "photo", mime: "image/jpeg", ext: "jpg" };
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { kind: "photo", mime: "image/png", ext: "png" };
  }
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WEBP"))
    return { kind: "photo", mime: "image/webp", ext: "webp" };
  if (ascii(head, 0, "RIFF") && ascii(head, 8, "WAVE"))
    return { kind: "audio", mime: "audio/wav", ext: "wav" };
  if (ascii(head, 0, "OggS")) return { kind: "audio", mime: "audio/ogg", ext: "ogg" };
  if (ascii(head, 0, "#!AMR")) return { kind: "audio", mime: "audio/amr", ext: "amr" };
  if (ascii(head, 0, "ID3") || (head[0] === 0xff && ((head[1] ?? 0) & 0xe0) === 0xe0)) {
    return { kind: "audio", mime: "audio/mpeg", ext: "mp3" };
  }
  if (ascii(head, 4, "ftyp")) {
    const brand = head.subarray(8, 12).toString("latin1");
    if (["heic", "heix", "mif1", "msf1"].includes(brand))
      return { kind: "photo", mime: "image/heic", ext: "heic" };
    if (brand.startsWith("M4A")) return { kind: "audio", mime: "audio/mp4", ext: "m4a" };
    if (brand === "qt  ") return { kind: "video", mime: "video/quicktime", ext: "mov" };
    if (brand.startsWith("3g")) return { kind: "video", mime: "video/3gpp", ext: "3gp" };
    return { kind: "video", mime: "video/mp4", ext: "mp4" };
  }
  return null;
}

/** Size limits per kind — docs/11 §4. */
export const MAX_BYTES = {
  photo: 25 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  audio: 100 * 1024 * 1024,
};
