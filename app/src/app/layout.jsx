import "./globals.css";

import localFont from "next/font/local";

import DailySnapshotTrigger from "../components/DailySnapshotTrigger";

// LEYLINE type system, vendored in ./fonts/ so neither the build nor the running
// .exe contacts any font service (local-first mandate). Each family is the
// latin-subset variable woff2 that next/font/google used to download from
// fonts.gstatic.com at build time (Space Grotesk v22, Inter v20, JetBrains Mono
// v24, Cinzel v26); each folder carries that family's SIL OFL 1.1 licence.
// Only the latin subset (the one `subsets: ["latin"]` named) is vendored, so a
// character outside it (e.g. latin-ext "ō", Greek, Cyrillic) draws from the
// fallback font instead of the family.
// One file serves every weight. As in the Google Fonts CSS, each weight gets its
// own @font-face pointing at that file, so a weight outside the list still snaps
// to the nearest listed one. The font-family declaration keeps Google's family
// name, so each --font-* variable holds the same value as before (e.g. "Inter",
// "Inter Fallback"). next/font requires literal options, hence the repetition.
const display = localFont({
  src: [
    { path: "./fonts/space-grotesk/space-grotesk-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/space-grotesk/space-grotesk-latin.woff2", weight: "600", style: "normal" },
    { path: "./fonts/space-grotesk/space-grotesk-latin.woff2", weight: "700", style: "normal" }
  ],
  declarations: [{ prop: "font-family", value: "Space Grotesk" }],
  variable: "--font-display",
  display: "swap"
});
// The HERO face — big room titles only ("THE VAULT" chrome type and its siblings).
// Cinzel = engraved Roman capitals: reads as metal plate / bank door, fits the
// jewel-&-machine register without sci-fi. Swap the whole app's hero type here.
const hero = localFont({
  // 900 (Black) carries the chrome gradient — 700's thin strokes read flat under it.
  src: [
    { path: "./fonts/cinzel/cinzel-latin.woff2", weight: "700", style: "normal" },
    { path: "./fonts/cinzel/cinzel-latin.woff2", weight: "900", style: "normal" }
  ],
  declarations: [{ prop: "font-family", value: "Cinzel" }],
  variable: "--font-hero",
  display: "swap",
  // A serif face: size its metric-matched fallback on Times New Roman, as next/font/google did.
  adjustFontFallback: "Times New Roman"
});
const body = localFont({
  src: [
    { path: "./fonts/inter/inter-latin.woff2", weight: "400", style: "normal" },
    { path: "./fonts/inter/inter-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/inter/inter-latin.woff2", weight: "600", style: "normal" }
  ],
  declarations: [{ prop: "font-family", value: "Inter" }],
  variable: "--font-body",
  display: "swap"
});
const mono = localFont({
  src: [
    { path: "./fonts/jetbrains-mono/jetbrains-mono-latin.woff2", weight: "500", style: "normal" },
    { path: "./fonts/jetbrains-mono/jetbrains-mono-latin.woff2", weight: "600", style: "normal" }
  ],
  declarations: [{ prop: "font-family", value: "JetBrains Mono" }],
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
