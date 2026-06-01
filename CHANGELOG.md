# Changelog

All notable changes to MTG Tool are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/), and the project aims for
[Semantic Versioning](https://semver.org/). Full per-release notes and binaries live on
the [GitHub Releases](https://github.com/Robak503/mtg-tool/releases) page; this file
summarizes the notable changes.

## [Unreleased]

## [0.12.0] - 2026-05-31

### Added
- **Deck Report in the deck view.** A new **Deck Report** section (next to
  Recommendations) generates one complete, local report for the active deck —
  power level + WotC bracket, role counts, Commander legality + color-identity
  check, in-deck and one-card-away combos, EDHREC salt, and cost-to-finish from
  your collection — plus a copy-paste **Rule 0 card** for the table. Toggle
  between the full report and the Rule 0 pitch, and copy either to the
  clipboard. Runs entirely off local data — no API cost.
- **Export your collection to CSV** from the Vault — a Deckbox-style sheet of
  your owned cards that re-imports cleanly into MTG Tool, Deckbox, or Moxfield.
- **Back up & restore all your data** from the Updates panel — export everything
  (decks, chats, collection, grails, games) to one JSON file and restore it on
  another machine. A safety backup of your current data is saved before a restore
  overwrites anything.
- **Copy support info** (Updates panel) — a redacted diagnostics summary for bug
  reports (version, OS, data freshness, content counts) with no secrets and no
  deck/chat content.
- **Export a deck's shopping list** from the Vault's Decks panel — the cards
  you're still missing as a paste-ready Moxfield / Archidekt decklist.

## [0.11.0] - 2026-05-31

### Fixed
- **Your chats keep their state across a restart.** The deck-gate "Chat without
  a deck" choice, plus each answer's retry button and its grounding / Arbiter
  metadata, were silently dropped when chats were saved — so they vanished on
  the next launch (Karn and Tibalt would re-prompt for a deck every time). They
  now persist.
- **Streaming answers can't hang forever.** Local (Ollama) and API (Anthropic)
  streamed responses now have an idle timeout that covers the whole response,
  not just the initial connection — a stalled model surfaces a clear error you
  can retry instead of a frozen "…".
- **In-app data syncs take effect immediately.** After a sync from the Updates
  panel, the app now drops its stale in-memory caches, so refreshed cards,
  combos, salt scores, prices, and rules are used right away without restarting.

### Added
- **Price history accrues on app launch**, not only when you open the Vault — so
  the Finance tab's movers and "finance plays" fill in reliably even if you
  rarely open your collection.

### Security
- **A mistyped model provider can no longer spend API credits.** Provider
  selection is now a strict allowlist that defaults to the local model; only the
  explicit API tier reaches Anthropic.
- **Hardened feedback-bundle import** against a path-traversal attempt hidden in
  a malicious bundle's timestamp.

## [0.10.0] - 2026-05-31

### Added
- **MTG Finance in the Vault.** The Vault has a new **Finance** tab — a local,
  MTGStocks-style price watch built entirely from the app's own daily price
  snapshots (no external finance API, no cost):
  - **Your collection** — total value with 30 / 90 / 365-day change, plus your
    cards' biggest price risers and fallers.
  - **Finance plays** — the biggest movers across everything the app tracks.
  - **Worth getting** — EDHREC staples (across all of Commander, not just your
    colors) you don't own, and combo pieces you're one card away from, each with
    its current price; one click adds any of them to your Grails.
  - **Grails** — a personal price watchlist: search any card to track it, and
    the app charts its price movement over time.
  Movement starts empty on a fresh install and fills in over the first week or
  two as daily snapshots accrue — there's no free way to back-fill historical
  prices, and the UI says so rather than faking it. The daily snapshot now also
  records your grails and the top ~200 staples so their movers build up too.

## [0.9.0] - 2026-05-30

### Added
- **Combos tab in the right panel.** Pick any deck and the new **Combos** tab
  shows the Commander Spellbook combos already in it *and* the ones you're a
  single card away from — with the missing piece called out. Runs entirely off
  your local Spellbook snapshot (no network calls).
- **Color-identity guardrail in the Legal tab.** Alongside the ban check, the
  Legal tab now flags any card whose color identity falls outside your
  commander's — the cards that are illegal in the deck even though they're
  Commander-legal — and tells you which colors are off.
- **"Buildable only" filter in the Vault's Decks panel.** A toggle (plus a
  running "X of Y decks buildable now" count) hides everything except the decks
  you can build end-to-end from cards you already own.
- **Deck snapshots.** A new section in the deck view lets you snapshot a deck on
  demand; each saved snapshot shows exactly what you've added and cut since you
  took it ("+4 / −3 since"), so you can track how a deck drifts over time.
- **Pod Balance.** A new sidebar tool (Library → Pod Balance) compares up to four
  saved decks side by side: each deck's official WotC **bracket (1–5)**, power
  level, CRISPI axes, and the **Game Changers** it runs (the official 53-card
  list, detected from the bundled Commander Spellbook data) — plus a one-line
  verdict on whether the table is balanced or lopsided. Select a single deck to
  use it as a quick bracket + Game Changers readout. All local, no API cost.
- **Recommendations (local, free) in the deck view.** A new section gives
  instant, deterministic add/cut guidance without spending a model call: the
  roles your deck is short on (ramp / draw / removal / wipes / protection)
  filled with color-identity-legal staples ranked by play rate, the combos
  you're one card away from completing, and weak- or salty-card cut candidates.
  Hover any suggestion to preview the card. Karn's Upgrade Plan still does the
  deep, deck-specific reasoning; this is the fast first pass.

### Fixed
- **Card popularity is back in the local card index.** The slim Oracle index was
  dropping each card's `edhrec_rank`, so play-rate never factored into local
  card search or the deck power/impact scoring (both were written to use it).
  Restoring it makes search surface real staples first and tightens the power
  ranker's impact model — which also resolved a long-standing calibration drift.
- **Karn and Tibalt no longer answer with no deck.** Starting a chat with the
  deck-builder (Karn) or roaster (Tibalt) when no deck was loaded let them reply
  from generic card-search context — recommending cuts of cards that aren't in
  any of your decks. Those two agents now require a deck before the first
  message: a pop-out forces you to pick a saved deck, import one, or explicitly
  choose "Chat without a deck" (build-from-scratch). Jace is unaffected — it
  still answers general rules questions with no deck loaded.
- **The Vault grid no longer logs a console error on load.** The collection
  card was a button that contained the +/- quantity steppers (also buttons),
  which a browser can't nest — React flagged it as a hydration error. The card
  is now a regular clickable element with keyboard support (Enter / Space),
  steppers still adjust quantity without opening the card, and the console is
  clean.

## [0.8.0] - 2026-05-30

### Added
- **The Vault tells you what it costs to finish your decks.** A new **Decks**
  panel lists every saved deck with how much of it you already own and the
  cheapest price to complete it — planned (partly-owned) decks sort to the top.
  Expand a deck for the shopping list of cards you're short, cheapest first;
  **Add** opens the card picker pre-filled so you choose the printing you bought
  and it counts as owned. Basic lands are free; sideboards are ignored.
- **Learn-to-Play is now its own section: The Academy.** It moved out of the
  agent list into its own sidebar area (Train → The Academy), a home for both
  Standard 1v1 and Commander 4P training.
- **Ask Jace, in real time, mid-game.** A floating tutor pop-out in any Academy
  game: ask "what can I play?", "is it safe to attack?", "what does this step
  do?" and Jace answers grounded in the actual board — your hand, everyone's
  life and board, the current step. Runs on the local model (no API credits).

- **No more nil card values in the Vault.** When TCGPlayer (via Scryfall) has no
  market price for a printing — which happens when it lacks recent sales even
  though copies are listed — the value now falls back to **Card Kingdom's actual
  retail price** for that exact printing (matched by scryfall_id, synced + cached
  locally like the rest of the data). CardSphere and Star City Games were
  evaluated but render prices in JavaScript with no public API, so they can't be
  read from a desktop app; Card Kingdom's bulk pricelist covers the gap.
- **"↻ Prices" button in the Vault** re-pulls live Scryfall prices for any cards
  whose stored price is still null, in case TCGPlayer computed a market price
  since the last sync. Bounded, throttled, user-triggered.

## [0.7.0] - 2026-05-30

### Added
- **Play Learn-to-Play as a 4-player Commander game.** The Learn-to-Play setup
  has a format picker — Standard 1v1 or **Commander 4P** (you plus three AI
  opponents). The game screen now shows a table strip across the top: every seat's
  life, hand / board / graveyard counts, commander damage, and whose turn it is.
  When you attack in Commander, each option says which opponent it targets
  (e.g. "Attack → AI 2").

## [0.6.0] - 2026-05-30

### Added
- **Learn-to-Play combat now resolves.** In Garfield's Learn-to-Play mode, the
  combat-damage step is no longer a no-op: creatures deal and take damage,
  lethally-damaged creatures die, and unblocked attackers reduce the defending
  player's life. Multi-defender groundwork landed too (Commander attackers can
  target any opponent, the AI picks a sensible target, and the trap warnings
  account for every opponent's possible swing-back). _Simplified for now: no
  first strike, trample, or deathtouch._

## [0.5.0] - 2026-05-30

### Added
- **Import a deck from a Moxfield or Archidekt URL.** Open Import Deck, paste a deck link,
  and hit Fetch — the deck is pulled, every card resolved against your local data, and a
  preview shows the name, card count, commander, and any cards not found in your snapshot.
  Save to library and it's yours. (One user-triggered fetch, stored locally — same posture
  as the data syncs. Pasted decklists and project loads still work as before.)

