# Codex Phase 2 Progress - 2026-05-24
*Updated 2026-05-25 to include Saturday deck-Oracle work and Phase 2 verification*

Project root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`
Branch: `feat/phase2-arbiter-retrieval`
Latest commit: `0b5a4e6`

This document supersedes the older "start Phase 2" assumptions in `PHASE2_PLAN.md`,
`CODEX_PHASE2_HANDOFF.md`, and `CODEX_PHASE2_PROMPT.md`. Those files are still useful
for design rationale, but the implementation has moved well past the original Step 1-7
checklist.

---

## What Is Now Built

### Phase 2 Backend Retrieval (completed May 24)

- `app/scripts/build-rules-index.cjs` builds `app/data/rules-index.json` from the local CR corpus.
- `app/src/lib/server/cardIndex.js` provides local Scryfall lookup from `app/data/scryfall-bulk/oracle_cards.json`.
- `app/src/lib/server/rulesRetrieval.js` retrieves rules by exact rule number, pinned local hints, card names, Scryfall rulings, keyword overlap, and RulesGuru precedents.
- `app/src/lib/server/rulesGuruRetrieval.js` loads local RulesGuru scenarios as precedent data.
- `app/src/lib/server/citationInjector.js` builds grounded Arbiter context with retrieved CR text and card text.
- `app/src/app/api/arbiter/route.js` now uses local retrieval modules directly instead of acting as a thin prompt-only proxy.
- `app/scripts/validate-arbiter-knowledge.cjs` has validation-mode support for deterministic retrieval checks.
- `app/scripts/clean-next-cache.cjs` and package scripts clean `.next` before build/check.
- The UI has a Fast / Deep / API model tier selector in `AppHeader.jsx`.
- TrustStrip/message metadata records provider, tier, model, deck lock, cards, rulings, engine context, and Arbiter trace.
- `/api/model-calls` exposes `modelTier` and `fastLocal` per call.
- Arbiter grounding metadata flows into chat history and TrustStrip.
- `/api/knowledge-status` reports compact local Scryfall/rules version strings.
- Deck locks snapshot `cardDataVersion` and `rulesVersion`.
- Unresolved, retrieval-miss, and citation-failed Arbiter statuses are visible in the chat UI.
- `validate:arbiter --mutate` adds a paraphrase-lite RulesGuru validation mode.
- Chat history stores compact Arbiter source lists instead of full retrieved rule text.
- Chat UI includes `View Arbiter Sources` for rule numbers, card names, RulesGuru precedent IDs, and citation warnings.

### Deck Oracle Context + Lock Controls (completed May 23, commit 42bba63)

- `app/src/lib/scryfall.js` has a new `buildCardContextForNames(names, options)` function that builds a full `## CARDS REFERENCED` block from a list of card names, using local Scryfall data.
- `app/src/hooks/useChatAgents.js` stores `cardNames` in deck locks and attaches full Oracle text for all non-token, non-sideboard locked deck cards to every agent message.
- Deck locks now apply across Jace, Karn, Tibalt, and Arbiter — not only Karn.
- Sidebar deck switches do not silently change an already locked conversation.
- The app has **Unlock Deck** and **Unload Deck** controls:
  - **Unlock** — removes the current agent's locked snapshot, keeps chat history.
  - **Unload** — clears the sidebar active deck selection.
  - **Clear Chat** — still clears the current chat and removes that agent's lock.
- Jace, Karn, and Tibalt prompts respect locked deck snapshots.
- Local Scryfall rulings (max 2 per card) are included in deck lock context.
- Live Scryfall fallback is narrow and explicit: only for missing locked-deck or directly-mentioned card facts, not for general searches.

---

## Validation Results (verified 2026-05-25)

```powershell
# From app/
npm.cmd run validate:arbiter -- --limit 2
# Result: 2/2 passed (A1 ✓, A2 ✓)

npm.cmd run validate:arbiter -- --all --report reports/phase2-arbiter-core-full.md
# Result: 76/76 passed

npm.cmd run validate:arbiter -- --suite expanded --all
# Result: 424/424 passed

npm.cmd run validate:arbiter -- --suite rulesguru --all
# Result: 500/500 passed

npm.cmd run validate:arbiter -- --suite rulesguru --all --mutate
# Result: 500/500 passed (paraphrase-lite mode)

npm.cmd run check
# Result: build passes, exit 0
```

