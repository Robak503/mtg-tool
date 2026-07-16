"use client";

/**
 * VaultTrophyPage — C5-P2.4: the full-page trophy view for showpieces.
 *
 * Cards flagged signed / artist proof / altered / showcase open HERE instead
 * of the edit drawer: hero art banner, the card large under the LEYLINE glow,
 * provenance rendered as a plaque, price history, copies, notes. The drawer
 * stays one click away ("Edit details") for changes; everything unflagged
 * keeps the drawer it always had. The drawer's ★ Showcase toggle is the
 * promotion pin.
 */

import { useEffect, useState } from "react";

import Sparkline from "./Sparkline";
import { cardImageProxySrc } from "../../lib/cardImage";
import { rowUnitValue } from "../../lib/showpiece";

const FINISH_LABELS = { nonfoil: "Nonfoil", foil: "Foil", etched: "Etched" };

// The provenance plaque lines for a row — exported so the render test can
// assert the wording without spelunking markup.
export function plaqueLines(row) {
  const lines = [];
  if (row.signed) {
    const bits = [];
    if (row.signed.artist) bits.push(row.signed.artist);
    if (row.signed.inPerson) bits.push("signed in person");
    if (row.signed.event) bits.push(row.signed.event);
    if (row.signed.date) bits.push(row.signed.date);
    lines.push({ label: "Signed", detail: bits.join(" · ") });
  }
  if (row.artistProof) lines.push({ label: "Artist proof", detail: "" });
  if (row.altered) lines.push({ label: "Altered", detail: "" });
  if (row.showcase) lines.push({ label: "Showcase piece", detail: "pinned to the shelf" });
  return lines;
}