## [0.4.0] - 2026-05-30

### Added
- **The Vault — pick the exact printing and finish you own.** Adding a card lists every
  printing as a row — **full set name · set code · collector number · price** — newest
  first, each with a button per available treatment: **Normal**, **Foil**, and special
  foils named from the card data (Surge, Galaxy, Confetti, Oil Slick, Ripple, Step-and-
  Compleat, Halo, Gilded, Textured, and more). The printings index is now built from the
  full Scryfall `default_cards` set, so art-reuse reprints (e.g. the Commander Masters
  Sliver Hivelord that shares M15 art) are selectable too — not just one printing per
  artwork. Only treatments that exist on real paper cards are shown (digital-only MTGO /
  Arena printings are excluded).
- **Quantity steppers everywhere.** Every owned card has a `− N +` control on the grid
  and per-stack steppers in the detail drawer. Dropping the last copy removes the card
  (delete-at-zero). Owned value and counts track the quantity live.
- **Color tags that act.** Tag cards with custom color labels whose behavior reflects
  onto the card: *Have* marks it owned, *Getting* / *Considering* move it to the wishlist
  (kept out of owned value), and *Swap* feeds the card to Karn so he suggests
  replacements. The drawer shows what each tag will do before you apply it; tagged cards
  get a color stripe on the grid.

