# Codex Pause Handoff - 2026-05-24

## Why This Exists

Colton needed to shut down the computer mid-Phase 2. This file captures the exact safe pause point.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

Current branch:

```text
feat/phase2-arbiter-retrieval
```

Latest commit at pause:

```text
fe8707a fix: prioritize deterministic rule hints
```

## What Was Completed This Session

Phase 1 closeout:

- Re-ran the post-token-fix browser smoke test through the real UI.
- Karn cut mode passed: 10 complete cut bullets, no Additions section.
- Jace stack primer passed: local response, deck lock, Arbiter trace attached.
- Tibalt roast passed: reached Final Verdict and persisted after reload.
- Confirmed `anthropic.total = 0`.
- Updated and committed Phase 2 docs so they no longer say T12 is pending.

Phase 2 implementation:

- Created branch `feat/phase2-arbiter-retrieval`.
- Step 0 verified:
  - `mtg-judge/data/cr/cr_current.json` exists and has 3,138 rules.
  - `616.1`, `616.1a`, `614.6`, `608.2`, and `700.4` exist.
  - `app/data/scryfall-bulk/oracle_cards.json` exists.
- Step 2 completed:
  - Added `app/scripts/build-rules-index.cjs`.
  - Added npm script `build:rules-index`.
  - Generated ignored artifact `app/data/rules-index.json`.
- Step 3 completed:
  - Added shared server singleton `app/src/lib/server/cardIndex.js`.
  - Refactored `cardContext.js` and `/api/cards` to use it.
- Step 4 completed:
  - Added `app/src/lib/server/rulesRetrieval.js`.
  - Handles exact rule numbers, card-name extraction, Oracle/ruling seed text, keyword overlap, and deterministic rule hints.
  - Fixed false-positive card detections for blank/unset cards and common words like `who`.
- Step 5 completed:
  - Added `app/src/lib/server/citationInjector.js`.
  - Builds grounded Arbiter context with full local rule text and card text.
  - Can strip hallucinated citations not present in retrieved rules.
- Step 6 mostly completed:
  - Rebuilt `app/src/app/api/arbiter/route.js`.
  - Removed the internal `/api/engine` HTTP loopback.
  - Calls retrieval modules directly.
  - Sets Arbiter max tokens to `2500`.
  - Returns `retrievalMetadata`:

```js
{
  rulesRetrieved: { ruleNumber: string, text: string }[],
  cardsRetrieved: string[],
  hallucinations: string[],
  confidence: "high" | "low"
}
```

Live API check passed for:

```text
How does Rest in Peace interact with Reanimate?
```

It returned local `retrievalMetadata`, `cardsRetrieved: ["Rest in Peace", "Reanimate"]`, `hallucinations: []`, and `confidence: "high"`.

## Important Finding

The design docs said A2 should force `616.1a` for replacement-choice ordering. The local CR corpus says:

- `616.1` is the affected player/controller choice rule.
- `616.1a` is specifically self-replacement effects.

So validator expectations should be corrected to accept/require `616.1` for the general replacement-ordering concept. Do not blindly force `616.1a` unless the scenario actually involves self-replacement effects.

## Current Verification State

Already run successfully after major edits:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run build
npm.cmd run build:rules-index
```

After a production build, the dev server hit the known `.next` cache issue once. Standard recovery was used:

```powershell
Stop project node processes
Remove-Item .next -Recurse -Force
npm.cmd run dev
```

After restart, `/api/model-calls` worked and showed:

```json
{
  "providers": {
    "anthropic": { "total": 0 }
  }
}
```

## Next Exact Step

Continue Phase 2 Step 7:

```text
Update app/scripts/validate-arbiter-knowledge.cjs
```

The validator currently expects old trace-only output. It should be updated to inspect `retrievalMetadata` from `/api/arbiter`.

Recommended Step 7 behavior:

- For A1, check `retrievalMetadata.rulesRetrieved` includes `614.6` and `700.4`.
- For A1, keep Axiom 4 as a model/prose expectation if useful, but do not make retrieval fail on missing `Axiom 4` because the CR JSON index does not contain axioms.
- For A2, check retrieved rules include `608.2`, `614.6`, and `616.1`.
- Avoid requiring `616.1a` for A2 unless the local test case is rewritten to specifically require self-replacement effects.
- Check `retrievalMetadata.hallucinations` is empty for well-formed tests.
- Keep the old structural section checks if helpful.

Then run:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run validate:arbiter -- --limit 2
```

Expected target after Step 7:

```text
2/2 passing
```

## Resume Checklist

When restarting:

1. Open PowerShell.
2. Run:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL"
git status --short
git branch --show-current
git log --oneline -6
```

3. If not already on the feature branch:

```powershell
git switch feat/phase2-arbiter-retrieval
```

4. Start app if needed:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run dev
```

5. Continue with validator update.

## Files To Read First Next Session

Read in this order:

1. `CODEX_PAUSE_HANDOFF_2026-05-24.md`
2. `CODEX_PHASE2_HANDOFF.md`
3. `PHASE2_PLAN.md`
4. `app/src/lib/server/rulesRetrieval.js`
5. `app/src/lib/server/citationInjector.js`
6. `app/src/app/api/arbiter/route.js`
7. `app/scripts/validate-arbiter-knowledge.cjs`

