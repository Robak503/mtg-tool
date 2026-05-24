# MTG Tool — Initial Audit
## Produced by Claude Code on first session: 2026-05-23
## Status: Phase 0 → awaiting owner review before Phase 1 begins

---

## Security Note — Act First

**THE KEY.txt** in `MTG ENGINE/` contained a plaintext `ANTHROPIC_API_KEY`. It was committed in the initial git commit (commit `55f826b`) and has been removed in the follow-up commit (`c9d7600`). Because the key exists in local git history, you should rotate the key in your Anthropic console as a precaution, even though no remote has been pushed. Steps:
1. Go to console.anthropic.com → API Keys → revoke the key that was in that file
2. Generate a new key
3. Update `app/.env.local` with the new key

---

## 1. File Inventory

### Top-level structure

| Folder / File | Purpose |
|---|---|
| `app/` | Next.js 15 web application |
| `MTG ENGINE/` | Legacy Codex-era rules codex + Python scripts |
| `mtg-judge/` | Test suites, validation scripts, CR JSON, embedded repos |
| `CLAUDE.md` | This project's operating manual |
| `README.md` | Project overview |
| `ROADMAP.md` | Phase plan |

### app/ breakdown

| Area | Files | Notes |
|---|---|---|
| `src/app/api/` | 7 routes | anthropic, arbiter, cards, chats, decks, engine, symbolic-engine |
| `src/components/` | 12 JSX files | MTGAssistant.jsx + 9 MTG-specific components |
| `src/hooks/` | 3 hooks | useChatAgents, useDeckStore, useCardSearch |
| `src/lib/` | 12 JS files | agents, scryfall, goldfish, deckMemory, etc. |
| `src/data/` | 1 file | deckSeeds.js (1519 lines — seed deck data) |
| `data/` | 4 items | decks.local.json, chats.local.json, scryfall-bulk/, backups/ |
| `scripts/` | 11 scripts | sync, check, validate, import scripts |
| `public/` | 2 JSON files | card-names.json, token-names.json |
| `reports/` | 8 files | Arbiter validation reports |
| `docs/` | 1 file | APP_ROADMAP.md |

### MTG ENGINE/ breakdown

~100 files:
- **80 L-layer files** (L00–L10, _v and _t variants) — the full rules codex
- **5 META files** — layer index, query router, gap analysis, next steps, app roadmap
- **2 Python scripts** — mtg_judge_v5.py, scryfall_setup.py
- **1 legacy binary** — MagicCompRules 20260227.docx
- **Excluded from git**: THE KEY.txt (was plaintext API key), scryfall_*.json fragments (already in bulk)

### mtg-judge/ breakdown

- `data/cr/cr_current.json` — full Comprehensive Rules in JSON (1.18MB)
- `data/forge/` — embedded git clone of the Forge project (Java MTG engine) — **NOT submoduled, excluded from git**
- `data/rulesguru-repo/` — embedded git clone of a RulesGuru Node tool — **NOT submoduled, excluded from git**
- `META_test_cases.md` — core Arbiter test suite
- `META_test_cases_expanded.md` — expanded test suite
- `META_test_cases_rulesguru.md` — 500 RulesGuru-sourced questions
- `META_test_suite_coverage.md` — coverage analysis
- `cite_audit.md`, `cite_audit_v2.md` — citation audits
- Several Python validation scripts
- `MTGAssistant.jsx` — **stale copy of a component, should not be here**

---

## 2. Codebase Health

### Lines of code (JS/JSX in app/src/)

| File | Lines | Status |
|---|---|---|
| `src/data/deckSeeds.js` | 1519 | Seed data — acceptable, but likely stale if decks are now in decks.local.json |
| `src/app/api/engine/route.js` | 538 | **Refactor candidate** — complex query router with embedded rule definitions |
| `src/hooks/useChatAgents.js` | 415 | **Refactor candidate** — does too much (locking, context building, Arbiter calls, history) |
| `src/components/MTGAssistant.jsx` | 407 | **Refactor candidate** — main shell component |
| `src/hooks/useDeckStore.js` | 355 | Acceptable |
| `src/lib/agents.js` | 279 | Agent prompts — long but each prompt is legitimately dense |
| `src/lib/goldfish.js` | 277 | Acceptable |
| `src/lib/scryfall.js` | 268 | Acceptable |
| `src/components/mtg/DeckView.jsx` | 297 | Acceptable |
| `src/components/mtg/ChatPanel.jsx` | 283 | Acceptable |
| All others | <215 | ✅ Healthy |

---

## 3. mtg-judge Corpus State

