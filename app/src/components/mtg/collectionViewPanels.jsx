/**
 * collectionViewPanels.jsx — the pure presentational panels of the Vault collection view,
 * extracted from CollectionView.jsx (god-component decomp, WAVE 5 B4). Each takes explicit props
 * (colors/font included) and holds NO CollectionView state; the render-fingerprint gate
 * (CollectionViewRenderFingerprint.test.jsx) proves the extraction changed no markup.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import useEscapeClose from "../../hooks/useEscapeClose";
import { buildShelf } from "../../lib/showpiece";

export function ConflictsModal({ conflicts, totalDecks, onClose, colors }) {
  useEscapeClose(onClose);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: 560,
          maxWidth: "calc(100vw - 40px)",
          maxHeight: "calc(100vh - 80px)",
          display: "flex",
          flexDirection: "column",
          color: colors.TEXT,
        }}
      >
        <header
          style={{
            padding: "14px 18px",
            borderBottom: `1px solid ${colors.LINE}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 14,
                color: colors.TEXT,
                fontWeight: 500,
                fontFamily: "var(--font-display)",
              }}
            >
              Cross-deck conflicts
            </div>
            <div style={{ fontSize: 11, color: colors.MUTED, marginTop: 2 }}>
              Across {totalDecks} deck{totalDecks === 1 ? "" : "s"}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="btn btn-ghost btn-icon btn-sm">
            ×
          </button>
        </header>
        <div style={{ overflowY: "auto", padding: "8px 0" }}>
          {conflicts.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: colors.MUTED, fontSize: 13 }}>
              No conflicts. Every deck card has enough physical copies.
            </div>
          )}
          {conflicts.map((c) => (
            <div
              key={c.oracleId}
              style={{
                padding: "10px 18px",
                borderBottom: `1px solid ${colors.LINE}`,
              }}
            >
              <div
                style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
              >
                <span style={{ fontSize: 13, color: colors.TEXT, fontWeight: 500 }}>{c.name}</span>
                <span style={{ fontSize: 11, color: colors.RED }}>
                  short {c.overflow} cop{c.overflow === 1 ? "y" : "ies"}
                </span>
              </div>
              <div style={{ fontSize: 11, color: colors.MUTED, marginTop: 3 }}>
                Owned {c.ownedQty} · used {c.usedQty} in: {c.deckNames.join(", ")}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CenterMessage({ text, color }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color,
        fontSize: 14,
      }}
    >
      {text}
    </div>
  );
}

export function EmptyState({ color, onAddCard }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: 40,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4 }}>📚</div>
      <div
        style={{
          fontSize: 16,
          color: "var(--ley-text)",
          marginBottom: 8,
          fontFamily: "var(--font-display)",
        }}
      >
        Your collection is empty.
      </div>
      <div style={{ fontSize: 13, color, maxWidth: 420, lineHeight: 1.5, marginBottom: 20 }}>
        Add cards individually or import from Deckbox / Moxfield CSV. Once you've added cards, every
        agent (Karn, Tibalt, Jace) will know what you own and tailor suggestions to your actual
        collection.
      </div>
      {onAddCard && (
        <button onClick={onAddCard} className="btn btn-primary">
          + Add your first card
        </button>
      )}
    </div>
  );
}

export function BulkActionBar({
  count,
  tags,
  busy,
  onAssignTag,
  onSetCondition,
  onMarkOwned,
  onDelete,
  onSelectAll,
  onClear,
  onExit,
  visibleCount,
  colors,
  font,
}) {
  const has = count > 0;
  const selectStyle = {
    background: "transparent",
    border: `1px solid ${colors.LINE}`,
    color: colors.TEXT,
    padding: "5px 12px",
    borderRadius: 4,
    fontSize: 12,
    cursor: has ? "pointer" : "default",
    fontFamily: font,
    opacity: has ? 1 : 0.5,
  };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
        padding: "8px 20px",
        background: colors.BG3,
        borderBottom: `1px solid ${colors.LINE}`,
      }}
    >
      <span
        style={{
          fontSize: 13,
          color: has ? colors.GOLD : colors.MUTED,
          fontWeight: 600,
          minWidth: 90,
        }}
      >
        {has ? `${count} selected` : "Select cards…"}
      </span>
      <button
        onClick={onSelectAll}
        disabled={busy}
        className="btn btn-secondary btn-sm"
        title="Select all cards matching the current filters"
      >
        Select all {visibleCount}
      </button>
      <button onClick={onClear} disabled={busy || !has} className="btn btn-ghost btn-sm">
        Clear
      </button>

      <div style={{ flex: 1 }} />

      <select
        defaultValue=""
        disabled={busy || !has}
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) onAssignTag(v === "__none" ? null : v);
        }}
        style={selectStyle}
        title="Assign a color tag to the selected cards"
      >
        <option value="" disabled>
          Assign tag ▾
        </option>
        {tags
          .filter((t) => t.id !== "default" && !t.builtin)
          .map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        <option value="__none">— Clear tag —</option>
      </select>

      {/* C5-P1.5 — bulk CONDITION set: stamps the chosen grade on every physical stack of the selection. */}
      <select
        defaultValue=""
        disabled={busy || !has}
        onChange={(e) => {
          const v = e.target.value;
          e.target.value = "";
          if (v) onSetCondition(v);
        }}
        style={selectStyle}
        title="Set the condition of the selected cards"
      >
        <option value="" disabled>
          Set condition ▾
        </option>
        {["NM", "LP", "MP", "HP", "DMG"].map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {/* C5-P1.5 — bulk WISHLIST → OWNED: flips selected wishlist rows to owned (seeds a copy if none). */}
      <button
        onClick={onMarkOwned}
        disabled={busy || !has}
        className="btn btn-secondary btn-sm"
        title="Mark selected wishlist cards as owned"
      >
        Mark owned
      </button>

      <button
        onClick={onDelete}
        disabled={busy || !has}
        className="btn btn-danger btn-sm"
        style={{ marginLeft: 4 }}
      >
        {busy ? "Working…" : `Delete${has ? ` (${count})` : ""}`}
      </button>
      <button
        onClick={onExit}
        disabled={busy}
        className="btn btn-primary btn-sm"
        style={{ marginLeft: 10 }}
      >
        Done
      </button>
    </div>
  );
}

