"use client";

/**
 * VaultDashboard — The Vault's new front door (V1 of the rework).
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
 */
import { useCallback, useEffect, useMemo, useState } from "react";

import VaultRail from "./VaultRail";


/* THE VAULT "boot sequence" — original-Xbox-startup energy (Colton: "up to 11, show off").
   Organic breathing light, not sci-fi lines: plasma blobs drifting in the void, staggered
   emergence from darkness, a chrome-green title with a light sweep, pedestals that pulse.
   Motion is transform/opacity/shadow only; every animation dies under reduced-motion. */
const VD_CSS = `
@keyframes vdPlasma {
  0%   { transform: translate(0, 0) scale(1);      opacity: 0.55; }
  50%  { transform: translate(4%, 6%) scale(1.18); opacity: 0.95; }
  100% { transform: translate(-3%, -2%) scale(1);  opacity: 0.55; }
}
@keyframes vdPlasma2 {
  0%   { transform: translate(0, 0) scale(1.1);      opacity: 0.35; }
  50%  { transform: translate(-5%, -4%) scale(0.92); opacity: 0.7; }
  100% { transform: translate(2%, 5%) scale(1.1);    opacity: 0.35; }
}
@keyframes vdRise {
  from { opacity: 0; transform: translateY(16px) scale(0.985); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes vdTitleSheen {
  0%, 55% { background-position: -220% 0; }
  100%    { background-position: 220% 0; }
}
@keyframes vdBreatheGlow {
  0%, 100% { box-shadow: var(--ley-aura-soft), var(--ley-top-edge), inset 0 0 22px rgba(57,245,126,0.04); }
  50%      { box-shadow: var(--ley-aura), var(--ley-top-edge), inset 0 0 30px rgba(57,245,126,0.08); }
}
@keyframes vdPedestal {
  0%, 100% { box-shadow: 0 0 14px 3px var(--ley-green-glow); opacity: 0.75; }
  50%      { box-shadow: 0 0 26px 7px var(--ley-green-glow); opacity: 1; }
}
@keyframes vdDrawLine { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
@keyframes vdEndPulse {
  0%, 100% { r: 3;   opacity: 0.9; }
  50%      { r: 5.5; opacity: 0.45; }
}
.vd-plasma, .vd-plasma2 { position: absolute; border-radius: 50%; pointer-events: none; will-change: transform, opacity; }
.vd-plasma  { animation: vdPlasma 13s ease-in-out infinite; }
.vd-plasma2 { animation: vdPlasma2 19s ease-in-out infinite; }
.vd-rise { opacity: 0; animation: vdRise 640ms var(--ease-snap) forwards; }
.vd-title {
  background: linear-gradient(100deg, var(--ley-green-text) 20%, #ffffff 38%, var(--ley-green) 46%, var(--ley-green-text) 62%);
  background-size: 220% 100%;
  -webkit-background-clip: text; background-clip: text; color: transparent;
  animation: vdTitleSheen 5.5s ease-in-out infinite;
  filter: drop-shadow(0 0 14px rgba(57,245,126,0.35));
}
.vd-tile { animation: vdBreatheGlow 4.8s ease-in-out infinite; }
.vd-pedestal { animation: vdPedestal 3.6s ease-in-out infinite; }
.vd-grail { transition: transform 220ms var(--ease-snap), filter 220ms var(--ease-snap); }
.vd-grail:hover { transform: translateY(-8px); filter: drop-shadow(0 0 18px rgba(57,245,126,0.4)); }
.vd-chart-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: vdDrawLine 1400ms var(--ease-snap) 250ms forwards; }
.vd-end-dot { animation: vdEndPulse 2.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  .vd-plasma, .vd-plasma2, .vd-rise, .vd-title, .vd-tile, .vd-pedestal, .vd-chart-line, .vd-end-dot { animation: none; }
  .vd-rise { opacity: 1; }
  .vd-chart-line { stroke-dasharray: none; stroke-dashoffset: 0; }
}
`;

/** Boot-up count: the tiles tick from 0 to value on mount (the startup feel). */
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

