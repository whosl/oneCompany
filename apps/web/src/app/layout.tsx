import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "OneCompany · Web Console",
  description: "Web replica of the OneCompany delivery TUI.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="theme-dark">
      <body>{children}</body>
    </html>
  );
}
