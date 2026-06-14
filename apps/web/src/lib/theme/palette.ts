/** Theme palette for the Taizi reply panel. Ported from apps/tui/src/theme.ts.
 *  The warm bg/fg/accent RGB triples are exposed for inline styles in the
 *  TaiziPanel component (Tailwind can't interpolate raw rgb into its token). */

export type TuiTheme = "dark" | "light";

export type TaiziPalette = {
  bg: string;
  fg: string;
  accent: string;
};

const PALETTES: Record<TuiTheme, TaiziPalette> = {
  light: {
    bg: "rgb(250,249,245)",
    fg: "rgb(61,57,53)",
    accent: "rgb(194,95,67)",
  },
  dark: {
    bg: "rgb(38,37,35)",
    fg: "rgb(230,227,220)",
    accent: "rgb(224,140,108)",
  },
};

export function taiziPalette(theme: TuiTheme): TaiziPalette {
  return PALETTES[theme];
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
