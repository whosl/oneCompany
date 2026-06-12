import pc from "picocolors";
import { clipW, strWidth, wrapW } from "./text.js";

function mdInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, (_, t: string) => pc.bold(t))
    .replace(/\*([^*]+)\*/g, (_, t: string) => pc.italic(t))
    .replace(/`([^`]+)`/g, (_, t: string) => pc.cyan(t));
}

/** Lightweight terminal markdown renderer for stream and artifact viewer. */
export function renderMarkdownLines(content: string, width = 100): string[] {
  const out: string[] = [];
  let inCode = false;

  const pushWrapped = (
    text: string,
    firstPrefix: string,
    contPrefix: string,
    style: (s: string) => string,
  ): void => {
    const avail = Math.max(16, width - strWidth(firstPrefix));
    const pieces = wrapW(text, avail);
    if (pieces.length === 0) {
      out.push(firstPrefix.trimEnd());
      return;
    }
    pieces.forEach((piece, index) => {
      out.push(`${index === 0 ? firstPrefix : contPrefix}${style(piece)}`);
    });
  };

  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    if (/^\s*```/.test(raw)) {
      inCode = !inCode;
      out.push(pc.dim("─".repeat(Math.min(40, width))));
      continue;
    }
    if (inCode) {
      out.push(pc.dim(`  ${clipW(raw, Math.max(16, width - 2))}`));
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(raw);
    if (h) {
      const level = h[1]!.length;
      const text = h[2]!;
      if (level === 1) {
        out.push("");
        pushWrapped(text, "█ ", "  ", (s) => pc.bold(pc.cyan(s)));
      } else if (level === 2) {
        out.push("");
        pushWrapped(text, "▎", " ", (s) => pc.bold(pc.cyan(s)));
      } else {
        pushWrapped(text, "  ".repeat(level - 3), "  ".repeat(level - 3), (s) => pc.bold(s));
      }
      continue;
    }
    if (/^\s*([-*_]){3,}\s*$/.test(raw)) {
      out.push(pc.dim("─".repeat(Math.min(40, width))));
      continue;
    }
    const bullet = /^(\s*)[-*]\s+(.*)$/.exec(raw);
    if (bullet) {
      const indent = bullet[1]!;
      pushWrapped(bullet[2]!, `${indent}${pc.cyan("•")} `, `${indent}  `, mdInline);
      continue;
    }
    const ordered = /^(\s*)(\d+)\.\s+(.*)$/.exec(raw);
    if (ordered) {
      const indent = ordered[1]!;
      const marker = `${ordered[2]}.`;
      pushWrapped(
        ordered[3]!,
        `${indent}${pc.cyan(marker)} `,
        `${indent}${" ".repeat(marker.length + 1)}`,
        mdInline,
      );
      continue;
    }
    const quote = /^\s*>\s?(.*)$/.exec(raw);
    if (quote) {
      pushWrapped(quote[1]!, `${pc.dim("▏")} `, `${pc.dim("▏")} `, (s) => pc.dim(s));
      continue;
    }
    pushWrapped(raw, "", "", mdInline);
  }
  return out;
}