export default function VaultTrophyPage({ row, onBack, onEdit, colors, fontFamily }) {
  const [series, setSeries] = useState([]);

  // Local price history for the trend line (advisory — the page renders fine
  // without it). Same endpoint the drawer's sparkline uses.
  useEffect(() => {
    let cancelled = false;
    setSeries([]);
    if (!row.scryfallId) return;
    (async () => {
      try {
        const resp = await fetch(`/api/collection/price-history?scryfallId=${encodeURIComponent(row.scryfallId)}`);
        if (!resp.ok) return;
        const data = await resp.json();
        if (!cancelled && Array.isArray(data.series)) setSeries(data.series);
      } catch {
        /* price history is advisory */
      }
    })();
    return () => { cancelled = true; };
  }, [row.scryfallId]);

  const value = rowUnitValue(row);
  const lines = plaqueLines(row);
  const stacks = (row.stacks || []).filter((s) => (s.quantity || 0) > 0);
  const mono = { fontFamily: "var(--font-mono), monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--ley-text-faint)" };
  const glass = { background: "var(--ley-glass)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid var(--ley-line)", borderRadius: "var(--r-lg)", padding: 16 };

  return (
    <div style={{ flex: 1, overflowY: "auto", fontFamily, color: colors.TEXT, position: "relative" }}>
      {/* Hero art banner — the piece's art crop, dimmed toward the content. */}
      <div style={{ position: "relative", height: 220, overflow: "hidden" }}>
        {row.scryfallId && (
          <img
            src={`/api/art-crop?id=${encodeURIComponent(row.scryfallId)}`}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", filter: "brightness(0.55)" }}
          />
        )}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(0,0,0,0.15) 0%, var(--ley-bg) 100%)" }} />
        <div style={{ position: "absolute", top: 14, left: 20, right: 20, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button onClick={onBack} className="btn btn-ghost btn-sm" title="Back to The Stacks">← The Stacks</button>
          <button onClick={onEdit} className="btn btn-secondary btn-sm" title="Open the edit drawer for this card">Edit details</button>
        </div>
      </div>

      {/* The piece + the plaque. */}
      <div style={{ display: "flex", gap: 26, flexWrap: "wrap", padding: "0 26px 30px", marginTop: -70, position: "relative" }}>
        <div style={{ flexShrink: 0 }}>
          {(row.scryfallId || row.artCropUrl) && (
            <img
              src={cardImageProxySrc(row)}
              alt={row.name}
              style={{
                width: 300,
                aspectRatio: "63 / 88",
                objectFit: "cover",
                borderRadius: 15,
                display: "block",
                border: "1px solid var(--ley-line-bright)",
                boxShadow: "0 0 28px var(--ley-green-glow), 0 10px 30px rgba(0,0,0,0.6)",
                background: colors.BG,
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 320, display: "flex", flexDirection: "column", gap: 14, paddingTop: 76 }}>
          <div>
            <div style={{ ...mono, color: "var(--ley-green)", textShadow: "0 0 8px var(--ley-green-glow)", marginBottom: 6 }}>★ Trophy</div>
            <h1 style={{ margin: 0, fontFamily: "var(--font-display), Georgia, serif", fontSize: 34, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {row.name}
            </h1>
            <div style={{ fontSize: 12, color: "var(--ley-text-dim)", marginTop: 6 }}>
              {row.setCode?.toUpperCase()} · #{row.collectorNumber}
              {row.language && row.language !== "en" ? ` · ${String(row.language).toUpperCase()}` : ""}
            </div>
          </div>

          {/* The plaque. */}
          {lines.length > 0 && (
            <div style={{ ...glass, borderColor: "var(--ley-line-bright)" }}>
              <div style={{ ...mono, marginBottom: 10 }}>Provenance</div>
              {lines.map((l) => (
                <div key={l.label} style={{ display: "flex", alignItems: "baseline", gap: 10, padding: "5px 0" }}>
                  <span style={{ color: "var(--ley-green)", fontSize: 13 }}>★</span>
                  <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--font-display), sans-serif" }}>{l.label}</span>
                  {l.detail && <span style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>{l.detail}</span>}
                </div>
              ))}
            </div>
          )}

          {/* Worth + trend. */}
          <div style={glass}>
            <div style={{ ...mono, marginBottom: 10 }}>Worth</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
              {value > 0 && (
                <div>
                  <div style={{ fontFamily: "var(--font-display), sans-serif", fontSize: 28, fontWeight: 700, color: "var(--ley-green)", lineHeight: 1 }}>
                    ${value.toFixed(2)}
                  </div>
                  <div style={{ ...mono, marginTop: 5 }}>current · best owned finish</div>
                </div>
              )}
              {series.length >= 2 && (
                <div>
                  <Sparkline points={series} width={220} height={44} />
                  <div style={{ ...mono, marginTop: 5 }}>
                    ${series[0].usd.toFixed(2)} → ${series[series.length - 1].usd.toFixed(2)}
                  </div>
                </div>
              )}
              {value <= 0 && series.length < 2 && (
                <div style={{ fontSize: 12, color: "var(--ley-text-dim)" }}>No price on record yet.</div>
              )}
            </div>
          </div>

          {/* The physical copies. */}
          {stacks.length > 0 && (
            <div style={glass}>
              <div style={{ ...mono, marginBottom: 10 }}>In the vault</div>
              {stacks.map((s, i) => (
                <div key={`${s.finish}-${i}`} style={{ fontSize: 13, padding: "3px 0", color: colors.TEXT }}>
                  {s.quantity}× {FINISH_LABELS[s.finish] || s.finish} · {s.condition || "NM"}
                  {Number.isFinite(s.paidUsd) ? ` · paid $${s.paidUsd.toFixed(2)}` : ""}
                  {s.acquiredAt ? ` · acquired ${s.acquiredAt}` : ""}
                </div>
              ))}
            </div>
          )}

          {/* Notes, when the collector wrote any. */}
          {row.notes && (
            <div style={glass}>
              <div style={{ ...mono, marginBottom: 10 }}>Notes</div>
              <div style={{ fontSize: 13, color: colors.TEXT, whiteSpace: "pre-wrap", lineHeight: 1.55 }}>{row.notes}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
