/**
 * CJK-aware text measurement and layout helpers.
 *
 * Ported from apps/tui/src/text.ts, minus ANSI-escape handling (no ANSI codes
 * in the web render path — React + Tailwind carry all styling). strWidth/clipW
 * /padW/wrapW/oneLine stay because store.ts uses them for status strings,
 * slice labels, and timeline clipping.
 */

/** Display columns of a single code point (wcwidth-lite). */
function charWidth(cp: number): number {
  if (cp === 0) return 0;
  // Combining marks / zero-width
  if ((cp >= 0x0300 && cp <= 0x036f) || cp === 0x200b || cp === 0x200d || cp === 0xfe0f) return 0;
  // Default-emoji-presentation symbols we use (render 2 cells in most terminals).
  if (
    cp === 0x26d4 ||
    cp === 0x2753 ||
    cp === 0x2b55 ||
    cp === 0x231b ||
    cp === 0x23f3 ||
    cp === 0x26a1 // ⚡
  ) {
    return 2;
  }
  if (
    cp >= 0x1100 &&
    (cp <= 0x115f ||
      cp === 0x2329 ||
      cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) ||
      (cp >= 0x1f300 && cp <= 0x1f9ff) ||
      (cp >= 0x20000 && cp <= 0x3fffd))
  ) {
    return 2;
  }
  return 1;
}

/** Visible display width of a string. */
export function strWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += charWidth(ch.codePointAt(0) ?? 0);
  }
  return width;
}

/** Clip to a display width, appending … when clipped. */
export function clipW(text: string, width: number): string {
  if (width <= 0) return "";
  if (strWidth(text) <= width) return text;
  if (width === 1) return "…";

  let used = 0;
  let output = "";
  for (const ch of text) {
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (used + w > width - 1) break;
    output += ch;
    used += w;
  }
  return `${output}…`;
}

/** Pad (or clip) to an exact display width. */
export function padW(text: string, width: number): string {
  const clipped = strWidth(text) > width ? clipW(text, width) : text;
  return clipped + " ".repeat(Math.max(0, width - strWidth(clipped)));
}

/** Wrap each line separately so newlines in the source are preserved. */
export function wrapPreservingNewlines(text: string, width: number, maxLines = Infinity): string[] {
  const rows: string[] = [];
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    if (!line.trim()) {
      rows.push("");
      if (rows.length >= maxLines) return rows.slice(0, maxLines);
      continue;
    }
    for (const wrapped of wrapW(line, width)) {
      rows.push(wrapped);
      if (rows.length >= maxLines) return rows.slice(0, maxLines);
    }
  }
  return rows.slice(0, maxLines);
}

/** Greedy wrap by display width (CJK-safe; prefers breaking at spaces). */
export function wrapW(text: string, width: number, maxLines = Infinity): string[] {
  if (width <= 0) return [];
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];

  const lines: string[] = [];
  let line = "";
  let lineW = 0;
  let lastSpace = -1; // index in `line` of last space

  for (const ch of clean) {
    const w = charWidth(ch.codePointAt(0) ?? 0);
    if (lineW + w > width) {
      if (lastSpace > 0 && lastSpace > line.length - 16) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + ch;
      } else {
        lines.push(line);
        line = ch === " " ? "" : ch;
      }
      lineW = strWidth(line);
      lastSpace = line.lastIndexOf(" ");
      if (lines.length >= maxLines) return lines;
      continue;
    }
    if (ch === " ") lastSpace = line.length;
    line += ch;
    lineW += w;
  }
  if (line) lines.push(line);
  return lines.slice(0, maxLines);
}

/** Single-line summary with ellipsis. */
export function oneLine(text: string, max = 120): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return strWidth(clean) <= max ? clean : clipW(clean, max);
}
