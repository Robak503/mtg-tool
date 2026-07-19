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
    return { d, area: `${d} L${xs[xs.length - 1].toFixed(1)},${height - 4} L${xs[0].toFixed(1)},${height - 4} Z` };
  }, [series, width, height]);

  if (!path) return null;
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: "100%", height: "auto", display: "block" }} aria-hidden="true">
      <path d={path.area} fill="var(--ley-green-faint)" stroke="none" />
      <path d={path.d} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" />
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

  const glass = {
    background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)",
    border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)",
  };
  const tileLabel = { ...mono, fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--ley-green)" };
  const doorish = { cursor: "pointer" };

  const movers = data?.movers;

  return (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: "20px 22px", overflow: "hidden", fontFamily, minHeight: 0 }}>
      {/* ── Main column ─────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minWidth: 0, overflowY: "auto", paddingRight: 2 }}>
        {/* Header: title + Rooms dropdown */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 22, fontWeight: 700, color: "var(--ley-text)", letterSpacing: "0.04em" }}>THE VAULT</span>
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setRoomsOpen((o) => !o)} aria-expanded={roomsOpen}>
              Rooms ▾
            </button>
            {roomsOpen && (
              <div style={{ ...glass, position: "absolute", right: 0, top: "110%", zIndex: 30, minWidth: 170, padding: 6, display: "flex", flexDirection: "column", gap: 2 }}>
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

        {error && <div style={{ ...glass, padding: 12, fontSize: 12.5, color: "var(--ley-red)", borderColor: "var(--ley-red)" }}>{error}</div>}

        {/* ── Tile row ──────────────────────────────────────────────────────────── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.2fr 1.6fr", gap: 12 }}>
          <div style={{ ...glass, ...doorish, padding: "14px 16px" }} onClick={() => onPick?.("vault-census")} title="Open The Census">
            <div style={tileLabel}>Unique printings</div>
            <div style={{ ...mono, fontSize: 30, fontWeight: 700, color: "var(--ley-text)", marginTop: 4 }}>
              {data ? data.uniquePrintings.toLocaleString() : "—"}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ley-text-dim)" }}>{data ? `${data.totalQuantity.toLocaleString()} total copies` : ""}</div>
          </div>

          <div style={{ ...glass, ...doorish, padding: "14px 16px" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            <div style={tileLabel}>Vault value</div>
            <div style={{ ...mono, fontSize: 30, fontWeight: 700, color: "var(--ley-text)", marginTop: 4 }}>
              {data ? usd(data.vaultValue) : "—"}
            </div>
            <div style={{ height: 18, marginTop: 2 }}>
              {data?.valueSeries?.length >= 2 && <Sparkline series={data.valueSeries} width={220} height={18} />}
            </div>
          </div>

          <div style={{ ...glass, ...doorish, padding: "14px 16px", display: "flex", gap: 14 }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
            {movers?.status === "ok" ? (
              <>
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.winner.scryfallId} name={movers.winner.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={tileLabel}>Week's winner</div>
                    <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: "var(--ley-green)" }}>+{movers.winner.pctChange.toFixed(0)}%</div>
                    <div style={{ fontSize: 10, color: "var(--ley-text-dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movers.winner.name}</div>
                  </div>
                </div>
                <div style={{ width: 1, background: "var(--ley-line)" }} />
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", minWidth: 0 }}>
                  <CardThumb scryfallId={movers.loser.scryfallId} name={movers.loser.name} size={40} />
                  <div style={{ minWidth: 0 }}>
                    <div style={tileLabel}>Week's loser</div>
                    <div style={{ ...mono, fontSize: 20, fontWeight: 700, color: "var(--ley-red)" }}>{movers.loser.pctChange.toFixed(0)}%</div>
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
          <div style={{ ...glass, ...doorish, padding: "14px 16px" }} onClick={() => onPick?.("vault-gallery")} title="Open The Gallery">
            <div style={tileLabel}>Collection grails</div>
            {data?.grails?.length ? (
              <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "flex-end" }}>
                {data.grails.map((g) => (
                  <div key={g.scryfallId || g.name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <CardThumb scryfallId={g.scryfallId} name={g.name} size={92} />
                    <div style={{ width: 70, height: 5, borderRadius: "50%", background: "var(--ley-green-dim)", boxShadow: "0 0 12px var(--ley-green-dim)" }} />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 10, lineHeight: 1.5 }}>
                No treasure on the shelf yet — flag a card as signed, altered, or ★ showcase in The Stacks, or add cards worth $50+.
              </div>
            )}
          </div>

          <div style={{ ...glass, ...doorish, padding: "14px 16px" }} onClick={() => onPick?.("vault-ledger")} title="Open The Ledger">
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
        <div style={{ ...glass, padding: "14px 16px" }}>
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
