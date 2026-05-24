# App Libraries

These modules hold stable app logic so `src/components/MTGAssistant.jsx` can stay focused on UI and interaction state.

- `agents.js`: agent prompts, colors, greetings, and quick actions.
- `deckAnalytics.js`: curve, color, price, and Commander legality helpers.
- `deckMemory.js`: deck import parsing, token separation, deck memory defaults, seed deck building, and agent memory serialization.
- `scryfall.js`: Scryfall card lookup, rulings lookup, card-name detection, search, and deck data hydration.
- `storage.js`: JSON storage adapter for Codex storage when available, falling back to `localStorage`.
