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

import { artCropProxySrc } from "../../lib/artCrop";

const CARD_WIDTH = 200;
const CARD_HEIGHT = 230;
const GAP = 12;

export default function CollectionGrid({ cards, onCardClick, onQuickAdjust, selectedScryfallId, conflictedOracleIds, tagMap, colors, selectMode = false, selectedIds, onToggleSelect }) {
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
                const isChecked = selectMode && !!selectedIds?.has(card.scryfallId);
                const isSelected = selectMode ? isChecked : card.scryfallId === selectedScryfallId;
                const isConflicted = conflictedOracleIds?.has(card.oracleId);
                return (
                  <CardCell
                    key={card.scryfallId}
                    card={card}
                    qty={meta.total}
                    wishlist={meta.wishlist}
                    isSelected={isSelected}
                    isConflicted={isConflicted}
                    selectMode={selectMode}
                    isChecked={isChecked}
                    onClick={() => (selectMode ? onToggleSelect?.(card.scryfallId) : onCardClick?.(card))}
                    onQuickAdjust={selectMode ? undefined : onQuickAdjust}
                    tag={card.colorTagId ? tagMap?.[card.colorTagId] : null}
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

function stepBtnStyle(colors, color) {
  return {
    background: "none",
    border: "none",
    color,
    cursor: "pointer",
    fontSize: 15,
    lineHeight: 1,
    fontWeight: 700,
    width: 22,
    height: 22,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 0,
    fontFamily: "inherit",
  };
}

function CardCell({ card, qty, wishlist, isSelected, isConflicted, selectMode, isChecked, onClick, onQuickAdjust, tag, colors }) {
  const [imgError, setImgError] = useState(false);
  // A real (non-default) color tag paints a left-edge stripe in its color.
  const tagStripe = tag && tag.id !== "default" && !tag.builtin ? tag : null;
  // Stop the stepper clicks from bubbling to the cell button (which opens the
  // detail drawer). A decrement at the last copy deletes the row upstream.
  const step = (delta) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    onQuickAdjust?.(card.scryfallId, delta);
  };
  return (
    // Card container is a div (role="button"), NOT a <button>: the quantity
    // steppers below are real <button>s, and a <button> cannot legally contain
    // another <button> (React hydration error). Keyboard support is wired by
    // hand so the card stays openable via Enter/Space.
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
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
      title={tagStripe
        ? `${card.name}  ·  ${card.setCode?.toUpperCase()} #${card.collectorNumber}  ·  ${tagStripe.name}`
        : `${card.name}  ·  ${card.setCode?.toUpperCase()} #${card.collectorNumber}`}
    >
      {tagStripe && (
        <span
          aria-hidden
          style={{
            position: "absolute", left: 0, top: 0, bottom: 0,
            width: 4, background: tagStripe.color, zIndex: 3,
          }}
        />
      )}
      <div style={{
        width: "100%",
        height: 140,
        background: colors.BG,
        position: "relative",
        overflow: "hidden",
      }}>
        {selectMode && (
          <span
            aria-hidden
            style={{
              position: "absolute", top: 6, left: 6, zIndex: 4,
              width: 20, height: 20, borderRadius: "50%",
              border: `2px solid ${isChecked ? colors.GOLD : "rgba(255,255,255,0.85)"}`,
              background: isChecked ? colors.GOLD : "rgba(0,0,0,0.5)",
              color: colors.BG, fontSize: 13, fontWeight: 900, lineHeight: "16px",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 1px 4px rgba(0,0,0,0.5)",
            }}
          >
            {isChecked ? "✓" : ""}
          </span>
        )}
        {selectMode && isChecked && (
          <span aria-hidden style={{ position: "absolute", inset: 0, zIndex: 2, background: "rgba(217,165,49,0.18)" }} />
        )}
        {(card.scryfallId || card.artCropUrl) && !imgError ? (
          <img
            src={artCropProxySrc(card)}
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
        {!wishlist && onQuickAdjust && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 6, right: 6,
              display: "flex", alignItems: "stretch",
              background: "rgba(0,0,0,0.74)",
              border: `1px solid ${colors.LINE}`,
              borderRadius: 5, overflow: "hidden",
              backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
            }}
          >
            <button
              onClick={step(-1)}
              aria-label={qty <= 1 ? `Remove ${card.name} from collection` : `Decrease ${card.name} quantity`}
              title={qty <= 1 ? "Remove from collection" : "Decrease quantity"}
              style={stepBtnStyle(colors, qty <= 1 ? colors.RED : colors.TEXT)}
            >
              −
            </button>
            <span style={{
              minWidth: 22, padding: "0 2px",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: colors.TEXT, fontSize: 12, fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
            }}>
              {qty}
            </span>
            <button
              onClick={step(+1)}
              aria-label={`Increase ${card.name} quantity`}
              title="Add a copy"
              style={stepBtnStyle(colors, colors.TEXT)}
            >
              +
            </button>
          </div>
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
    </div>
  );
}
