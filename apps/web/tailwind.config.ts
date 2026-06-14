import type { Config } from "tailwindcss";

// Tailwind tokens mirror the TUI's picocolors semantic palette. ANSI colors
// (cyan/green/yellow/red/magenta/blue) are theme-independent; the Taizi panel
// uses warm bg/fg/accent that swap between dark and light themes.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          '"Liberation Mono"',
          "monospace",
        ],
      },
      colors: {
        // Terminal semantic colors (constant across themes)
        term: {
          cyan: "#22d3ee",
          green: "#34d399",
          yellow: "#fbbf24",
          red: "#f87171",
          magenta: "#e879f9",
          blue: "#60a5fa",
          dim: "#6b7280",
          fg: "#e5e3dc",
          bg: "#0a0a0a",
        },
        // Taizi panel palette — dark theme values (overridden in CSS vars per theme)
        taizi: {
          bg: "rgb(var(--taizi-bg) / <alpha-value>)",
          fg: "rgb(var(--taizi-fg) / <alpha-value>)",
          accent: "rgb(var(--taizi-accent) / <alpha-value>)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