### Changed
- Consolidated the two root rules-knowledge dirs under one `knowledge/` folder
  (`knowledge/mtg-engine` + `knowledge/mtg-judge`), removing the space from the old
  `MTG ENGINE/` path. Internal layout only — no change to app behavior.

### Removed
- Two citation-audit QA reports (`cite_audit*.md`) that had been leaking "rule not
  found" rows into rules retrieval, plus 6 unused local data-build scripts.

## [0.3.0] - 2026-05-29

### Added
- Source-available `LICENSE`, plus `CONTRIBUTING.md`, `ARCHITECTURE.md`, `SECURITY.md`,
  `.gitattributes`, and this changelog.
- First tests for the `spellbook` and `edhrecSalt` modules, and a POST-with-rules test
  for `/api/engine`.
- **Midnight Codex** visual theme (indigo-black base, copper accent) across the whole
  app, plus a real-card-art blend on the chat view: the active commander's art backs the
  window behind frosted-glass panels, a commander portrait crowns the right panel, and
  inline card-art plates render on `[[card]]` mentions.
- `/api/art-crop` accepts `?name=` to resolve card art by name via the bundled printings
  index (disk-cached, offline-safe after first view).

### Changed
- README rewritten for outside readers (the desktop `.exe` build path is now
  documented; stale version/count facts removed).
- Repo root decluttered — 19 AI session-handoff docs moved to `docs/archive/`.
- Licensing reconciled to source-available (was contradictory across docs).
- Agent accent colors are now distinct identities: Jace blue, Karn silver, Tibalt deep
  red, Arbiter copper.
- All card art (backdrop, portrait, plates) routes through the local `/api/art-crop`
  proxy — no direct Scryfall CDN calls at runtime, honoring the local-first mandate.

### Fixed
- `/api/engine` returned 500 on POST rules queries (an undefined `TOOL_ROOT`).
- `spellbook` / `edhrecSalt` ignored `MTG_REFERENCE_DIR` and the writable AppData
  override in the packaged `.exe` (they used raw `__dirname`); now resolved through
  `paths.js`.

## Earlier

The project shipped its first phases — knowledge layer, Ollama integration, agent
rewiring, session-manager UI, and the archetype-aware Garfield goldfish — followed by
the Tauri desktop shell with signed auto-update, a card-collection feature, and in-app
data sync. See the git history and GitHub Releases for details.