**Important architectural note:** Despite the folder name `mtg-judge/`, the actual L-layer rules codex (L00–L10 _v and _t files) lives in `MTG ENGINE/`, not in `mtg-judge/`. The `mtg-judge/` folder is primarily test fixtures and validation tooling.

### mtg-judge/data/cr/cr_current.json
- Present: ✅
- Size: 1.18MB — this is the full CR in JSON
- Used by: `/api/engine` route at runtime for rules retrieval
- Status: **Healthy**

### MTG ENGINE/ layer files
- 80 _v and _t files covering L00–L10
- Spot-checked: L06_PlayerAction_117_v.md, L04_Trigger_603_seg1_v.md — both contain full verbatim CR text
- Status: **Healthy and complete**

### RulesGuru Questions
- `mtg-judge/META_test_cases_rulesguru.md`: **500 questions imported**
- Import date: 2026-05-22
- Categories: levels 0–3 + Corner Case, complexities: Simple/Intermediate/Complicated
- Used for: Arbiter validation only — **NOT exposed to agents at runtime**

---

## 4. Scryfall Data State

### Bulk data (app/data/scryfall-bulk/)

| File | Size | Last Synced | Status |
|---|---|---|---|
| oracle_cards.json | 165MB | 2026-05-23 09:02 UTC | ✅ Current |
| default_cards.json | 514MB | 2026-05-23 09:08 UTC | ✅ Current |
| all_cards.json | 2394MB | 2026-05-23 09:22 UTC | ✅ Current |
| unique_artwork.json | 241MB | 2026-05-23 09:03 UTC | ✅ Current |
| rulings.json | 24MB | 2026-05-23 09:00 UTC | ✅ Current |

All 5 bulk datasets are present and were downloaded today. **However, none of these are currently used by the app** — the `/api/cards` route reads from the legacy files below.

### Legacy Oracle files (app/data/)

| File | Size | Status |
|---|---|---|
| scryfall.oracle.local.json | 76MB | Used by /api/cards — older format |
| scryfall.rulings.local.json | 25.6MB | Used by /api/cards — rulings data |

**Critical gap:** The app reads from the small legacy oracle files, not the fresh bulk data. This means:
- Cards added since the last oracle sync are missing
- The bulk download was wasted — it's sitting unused
- Phase 2 work needs to wire the cards API to the bulk oracle instead

---

## 5. API Routes

| Route | What it does | Issues |
|---|---|---|
| `POST /api/anthropic` | Thin proxy to Anthropic `/v1/messages`. Takes system + messages, returns raw Anthropic response. | **Every agent call routes here. No local model support. No Ollama.** |
| `POST /api/arbiter` | Calls Anthropic with ARBITER_PROMPT (or ARBITER_PROMPT_FAST). Returns `{ trace: ... }`. | **Not a real engine — just a Claude call with a rules prompt. Calls Anthropic even for simple rule questions.** |
| `GET/POST /api/cards` | Reads from legacy scryfall.oracle.local.json and scryfall.rulings.local.json. Supports bulk name lookup, catalog, and rulings by oracle_id. | **Uses old oracle files, not the fresh bulk data. Works but has coverage gaps.** |
| `GET/POST /api/chats` | Reads/writes app/data/chats.local.json. Stores agent histories and deck locks. | ✅ Functional |
| `GET/POST /api/decks` | Reads/writes app/data/decks.local.json. Full deck CRUD. | ✅ Functional |
| `POST /api/engine` | The rules retrieval engine. Keyword-routes a query to relevant MTG ENGINE/ layer files and CR JSON. Returns formatted context snippets. 538 lines. | **Good foundation but only used when rules keywords are detected. Not exposed to all queries.** |
| `GET/POST /api/symbolic-engine` | Deterministic local engine. No AI. Handles a small set of known scenarios (cast, resolve, SBAs, etc.) with real rules citations. | ✅ Correct scope — it's honest about what it handles |

---

## 6. Agent Analysis

### Jace

| Dimension | Status |
|---|---|
| Data sources — claims | Scryfall Oracle, Arbiter trace, engine context |
| Data sources — actual | Local Oracle (via /api/cards ✅), Arbiter (via /api/arbiter ✅), Engine snippets (via /api/engine ✅) |
| Deck context | Reads saved deck library summary; can receive full locked deck context |
| Arbiter call | Wired — keyword-detects rules questions and fires Arbiter call first |
| Typical cost | 1–2 Anthropic API calls per message |
| Status | **Functionally complete but 100% Anthropic-dependent** |

### Karn