/** A tiny inline sparkline/area chart — no chart lib, pure SVG off the series. */
function Sparkline({ series, width = 620, height = 150, stroke = "var(--ley-green)" }) {
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
  // Depth = light: a blurred phosphor underlay beneath the crisp line + a fading area gradient —
  // the flat fill/stroke first cut is why the chart read stale next to the mock.
  const gid = `vd-grad-${width}x${height}`;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(57,245,126,0.28)" />
          <stop offset="100%" stopColor="rgba(57,245,126,0)" />
        </linearGradient>
        <filter id={`${gid}-blur`} x="-20%" y="-40%" width="140%" height="180%">
          <feGaussianBlur stdDeviation="3.5" />
        </filter>
      </defs>
      <path d={path.area} fill={`url(#${gid})`} stroke="none" />
      <path d={path.d} fill="none" stroke={stroke} strokeWidth="3" strokeLinejoin="round" opacity="0.55" filter={`url(#${gid}-blur)`} />
      <path className="vd-chart-line" pathLength="1" d={path.d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
      {path.end && <circle className="vd-end-dot" cx={path.end[0]} cy={path.end[1]} r="3" fill={stroke} />}
    </svg>
  );
}

function CardThumb({ scryfallId, name, size = 92 }) {
  return (
    <div style={{ width: size, aspectRatio: "63 / 88", borderRadius: 6, overflow: "hidden", background: "var(--ley-surface-2)", border: "1px solid var(--ley-line)", position: "relative", flexShrink: 0 }}>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", padding: 4, textAlign: "center", fontSize: 9, lineHeight: 1.25, color: "var(--ley-text)" }}>{name}</div>
      <img
        src={scryfallId ? `/api/card-image?id=${encodeURIComponent(scryfallId)}` : `/api/card-image?name=${encodeURIComponent(name || "")}`}
        alt=""
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
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

  // Depth = light (Colton, 2026-07-19): panels use the SYSTEM glass classes (.ley-glass — gradient
  // wash + aura + lit top edge), never a flat fill with a hairline. The flat first cut read as stale
  // next to the mock; the recipe already existed and simply wasn't used.
  const tileLabel = { ...mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-green)" };
  const glowNum = { textShadow: "0 0 16px var(--ley-green-glow), 0 0 2px var(--ley-green-glow)" };
  const doorish = { cursor: "pointer" };

  const movers = data?.movers;
  const countPrintings = useCountUp(data?.uniquePrintings ?? 0);
  const countValue = useCountUp(data?.vaultValue ?? 0);

  return (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0, position: "relative", background: "radial-gradient(ellipse 100% 70% at 50% -10%, rgba(86,214,93,0.08) 0%, rgba(86,214,93,0.015) 36%, transparent 62%), var(--ley-bg)" }}>
      <style>{VD_CSS}</style>
      {/* The living light — plasma drifting in the void behind the glass (the boot-screen heartbeat). */}
      <div className="vd-plasma" aria-hidden="true" style={{ width: "55%", height: "60%", left: "8%", top: "-18%", background: "radial-gradient(circle, rgba(57,245,126,0.11) 0%, rgba(57,245,126,0.035) 45%, transparent 70%)" }} />
      <div className="vd-plasma2" aria-hidden="true" style={{ width: "45%", height: "55%", right: "12%", bottom: "-20%", background: "radial-gradient(circle, rgba(57,245,126,0.08) 0%, rgba(57,245,126,0.02) 50%, transparent 72%)" }} />
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        {/* Header: title + Rooms dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span className="vd-title" style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 24, fontWeight: 800, letterSpacing: "0.09em" }}>THE VAULT</span>
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
          <div className="ley-glass vd-tile vd-rise" style={{ ...doorish, padding: "14px 16px", animationDelay: "60ms" }} onClick={() => onPick?.("vault-census")} title="Open The Census">
            <div style={tileLabel}>Unique printings</div>
            <div style={{ ...mono, ...glowNum, fontSize: 30, fontWeight: 700, color: "var(--ley-text)", marginTop: 4 }}>
              {data ? Math.round(countPrintings).toLocaleString() : "—"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)" }}>{data ? `${data.totalQuantity.toLocaleString()} total copies` : ""}</div>
          </div>

          <div className="ley-glass vd-tile vd-rise" style={{ ...doorish, padding: "14px 16px", animationDelay: "140ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            <div style={tileLabel}>Vault value</div>
            <div style={{ ...mono, ...glowNum, fontSize: 30, fontWeight: 700, color: "var(--ley-text)", marginTop: 4 }}>
              {data ? usd(countValue) : "—"}
            </div>
            <div style={{ height: 18, marginTop: 2 }}>
              {data?.valueSeries?.length >= 2 && <Sparkline series={data.valueSeries} width={220} height={18} />}
            </div>
          </div>

          <div className="ley-glass vd-tile vd-rise" style={{ ...doorish, padding: "14px 16px", display: "flex", gap: 14, animationDelay: "220ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            {movers?.status === "ok" ? (
              <>
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.winner.scryfallId} name={movers.winner.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={tileLabel}>Week's winner</div>
                    <div style={{ ...mono, ...glowNum, fontSize: 20, fontWeight: 700, color: "var(--ley-green)" }}>+{movers.winner.pctChange.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movers.winner.name}</div>
                  </div>
                </div>
                <div style={{ width: 1, background: "var(--ley-line)" }} />
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.loser.scryfallId} name={movers.loser.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={tileLabel}>Week's loser</div>
                    <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: "var(--ley-red)", textShadow: "0 0 14px rgba(248,113,113,0.4)" }}>{movers.loser.pctChange.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movers.loser.name}</div>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ flex: 1 }}>
                <div style={tileLabel}>Week's winner · loser</div>
                <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 6, lineHeight: 1.45 }}>
                  Building a week of price history… {movers?.reason ? `(${movers.reason})` : ""}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Grails + value graph ──────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.7fr 1fr", gap: 12 }}>
          <div className="ley-glass vd-rise" style={{ ...doorish, padding: "14px 16px", animationDelay: "320ms" }} onClick={() => onPick?.("vault-gallery")} title="Open The Gallery">
            <div style={tileLabel}>Collection grails</div>
            {data?.grails?.length ? (
              <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
                {data.grails.map((g) => (
                  <div key={g.scryfallId || g.name} className="vd-grail" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <CardThumb scryfallId={g.scryfallId} name={g.name} size={92} />
                    <div className="vd-pedestal" style={{ width: 70, height: 5, borderRadius: "50%", background: "var(--ley-green-dim)", animationDelay: `${(data.grails.indexOf(g) % 5) * 500}ms` }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                No treasure on the shelf yet — flag a card as signed, altered, or ★ showcase in The Stacks, or add cards worth $50+.
              </div>
            )}
          </div>

          <div className="ley-glass vd-rise" style={{ ...doorish, padding: "14px 16px", animationDelay: "400ms" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            <div style={tileLabel}>Value</div>
            {data?.valueSeries?.length >= 2 ? (
              <div style={{ marginTop: 8 }}><Sparkline series={data.valueSeries} width={340} height={140} /></div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                The value line draws itself as daily price snapshots accumulate — check back tomorrow.
              </div>
            )}
          </div>
        </div>

        {/* ── My Collection table ───────────────────────────────────────────────── */}
        <div className="ley-glass vd-rise" style={{ padding: "14px 16px", animationDelay: "480ms" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <div style={tileLabel}>My collection</div>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={() => onPick?.("collection")}>
              Open The Stacks →
            </button>
          </div>
          {data?.rows?.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: 22, marginTop: 8 }}>
              {[0, 1].map((col) => (
                <table key={col} style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ ...mono, fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ley-text-dim)" }}>
                      <th style={{ textAlign: "left", padding: "4px 6px" }}>Card</th>
                      <th style={{ textAlign: "right", padding: "4px 6px" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "4px 6px" }}>Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.slice(col * 6, col * 6 + 6).map((r) => (
                      <tr
                        key={r.scryfallId || r.name}
                        style={{ borderTop: "1px solid var(--ley-line)", cursor: "pointer" }}
                        onClick={() => onPick?.("collection")}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ley-green-faint)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <td style={{ padding: "7px 6px", color: "var(--ley-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 180 }}>{r.name}</td>
                        <td style={{ ...mono, padding: "7px 6px", textAlign: "right", color: "var(--ley-text-dim)" }}>{r.qty}</td>
                        <td style={{ ...mono, padding: "7px 6px", textAlign: "right", color: "var(--ley-text)" }}>{usd(r.unit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ))}
            </div>
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
