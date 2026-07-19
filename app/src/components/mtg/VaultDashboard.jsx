"use client";

/**
 * VaultDashboard — The Vault's front door (V2: "jewel & machine").
 *
 * Spec: memory/orders/vault-dashboard-rework-spec.md — Colton's mock translated to LEYLINE, his
 * final layout calls baked in:
 *   - NO left sidebar (room nav lives in the app's bottom bar). Halls live in the ROOMS DROPDOWN
 *     up top (Census · Atlas · Gallery · Stacks · Ledger · Forge).
 *   - Tile row (his exact three): UNIQUE PRINTINGS · VAULT VALUE · WEEK'S WINNER + LOSER.
 *     The movers tile is honest: "building a week of history…" until ≥2 spaced snapshots exist —
 *     a fabricated delta and no-data must never look alike (hollow-gate law).
 *   - Grails shelf (buildShelf server-side) · VALUE graph · MY COLLECTION table.
 *   - Blocks-as-doors: shelf → Gallery, table → Stacks, tiles/graph → Ledger.
 *   - Right rail = VaultRail (Vihaan: chat + widget canvas), its own component.
 *
 * V2 design law (Colton, 2026-07-19 — "not a fan of the pulsing"): NO LOOPING MOTION anywhere.
 * Richness is MATERIAL, not light shows — machined panel edges with corner brackets, baked
 * specular streaks, chrome/jewel gradient type, a safe-dial ornament, and a mirror-floor grail
 * case with real card reflections. Motion exists only as hover response and one fast one-shot
 * entrance, all killed under prefers-reduced-motion.
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import VaultRail from "./VaultRail";

const VD_CSS = `
/* ── One-shot motion only: entrance rise + chart draw-in. Nothing loops. ── */
@keyframes vdRise {
  from { opacity: 0; transform: translateY(14px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes vdDrawLine { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
.vd-rise { opacity: 0; animation: vdRise 520ms var(--ease-snap) forwards; }
.vd-chart-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: vdDrawLine 1200ms var(--ease-snap) 250ms forwards; }

/* ── The ground: static layered light + brushed machining. No drift. ── */
.vd-stage {
  background:
    radial-gradient(ellipse 90% 60% at 30% -12%, rgba(57,245,126,0.10), transparent 60%),
    radial-gradient(ellipse 70% 55% at 85% 108%, rgba(57,245,126,0.05), transparent 65%),
    var(--ley-bg);
}
.vd-stage::before { /* brushed-metal hairlines, barely there */
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: repeating-linear-gradient(115deg, rgba(167,243,208,0.016) 0 1px, transparent 1px 7px);
}

/* ── Machined glass: layered on .ley-glass — dual edge, corner brackets, baked specular ── */
.vd-pane {
  position: relative;
  box-shadow:
    inset 0 1px 0 rgba(214,255,236,0.14),
    inset 0 -14px 24px -18px rgba(0,0,0,0.9),
    0 0 0 1px rgba(57,245,126,0.05),
    0 22px 44px -28px rgba(0,0,0,0.9);
}
.vd-pane::before { /* baked specular streak — the jewel face */
  content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none;
  background: linear-gradient(112deg, transparent 32%, rgba(214,255,236,0.05) 42%, rgba(214,255,236,0.012) 50%, transparent 58%);
}
.vd-pane::after { /* corner brackets — machined, engraved */
  content: ""; position: absolute; inset: 5px; border-radius: 9px; pointer-events: none;
  background:
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) top left / 14px 1px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) top left / 1px 14px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) top right / 14px 1px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) top right / 1px 14px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) bottom left / 14px 1px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) bottom left / 1px 14px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) bottom right / 14px 1px,
    linear-gradient(rgba(57,245,126,0.34), rgba(57,245,126,0.34)) bottom right / 1px 14px;
  background-repeat: no-repeat; opacity: 0.55;
}
.vd-door { cursor: pointer; transition: transform 180ms var(--ease-snap), box-shadow 180ms; }
.vd-door:hover {
  transform: translateY(-3px);
  box-shadow:
    inset 0 1px 0 rgba(214,255,236,0.18),
    inset 0 -14px 24px -18px rgba(0,0,0,0.9),
    0 0 0 1px rgba(57,245,126,0.22),
    0 0 34px rgba(57,245,126,0.14),
    0 26px 48px -26px rgba(0,0,0,0.95);
}

