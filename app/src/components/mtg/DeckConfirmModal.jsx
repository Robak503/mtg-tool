/**
 * DeckConfirmModal — pop-out shown when a new chat's deck lock is still
 * pending (unconfirmed). It forces an explicit choice before the conversation
 * starts: confirm the deck (picked from the dropdown), swap to a different one,
 * or chat without a deck. The composer behind it stays disabled until resolved.
 *
 * Intentionally not dismissable by backdrop/Escape — both buttons are valid
 * exits, so there's no "cancel" that would leave the chat in limbo.
 */
export default function DeckConfirmModal({
  open,
  lock,
  savedDecks,
  activeDeckId,
  agentName,
  onSelectDeck,
  onConfirm,
  onNoDeck,
  cfg,
  colors,
  fontFamily,
}) {
  if (!open || !lock) return null;
  const { LINE, TEXT, MUTED } = colors;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm the deck for this chat"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.62)",
        backdropFilter: "blur(2px)",
        WebkitBackdropFilter: "blur(2px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "min(460px, 94vw)",
          background: "#101126",
          border: `1px solid ${cfg.border}`,
          borderRadius: 12,
          boxShadow: `0 24px 70px rgba(0,0,0,0.6), inset 3px 0 0 ${cfg.color}`,
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 13,
          fontFamily,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: cfg.color, letterSpacing: "0.02em" }}>
          🔒 Confirm this chat&rsquo;s deck
        </div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          {agentName} locks to one deck for the whole conversation. Choose the deck below and
          confirm, or chat without a deck.
        </div>

        <label htmlFor="deck-confirm-select" style={{ fontSize: 11, color: MUTED, marginBottom: -6 }}>
          Deck for this chat
        </label>
        <select
          id="deck-confirm-select"
          value={activeDeckId || lock.id || ""}
          onChange={event => onSelectDeck && onSelectDeck(event.target.value)}
          style={{
            background: "#1a1b38",
            color: TEXT,
            border: `1px solid ${cfg.border}`,
            borderRadius: 7,
            padding: "9px 11px",
            fontSize: 13,
            fontFamily,
            width: "100%",
          }}
        >
          {(savedDecks || []).map(deck => (
            <option key={deck.id} value={deck.id}>{deck.name}</option>
          ))}
        </select>
        <div style={{ fontSize: 12, color: MUTED }}>
          Commander: {lock.commander} &middot; {lock.mainCount} cards
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
          <button
            onClick={onNoDeck}
            style={{
              background: "transparent",
              border: `1px solid ${LINE}`,
              borderRadius: 7,
              color: MUTED,
              cursor: "pointer",
              fontSize: 12.5,
              padding: "8px 14px",
              fontFamily,
            }}
          >
            Chat without a deck
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: cfg.color,
              border: "none",
              borderRadius: 7,
              color: "#fff",
              cursor: "pointer",
              fontSize: 12.5,
              fontWeight: 600,
              padding: "8px 16px",
              fontFamily,
            }}
          >
            ✓ Confirm &amp; start
          </button>
        </div>
      </div>
    </div>
  );
}
