"use client";

/**
 * VaultValueChart — the Ledger's collection-value area chart. Zero chart
 * dependencies (hand-rolled SVG, same policy as Sparkline.jsx) over the
 * daily snapshot series from /api/collection/stats: [{ snappedAt, value }].
 * Range toggles + a hover crosshair with date/value readout.
 */

import { useMemo, useState } from "react";

const RANGES = [
  ["30", "30d", 30],
  ["90", "90d", 90],
  ["365", "1y", 365],
  ["all", "All", Infinity],
];

const money = (v) => `$${Number(v).toFixed(2)}`;

export default function VaultValueChart({ series, colors }) {
  const [range, setRange] = useState("all");
  const [hover, setHover] = useState(null); // index into pts

  const pts = useMemo(() => {
    const all = (series || []).filter((p) => Number.isFinite(Number(p.value)));
    const days = RANGES.find(([k]) => k === range)?.[2] ?? Infinity;
    if (!Number.isFinite(days)) return all;
    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    const inRange = all.filter((p) => {
      const t = Date.parse(p.snappedAt);
      return Number.isFinite(t) && t >= cutoff;
    });
    // A range with <2 snapshots can't draw a line — fall back to everything.
    return inRange.length >= 2 ? inRange : all;
  }, [series, range]);

  if (!pts || pts.length < 2) return null;

  const W = 640, H = 140, PAD = 8;
  const vals = pts.map((p) => Number(p.value));
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
  const y = (v) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const first = vals[0];
  const last = vals[vals.length - 1];
  const up = last >= first;
  const hoverPt = hover != null ? pts[hover] : null;

  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((fx - PAD) / (W - PAD * 2)) * (pts.length - 1));
    setHover(Math.max(0, Math.min(pts.length - 1, i)));
  };

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap", marginBottom: 8 }}>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 10, color: "var(--ley-text-faint)", textTransform: "uppercase", letterSpacing: "0.14em" }}>
          Value over time
        </span>
        <span style={{ fontSize: 12, color: hoverPt ? "var(--ley-text)" : up ? "var(--ley-green)" : colors?.RED || "var(--ley-red)" }}>
          {hoverPt
            ? `${String(hoverPt.snappedAt).slice(0, 10)} · ${money(hoverPt.value)}`
            : `${money(first)} → ${money(last)}`}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ display: "flex", gap: 4 }}>
          {RANGES.map(([k, label]) => (
            <button
              key={k}
              onClick={() => setRange(k)}
              className={range === k ? "btn btn-secondary btn-sm" : "btn btn-ghost btn-sm"}
              style={{ padding: "2px 8px", fontSize: 10, fontFamily: "var(--font-mono), monospace" }}
            >
              {label}
            </button>
          ))}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Collection value over time"
      >
        <defs>
          <linearGradient id="vault-value-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--ley-green)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--ley-green)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#vault-value-fill)" />
        <path d={line} fill="none" stroke="var(--ley-green)" strokeWidth="2" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 4px var(--ley-green-glow))" }} />
        {hover != null && (
          <g>
            <line x1={x(hover)} y1={PAD} x2={x(hover)} y2={H - PAD} stroke="var(--ley-line-bright)" strokeWidth="1" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(vals[hover])} r="3.5" fill="var(--ley-green)" />
          </g>
        )}
      </svg>
    </div>
  );
}
