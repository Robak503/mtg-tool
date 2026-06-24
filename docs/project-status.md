<!-- Relocated from CLAUDE.md §9 on 2026-06-24 to keep the always-loaded operating manual lean.
     This is the canonical copy; CLAUDE.md §9 links here. Load on demand. -->

## 9. PROJECT STATUS (LIVING SNAPSHOT)

Updated whenever phases complete. Last update: 2026-06-05.

> **Current status + actionable next steps live in `docs/HANDOFF.md`** — start a
> new chat by reading it. This §9 is the higher-level snapshot; the handoff has
> the copy-paste "what's next" prompts for each remaining piece.

### Shipped

- ✅ Phases 1-5 (Foundation, Knowledge Layer, Ollama, Agent
  rewiring, Garfield goldfish v2)
- ✅ Phase 6 PRs 1-6 (gameState, gameEngine, legalChoices,
  opponentAI, decisionGate, LearnView)
- ✅ In-app feedback capture
- ✅ Backup script (`npm run backup`)
- ✅ Tauri `.exe` shell (production builds work end-to-end)
- ✅ First-launch import wizard (marker-based detection)
- ✅ Ollama install + model pull wizard (winget + SSE)
- ✅ In-app Sync Data UI (Scryfall, Spellbook, EDHREC, indexes)
- ✅ Bundled portable Node 22 LTS (no external Node dependency)
- ✅ System tray + minimize-to-tray
- ✅ Single-instance enforcement
- ✅ Autostart-with-Windows toggle (opt-in)
- ✅ Background app-update check + banner
- ✅ Tauri auto-updater (signed manifest, CI release pipeline)
- ✅ GitHub remote (Robak503/mtg-tool, public)
- ✅ Repo signing secrets configured
- ✅ Reference-dir architecture (read bundled data without copying
  to AppData first)
- ✅ Phase 6 PR 7 (Intermediate trap warnings + auto-attack)
- ✅ Spellbook resilience — moved out of release pipeline into a
  weekly scheduled workflow (`.github/workflows/sync-spellbook.yml`)
- ✅ Deck-size → format auto-detection (100→Commander, 60±SB→Standard;
  `app/src/lib/learn/formatDetection.js`)
- ✅ Phase 6 PR 8 (engine mode refactor — `state.mode`/`turnOrder`,
  `opponentsOf`/`nextInTurnOrder`; Standard + Commander foundation)
- ✅ Phase 6 PR 9 (Commander 4P FFA session start — 3-deck pod = 4
  players total, 4-seat turn rotation, per-opponent AI, player
  elimination + multiplayer win/loss)
- ✅ Phase 6 PR 10 (combat damage + multi-defender — `combatResolution.js`
  resolves the once-no-op combat-damage step: simultaneous damage, lethal
  creatures → graveyard, unblocked attackers hit the chosen defender;
  `defenderId` end-to-end, AI lowest-life defender heuristic, all-opponent
  trap detection. v0.5.x)
- ✅ **The Vault** collection manager (v0.4.0) — per-printing selector with
  finish/treatment buttons sourced from the full `default_cards` printings
  index, quantity steppers + delete-at-zero, color tags with ownership
  behaviors (Have/Getting/Considering/Swap)
- ✅ Deck import from a Moxfield / Archidekt URL (v0.5.0) — paste a deck link →
  fetch server-side (`node:https`, not Next's patched fetch) → resolve cards
  against the local index → preview → save to library
- ✅ Releases v0.4.0 + v0.5.0 cut + signed + auto-updating
- ✅ **Playable learn engine (v0.22.0)** — closed the wiring gap that left The
  Academy stuck at the safety cap before any real game. Mana system (pool +
  tap-for-mana from lands/rocks/dorks, floating mana, CR 500.4 emptying with a
  per-card "doesn't empty" hook), combat orchestration (tap-on-attack + AI
  attacks/blocks + loop fix), termination (win/loss/elimination, simultaneous-
  death draw, turn-limit stalemate, anti-loop latch), and a targeted
  `cardEffects.js` registry (Omnath static P/T + mana-doesn't-empty; Kruphix,
  Horizon Stone). The Academy now plays end-to-end in 1v1 and 4P at all three
  difficulties. See `docs/phase6-playable-engine.md`.
- ✅ **Local multi-user profiles (v0.21.0)** — decks, Vault, chats, games, and
  agent notes are scoped per profile under `data/profiles/<id>/` (resolved via
  `profilePath()`; reference data stays shared at the `data/` root via
  `dataPath()`). One-time migration splits legacy decks by `memory.owner`,
  routes ownerless data to the primary profile, and backs up to
  `.pre-profiles-backup/` first; idempotent + self-healing of a stale flat decks
  file. `ProfileGate` launch picker + header menu. Fully local (no auth). The
  migration is shape-guarded against profile-id path traversal. See
  `app/src/lib/server/profiles.js` + `docs/qa/v0.21.0-profiles-qa.md`.
- ✅ **Structure cleanup + route rename (v0.21.0)** — `/api/engine` →
  `/api/rules-retrieval`, `lib/deck/` module grouping, `lib/server/` boundary
  (`symbolicEngine.cjs` moved), `Vault*` sub-tab names, dead-code/doc prune, and
  a shadowed-vitest-config + bundled-roadmap-doc latent-bug fix.
- ✅ **Card-art proxy hardening (v0.22.0)** — `/api/art-crop` upstream fetch now
  has a timeout, response-size cap, and image-only content-type check.

### Open

- ⏳ Phase 6 PR 11 (LearnView 4P layout — 3 opponent strips, mode +
  format picker wired to `detectDeckFormat`)
- ⏳ Phase 6 PR 12 (Expert mode + post-game analysis, mode-aware)
- ⏳ Phase 6 learn-session persistence (`data/learn-sessions/`, PR 13)
- ⏳ Code signing (Authenticode) — paid cert, optional (eliminates
  SmartScreen warning on first install)
- ⏳ Microsoft Store distribution — deferred until needed

### Declined

- ✗ File associations (.dec/.txt) — owner imports from Archidekt /
  Moxfield via copy-paste; file-based deck workflows aren't part of
  the loop. Decided 2026-05-28.

### Test coverage

~1144 vitest cases (learn engine alone is ~357). Run with `npm test` in `app/`.

---

