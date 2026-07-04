/**
 * DeckConfirmModal — the deck gate pop-out shown before a deck-bound chat can
 * start. It has two modes:
 *
 *  • PICK mode (no lock): a deck-required agent (Karn/Tibalt) was opened with no
 *    deck loaded. Force a choice — select a saved deck, import one, or opt out
 *    of having a deck. Picking a saved deck creates a pending lock, which flips
 *    the pop-out into CONFIRM mode.
 *  • CONFIRM mode (pending lock): the deck is chosen but unconfirmed. Confirm it,
 *    swap to another via the dropdown, import a different one, or opt out.
 *
 * The composer behind it stays disabled until the gate resolves. Intentionally
 * not dismissable by backdrop/Escape — every button is a valid exit, so there's
 * no "cancel" that would leave the chat in limbo with no deck and no decision.
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
  onImport,
  cfg,
  colors,
  fontFamily,
}) {
  if (!open) return null;
  const { TEXT, MUTED } = colors;
  const pickMode = !lock;
  const decks = savedDecks || [];
  const hasDecks = decks.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pickMode ? "Pick a deck for this chat" : "Confirm the deck for this chat"}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(4px)",
        WebkitBackdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        className="ley-glass-strong ley-glass-lit"
        style={{
          width: "min(460px, 94vw)",
          padding: "20px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 13,
          fontFamily,
        }}
      >
        <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: cfg.color, letterSpacing: "0.02em" }}>
          🔒 {pickMode ? "Pick a deck for this chat" : "Confirm this chat’s deck"}
        </div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.5 }}>
          {pickMode
            ? `${agentName} works on one deck for the whole conversation. Select a saved deck or import one so it has real context — or chat without a deck.`
            : `${agentName} locks to one deck for the whole conversation. Choose the deck below and confirm, or chat without a deck.`}
        </div>

        {hasDecks ? (
          <>
            <label htmlFor="deck-confirm-select" style={{ fontSize: 11, color: MUTED, marginBottom: -6 }}>
              Deck for this chat
            </label>
            <select
              id="deck-confirm-select"
              value={activeDeckId || lock?.id || ""}
              onChange={event => onSelectDeck && onSelectDeck(event.target.value)}
              style={{
                background: "var(--ley-surface-0)",
                color: TEXT,
                border: `1px solid ${cfg.border}`,
                borderRadius: 8,
                padding: "9px 11px",
                fontSize: 13,
                fontFamily,
                width: "100%",
              }}
            >
              {pickMode && <option value="" disabled>&mdash; Select a deck &mdash;</option>}
              {decks.map(deck => (
                <option key={deck.id} value={deck.id}>{deck.name}</option>
              ))}
            </select>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>
            No saved decks yet &mdash; import one to get started.
          </div>
        )}

        {lock && (
          <div style={{ fontSize: 12, color: MUTED }}>
            Commander: {lock.commander} &middot; {lock.mainCount} cards
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6, flexWrap: "wrap" }}>
          <button onClick={onNoDeck} className="btn btn-ghost">
            Chat without a deck
          </button>
          {onImport && (
            <button onClick={onImport} className="btn btn-ghost" style={{ color: cfg.color }}>
              Import a deck
            </button>
          )}
          {lock && (
            <button onClick={onConfirm} className="btn btn-primary">
              ✓ Confirm &amp; start
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
