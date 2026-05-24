import "./globals.css";

export const metadata = {
  title: "MTG Tool",
  description: "Personal Commander rules and deck assistant"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
