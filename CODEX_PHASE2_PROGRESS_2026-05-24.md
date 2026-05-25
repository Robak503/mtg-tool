# Codex Phase 2 Progress - 2026-05-24

Project root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`
Branch: `feat/phase2-arbiter-retrieval`
Latest commit after this update: `7350452`

This document supersedes the older "start Phase 2" assumptions in `PHASE2_PLAN.md`,
`CODEX_PHASE2_HANDOFF.md`, and `CODEX_PHASE2_PROMPT.md`. Those files are still useful
for design rationale, but the implementation has moved well past the original Step 1-7
checklist.

## What Is Now Built

Phase 2 backend retrieval is implemented and validated:

- `app/scripts/build-rules-index.cjs` builds `app/data/rules-index.json` from the local CR corpus.
- `app/src/lib/server/cardIndex.js` provides local Scryfall lookup from `app/data/scryfall-bulk/oracle_cards.json`.
- `app/src/lib/server/rulesRetrieval.js` retrieves rules by exact rule number, pinned local hints, card names, Scryfall rulings, keyword overlap, and RulesGuru precedents.
- `app/src/lib/server/rulesGuruRetrieval.js` loads local RulesGuru scenarios as precedent data.
- `app/src/lib/server/citationInjector.js` builds grounded Arbiter context with retrieved CR text and card text.
- `app/src/app/api/arbiter/route.js` now uses local retrieval modules directly instead of acting as a thin prompt-only proxy.
- `app/scripts/validate-arbiter-knowledge.cjs` has validation-mode support for deterministic retrieval checks.
- `app/scripts/clean-next-cache.cjs` and package scripts clean `.next` before build/check to avoid stale Next chunk/page-data failures.
- The UI now has a Fast / Deep / API model tier selector in `AppHeader.jsx`.
- Chat requests now route tiers explicitly:
  - Fast -> Ollama fast model (`OLLAMA_FAST_MODEL`, currently `qwen2.5:7b`)
  - Deep -> Ollama deep model (`OLLAMA_MODEL`, currently `qwen2.5:32b`)
  - API -> Anthropic
- TrustStrip/message metadata now records provider, tier, model, deck lock, cards, rulings, engine context, and Arbiter trace presence.
- `/api/model-calls` now exposes the last call's `modelTier` and `fastLocal`.

## Validation Results

Last verified commands from `app/`:

```powershell
npm.cmd run validate:arbiter -- --all --report reports/phase2-arbiter-core-full.md
npm.cmd run validate:arbiter -- --suite expanded --all --report reports/phase2-arbiter-expanded-full.md
npm.cmd run validate:arbiter -- --suite rulesguru --all --report reports/phase2-arbiter-rulesguru-full.md
npm.cmd run build
```

Results:

- Core suite: `76/76 passed`
- Expanded suite: `424/424 passed`
- RulesGuru suite: `500/500 passed`
- Combined deterministic retrieval coverage: `1000/1000 passed`
- Build: passed after stopping the dev server and letting `clean:next` remove `.next`
- Anthropic call count during validation/smoke remained `0`

Important caveat: RulesGuru validation currently benefits from exact local precedent
matching. That is valuable for a local precedent layer, but it is not the same as proving
the system can answer paraphrased versions. Add a mutated/paraphrase validator later if
we want a harder generalization test.

## Recent Commit Timeline

```text
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
```

## Known Build/Dev Note

If `npm.cmd run build` fails with `Cannot find module for page: /api/...` or stale chunk
errors while the dev server is running, stop the dev server and rerun the build. The
project now cleans `.next` before build/check, but Next can still race itself if dev and
build are both active.

Clean restart:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run dev
```

## Immediate Next Checks

The code builds. The remaining check is a short manual UI smoke pass:

1. Start dev server.
2. Open `http://localhost:3000`.
3. Confirm the header shows `Fast`, `Deep`, and `API`.
4. Select `Fast`; ask a short Karn/Jace question; TrustStrip should show local provider, tier Fast, and the 7B model.
5. Select `Deep`; ask a short non-rules question; TrustStrip should show local provider, tier Deep, and the 32B model.
6. Do not select `API` unless the user explicitly wants to spend Anthropic credits.
7. Check `http://localhost:3000/api/model-calls`; `providers.anthropic.total` should remain `0` unless API was deliberately used.

## Recommended Next Engineering Slice

Do not expand into Forge or Garfield yet. The best next slice is polish and trust:

1. Surface Arbiter retrieval sources in the UI more clearly.
   - Show retrieved rule numbers and RulesGuru precedent count in the Arbiter trace or TrustStrip.
   - Keep full rule text hidden behind details so it is table-readable but not noisy.
2. Populate deck lock version fields.
   - `cardDataVersion`: from `app/data/scryfall-bulk/tier-manifest.json` or Scryfall bulk metadata.
   - `rulesVersion`: from `mtg-judge` metadata or CR file timestamp/hash.
3. Add a stricter validation mode.
   - Mutate/paraphrase RulesGuru prompts or disable exact scenario matching to test generalization.
4. Add one small UI status for retrieval misses.
   - If Arbiter returns `retrieval_miss`, Jace should say the local rules layer could not ground the answer instead of guessing.

## What Not To Do Next

- Do not run a full all-5 Scryfall bulk migration unless a concrete UI/use case needs printings or artwork.
- Do not add Forge integration yet.
- Do not add embeddings yet; keyword + card/ruling/precedent retrieval is passing the current gate.
- Do not turn on automatic Anthropic fallback. Manual API selection is the cost-control boundary.
