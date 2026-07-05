# 03 — FEATURE: DECKS

> **OMNATH IN POCKET · execution playbook · doc 03 of 17**
> Full deck library + CRUD editing on the phone (D8), offline-first,
> synced. Existing code seams: `lib/deck/` (deckPersistence, deckMemory,
> deckImportUrl, deckAnalytics, deckContextBuilder, deckApply),
> `DeckView.jsx` / `ImportDeckView.jsx` / `DeckMenu.jsx` on desktop.

---

## 1. Behavior

### 1.1 Library
- List all decks: name, commander(s) with art thumb, color identity,
  card count, last-edited, sync state glyph if pending/conflicted.
- Sort: last-edited (default) · name · commander. Filter: color identity.
- Actions: open, new (blank), import, duplicate, archive/delete
  (tombstone — D-P5).

### 1.2 Deck view
- Grouped by category (commander / creatures / lands / etc. — the
  existing deckMemory category model; don't invent a new taxonomy).
- Per card row: name, mana cost, qty, owned-glyph (collection
  cross-ref), tap → card inspector (oracle text + rulings from bundled
  data — CREED).
- Counts bar: total / by-category counts vs Karn's baseline targets
  (reuse `deckAnalytics` outputs).
- Deck memory/notes pane (the "changes to make" list survives as a
  notes surface even though full editing exists).

### 1.3 Editing (full CRUD — D8)
- Add card: search-as-you-type against the oracle index (offline);
  qty stepper; category auto-suggest from card type, overridable.
- Cut / swap / change qty / move category / set commander(s) (incl.
  partner/background/companion slots — reuse desktop model).
- Every commit = one journal op on the deck record (`02 §4`): edits
  batch into a commit on view-exit or explicit save-tick, not per
  keystroke (keeps rev churn sane).
- Undo: session-local undo stack (in-memory), because sync ops are
  whole-record snapshots — undo before commit is free; after commit,
  "revert to previous rev" uses the journal (nice-to-have, M4 polish).

### 1.4 Import
- **Paste** (offline-capable): the existing paste-parse path from
  ImportDeckView — text list in, resolved against local oracle.
- **URL** (Moxfield / Archidekt — online-only, SVC-NET): the existing
  `deckImportUrl.js` logic client-side. Offline → button disabled with
  "no signal — paste your list instead" (`01 §7.2`).
- Unresolved lines (typos, unknown cards): staged review list, same as
  desktop behavior — never silently drop lines.

### 1.5 Deck-lock (agents contract)
- Any agent chat started from a deck locks THAT deck snapshot to the
  conversation (existing desktop semantic — carried over verbatim:
  switching active deck does NOT retarget an open chat).
- The lock captures: list, per-card oracle text (from bundled data),
  deck memory/notes, recent game records for that deck. Assembly reuses
  `deckContextBuilder.js` — port as SVC.

## 2. States

| State | Rendering |
|---|---|
| **Empty** | No decks: hero CTA — "Import a deck" (paste/URL) + "Start blank." No sample-deck auto-load (owner call, desktop parity) |
| **Loading** | Library renders from replica instantly (local reads — there is no spinner-worthy load in steady state); oracle-index lazy-load on first search may show a brief inline "loading card data…" if bootstrap tier still downloading |
| **Error** | Import parse errors → staged review list. Storage write failure → visible toast + the edit stays in the UI (retry), never silent loss |
| **Offline** | Everything works EXCEPT URL import (disabled + paste hint). Sync glyphs show pending state. Zero other differences — the user should not be able to tell |

## 3. Edge cases

- **Card not in bundled oracle** (post-snapshot printing): row renders
  with raw name + "unknown card" badge; resolves on next data-tier
  update. Never fabricate oracle text for it (CREED). Agent context
  marks it `[unresolved card]`.
- **Same deck edited on phone + desktop while apart** → fork → conflict
  UX with the **three-way card-list merge** helper (`02 §6.4`): both
  adds kept, both cuts kept, qty conflicts highlighted. This is the
  flagship conflict case — build the merge helper against decks first.
- **Duplicate deck names**: allowed (recordId is identity); UI
  disambiguates with commander + date.
- **Huge paste** (500+ lines / sideboard formats): parse is O(lines) —
  fine; cap the staged-review render, not the parse.
- **Companion/partner legality**: display-level hints only; legality
  enforcement stays Karn/Arbiter advice, never a hard block (desktop
  parity).
- **Archived decks**: excluded from library default view + agent deck
  pickers; restorable.

## 4. Data dependencies

| Dep | Source | Offline? |
|---|---|---|
| Deck records | replica (user data) | ✅ |
| Oracle text / card search | bundled oracle index (reference) | ✅ |
| Printings/art for thumbs | printing index + art cache | ✅ (cached tiers) |
| Collection owned-glyphs | replica collection | ✅ |
| URL import | Moxfield/Archidekt fetch | ⛔ online-only |
| Karn analysis/suggestions | Mac 70B+ (or API tier) | ⛔ box/net |

## 5. Box-dependency

**Core = STANDALONE.** Library, view, edit, paste-import, deck-lock,
analytics counts — all phone-only, no Mac. **BOX:** Karn's brain
(`04-feat-agents.md`), sync itself (M2+), URL import needs internet
(not the box).

## 6. Acceptance criteria (live, observable)

1. **Airplane-mode CRUD:** airplane mode ON → create a deck, paste-import
   a real list, add/cut/change-qty/recategorize, kill the app,
   relaunch → all edits present. (M1 gate feed)
2. **Search-add speed:** add-card search over the full oracle returns
   usable results as-you-type on the Pixel 10 (subjective fluid — no
   multi-second stalls; measure, then tune index tier if needed).
3. **Sync round-trip:** edit deck on phone offline → reconnect → silent
   sync → deck updated on desktop. Reverse direction likewise. (M2 gate)
4. **Fork drill:** deliberately edit the SAME deck both sides while
   phone offline → reconnect → chip shows `! 1 conflict` → merge helper
   shows card-level diff → choose merge → both edits present, one clean
   record, no data loss. (M2 gate)
5. **Deck-lock integrity:** lock deck → switch active deck in library →
   locked chat still answers about the original deck with full oracle
   text. (M3 gate feed)
6. **CREED spot-check:** card inspector oracle text for 5 random deck
   cards matches the bundled Scryfall JSON byte-for-byte.

---

*Cross-refs: `02-data-and-sync.md §6.4` (merge) · `04-feat-agents.md`
(deck-lock consumption) · `10-ui-ia.md §decks` (screen layouts) ·
`12-phases.md` M0 (service extraction), M1 (UI), M2 (sync).*
