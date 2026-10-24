// A small PDF writer for management reports (docs/12 §7): A4 pages of
// headings, label–value pairs and tables, in Helvetica — one of the 14 fonts
// every PDF reader has, so nothing is embedded and no library is needed.
// Text is measured with Helvetica's published widths, so columns line up,
// long cells are shortened with "…", and a table's header repeats on each
// page. Reports hold counts and record numbers only (no personal data), so
// the Western (WinAnsi) character set is enough.

/**
 * @typedef {object} Section
 * @property {string} heading
 * @property {string} [note]
 * @property {[string, string][]} [pairs]
 * @property {{ head: string[], rows: string[][], align?: ("left" | "right")[], wrap?: number }} [table]
 *   `wrap`: the column whose text wraps onto more lines instead of being shortened
 */
/** @typedef {{ title: string, subtitle: string, sections: Section[] }} ReportDoc */

const PAGE = { w: 595.28, h: 841.89 };
const MARGIN = 48;
const WIDTH = PAGE.w - 2 * MARGIN;

// Advance widths (1/1000 em) for characters 32–126 — Adobe's Helvetica and
// Helvetica-Bold font metrics.
// prettier-ignore
const REGULAR = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

/** Characters outside ASCII that WinAnsi has: code and width. */
const EXTRA = new Map([
  ["—", [0x97, 1000]],
  ["–", [0x96, 556]],
  ["·", [0xb7, 278]],
  ["•", [0x95, 350]],
  ["…", [0x85, 1000]],
  ["’", [0x92, 222]],
  ["‘", [0x91, 222]],
  ["“", [0x93, 333]],
  ["”", [0x94, 333]],
  ["×", [0xd7, 584]],
]);

/** Width of text in points. @param {string} text @param {number} size @param {boolean} [bold] */
export function textWidth(text, size, bold = false) {
  const table = bold ? BOLD : REGULAR;
  let units = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    units += code >= 32 && code <= 126 ? (table[code - 32] ?? 556) : (EXTRA.get(ch)?.[1] ?? 556);
  }
  return (units * size) / 1000;
}

/** The text as a PDF string literal in WinAnsi bytes. @param {string} text */
function literal(text) {
  let out = "(";
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else if (code >= 32 && code <= 126) out += ch;
    else {
      const extra = EXTRA.get(ch);
      out += extra ? `\\${extra[0].toString(8).padStart(3, "0")}` : "?";
    }
  }
  return `${out})`;
}

/** Shortens text to fit, ending with "…". @param {string} text @param {number} max @param {number} size @param {boolean} bold */
function fit(text, max, size, bold) {
  if (textWidth(text, size, bold) <= max) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, size, bold) > max) s = s.slice(0, -1);
  return `${s}…`;
}