| Dimension | Status |
|---|---|
| Data sources — claims | Scryfall Oracle, engine context, locked deck |
| Data sources — actual | Local Oracle (✅), deck list from lock (✅) |
| Deck context lock | Implemented — createDeckLock() captures deck at conversation start |
| Lock format bug | Lock header says "LOCKED KARN DECK CONTEXT" — all agents share this exact text. Jace/Tibalt would receive a Karn-labeled context. |
| Typical cost | 1 Anthropic API call per message |
| Status | **Mostly functional. Lock header naming is misleading but not broken.** |

### Tibalt

| Dimension | Status |
|---|---|
| Data sources | Same as Karn — local Oracle, deck context |
| Deck context lock | Uses same lock mechanism — works, but labeled "LOCKED KARN DECK CONTEXT" in header |
| Saved deck roast | Wired — can see full deck library summary and matched decks |
| Typical cost | 1 Anthropic API call per message |
| Status | **Functional. Voice samples file referenced in CLAUDE.md (`docs/tibalt-voice-samples.md`) does not exist — no blocker since prompts carry the voice.** |

### Arbiter

| Dimension | Status |
|---|---|
| What it claims to be | "A deterministic Magic: The Gathering rules execution engine" |
| What it actually is | An Anthropic API call with a very detailed rules prompt |
| Local processing | None — 100% LLM |
| Symbolic engine | Separate route (/api/symbolic-engine) — deterministic and correct for its small scenario set |
| Rules codex access | Via /api/engine context injection — but this only happens when Jace calls Arbiter, not when user calls Arbiter directly |
| Cost | Jace + Arbiter = 2 Anthropic calls per rules question |
| Status | **Half-wired. Works but is not the deterministic engine it claims. Phase 2 must rebuild Arbiter as a real retrieval service.** |

### Garfield

| Dimension | Status |
|---|---|
| Implementation | goldfish.js (277 lines) + GarfieldPanel.jsx (88 lines) |
| Card data | Reads deckCards from DeckView — uses Scryfall data already loaded |
| Classification | Heuristics (regex on oracle text + named fast-mana list) — works but coarse |
| Turn simulation | Turns 1–6 goldfish, scoring curve execution |
| Save/load | Does NOT save game records to data/games/ — sessions are ephemeral |
| Status | **v1 goldfish exists and runs. Missing: game record persistence, commander-aware priorities, smarter archetypes.** |

---

## 7. Broken / Half-Wired Things (Priority Ordered)

### Critical

1. **No Ollama / 100% Anthropic** — Every agent message costs real money. Every session. No local model path exists at all. This is the single largest architectural gap vs. the spec.

2. **Bulk Scryfall data unused** — 3.3GB of fresh card data downloaded today, not wired into anything. The app is reading from a 76MB legacy file. The bulk sync script exists (`sync:scryfall-bulk`) but the cards API was never updated to use it.

3. **Arbiter is not an engine** — The ARBITER_PROMPT is excellent and produces correct-looking output, but it's 100% LLM inference — not a real rules engine. The symbolic engine is real but handles only a handful of scenarios. For complex rulings, the "engine" is just Claude with a good prompt.

### Significant

4. **RulesGuru questions not used at runtime** — 500 human-verified rule questions are sitting in a test file. They're never injected into agent context. They exist only for batch validation runs.

5. **Deck lock header bug** — All agents receive "LOCKED KARN DECK CONTEXT" in their system prompt regardless of which agent is active. Should be agent-specific. Not a crash bug but semantically incorrect.

6. **Engine context not wired to Arbiter direct calls** — When a user calls Arbiter directly (not via Jace), the engine context (/api/engine) is NOT injected. Arbiter's prompt is strong, but it doesn't have the local codex snippets the engine route provides. Jace gets this; Arbiter as a direct call doesn't.

7. **No cost tracking** — No dashboard, no per-call logging, no spend visibility. Owner has no way to see how much the app is costing.

8. **`mtg-judge/MTGAssistant.jsx` is a stale misplaced copy** — Should be deleted. It's a component that ended up in the test/judge directory by mistake.

### Minor

9. **`deckSeeds.js` at 1519 lines** — Contains seed deck templates. If the owner's real decks are in decks.local.json, these seeds are likely unused. Worth auditing whether any seed deck actually gets imported.

10. **Engine route fragile path** — `/api/engine` uses `path.resolve(process.cwd(), "..")` to find MTG ENGINE/. This breaks if Next.js is started from outside `app/`. Should use `__dirname` or a config constant.

11. **README.md `npm run sync:rulesguru` doesn't exist** — The README references this script but package.json has no such entry. Misleading for anyone following setup docs.

