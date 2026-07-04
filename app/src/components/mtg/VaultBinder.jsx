"use client";

/**
 * VaultBinder — 9-pocket binder view for The Stacks (wave V8). Renders full
 * card images (local /api/card-image cache) in 3×3 pages instead of the
 * art-crop grid. One page = 9 images, so no virtualization needed; prev/next
 * page through the (already-filtered, already-sorted) card list.
 */

import { useEffect, useState } from "react";

import { cardImageProxySrc } from "../../lib/cardImage";

const PER_PAGE = 9;

export default function VaultBinder({ cards, onCardClick, tagMap }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil((cards?.length || 0) / PER_PAGE));

  // Clamp when the filtered list shrinks under the current page.
  useEffect(() => { if (page >= pageCount) setPage(pageCount - 1); }, [pageCount, page]);

  const start = page * PER_PAGE;
  const pageCards = (cards || []).slice(start, start + PER_PAGE);

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, maxWidth: 720, margin: "0 auto" }}>
          {pageCards.map((row) => {
            const qty = (row.stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);
            const tag = row.colorTagId ? tagMap?.[row.colorTagId] : null;
            return (
              <button
                key={row.scryfallId}
                onClick={() => onCardClick?.(row)}
                style={{ position: "relative", padding: 0, border: "none", background: "transparent", cursor: "pointer", aspectRatio: "63 / 88" }}
                title={row.name}
              >
                <img
                  src={cardImageProxySrc(row)}
                  alt={row.name}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.style.opacity = "0.15"; }}
                  style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8, border: "1px solid var(--ley-line)", boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
                />
                {qty > 1 && (
                  <span style={{ position: "absolute", top: 6, right: 6, background: "var(--ley-glass-strong)", border: "1px solid var(--ley-line-bright)", color: "var(--ley-text)", borderRadius: 10, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>×{qty}</span>
                )}
                {tag && (
                  <span style={{ position: "absolute", bottom: 6, left: 6, width: 12, height: 12, borderRadius: "50%", background: tag.color, border: "1px solid var(--ley-line-bright)" }} title={tag.name} />
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, padding: "10px 20px", borderTop: "1px solid var(--ley-line)" }}>
        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-secondary btn-sm">‹ Prev</button>
        <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: 11, letterSpacing: "0.1em", color: "var(--ley-text-dim)" }}>
          Page {page + 1} / {pageCount}
        </span>
        <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={page >= pageCount - 1} className="btn btn-secondary btn-sm">Next ›</button>
      </div>
    </div>
  );
}