// C5-P2.2 — the Stacks header's ⋯ overflow menu. Holds every action that isn't
// an everyday one (Add / Import stay on the strip). Plain popover: closes on
// outside click or Escape. `initialOpen` exists for SSR render tests only.
export function HeaderOverflowMenu({ items, colors, initialOpen = false }) {
  const [open, setOpen] = useState(initialOpen);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={open ? "btn btn-primary btn-sm btn-icon" : "btn btn-secondary btn-sm btn-icon"}
        title="More actions"
        aria-label="More actions"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div
          className="ley-glass-strong"
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 60,
            minWidth: 180,
            padding: 6,
            display: "flex",
            flexDirection: "column",
            gap: 2,
            border: `1px solid ${colors.LINE}`,
            borderRadius: "var(--r-lg)",
          }}
        >
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="btn btn-ghost btn-sm"
              title={item.title}
              style={{
                justifyContent: "flex-start",
                textAlign: "left",
                width: "100%",
                whiteSpace: "nowrap",
                color: item.danger ? "var(--ley-red)" : undefined,
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Provenance caption shared by the shelf tiles (and their tooltips). Falls
// back to "Showcase" for pinned-but-unannotated rows, and to the value line
// for unflagged top-value picks.
function showpieceCaption(entry) {
  const r = entry.row;
  const bits = [];
  if (r.signed) {
    bits.push(
      `Signed${r.signed.artist ? ` — ${r.signed.artist}` : ""}${r.signed.inPerson ? " (in person)" : ""}`,
    );
    if (r.signed.event) bits.push(r.signed.event);
    if (r.signed.date) bits.push(r.signed.date);
  }
  if (r.artistProof) bits.push("Artist proof");
  if (r.altered) bits.push("Altered");
  if (bits.length === 0)
    return entry.flagged ? "Showcase" : `Top value · $${entry.value.toFixed(2)}`;
  return bits.join(" · ");
}

// C5-P2.1 — THE SHOWPIECE SHELF: the treasure hierarchy that opens The Stacks.
// The old Trophy Case strip (showcase-pins only, small tiles), promoted: every
// provenance-flagged row PLUS the top few unflagged cards by value (the $50
// Finance grail floor), rendered LARGE with the LEYLINE glow. The grid of
// everything follows below — the Vault reads treasure-first the moment it opens.
export function ShowpieceShelf({ cards, onPick, colors }) {
  const shelf = useMemo(() => buildShelf(cards), [cards]);
  if (shelf.length === 0) return null;
  return (
    <div style={{ padding: "14px 20px 4px", borderBottom: `1px solid ${colors.LINE}` }}>
      <div
        style={{
          fontFamily: "var(--font-mono), monospace",
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--ley-green)",
          marginBottom: 10,
          textShadow: "0 0 8px var(--ley-green-glow)",
        }}
      >
        ★ The Showpiece Shelf
      </div>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", paddingBottom: 12 }}>
        {shelf.map((entry) => {
          const r = entry.row;
          return (
            <button
              key={r.scryfallId}
              onClick={() => onPick(r)}
              className="ley-card"
              style={{
                flexShrink: 0,
                width: 240,
                textAlign: "left",
                cursor: "pointer",
                background: "var(--ley-glass)",
                border: "1px solid var(--ley-line-bright)",
                borderRadius: "var(--r-lg)",
                padding: 8,
                color: colors.TEXT,
                boxShadow: "0 0 18px var(--ley-green-glow)",
              }}
              title={`${r.name} — ${showpieceCaption(entry)}`}
            >
              <img
                src={`/api/card-image?id=${encodeURIComponent(r.scryfallId)}`}
                alt=""
                width={224}
                height={313}
                loading="lazy"
                style={{
                  objectFit: "cover",
                  borderRadius: 11,
                  display: "block",
                  border: `1px solid ${colors.LINE}`,
                }}
              />
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 7,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "var(--font-display), sans-serif",
                }}
              >
                {r.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "var(--ley-text-dim)",
                  marginTop: 2,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {showpieceCaption(entry)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
