/**
 * tibaltGremlinClient.js — the client half of Tibalt's gremlin mode (NEXT-QUEUE A1).
 *
 * useDeckStore calls emitGremlinEvent() at its completed-action sites (save / import) exactly the
 * way autoRatePower fires: non-blocking, and a failure never touches the save UX. The shell
 * (MTGAssistant) registers the context — how to read the CURRENT surface at fire time, and where
 * a granted bubble goes. The module is a singleton on purpose: the emit sites live in a hook and
 * the surface lives in the shell, and threading a callback chain through the deck store's whole
 * prop surface for one fire-and-forget feature would be all cost.
 *
 * Everything here is advisory — the POLICY (caps, vetoes, suppression) is server-side in
 * lib/tibaltGremlin.js via /api/tibalt/interject. The only client-side gate is a short
 * per-deck chatter guard so a burst of debounced saves doesn't spam the route.
 */

let context = null; // { getSurface: () => ({ surface, karnDeckId }), onBubble: (bubble) => void }

export function setGremlinContext(ctx) {
  context = ctx;
}

const lastEmitByDeck = new Map();
const EMIT_GUARD_MS = 5000;

export function emitGremlinEvent(kind, deck, { isFirstDeck = false, isFirstImport = false } = {}) {
  if (!deck?.id || !Array.isArray(deck.cards) || !deck.cards.length) return;
  const now = Date.now();
  if (now - (lastEmitByDeck.get(deck.id) || 0) < EMIT_GUARD_MS) return;
  lastEmitByDeck.set(deck.id, now);

  const surfaceInfo = context?.getSurface?.() || {};
  (async () => {
    try {
      const resp = await fetch("/api/tibalt/interject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: { kind },
          surface: surfaceInfo.surface || null,
          deckId: deck.id,
          deckName: deck.name || "",
          cards: deck.cards.filter((c) => c.section !== "Tokens" && c.section !== "Sideboard"),
          isFirstDeck,
          isFirstImport,
          // Karn's room is open with THIS deck locked → whatever he said is on screen; an echo
          // is not a gremlin. Conservative by construction (may over-suppress, never echoes).
          findingAlreadyOnScreen: !!surfaceInfo.karnDeckId && surfaceInfo.karnDeckId === deck.id,
        }),
      });
      const data = await resp.json().catch(() => null);
      if (resp.ok && data?.bubble && context?.onBubble) context.onBubble(data.bubble);
    } catch (err) {
      // Fire-and-forget: the gremlin must never break a save. Logged, not swallowed.
      console.warn("[tibaltGremlin] interject emit failed (save unaffected):", err?.message || err);
    }
  })();
}

/** Report what the user did with a bubble — the reaction IS the tuning signal. */
export function reportGremlinReaction(fireId, reaction) {
  fetch("/api/tibalt/interject", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fireId, reaction }),
  }).catch((err) => {
    console.warn("[tibaltGremlin] reaction report failed:", err?.message || err);
  });
}
