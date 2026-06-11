/** Raw stdin key decoding: escape sequences, control chars, printable runs. */

export type MouseEvent = {
  type: "mouse";
  kind: "press" | "release" | "wheelup" | "wheeldown" | "other";
  /** 0-based screen cell coordinates. */
  x: number;
  y: number;
};

export type Key =
  | { type: "char"; ch: string }
  | { type: "ctrl"; ch: string }
  | { type: "enter" }
  | { type: "tab" }
  | { type: "backspace" }
  | { type: "esc" }
  | { type: "up" }
  | { type: "down" }
  | { type: "left" }
  | { type: "right" }
  | { type: "pgup" }
  | { type: "pgdn" }
  | { type: "home" }
  | { type: "end" }
  | MouseEvent;

const MOUSE_SGR = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])/;

const SEQUENCES: Record<string, Key> = {
  "[A": { type: "up" },
  "[B": { type: "down" },
  "[C": { type: "right" },
  "[D": { type: "left" },
  "[H": { type: "home" },
  "[F": { type: "end" },
  "[1~": { type: "home" },
  "[4~": { type: "end" },
  "[5~": { type: "pgup" },
  "[6~": { type: "pgdn" },
  OA: { type: "up" },
  OB: { type: "down" },
  OC: { type: "right" },
  OD: { type: "left" },
  OH: { type: "home" },
  OF: { type: "end" },
};

export function decodeKeys(chunk: Buffer): Key[] {
  const text = chunk.toString("utf8");
  const keys: Key[] = [];
  let i = 0;

  while (i < text.length) {
    const ch = text[i]!;

    if (ch === "\x1b") {
      const mouse = MOUSE_SGR.exec(text.slice(i));
      if (mouse) {
        const button = Number(mouse[1]);
        const x = Number(mouse[2]) - 1;
        const y = Number(mouse[3]) - 1;
        const press = mouse[4] === "M";
        const kind: MouseEvent["kind"] =
          button === 64
            ? "wheelup"
            : button === 65
              ? "wheeldown"
              : (button & 0b11) !== 0b11 && button < 32
                ? press
                  ? "press"
                  : "release"
                : "other";
        keys.push({ type: "mouse", kind, x, y });
        i += mouse[0].length;
        continue;
      }
      let matched = false;
      for (const [sequence, key] of Object.entries(SEQUENCES)) {
        if (text.startsWith(sequence, i + 1)) {
          keys.push(key);
          i += 1 + sequence.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;
      // Unrecognized CSI: skip the whole sequence to avoid leaking chars.
      if (text[i + 1] === "[") {
        let j = i + 2;
        while (j < text.length && !/[a-zA-Z~]/.test(text[j]!)) j += 1;
        i = j + 1;
        continue;
      }
      keys.push({ type: "esc" });
      i += 1;
      continue;
    }

    if (ch === "\r" || ch === "\n") {
      keys.push({ type: "enter" });
      i += 1;
      continue;
    }
    if (ch === "\t") {
      keys.push({ type: "tab" });
      i += 1;
      continue;
    }
    if (ch === "\x7f" || ch === "\b") {
      keys.push({ type: "backspace" });
      i += 1;
      continue;
    }

    const code = ch.charCodeAt(0);
    if (code < 32) {
      keys.push({ type: "ctrl", ch: String.fromCharCode(code + 96) });
      i += 1;
      continue;
    }

    // Group a run of printable characters (handles CJK + paste).
    let j = i;
    while (j < text.length && text.charCodeAt(j) >= 32 && text[j] !== "\x1b") j += 1;
    keys.push({ type: "char", ch: text.slice(i, j) });
    i = j;
  }

  return keys;
}

export function attachStdin(onKey: (key: Key) => void): () => void {
  if (!process.stdin.isTTY) return () => {};

  const onData = (chunk: Buffer): void => {
    for (const key of decodeKeys(chunk)) onKey(key);
  };

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on("data", onData);

  return () => {
    process.stdin.off("data", onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  };
}