Arbiter smoke (via API):
- POST /api/arbiter with "If Rest in Peace is on the battlefield, does a creature that dies go to the graveyard or exile?"
  → status: resolved, confidence: high, rulesRetrieved: [700.4, 701.8a, 614.6, 613.4d, 613.4b], hallucinations: 0

Model calls:
- GET /api/model-calls → anthropic.total = 0, ollama.total = 53

---

## Recent Commit Timeline

```text
0b5a4e6 docs: update Phase 2 source metadata status
da67fc7 refactor: persist compact Arbiter sources
d2438ba test: add mutated RulesGuru validation
7eb53bf fix: make unresolved Arbiter answers visible
2c848cf feat: snapshot knowledge versions in deck locks
028114d feat: show Arbiter grounding metadata
b5871f6 docs: update Phase 2 progress handoff
7350452 feat: add model tier selector
aa8c4d8 chore: clean Next cache before builds
8186416 feat: add RulesGuru precedent retrieval
50726c7 test: pass 500-case Arbiter retrieval gate
4b963e5 test: add fast Arbiter retrieval validation
d98b91d docs: add Phase 2 pause handoff
fe8707a fix: prioritize deterministic rule hints
eb94b0b feat: ground Arbiter in local retrieval
4b751ed feat: add citation injector
1d285de feat: add local rules retrieval
7194e37 refactor: centralize local card index
7070794 feat: add rules index builder
1ae159c docs: close Phase 1 smoke test
42bba63 feat: implement deck context lock with per-agent Oracle text attachment
```

---

## Current Port State

The app is running at **http://localhost:3000** (the original Codex copy at
`C:\Users\colto\Documents\Codex\MTG TOOL\app` appears to no longer be running).
If port 3000 is occupied, the app falls back to port 3001.

```powershell
# Start dev server
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run dev
```

---

## Known Build/Dev Note

If `npm.cmd run build` fails with stale chunk errors:
1. Stop the dev server
2. `Remove-Item .next -Recurse -Force` (from app/)
3. Restart `npm.cmd run dev`

The project cleans `.next` before build/check automatically, but Next can still race
if dev and build are both active.

---

## What Phase 2 Verified "Done" Criteria

- [x] `validate:arbiter --limit 2` passes 2/2
- [x] UI tier toggle (Fast/Deep/API) persists per-conversation, shows in TrustStrip
- [x] "Rest in Peace + dies trigger" → 614.6 in `rulesRetrieved`
- [x] Zero-retrieval case returns `retrieval_miss`, not a hallucinated answer
- [x] No HTTP loopback in Arbiter route — all module imports
- [x] Arbiter `max_tokens` = 2500
- [x] `anthropic.total = 0` at `/api/model-calls`
- [x] Deck lock applies to all agents (Jace, Karn, Tibalt, Arbiter)
- [x] Full Oracle text for deck cards injected into every locked-deck message
- [x] Unlock Deck / Unload Deck controls present in UI

---

## Recommended Next Engineering Slice

Phase 2 backend is complete. The best next work is user-facing polish:

1. **Browser smoke test** (manual, ~20 min) — Chrome was disconnected at last check.
   Key points:
   - Load a deck → confirm deck lock banner appears
   - Ask Karn "What is weak about this deck?" → confirm Oracle block present, no "I don't have access to card data"
   - Switch to Jace → ask a rules question → confirm Arbiter trace fires, `View Arbiter Sources` visible
   - Test Unlock Deck and Unload Deck buttons
   - Load Sliver Hivelord → Jace → "If Rest in Peace is in play, does [[Viscera Seer]] see [[Yawgmoth, Thran Physician]] die?" → 614.6 + 700.4 in sources
   - Check `/api/model-calls` → `anthropic.total = 0`

2. **Decide Phase 2 is ready** — it meets all defined success criteria. The 7B quality
   ceiling on voice/tone is a model-routing issue, not a Phase 2 plumbing failure.

3. **Phase 3 candidates** (next session):
   - Garfield goldfish simulator improvements
   - Chat session manager (new UI with list of active chats per agent)
   - In-app feedback capture button
   - Tibalt/Karn voice tuning (route more questions to 14B/32B for quality)

## What Not To Do Next

- Do not run a full all-5 Scryfall bulk migration — not needed for current use cases.
- Do not add Forge integration yet.
- Do not add embeddings — keyword + card/ruling/precedent retrieval passes the gate.
- Do not turn on automatic Anthropic fallback — manual API selection is cost control.
- Do not start Phase 3 until the browser smoke test confirms Phase 2 is clean.