/** Words wrapped to lines no wider than max. @param {string} text @param {number} max @param {number} size */
function wrap(text, max, size) {
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (textWidth(next, size) > max && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Lays out the report and writes the PDF.
 * @param {ReportDoc} doc @returns {Buffer}
 */
export function renderPdf(doc) {
  /** @type {string[][]} */
  const pages = [];
  /** @type {string[]} */
  let ops = [];
  let y = 0;
  const newPage = () => {
    ops = [];
    pages.push(ops);
    y = PAGE.h - MARGIN;
  };
  /** @param {string} t @param {number} x @param {number} size @param {boolean} [bold] @param {number} [gray] */
  const text = (t, x, size, bold = false, gray = 0) => {
    ops.push(
      `${gray} g BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${literal(t)} Tj ET`,
    );
  };
  /** @param {number} at @param {number} [gray] @param {number} [width] */
  const rule = (at, gray = 0.8, width = 0.5) => {
    ops.push(
      `${gray} G ${width} w ${MARGIN} ${at.toFixed(2)} m ${MARGIN + WIDTH} ${at.toFixed(2)} l S`,
    );
  };
  /** Room for `h` points, or a new page. @param {number} h */
  const room = (h) => {
    if (y - h < MARGIN + 24) {
      newPage();
      return true;
    }
    return false;
  };

  newPage();
  y -= 4;
  text(doc.title, MARGIN, 16, true);
  y -= 16;
  for (const line of wrap(doc.subtitle, WIDTH, 9)) {
    text(line, MARGIN, 9, false, 0.35);
    y -= 12;
  }
  rule(y + 4, 0, 1);
  y -= 14;

  for (const section of doc.sections) {
    room(48);
    text(section.heading, MARGIN, 11, true);
    y -= 15;
    if (section.note) {
      for (const line of wrap(section.note, WIDTH, 8)) {
        room(11);
        text(line, MARGIN, 8, false, 0.4);
        y -= 11;
      }
      y -= 2;
    }
    if (section.pairs) {
      for (const [label, value] of section.pairs) {
        room(13);
        text(fit(label, WIDTH * 0.6, 9, false), MARGIN, 9, false, 0.25);
        text(value, MARGIN + WIDTH - textWidth(value, 9, true), 9, true);
        y -= 13;
      }
    }
    if (section.table) table(section.table);
    y -= 12;
  }

  /** @param {NonNullable<Section["table"]>} t */
  function table(t) {
    const size = 8.5;
    const cols = t.head.length;
    const natural = t.head.map((h, i) =>
      Math.max(
        textWidth(h, size, true),
        ...t.rows.slice(0, 200).map((r) => textWidth(String(r[i] ?? ""), size)),
      ),
    );
    const gap = 10;
    const total = natural.reduce((s, w) => s + w, 0) + gap * (cols - 1);
    // Shrink the widest columns first when the table is too wide.
    const widths = [...natural];
    if (total > WIDTH) {
      let over = total - WIDTH;
      while (over > 0.5) {
        const i = widths.indexOf(Math.max(...widths));
        const cut = Math.min(over, (widths[i] ?? 0) * 0.1 + 1);
        widths[i] = (widths[i] ?? 0) - cut;
        over -= cut;
      }
    }
    const align = t.align ?? t.head.map((_, i) => (i === 0 ? "left" : "right"));
    const LINE = 11;
    /** A data row's cells as lines: the wrapped column over several, the rest shortened. @param {string[]} cells */
    const linesOf = (cells) =>
      cells.map((c, i) =>
        i === t.wrap
          ? wrap(String(c ?? ""), widths[i] ?? 0, size)
          : [fit(String(c ?? ""), widths[i] ?? 0, size, false)],
      );
    /** @param {string[][]} cells @param {boolean} bold */
    const row = (cells, bold) => {
      let x = MARGIN;
      const top = y;
      cells.forEach((lines, i) => {
        const w = widths[i] ?? 0;
        lines.forEach((s, k) => {
          y = top - k * LINE;
          const at = align[i] === "right" ? x + w - textWidth(s, size, bold) : x;
          text(s, at, size, bold, bold ? 0.25 : 0);
        });
        x += w + gap;
      });
      y = top;
    };
    const header = () => {
      row(
        t.head.map((h, i) => [fit(h, widths[i] ?? 0, size, true)]),
        true,
      );
      rule(y - 4, 0.6);
      y -= 15;
    };
    room(30);
    header();
    if (t.rows.length === 0) {
      text("None.", MARGIN, size, false, 0.4);
      y -= 13;
      return;
    }
    for (const r of t.rows) {
      const cells = linesOf(r);
      const height = Math.max(...cells.map((l) => l.length)) * LINE + 2;
      if (room(height)) header();
      row(cells, false);
      rule(y - height + 9, 0.9, 0.3);
      y -= height;
    }
  }

  // Footers, now that the number of pages is known.
  pages.forEach((p, i) => {
    const footer = `E-Vigilance — ${doc.title} — page ${i + 1} of ${pages.length}`;
    p.push(`0.45 g BT /F1 7.5 Tf ${MARGIN} ${MARGIN - 18} Td ${literal(footer)} Tj ET`);
  });

  return assemble(pages.map((p) => p.join("\n")));
}

/** The PDF file around the pages' content streams. @param {string[]} contents */
function assemble(contents) {
  /** @type {string[]} */
  const objects = [];
  const add = (/** @type {string} */ body) => objects.push(body) && objects.length;
  const catalog = add("");
  const pagesId = add("");
  const regular = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  );
  const bold = add(
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );
  const kids = [];
  for (const content of contents) {
    const stream = add(
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    );
    kids.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE.w} ${PAGE.h}] ` +
          `/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${stream} 0 R >>`,
      ),
    );
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] =
    `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) out += `${String(o).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
