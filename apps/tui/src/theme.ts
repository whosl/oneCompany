import { padW } from "./text.js";

export type TuiTheme = "dark" | "light";

export type TaiziPalette = {
  bg: string;
  fg: string;
  accent: string;
  reset: string;
};

const PALETTES: Record<TuiTheme, TaiziPalette> = {
  light: {
    bg: "\x1b[48;2;250;249;245m",
    fg: "\x1b[38;2;61;57;53m",
    accent: "\x1b[38;2;194;95;67m",
    reset: "\x1b[0m",
  },
  dark: {
    bg: "\x1b[48;2;38;37;35m",
    fg: "\x1b[38;2;230;227;220m",
    accent: "\x1b[38;2;224;140;108m",
    reset: "\x1b[0m",
  },
};

export function taiziPalette(theme: TuiTheme): TaiziPalette {
  return PALETTES[theme];
}

export function taiziBgLine(text: string, width: number, theme: TuiTheme): string {
  const p = taiziPalette(theme);
  return `${p.bg}${p.fg}${padW(text, width)}${p.reset}`;
}

export function themeLabel(theme: TuiTheme): string {
  return theme === "dark" ? "深色" : "浅色";
}

export function parseTheme(raw: string | undefined): TuiTheme | undefined {
  if (raw === "dark" || raw === "light") return raw;
  return undefined;
}

export function toggleTheme(theme: TuiTheme): TuiTheme {
  return theme === "dark" ? "light" : "dark";
}
