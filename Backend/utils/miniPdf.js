// utils/miniPdf.js
// Tiny dependency-free PDF writer (A4, Helvetica / Helvetica-Bold, text,
// lines, filled rectangles, word-wrap, multiple pages). Enough for invoices
// without adding a PDF library. Coordinates are top-left based (like the
// browser); text is ASCII (other characters are mapped or replaced).

import zlib from "zlib";

const WIDTHS = {"Helvetica":[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],"Helvetica-Bold":[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584]};
const FONT_KEY = { "Helvetica": "F1", "Helvetica-Bold": "F2" };

const CHAR_MAP = { "·": "-", "–": "-", "—": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "₹": "Rs.", " ": " ", "…": "..." };

export function toAscii(value) {
  return String(value ?? "")
    .replace(/[·–—‘’“”₹ …]/g, (c) => CHAR_MAP[c])
    .replace(/[^\x20-\x7e\n]/g, "?");
}

function hexToRgb(hex) {
  const h = String(hex || "#000000").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(" ");
}

const esc = (s) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
const num = (v) => (Math.round(v * 100) / 100).toString();

export class MiniPdf {
  constructor({ width = 595.28, height = 841.89, margin = 36, title = "" } = {}) {
    this.page = { width, height, margin };
    this.title = title;
    this.pages = [];
    this.y = margin;
    this.addPage();
  }

  addPage() {
    this.current = [];
    this.pages.push(this.current);
    this.y = this.page.margin;
    return this;
  }

  widthOf(str, font = "Helvetica", size = 10) {
    const table = WIDTHS[font] || WIDTHS.Helvetica;
    let w = 0;
    for (const ch of toAscii(str)) {
      const code = ch.charCodeAt(0);
      w += code >= 32 && code <= 126 ? table[code - 32] : 556;
    }
    return (w * size) / 1000;
  }

  wrap(str, width, font = "Helvetica", size = 10) {
    const out = [];
    for (const para of toAscii(str).split("\n")) {
      if (!width) { out.push(para); continue; }
      let line = "";
      for (const word of para.split(/ +/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (this.widthOf(candidate, font, size) <= width || !line) {
          // Hard-break a single word that is wider than the box.
          if (!line && this.widthOf(candidate, font, size) > width) {
            let chunk = "";
            for (const ch of candidate) {
              if (this.widthOf(chunk + ch, font, size) > width && chunk) { out.push(chunk); chunk = ""; }
              chunk += ch;
            }
            line = chunk;
          } else line = candidate;
        } else {
          out.push(line);
          line = word;
        }
      }
      out.push(line);
    }
    return out;
  }

  heightOf(str, { width, font = "Helvetica", size = 10, lineGap = 1.5 } = {}) {
    return this.wrap(str, width, font, size).length * (size + lineGap);
  }

  /** Draw text; returns and sets this.y to the bottom of the block. */
  text(str, x, y, { width, align = "left", font = "Helvetica", size = 10, color = "#000000", lineGap = 1.5 } = {}) {
    const lines = this.wrap(str, width, font, size);
    const lh = size + lineGap;
    const ops = [`BT /${FONT_KEY[font] || "F1"} ${num(size)} Tf ${hexToRgb(color)} rg`];
    lines.forEach((line, i) => {
      let lx = x;
      if (width && align !== "left") {
        const w = this.widthOf(line, font, size);
        lx = align === "right" ? x + width - w : x + (width - w) / 2;
      }
      const baseline = this.page.height - (y + i * lh + size * 0.8);
      ops.push(`1 0 0 1 ${num(lx)} ${num(baseline)} Tm (${esc(line)}) Tj`);
    });
    ops.push("ET");
    this.current.push(ops.join("\n"));
    this.y = y + lines.length * lh;
    return this.y;
  }

  line(x1, y1, x2, y2, { width = 0.5, color = "#999999" } = {}) {
    const H = this.page.height;
    this.current.push(`${hexToRgb(color)} RG ${num(width)} w ${num(x1)} ${num(H - y1)} m ${num(x2)} ${num(H - y2)} l S`);
    return this;
  }

  rect(x, y, w, h, { fill = "#f1f1f1" } = {}) {
    const H = this.page.height;
    this.current.push(`${hexToRgb(fill)} rg ${num(x)} ${num(H - y - h)} ${num(w)} ${num(h)} re f`);
    return this;
  }

  toBuffer() {
    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalogId = add(null);
    const pagesId = add(null);
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const pageIds = [];
    for (const ops of this.pages) {
      const data = zlib.deflateSync(Buffer.from(ops.join("\n"), "latin1"));
      const streamId = add({ stream: data });
      pageIds.push(add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${num(this.page.width)} ${num(this.page.height)}] ` +
        `/Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${streamId} 0 R >>`
      ));
    }
    objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
    objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    const infoId = add(`<< /Title (${esc(toAscii(this.title))}) /Producer (AppleNext) >>`);

    const parts = [Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1")];
    const offsets = [];
    let length = parts[0].length;
    objects.forEach((body, i) => {
      offsets.push(length);
      let chunk;
      if (body && typeof body === "object" && body.stream) {
        chunk = Buffer.concat([
          Buffer.from(`${i + 1} 0 obj\n<< /Length ${body.stream.length} /Filter /FlateDecode >>\nstream\n`, "latin1"),
          body.stream,
          Buffer.from("\nendstream\nendobj\n", "latin1"),
        ]);
      } else {
        chunk = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, "latin1");
      }
      parts.push(chunk);
      length += chunk.length;
    });
    const xref = [`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`]
      .concat(offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)).join("");
    parts.push(Buffer.from(
      `${xref}trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R /Info ${infoId} 0 R >>\nstartxref\n${length}\n%%EOF\n`,
      "latin1"
    ));
    return Buffer.concat(parts);
  }
}

export default MiniPdf;
