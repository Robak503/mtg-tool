"use client";

/**
 * CollectionGrid — virtualized grid of FULL card images.
 *
 * Uses @tanstack/react-virtual to render only rows in the viewport. At
 * 5,000 cards this avoids ~5,000 DOM nodes and keeps the grid at 60fps.
 *
 * Layout: each cell IS the card (63:88, frame + name + text box — the way it
 * looks on the table), served by /api/card-image (local-first AppData cache,
 * exact owned printing by scryfallId). Qty stepper, wishlist/conflict badges
 * and the tag stripe overlay the card. Click → onCardClick(row).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

import { cardImageProxySrc } from "../../lib/cardImage";
import { isShowpiece } from "../../lib/showpiece";

const CARD_WIDTH = 200;
// Real Magic card ratio (63mm × 88mm).
const CARD_HEIGHT = Math.round(CARD_WIDTH * 88 / 63);
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

// Layout-only override for the grid quick-adjust steppers: keep the tight
// 22px square inside the pill; variant classes carry all color.
const STEP_BTN_LAYOUT = { width: 22, height: 22 };

function CardCell({ card, qty, wishlist, isSelected, isConflicted, selectMode, isChecked, onClick, onQuickAdjust, tag, colors }) {
  const [imgError, setImgError] = useState(false);
  // A real (non-default) color tag paints a left-edge stripe in its color.
  const tagStripe = tag && tag.id !== "default" && !tag.builtin ? tag : null;
  // C5-P2.1 — elevated cells: provenance-flagged rows (signed / artist proof /
  // altered / showcase) read as treasure in the grid — glow ring + ★ chip.
  // Bulk stays exactly as compact as before.
  const showpiece = isShowpiece(card);
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
      aria-label={selectMode
        ? `${isChecked ? "Deselect" : "Select"} ${card.name}`
        : `View ${card.name} details`}
      className="ley-card"
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
        border: `1px solid ${isSelected ? colors.GOLD : showpiece ? "var(--ley-line-bright)" : colors.LINE}`,
        boxShadow: showpiece ? "0 0 14px var(--ley-green-glow)" : undefined,
        // Match a real card's corner radius at this size (~4.5% of width).
        borderRadius: 10,
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
        height: "100%",
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
          <span aria-hidden style={{ position: "absolute", inset: 0, zIndex: 2, background: "var(--ley-green-dim)" }} />
        )}
        {(card.scryfallId || card.artCropUrl) && !imgError ? (
          <img
            src={cardImageProxySrc(card)}
            alt=""
            loading="lazy"
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          // Offline + uncached: a text stand-in so the cell still names the card.
          <div style={{
            width: "100%", height: "100%",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 6, color: colors.MUTED, fontSize: 12, padding: 14, textAlign: "center",
            boxSizing: "border-box",
          }}>
            <span style={{ color: colors.TEXT, fontWeight: 600, lineHeight: 1.3 }}>{card.name}</span>
            <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              {card.setCode} · #{card.collectorNumber}
            </span>
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
              boxShadow: "0 0 6px var(--ley-red-dim)",
            }}
          />
        )}
        {showpiece && !selectMode && (
          <span
            aria-hidden
            title="Showpiece"
            style={{
              position: "absolute", bottom: 6, left: 6, zIndex: 3,
              fontSize: 11, lineHeight: "14px", color: "var(--ley-green)",
              background: "rgba(5,7,5,0.82)",
              border: "1px solid var(--ley-line-bright)",
              borderRadius: 4, padding: "1px 5px",
            }}
          >
            ★
          </span>
        )}
        {!wishlist && onQuickAdjust && (
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute", top: 6, right: 6,
              display: "flex", alignItems: "stretch",
              background: "rgba(5,7,5,0.82)",
              border: `1px solid ${colors.LINE}`,
              borderRadius: 5, overflow: "hidden",
            }}
          >
            <button
              onClick={step(-1)}
              aria-label={qty <= 1 ? `Remove ${card.name} from collection` : `Decrease ${card.name} quantity`}
              title={qty <= 1 ? "Remove from collection" : "Decrease quantity"}
              className={qty <= 1 ? "btn btn-danger btn-sm btn-icon" : "btn btn-ghost btn-sm btn-icon"}
              style={STEP_BTN_LAYOUT}
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
              className="btn btn-ghost btn-sm btn-icon"
              style={STEP_BTN_LAYOUT}
            >
              +
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
