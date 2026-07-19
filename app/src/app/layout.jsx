import "./globals.css";

import { Space_Grotesk, Inter, JetBrains_Mono, Cinzel } from "next/font/google";

import DailySnapshotTrigger from "../components/DailySnapshotTrigger";

// LEYLINE type system. next/font self-hosts these at build time, so the running
// .exe serves them locally — no runtime network calls (local-first mandate).
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap"
});
// The HERO face — big room titles only ("THE VAULT" chrome type and its siblings).
// Cinzel = engraved Roman capitals: reads as metal plate / bank door, fits the
// jewel-&-machine register without sci-fi. Swap the whole app's hero type here.
const hero = Cinzel({
  subsets: ["latin"],
  // 900 (Black) carries the chrome gradient — 700's thin strokes read flat under it.
  weight: ["700", "900"],
  variable: "--font-hero",
  display: "swap"
});
const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap"
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-mono",
  display: "swap"
});

export const metadata = {
  title: "MTG Tool",
  description: "Personal Commander rules and deck assistant"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${hero.variable}`}>
      {/* suppressHydrationWarning: browser extensions (Grammarly's data-gr-*, etc.)
          inject attributes onto <body> before React hydrates, which would otherwise
          throw a dev-only hydration mismatch. This suppresses only <body>'s own
          attribute diff (not its children) — the React-recommended fix for this. */}
      <body suppressHydrationWarning>
        {children}
        {/* Fires the daily price snapshot on launch, regardless of view (#21). */}
        <DailySnapshotTrigger />
      </body>
    </html>
  );
}
