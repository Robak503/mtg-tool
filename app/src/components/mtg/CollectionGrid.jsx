"use client";

/**
 * CollectionGrid — virtualized grid of card thumbnails.
 *
 * Uses @tanstack/react-virtual to render only rows in the viewport. At
 * 5,000 cards this avoids ~5,000 DOM nodes and keeps the grid at 60fps.
 *
 * Layout: art crop on top, name + qty badge below. Click → onCardClick(row).
 *
 * Art crops are fetched directly from Scryfall CDN URLs stored on each
 * row (POST /api/collection adds these from the printingIndex). For
 * fully offline operation the renderer could be swapped to lazy-cache
 * to AppData on first view — deferred to a later phase.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

const CARD_WIDTH = 200;
const CARD_HEIGHT = 230;
const GAP = 12;

export default function CollectionGrid({ cards, onCardClick, selectedScryfallId, conflictedOracleIds, colors }) {
  const parentRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track container width so we can compute the column count for the
  // current viewport. ResizeObserver fires on layout shifts (sidebar
  // toggles, window resize) without polling.
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setContainerWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const columnCount = Math.max(1, Math.floor((containerWidth + GAP) / (CARD_WIDTH + GAP)));
  const rowCount = Math.ceil(cards.length / columnCount);

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => CARD_HEIGHT + GAP,
    overscan: 4,
  });

  // Compute total owned per row for the qty badge (sum across stacks).
  const rowMeta = useMemo(() => {
    return cards.map(row => {
      const total = (row.stacks || []).reduce((s, st) => s + (st.quantity || 0), 0);
      return { total, wishlist: !!row.wishlist };
    });
  }, [cards]);

  return (
    <div
      ref={parentRef}
      style={{
        height: "100%",
        overflow: "auto",
        padding: GAP,
      }}
    >
      <div style={{
        height: rowVirtualizer.getTotalSize(),
        width: "100%",
        position: "relative",
      }}>
        {rowVirtualizer.getVirtualItems().map(virtualRow => {
          const startIdx = virtualRow.index * columnCount;
          const slice = cards.slice(startIdx, startIdx + columnCount);
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                transform: `translateY(${virtualRow.start}px)`,
                width: "100%",
                display: "flex",
                gap: GAP,
                paddingBottom: GAP,
              }}
            >
              {slice.map((card, sliceIdx) => {
                const meta = rowMeta[startIdx + sliceIdx];
                const isSelected = card.scryfallId === selectedScryfallId;
                const isConflicted = conflictedOracleIds?.has(card.oracleId);
                return (
                  <CardCell
                    key={card.scryfallId}
                    card={card}
                    qty={meta.total}
                    wishlist={meta.wishlist}
                    isSelected={isSelected}
                    isConflicted={isConflicted}
                    onClick={() => onCardClick?.(card)}
                    colors={colors}
                  />
                );
              })}
              {/* pad the last row so cells stay left-aligned */}
              {slice.length < columnCount && Array.from({ length: columnCount - slice.length }).map((_, i) => (
                <div key={`pad-${i}`} style={{ width: CARD_WIDTH, flexShrink: 0 }} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CardCell({ card, qty, wishlist, isSelected, isConflicted, onClick, colors }) {
  const [imgError, setImgError] = useState(false);
  return (
    <button
      onClick={onClick}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        flexShrink: 0,
        padding: 0,
        background: colors.BG3,
        border: `1px solid ${isSelected ? colors.GOLD : colors.LINE}`,
        borderRadius: 6,
        cursor: "pointer",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        textAlign: "left",
        color: colors.TEXT,
        fontFamily: "inherit",
      }}
      title={`${card.name}  ·  ${card.setCode?.toUpperCase()} #${card.collectorNumber}`}
    >
      <div style={{
        width: "100%",
        height: 140,
        background: colors.BG,
        position: "relative",
        overflow: "hidden",
      }}>
        {card.artCropUrl && !imgError ? (
          <img
            src={card.artCropUrl}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: colors.MUTED, fontSize: 11, padding: 12, textAlign: "center",
          }}>
            {card.name}
          </div>
        )}
        {wishlist && (
          <span style={{
            position: "absolute", top: 6, left: 6,
            background: colors.GOLD, color: colors.BG,
            fontSize: 10, padding: "2px 6px", borderRadius: 3,
            fontWeight: 600, letterSpacing: "0.05em",
          }}>
            WISHLIST
          </span>
        )}
        {isConflicted && !wishlist && (
          <span
            title="This card is used across decks more times than you own copies"
            style={{
              position: "absolute", top: 6, left: 6,
              width: 10, height: 10, borderRadius: 5,
              background: colors.RED,
              boxShadow: "0 0 6px rgba(196,83,78,0.7)",
            }}
          />
        )}
        {!wishlist && qty > 1 && (
          <span style={{
            position: "absolute", top: 6, right: 6,
            background: "rgba(0,0,0,0.7)", color: colors.TEXT,
            fontSize: 12, padding: "2px 7px", borderRadius: 3,
            fontWeight: 600,
          }}>
            ×{qty}
          </span>
        )}
      </div>
      <div style={{
        padding: "8px 10px",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <div style={{
          fontSize: 12,
          color: colors.TEXT,
          fontWeight: 500,
          lineHeight: 1.3,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}>
          {card.name}
        </div>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 10,
          color: colors.MUTED,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          <span>{card.setCode}</span>
          <span>#{card.collectorNumber}</span>
        </div>
      </div>
    </button>
  );
}
