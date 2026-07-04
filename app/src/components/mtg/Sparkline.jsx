"use client";

/**
 * Sparkline — a tiny inline price line chart (SVG). `points` is an array of
 * numbers or `{ usd }` objects (oldest→newest). Renders nothing for <2 points.
 * Line color is green when the last value ≥ the first, red otherwise.
 */
export default function Sparkline({ points, width = 132, height = 30, strokeWidth = 1.5 }) {
  const vals = (points || [])
    .map(p => (typeof p === "number" ? p : p?.usd))
    .filter(v => Number.isFinite(v));
  if (vals.length < 2) return null;

  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 2;
  const stepX = width / (vals.length - 1);
  const yOf = v => pad + (height - 2 * pad) * (1 - (v - min) / range);
  const d = vals.map((v, i) => `${i === 0 ? "M" : "L"}${(i * stepX).toFixed(1)},${yOf(v).toFixed(1)}`).join(" ");
  const stroke = vals[vals.length - 1] >= vals[0] ? "var(--ley-green)" : "var(--ley-red)";

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block" }} aria-hidden="true">
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
