const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, "");
}

export function visibleLength(text: string): number {
  return stripAnsi(text).length;
}

export function clipVisible(text: string, width: number): string {
  if (width <= 0) return "";
  if (visibleLength(text) <= width) return text;
  if (width <= 1) return "…";

  let visible = 0;
  let output = "";
  let inEscape = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (inEscape) {
      output += ch;
      if (ch === "m") inEscape = false;
      continue;
    }
    if (ch === "\x1b") {
      inEscape = true;
      output += ch;
      continue;
    }
    if (visible >= width - 1) break;
    output += ch;
    visible += 1;
  }

  return `${output}…`;
}

export function padVisible(text: string, width: number): string {
  const clipped = visibleLength(text) > width ? clipVisible(text, width) : text;
  const padBy = Math.max(0, width - visibleLength(clipped));
  return clipped + " ".repeat(padBy);
}
