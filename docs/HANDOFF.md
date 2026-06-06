# MTG Tool — Project Handoff & Next Steps

> **Tactical "where we are / what's next" doc.** Start any new chat by reading
> this + `CLAUDE.md` (operating manual). For the full prioritized backlog +
> product strategy, see **[`docs/master-plan.md`](master-plan.md)**.
> `CHANGELOG.md` is authoritative for shipped state.

**Last updated:** 2026-06-05 · **Master:** green · **Tests:** ~1091 vitest · **Lint:** 0 warnings.

---

## TL;DR — current state

- **Latest release: v0.22.0** (signed + auto-updating). The big arc since the
  old single-user era:
  - **v0.20.0 — Aether redesign.** Whole app moved to the cyan / near-black /
    glass "Aether" system (Playfair + Inter + JetBrains Mono, bundled locally).
  - **v0.21.0 — Local multi-user profiles + structure cleanup.** Decks, Vault,
    chats, games, and agent notes are now scoped **per profile** with a one-time
    auto-migration (splits decks by `memory.owner`). Plus an aggressive rename
    pass (`/api/engine` → `/api/rules-retrieval`, `lib/deck/` grouping, `Vault*`
    component names, `lib/server/` boundary) and two latent-bug fixes.
  - **v0.22.0 — The Academy is playable.** Mana (tap lands/rocks/dorks, floating
    mana, CR 500.4 emptying), combat (keywords: flying/reach, first/double
    strike, trample, deathtouch, lifelink; AI attacks + blocks), spell effects
    (burn / removal / draw with targeting), and termination (win/loss/draw).
    Plays end-to-end 1v1 and 4P Commander at all three difficulties. Plus
    card-art-proxy hardening and a self-healing profiles migration.
- **`[Unreleased]` is empty** — master == the v0.22.0 release plus docs.
- **CI gates both languages:** `ci.yml` (lint + vitest on every PR), `rust.yml`
  (rustfmt + clippy `-D warnings` + cargo-audit), `release.yml` (tag-triggered
  signed build + publish), `sync-spellbook.yml` (weekly). Windows runner pinned
  to `windows-2025`.
- **A weekly autonomous ultracode review** runs Sundays (whole-project review +
  QA, opens a PR — never auto-merges).

## Architecture deltas a cold chat must know

- **Profiles data model.** Per-profile writable data lives under
  `data/profiles/<id>/` and is resolved via `profilePath(...)`. Shared reference
  data (Scryfall/rules/spellbook/EDHREC) stays at the `data/` root via
  `dataPath(...)`. The active profile is a pointer in `data/profiles.json`;
  `profiles.js` owns the registry + migration, `paths.js` only reads it. Per-
  profile files: `decks.local.json`, `chats.local.json(+variants)`,
  `collection.json`, `collection-prices.jsonl`, `watchlist.json`,
  `price-alerts.json`, `agent-notes.local.json`, `collection-roasts.json`, and
  the `games/` + `backups/` dirs. Feedback + model-calls are deliberately global.
- **Packaged-.exe path layout** is covered by `profilesRefDir.test.js` (profiles
  × `MTG_REFERENCE_DIR`). A profile id is shape-guarded (`prof_<uuid>`) before it
  reaches `path.join` (traversal defense).
- **The Academy plays for real now.** Engine files under `app/src/lib/learn/`
  (mana/combat/spell/termination layers + the existing gameState/decisionGate/
  opponentAI). Owned by the Academy track — coordinate before editing.

## How to start the next chat (copy a block)

**› Local-first art proxying — finish it (needs the app running):**
> Route the last card-art surfaces (hover tooltip, right-panel search preview,
> `CollectionAddModal`) through `/api/art-crop?name=` instead of the Scryfall CDN
> — only `MTGAssistant.jsx` uses the proxy today. The proxy is already hardened
> (timeout/size-cap/content-type). Verify each surface + the offline placeholder
> in `npm run dev`. (master-plan N4.)

**› "Play this deck in the Academy" one-click (core-loop unlock):**
> Add a one-click entry from the deck/Vault view that runs `detectDeckFormat`
> (`lib/learn/formatDetection.js`) on the loaded/locked deck and starts a learn
> session (`POST /api/learn/start`) with that deck + detected format (100→
> Commander 4P, 60→Standard 1v1). Now high-value since the Academy actually
> plays. Deck data is per-profile — keep the snapshot/profile scoping right.
> (master-plan E2.) **Academy-surface — coordinate with that track first.**

**› Phase 6 PR 12 — post-game analysis (Academy track):**
> Build the post-game-analysis module (walk the session `decisionLog` → missed
> lines: "held mana but never cast it", "could have attacked for lethal"; 4P-
> aware). Expert auto-pilot already ships (`decisionGate.js`) — only analysis is
> open. Route every legality claim through Arbiter/the engine, never the model.

**› Tech-debt — decompose the oversized files:**
> `MTGAssistant.jsx` (~1.4k lines), `FeedbackPanel.jsx`, `powerRanker.js`,
> `lib.rs` — headless but behavior-sensitive; best with the app available to
> smoke-test. (master-plan N1.)

**› Verify the v0.21.0 migration on a real install (owner-run):**
> `docs/qa/v0.21.0-profiles-qa.md` — copy-paste QA against real `%APPDATA%`.
> Only the owner can drive the `.exe` webview.

## Done since the old backlog (no longer "next")

CSP (v0.18.0), guided onboarding (v0.18.0), ownership tags + merge-import
(v0.18.0), Settings/Privacy/About (v0.16.0), Build-From-Vault (v0.16.0), trust
badge + freshness + model fallback (v0.19.0), the export-all/restore/support-
bundle UI, Aether redesign (v0.20.0), multi-user profiles (v0.21.0), Phase 6
PRs 10–11 + the playable engine (v0.22.0). Tech-debt cleanup (lint 0, atomic
writes, dead-code removal, CI gates) is essentially cleared.

---

## Project quick-reference (cold chat)

- **What:** local-first MTG Commander assistant shipping as a signed Windows
  `.exe` (Tauri 2 → bundled Node 22 → Next.js 15, JavaScript; local Ollama with
  an Anthropic fallback tier).
- **Run dev:** `cd app && npm run dev` (http://localhost:3000). **Tests:**
  `npm test` in `app/`. **Build .exe:** `npm run tauri:build`.
- **Release:** `git tag vX.Y.Z -a -m "..." && git push origin vX.Y.Z` → CI syncs
  data, builds, signs, publishes; installs auto-update within 24h.
- **Five agents:** Jace (rules chat), Karn (deck architect), Tibalt (roaster),
  Arbiter (backend rules engine, Ollama-only), Garfield (Academy simulator).
- **Path chokepoint:** `app/src/lib/server/paths.js` — `dataPath()` global,
  `profilePath()` per active profile. Never raw `process.cwd()`.
- **Deferred / paid:** Authenticode code signing (removes SmartScreen warning),
  Microsoft Store distribution.
