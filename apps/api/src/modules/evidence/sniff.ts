// A file's real type from its first bytes ("magic numbers") — never from the
// name or the Content-Type the browser sent. Only formats evidence may use
// are recognised; anything else returns null. (Ported from the old system.)

const ascii = (buf: Buffer, start: number, end: number) =>
  buf.subarray(start, end).toString("latin1");

export function sniffMime(buf: Buffer): string | null {
  if (!buf || buf.length < 12) return null;

  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
    return "image/png";
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") return "image/gif";

  if (ascii(buf, 0, 4) === "RIFF") {
    const form = ascii(buf, 8, 12);
    if (form === "WEBP") return "image/webp";
    if (form === "WAVE") return "audio/wav";
    if (form === "AVI ") return "video/x-msvideo";
    return null;
  }

  // ISO base media (MP4 / MOV / M4A): "ftyp" box at offset 4, brand after it.
  if (ascii(buf, 4, 8) === "ftyp") {
    const brand = ascii(buf, 8, 12);
    if (brand === "qt  ") return "video/quicktime";
    if (brand === "M4A " || brand === "M4B ") return "audio/mp4";
    return "video/mp4";
  }

  if (buf[0] === 0x00 && buf[1] === 0x00 && buf[2] === 0x01 && (buf[3] === 0xba || buf[3] === 0xb3))
    return "video/mpeg";
  if (ascii(buf, 0, 4) === "OggS") return "audio/ogg";
  if (ascii(buf, 0, 3) === "ID3") return "audio/mpeg";
  if (buf[0] === 0xff && ((buf[1] ?? 0) & 0xf0) === 0xf0) {
    // ADTS AAC has layer bits 00; MPEG audio (MP3) doesn't.
    return ((buf[1] ?? 0) & 0x06) === 0 ? "audio/aac" : "audio/mpeg";
  }
  return null;
}
