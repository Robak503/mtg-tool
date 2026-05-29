# Data Files

`deckSeeds.js` is the app's built-in deck memory seed list. Deck parsing and normalization live in `src/lib/deckMemory.js`.

Use it for decks that should exist automatically on a fresh local install, or for personal deck archives that should survive browser storage resets. Each seed should include:

- `id`: stable lowercase slug.
- `owner`: deck owner, such as `Colton` or `Joe`.
- `name`: visible deck name, usually the commander.
- `tags`: comma-separated tags for future filtering.
- `notes`: memory the agents should remember about the deck, including roast context.
- `raw`: commander/deck export text.

The app merges these seeds into `localStorage` on startup without overwriting an existing deck with the same owner and name.

Token rows should stay in the raw import when present. The parser moves known Scryfall token names into the `Tokens` section so Karn, Tibalt, and deck stats do not count them as main-deck cards.

Refresh catalog files from the app root:

```powershell
npm.cmd run generate:card-names
npm.cmd run generate:token-names
```
