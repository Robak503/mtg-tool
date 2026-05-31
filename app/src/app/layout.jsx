import "./globals.css";

import DailySnapshotTrigger from "../components/DailySnapshotTrigger";

export const metadata = {
  title: "MTG Tool",
  description: "Personal Commander rules and deck assistant"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Fires the daily price snapshot on launch, regardless of view (#21). */}
        <DailySnapshotTrigger />
      </body>
    </html>
  );
}