/* ── Header: chrome title in the app-wide hero face (dial + rule cut — Colton, 2026-07-19) ── */
.vd-title {
  font-family: var(--font-hero), serif;
  font-size: 30px; font-weight: 900; letter-spacing: 0.1em; line-height: 1;
  background: linear-gradient(180deg, #f2fff8 8%, #a7f3d0 34%, var(--ley-green) 56%, #128a45 88%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 1px 0 rgba(0,0,0,0.8)) drop-shadow(0 0 16px rgba(57,245,126,0.3));
}

/* ── Labels: engraved small-caps with a tick-ruler tail ── */
.vd-lab {
  display: flex; align-items: center; gap: 8px;
  font-family: var(--font-mono), monospace; font-size: 10px; font-weight: 700;
  letter-spacing: 0.17em; color: var(--ley-green); text-transform: uppercase;
}
.vd-lab::after { content: ""; flex: 1; height: 3px;
  background: repeating-linear-gradient(90deg, var(--ley-line) 0 1px, transparent 1px 6px) bottom / 100% 1px no-repeat,
              repeating-linear-gradient(90deg, var(--ley-line) 0 1px, transparent 1px 24px) bottom / 100% 3px no-repeat; }

/* ── Jeweled numerals + winner/loser metalwork ── */
.vd-num {
  font-family: var(--font-mono), monospace; font-weight: 700; font-size: 30px; line-height: 1.15;
  font-variant-numeric: tabular-nums; margin-top: 5px;
  background: linear-gradient(180deg, #f2fff8 0%, #a7f3d0 40%, var(--ley-green) 78%, #21b45f 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 14px rgba(57,245,126,0.35));
}
.vd-delta { font-family: var(--font-mono), monospace; font-weight: 700; font-size: 20px; line-height: 1.1; }
.vd-delta-up { background: linear-gradient(180deg, #6dffa1, #21b45f);
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 12px rgba(57,245,126,0.4)); }
.vd-delta-down { background: linear-gradient(180deg, #ffb4b4, var(--ley-red));
  -webkit-background-clip: text; background-clip: text; color: transparent;
  filter: drop-shadow(0 0 12px rgba(248,113,113,0.35)); }
.vd-groove { width: 2px; margin: 2px 0; border-radius: 1px; flex-shrink: 0;
  background: linear-gradient(180deg, transparent, rgba(0,0,0,0.8) 20% 80%, transparent);
  box-shadow: 1px 0 0 rgba(167,243,208,0.10); }

/* ── The jewel case: tilted fan, static spotlight, glossy floor with real reflections ── */
.vd-spotlight { position: absolute; left: 12%; right: 12%; top: 4%; bottom: 18%; pointer-events: none;
  background: radial-gradient(55% 75% at 50% 18%, rgba(57,245,126,0.13), transparent 70%); }
.vd-shelf { display: flex; gap: 24px; justify-content: center; align-items: flex-end; padding: 22px 6px 0; position: relative; }
.vd-grail { position: relative; transition: transform 220ms var(--ease-snap), filter 220ms; }
.vd-grail:hover { transform: translateY(-8px) scale(1.03); filter: drop-shadow(0 0 20px rgba(57,245,126,0.45)); z-index: 3; }
.vd-grail:nth-child(1) { transform: rotate(-6deg) translateY(6px); }
.vd-grail:nth-child(2) { transform: rotate(-2.6deg) translateY(1px); }
.vd-grail:nth-child(4) { transform: rotate(2.6deg) translateY(1px); }
.vd-grail:nth-child(5) { transform: rotate(6deg) translateY(6px); }
.vd-grail:nth-child(1):hover, .vd-grail:nth-child(5):hover { transform: rotate(0deg) translateY(-7px) scale(1.03); }
.vd-grail:nth-child(2):hover, .vd-grail:nth-child(4):hover { transform: rotate(0deg) translateY(-8px) scale(1.03); }
.vd-refl { /* the mirror floor — a flipped copy of the real card, bottom-aligned so the mirror is true */
  position: absolute; top: calc(100% + 3px); left: 0; right: 0; height: 56%;
  overflow: hidden; border-radius: 6px; pointer-events: none; opacity: 0.45;
  transform: scaleY(-1);
  -webkit-mask-image: linear-gradient(180deg, transparent 12%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0.55) 100%);
  mask-image: linear-gradient(180deg, transparent 12%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0.55) 100%);
}
.vd-refl-inner { position: absolute; left: 0; right: 0; bottom: 0; }
.vd-floorline { height: 1px; margin: 6px 4px 0; position: relative; z-index: 2;
  background: linear-gradient(90deg, transparent, rgba(214,255,236,0.28) 18% 82%, transparent);
  box-shadow: 0 1px 8px rgba(57,245,126,0.25); }
.vd-gtag { position: absolute; top: -7px; right: -7px; z-index: 4;
  font-family: var(--font-mono), monospace; font-weight: 700; font-size: 9px; letter-spacing: 0.06em;
  color: #03140a; background: linear-gradient(180deg, #6dffa1, #21b45f);
  padding: 2px 6px; border-radius: 999px; box-shadow: 0 0 12px rgba(57,245,126,0.5); }

/* ── Cards: the jewel-case facsimile UNDER every card image (Colton: "we went back flat" —
      the flat black no-art tile was the killer; art windows glow even before/without art) ── */
.vd-card { position: relative; aspect-ratio: 63 / 88; border-radius: 6px; overflow: hidden; flex-shrink: 0;
  background: linear-gradient(168deg, #102316, #071108);
  border: 1px solid rgba(167,243,208,0.22);
  box-shadow: inset 0 1px 0 rgba(214,255,236,0.14), inset 0 0 18px rgba(0,0,0,0.6), 0 8px 18px -8px rgba(0,0,0,0.9); }
.vd-card-art { position: absolute; left: 7%; right: 7%; top: 9%; height: 46%; border-radius: 4px;
  border: 1px solid rgba(167,243,208,0.16);
  background: radial-gradient(120% 90% at 30% 20%, rgba(57,245,126,0.34), rgba(13,60,30,0.9) 60%, #051007 100%);
  box-shadow: inset 0 0 14px rgba(0,0,0,0.65); }
.vd-card-name { position: absolute; left: 8%; right: 8%; bottom: 7%; text-align: center; color: #a7f3d0;
  font-weight: 600; line-height: 1.25; text-shadow: 0 1px 2px #000; }
.vd-card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.vd-card::after { /* specular glass over whatever shows — facsimile or real art */
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(118deg, transparent 30%, rgba(234,255,243,0.14) 41%, transparent 52%); }

/* ── Chart margins + the engraved ledger table ── */
.vd-chart-notes { display: flex; justify-content: space-between; margin-top: 5px;
  font-family: var(--font-mono), monospace; font-size: 9.5px; font-weight: 500;
  color: var(--ley-text-dim); letter-spacing: 0.04em; }
.vd-row { transition: background 130ms, box-shadow 130ms; cursor: pointer; }
.vd-row:hover { background: rgba(57,245,126,0.06); box-shadow: inset 2px 0 0 var(--ley-green); }
.vd-qty { display: inline-block; min-width: 20px; text-align: center;
  font-family: var(--font-mono), monospace; font-weight: 700; font-size: 10.5px; color: #a7f3d0;
  padding: 2px 6px; border-radius: 5px; background: rgba(57,245,126,0.08);
  border: 1px solid var(--ley-line); box-shadow: inset 0 1px 0 rgba(214,255,236,0.08); }

/* ── Vihaan's nameplate portrait: little artwork, not a green ball (Colton, 2026-07-19) ── */
.vd-avatar { width: 32px; height: 32px; border-radius: 8px; position: relative; flex-shrink: 0;
  overflow: hidden; background: var(--ley-surface-2);
  border: 1px solid rgba(57,245,126,0.34);
  box-shadow: 0 0 12px rgba(57,245,126,0.22), inset 0 1px 0 rgba(214,255,236,0.14); }
.vd-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.vd-avatar .vd-avatar-fallback { position: absolute; inset: 0; display: flex; align-items: center;
  justify-content: center; font-family: var(--font-mono), monospace; font-weight: 700; font-size: 14px;
  color: var(--ley-green);
  background: radial-gradient(120% 90% at 30% 20%, rgba(57,245,126,0.3), rgba(13,60,30,0.9) 60%, #051007 100%);
  text-shadow: 0 0 8px rgba(57,245,126,0.6); }

@media (prefers-reduced-motion: reduce) {
  .vd-rise, .vd-chart-line { animation: none; }
  .vd-rise { opacity: 1; }
  .vd-chart-line { stroke-dasharray: none; stroke-dashoffset: 0; }
}
`;

/** Boot-up count: the tiles tick from 0 to value on mount (one-shot, not a loop). */
function useCountUp(target, ms = 900) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let raf; const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(target * (1 - Math.pow(1 - k, 3))); // ease-out cubic
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

const HALLS = [
  { id: "collection", label: "The Stacks" },
  { id: "vault-ledger", label: "The Ledger" },
  { id: "vault-census", label: "The Census" },
  { id: "vault-atlas", label: "The Atlas" },
  { id: "vault-gallery", label: "The Gallery" },
  { id: "vault-forge", label: "The Forge" },
];

const mono = { fontFamily: "var(--font-mono), monospace" };

/* Colton's display rule for long set names (2026-07-19): flip a trailing qualifier to the
   front — "Lost Caverns of Ixalan Special Guests" → "Special Guests - Lost Caverns of Ixalan" —
   then cut at a word boundary to fit the column, dropping dangling connectives:
   "Special Guests - Lost Caverns". Reorder + trim only; the name's own words are never
   rewritten, and the untouched full name rides the cell tooltip. */
const SET_QUALIFIERS = ["Special Guests", "Commander", "Art Series", "Promos", "Tokens"];
export function formatSetName(name, max = 30) {
  if (!name) return null;
  let out = name;
  if (out.length > max) {
    for (const q of SET_QUALIFIERS) {
      if (out.endsWith(` ${q}`)) { out = `${q} - ${out.slice(0, -(q.length + 1))}`; break; }
    }
  }
  if (out.length > max) {
    let cut = out.slice(0, max + 1);
    if (cut.includes(" ")) cut = cut.slice(0, cut.lastIndexOf(" "));
    cut = cut.replace(/[\s:,–-]+$/, "").replace(/\s+(of|the|at|a|an|and|in|for)$/i, "");
    out = cut || out.slice(0, max);
  }
  return out;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** "2026-07-01" → "JUL" (annotation margins under the value chart). */
function monthLabel(point) {
  const s = point?.snappedAt || point?.date || "";
  const m = Number(String(s).slice(5, 7));
  return m >= 1 && m <= 12 ? MONTHS[m - 1] : "";
}

/** Inline value chart — engraved grid, gradient stroke that brightens toward now, static endpoint. */
function Sparkline({ series, width = 620, height = 150, grid = false }) {
  const path = useMemo(() => {
    const pts = (series || []).filter((p) => Number.isFinite(p?.value));
    if (pts.length < 2) return null;
    const xs = pts.map((_, i) => (i / (pts.length - 1)) * (width - 8) + 4);
    const vals = pts.map((p) => p.value);
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const ys = vals.map((v) => height - 6 - ((v - min) / span) * (height - 24));
    const d = xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
    return { d, area: `${d} L${xs[xs.length - 1].toFixed(1)},${height - 4} L${xs[0].toFixed(1)},${height - 4} Z`, end: [xs[xs.length - 1], ys[ys.length - 1]] };
  }, [series, width, height]);

  if (!path) return null;
  // Depth = light: blurred phosphor underlay beneath the crisp line + fading area gradient;
  // the stroke itself is a gradient (deep → hot) so the line brightens as it approaches today.
  const gid = `vd-grad-${width}x${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(57,245,126,0.28)" />
          <stop offset="100%" stopColor="rgba(57,245,126,0)" />
        </linearGradient>
        <linearGradient id={`${gid}-stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#1d9e54" />
          <stop offset="75%" stopColor="#39f57e" />
          <stop offset="100%" stopColor="#6dffa1" />
        </linearGradient>
        <filter id={`${gid}-blur`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      {grid && (
        <g stroke="rgba(167,243,208,0.07)" strokeWidth="1">
          {[0.25, 0.5, 0.75].map((k) => (
            <line key={k} x1="0" y1={height * k} x2={width} y2={height * k} />
          ))}
          <line x1="0" y1={height - 4} x2={width} y2={height - 4} stroke="rgba(167,243,208,0.12)" />
        </g>
      )}
      <path d={path.area} fill={`url(#${gid})`} stroke="none" />
      <path d={path.d} fill="none" stroke="var(--ley-green)" strokeWidth="3" strokeLinejoin="round" opacity="0.55" filter={`url(#${gid}-blur)`} />
      <path className="vd-chart-line" pathLength="1" d={path.d} fill="none" stroke={`url(#${gid}-stroke)`} strokeWidth="2.2" strokeLinejoin="round" />
      {path.end && (
        <>
          <circle cx={path.end[0]} cy={path.end[1]} r="3.2" fill="#6dffa1" />
          <circle cx={path.end[0]} cy={path.end[1]} r="7" fill="none" stroke="rgba(109,255,161,0.35)" strokeWidth="1" />
        </>
      )}
    </svg>
  );
}

function CardThumb({ scryfallId, name, size = 92 }) {
  // The facsimile layers (art window + name plate) sit UNDER the real image: they carry the
  // frame while art loads and whenever it can't resolve — a card is never a black void.
  return (
    <div className="vd-card" style={{ width: size }}>
      <div className="vd-card-art" aria-hidden="true" />
      <div className="vd-card-name" style={{ fontSize: Math.max(6.5, size / 10) }}>{name}</div>
      <img
        src={scryfallId ? `/api/card-image?id=${encodeURIComponent(scryfallId)}` : `/api/card-image?name=${encodeURIComponent(name || "")}`}
        alt=""
        onError={(e) => { e.currentTarget.style.visibility = "hidden"; }}
      />
    </div>
  );
}

const usd = (n) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function VaultDashboard({ onPick, fontFamily }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [roomsOpen, setRoomsOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/collection/dashboard");
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || `Dashboard failed: ${r.status}`);
      setData(b);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const movers = data?.movers;
  const countPrintings = useCountUp(data?.uniquePrintings ?? 0);
  const countValue = useCountUp(data?.vaultValue ?? 0);
  const series = data?.valueSeries || [];
  const seriesPeak = series.length >= 2 ? Math.max(...series.map((p) => p.value)) : null;

  return (
    <div className="vd-stage" style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0, position: "relative" }}>
      <style>{VD_CSS}</style>
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        {/* Header: chrome title + Rooms dropdown */}
        <div className="vd-rise" style={{ display: "flex", alignItems: "center", gap: 14, animationDelay: "40ms" }}>
          <span className="vd-title">THE VAULT</span>
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setRoomsOpen((o) => !o)} aria-expanded={roomsOpen}>
              Rooms ▾
            </button>
            {roomsOpen && (
              <div className="ley-glass-strong ley-glass-lit" style={{ position: "absolute", right: 0, top: "110%", zIndex: 30, minWidth: 170, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                {HALLS.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => { setRoomsOpen(false); onPick?.(h.id); }}
                    style={{ textAlign: "left", padding: "7px 10px", fontSize: 12.5, background: "transparent", border: "none", color: "var(--ley-text)", cursor: "pointer", borderRadius: 6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ley-green-dim)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && <div className="ley-glass" style={{ padding: 12, fontSize: 12.5, color: "var(--ley-red)", borderColor: "var(--ley-red)" }}>{error}</div>}

        {/* ── Tile row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.6fr", gap: 12 }}>
          <div className="ley-glass vd-pane vd-door vd-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("vault-census")} title="Open The Census">
            <div className="vd-lab">Unique printings</div>
            <div className="vd-num">
              {data ? Math.round(countPrintings).toLocaleString() : "—"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)", marginTop: 2 }}>{data ? `${data.totalQuantity.toLocaleString()} total copies` : ""}</div>
          </div>

          <div className="ley-glass vd-pane vd-door vd-rise" style={{ padding: "14px 16px", animationDelay: "110ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            <div className="vd-lab">Vault value</div>
            <div className="vd-num">
              {data ? usd(countValue) : "—"}
            </div>
            <div style={{ height: 18, marginTop: 2 }}>
              {series.length >= 2 && <Sparkline series={series} width={220} height={18} />}
            </div>
          </div>

          <div className="ley-glass vd-pane vd-door vd-rise" style={{ padding: "14px 16px", display: "flex", gap: 15, animationDelay: "110ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            {movers?.status === "ok" ? (
              <>
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.winner.scryfallId} name={movers.winner.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="vd-lab">Week's winner</div>
                    <div className="vd-delta vd-delta-up" style={{ marginTop: 4 }}>+{movers.winner.pctChange.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movers.winner.name}</div>
                  </div>
                </div>
                <div className="vd-groove" aria-hidden="true" />
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.loser.scryfallId} name={movers.loser.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div className="vd-lab">Week's loser</div>
                    <div className="vd-delta vd-delta-down" style={{ marginTop: 4 }}>{movers.loser.pctChange.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movers.loser.name}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1 }}>
                <div className="vd-lab">Week's winner · loser</div>
                <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 6, lineHeight: 1.45 }}>
                  Building a week of price history… {movers?.reason ? `(${movers.reason})` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Grail case + value graph ──────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12 }}>
          <div className="ley-glass vd-pane vd-door vd-rise" style={{ padding: "14px 16px", animationDelay: "180ms" }} onClick={() => onPick?.("vault-gallery")} title="Open The Gallery">
            <div className="vd-lab">Collection grails</div>
            {data?.grails?.length ? (
              <>
                <div className="vd-spotlight" aria-hidden="true" />
                <div className="vd-shelf">
                  {(() => {
                    // Daily case: hero (role:"hero", first in payload) stands large center-stage;
                    // supporting picks flank it two a side, so the nth-child fan tilts frame the
                    // straight-standing hero in slot 3.
                    const hero = data.grails.find((g) => g.role === "hero") || data.grails[0];
                    const sup = data.grails.filter((g) => g !== hero);
                    const arranged = [...sup.slice(0, 2), hero, ...sup.slice(2, 4)];
                    return arranged.map((g) => {
                      const size = g === hero ? 128 : 76;
                      return (
                        <div key={g.scryfallId || g.name} className="vd-grail" style={{ width: size }}>
                          {g.flagged && <div className="vd-gtag" title="Provenance piece — signed, altered, or showcase">★</div>}
                          <CardThumb scryfallId={g.scryfallId} name={g.name} size={size} />
                          <div className="vd-refl" aria-hidden="true">
                            <div className="vd-refl-inner">
                              <CardThumb scryfallId={g.scryfallId} name={g.name} size={size} />
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
                <div className="vd-floorline" aria-hidden="true" />
                <div style={{ height: 62 }} aria-hidden="true" />
              </>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                No treasure on the shelf yet — flag a card as signed, altered, or ★ showcase in The Stacks, or add cards worth $50+.
              </div>
            )}
          </div>

          <div className="ley-glass vd-pane vd-door vd-rise" style={{ padding: "14px 16px", animationDelay: "250ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            <div className="vd-lab">Value</div>
            {series.length >= 2 ? (
              <div style={{ marginTop: 8 }}>
                <Sparkline series={series} width={340} height={140} grid />
                <div className="vd-chart-notes">
                  <span>{monthLabel(series[0])} · {usd(series[0].value)}</span>
                  <span>PEAK {usd(seriesPeak)}</span>
                  <span>NOW · {usd(series[series.length - 1].value)}</span>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                The value line draws itself as daily price snapshots accumulate — check back tomorrow.
              </div>
            )}
          </div>
        </div>

        {/* ── My Collection table ───────────────────────────────────────────────── */}
        <div className="ley-glass vd-pane vd-rise" style={{ padding: "14px 16px", animationDelay: "320ms" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div className="vd-lab" style={{ flex: 1 }}>My collection</div>
            <button className="btn btn-ghost btn-sm" onClick={() => onPick?.("collection")}>
              Open The Stacks →
            </button>
          </div>
          {data?.rows?.length ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, marginTop: 8 }}>
              <thead>
                <tr style={{ ...mono, fontSize: 9.5, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
                  <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Card</th>
                  <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Set</th>
                  <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>#</th>
                  <th style={{ textAlign: "left", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Finish</th>
                  <th style={{ textAlign: "right", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Qty</th>
                  <th style={{ textAlign: "right", padding: "5px 7px", borderBottom: "1px solid rgba(57,245,126,0.34)" }}>Price</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.slice(0, 12).map((r) => (
                  <tr
                    key={`${r.scryfallId || r.name}-${r.finish}`}
                    className="vd-row"
                    style={{ borderTop: "1px solid var(--ley-line)" }}
                    onClick={() => onPick?.("collection")}
                  >
                    <td style={{ padding: "8px 7px", color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 220 }}>{r.name}</td>
                    <td style={{ padding: "8px 7px", fontSize: 11.5, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }} title={r.setName ? `${r.setName}${r.set ? ` (${r.set})` : ""}` : r.set || undefined}>
                      {formatSetName(r.setName) || r.set || "—"}
                    </td>
                    <td style={{ ...mono, padding: "8px 7px", fontSize: 10.5, color: "var(--ley-text-dim)", whiteSpace: "nowrap" }}>{r.collectorNumber || "—"}</td>
                    <td style={{ padding: "8px 7px", fontSize: 11, color: r.finish === "nonfoil" ? "var(--ley-text-dim)" : "#a7f3d0", whiteSpace: "nowrap" }}>
                      {r.finish === "nonfoil" ? "Normal" : `✦ ${r.finishLabel || `${r.finish[0].toUpperCase()}${r.finish.slice(1)}`}`}
                    </td>
                    <td style={{ padding: "8px 7px", textAlign: "right" }}><span className="vd-qty">{r.qty}</span></td>
                    <td style={{ ...mono, padding: "8px 7px", textAlign: "right", color: "#a7f3d0", fontVariantNumeric: "tabular-nums" }}>{usd(r.unit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
              The vault is empty — open The Stacks and add your first cards (paste a list works).
            </div>
          )}
        </div>
      </div>

      {/* ── Right rail: Vihaan ─────────────────────────────────────────────────── */}
      <VaultRail fontFamily={fontFamily} dashboard={data} />
    </div>
  );
}
