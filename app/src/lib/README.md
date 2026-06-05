# App Libraries

These modules hold stable app logic so `src/components/MTGAssistant.jsx` can stay focused on UI and interaction state.

- `agents.js`: agent prompts, colors, greetings, and quick actions.
- `deck/`: the deck-domain cluster — `deck/deckAnalytics.js` (curve, color, price,
  Commander legality), `deck/deckMemory.js` (import parsing, token separation, deck
  memory defaults, agent memory serialization), `deck/deckContextBuilder.js`,
  `deck/deckApply.js`, `deck/deckImportUrl.js`, and `deck/deckPersistence.js`.
- `scryfall.js`: Scryfall card lookup, rulings lookup, card-name detection, search, and deck data hydration.
- `storage.js`: JSON storage adapter for Codex storage when available, falling back to `localStorage`.
- `server/`: server-only modules (Node APIs) — path resolution, card/rules indexes,
  collection storage, the symbolic rules engine. Never import these from client code.