12. **`docs/tibalt-voice-samples.md` referenced but missing** — CLAUDE.md says to create it from previous chat samples. Not urgent (Tibalt's prompt is comprehensive) but should exist.

13. **PostCSS moderate vulnerability** — In Next.js transitive dep. Low risk for local tool, but worth patching when Next.js releases an update.

14. **API key in initial git commit** — THE KEY.txt was committed in `55f826b` and removed in `c9d7600`. Since no remote exists, exposure is local only. **Rotate the key anyway.**

---

## 8. Cost Analysis

### Per-message cost (current state)

| Action | Anthropic calls |
|---|---|
| Ask Jace a general question | 1 |
| Ask Jace a rules question | 2 (Jace + Arbiter) |
| Ask Karn to analyze a deck | 1 |
| Ask Tibalt to roast a deck | 1 |
| Call Arbiter directly | 1 |
| Any Garfield simulation | 0 (fully local) |

### Where Anthropic is called

- `app/src/app/api/anthropic/route.js` — all Jace, Karn, Tibalt, Arbiter (direct) calls
- `app/src/app/api/arbiter/route.js` — Arbiter backend calls from Jace

### Scryfall API calls

- Card catalog: fetched fresh from Scryfall API as last fallback if `/api/cards?catalog=1` and `/card-names.json` both miss. With card-names.json pre-built, this shouldn't fire in normal use.
- Individual card lookups: `/api/cards` serves local first; Scryfall API is fallback for cache misses only.
- `searchCards()` in scryfall.js: always calls Scryfall live (no local search endpoint yet).

---

## 9. Recommended Phase 1 Priorities

**Stop after this audit and wait for owner confirmation. The recommendations below are what I'd build once you say go.**

### Priority 1 — Ollama Integration (highest impact, stops the credit bleed)

Wire Ollama as the default provider for all agents. Every chat message that currently goes to Anthropic should go to Ollama instead. Anthropic becomes a fallback for when Ollama is unavailable or fails.

Implementation:
- Add Ollama provider to `/api/anthropic` route (OpenAI-compatible, just change base URL)
- Add a model routing config: default = Ollama, fallback = Anthropic
- Add a UI toggle in AppHeader: "Local (Ollama) / Cloud (Anthropic) / Auto"
- Tune prompts for local model (smaller models need more explicit formatting instructions)
- Add cost dashboard showing $0 for local calls vs. $ for Anthropic calls

Recommended models for RTX 5080:
- Primary: `qwen2.5:32b` (best quality in 16GB VRAM with some CPU offload)
- Fast: `qwen2.5:7b` (instant, for simple lookups)
- Confirm what's installed: `ollama list`

### Priority 2 — Migrate cards API to bulk Scryfall data

The oracle_cards.json bulk file (165MB) is sitting unread. Switch `/api/cards` to read from it. Build a proper index on first load (name → card, oracle_id → rulings). This is richer, fresher data than the legacy oracle file.

Implementation:
- Update `loadOracle()` in `/api/cards/route.js` to read from `data/scryfall-bulk/oracle_cards.json`
- Update `loadRulings()` to read from `data/scryfall-bulk/rulings.json`
- Add index build on first load (in-memory Map is fine — it's already how the legacy version works)
- Add refresh detection: check manifest.json timestamps, warm cache on startup
- Remove the legacy `scryfall.oracle.local.json` dependency once this is confirmed working

### Priority 3 — Fix deck context lock + add agent-specific headers

The deck lock mechanism is already 90% built. Three small fixes:

1. Change lock header from always "LOCKED KARN DECK CONTEXT" to be agent-specific (`LOCKED JACE DECK CONTEXT`, `LOCKED TIBALT DECK CONTEXT`, etc.)
2. Update each agent's prompt to reference its own lock header
3. Wire lock context to Tibalt conversations (currently, Tibalt receives the generic context but without the "LOCKED TIBALT" framing that its prompt expects)

This is a 1-hour fix that makes the UX correct.

---

## 10. Phase 2+ Readiness

The foundation for Phase 2 (Unified Knowledge Layer) is partly in place:

- ✅ All 5 Scryfall bulk datasets downloaded
- ✅ mtg-judge CR JSON present (cr_current.json)
- ✅ 500 RulesGuru questions imported
- ✅ /api/engine already does rule retrieval from MTG ENGINE/ layer files
- ❌ Bulk data not wired into /api/cards
- ❌ RulesGuru questions not served at runtime
- ❌ Forge data directory exists (mtg-judge/data/forge/) but nothing is imported/indexed from it
- ❌ Arbiter is not a real retrieval service

The codex structure in MTG ENGINE/ is the most complete and well-organized piece of the project. The /api/engine route that reads from it is a genuine strength. Phase 2 should build on this rather than replace it.

---

*Audit complete. Awaiting owner review.*
*Next action: owner confirms → begin Phase 1 critical fixes (Ollama integration first)*
