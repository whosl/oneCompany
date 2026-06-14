"use client";

import type { TuiTheme } from "../lib/theme/palette";

/** Load persisted theme (dark default). Mirrors TUI's ~/tmp/...theme.json, via localStorage. */
export function loadTheme(): TuiTheme {
  if (typeof localStorage === "undefined") return "dark";
  const stored = localStorage.getItem("onecompany-web-theme");
  return stored === "light" ? "light" : "dark";
}
