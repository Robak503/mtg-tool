import "./globals.css";

import { Playfair_Display, Inter, JetBrains_Mono } from "next/font/google";

import DailySnapshotTrigger from "../components/DailySnapshotTrigger";

// Aether type system. next/font self-hosts these at build time, so the running
// .exe serves them locally — no runtime network calls (local-first mandate).
const display = Playfair_Display({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
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
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        {children}
        {/* Fires the daily price snapshot on launch, regardless of view (#21). */}
        <DailySnapshotTrigger />
      </body>
    </html>
  );
}
