# MTG Tool — Phase 2 Plan & Session Handoff
*2026-05-24 — covers this Claude session in full + Phase 2 build plan*

## Current Implementation Status

This plan now has a newer companion progress file:
`CODEX_PHASE2_PROGRESS_2026-05-24.md`.

As of commit `7350452`, the major Phase 2 backend work has been implemented and
validated:

- Arbiter local retrieval is wired at runtime.
- Rules index, card index, citation injection, and RulesGuru precedent retrieval are built.
- Deterministic validation passes core `76/76`, expanded `424/424`, and RulesGuru `500/500`.
- The Fast / Deep / API model tier selector is built.
- Build passes after stopping dev and cleaning `.next`.

The remaining live work is polish and trust UX, not the original backend scaffold.
Use `CODEX_PHASE2_PROGRESS_2026-05-24.md` as the current handoff, and use this file
for design rationale.

---

## How to Use This Document

This is a complete handoff. It covers:
1. Everything done in this Claude session (fixes, smoke test, planning)
2. The full Phase 2 plan (architecture, build order, design rationale)

Read this cold and you have everything you need to continue.

Project root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`
App root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app`
Latest verified commit for current Phase 2 progress: `7350452`

---

## What Happened This Session

### Starting state
Picked up from Codex Phase 1 handoff (`ce362f2`). Phase 1 was declared complete by
Codex. T12 manual browser smoke test was the only remaining gate.

### T12 Browser Smoke Test — Final Results

The user ran T12 in the browser and found two issues:

**Issue 1 — Karn responses truncated and adding Additions section**
- `Suggest 10 cards to cut` was cut off mid-sentence at `[[Guardian`
- Response included a `### Additions:` section (should be cuts only on a pure cut request)
- Root cause: `localMaxTokens` was set to **420 tokens** for pure cut requests — far too small
  for 10 cards with reasoning. The `LOCAL MODEL RESPONSE BUDGET` instruction also hardcoded
  "finish within 250-350 words" globally for all local model calls.
- The `KARN CUT MODE` instruction said cuts must come from the deck list, but never explicitly
  said "no Additions section."

**Issue 2 — Tibalt roast truncated mid-section**
- Response cut off at "Flavor Failures" section header — never finished the roast
- Root cause: `localMaxTokens` was **520 tokens** for Karn/Tibalt — a multi-section roast
  needs ~1500-2000 tokens minimum.

**Fixes applied:**

`app/src/hooks/useChatAgents.js` — commit `c3f114f`:
- `localMaxTokens` changed from per-agent variable (`isPureKarnCutRequest ? 420 : 520`)
  to a flat **2500** for all agents and modes (commit `2a32fe9` — user requested flat cap)
- `LOCAL MODEL RESPONSE BUDGET` instruction made agent-aware:
  - CUT MODE: "Provide cuts only. Do NOT include Additions or Recommendations section."
  - Tibalt: "Complete every section you start. Do not truncate mid-section."
  - Karn general: "400-500 words unless user asked for full report."
  - Jace/other: "300-400 words and stop cleanly."
- `KARN CUT MODE` instruction updated to explicitly say:
  "Do NOT include an Additions section, Recommendations section, or any suggested
  replacements. Cuts only. Format: bullet list, [[Card Name]] — one-line reason."

**T12 status after fixes: PASSED.**
Codex re-ran the browser smoke test on 2026-05-24 after the 2500-token cap fix:

1. Sliver Hivelord loaded successfully.
2. Karn → clear chat → `Suggest 10 cards to cut`
   - Result: 10 complete cut bullets, all from the locked deck, NO Additions section.
3. Jace → clear chat → `How does the stack work?`
   - Result: deterministic stack primer fired, deck lock visible, Arbiter trace attached,
     TrustStrip showed local provider and Arbiter context.
4. Tibalt → clear chat → `Roast my active deck`
   - Result: full roast reached `Final Verdict`; no mid-section truncation.
5. Reload → switch back to Tibalt
   - Result: loaded deck, Tibalt lock, chat history, and Final Verdict persisted.
6. `http://localhost:3000/api/model-calls`
   - Result: `providers.anthropic.total = 0`; all smoke calls stayed local through Ollama.

Quality note: the 7B local model is usable but still softer and less precise than the
target Tibalt/Karn voice. That is a model-quality/prompt-routing issue, not a Phase 1
plumbing failure. Phase 2 should proceed.

### Phase 2 Planning

Ran the full three-review planning pipeline:
1. **Office hours** (builder mode) — design doc written, 2 adversarial spec review rounds,
   5 issues caught and fixed, approved at 9/10 quality score
2. **CEO review** (independent agent, read doc cold) — reframed as trust problem,
   flagged binary trigger flaw, identified silent retrieval miss risk
3. **Eng review** (independent agent, read codebase + doc cold) — found 2 real bugs in
   existing code, caught keyword filter bug, defined missing interface

Seven amendments from reviews were baked into the design doc and are reflected in the
build plan below.

### Commits This Session

| Commit | What |
|--------|------|
| `c3f114f` | fix(karn/tibalt): token budgets, cut-mode additions bleed, agent-aware response budget |
| `2a32fe9` | fix: flat 2500 token cap for all local model calls |
| `c007a5c` | docs: CODEX_PHASE2_HANDOFF.md + CODEX_PHASE2_PROMPT.md |
| `b8770c9` | docs: PHASE2_PLAN.md (this file, first version) |

### Files Changed This Session

| File | What Changed |
|------|-------------|
| `app/src/hooks/useChatAgents.js` | Token caps, KARN CUT MODE, LOCAL MODEL RESPONSE BUDGET |
| `CODEX_PHASE2_HANDOFF.md` | New — full Phase 2 implementation brief for Codex |
| `CODEX_PHASE2_PROMPT.md` | New — paste-in starter for Codex |
| `PHASE2_PLAN.md` | New — this file |

---

## Phase 1 Final State

All Phase 1 work complete. Working tree clean after the post-fix smoke rerun.
Historical table below reflects the original Phase 2 planning moment; current
implementation status is summarized at the top of this file and in
`CODEX_PHASE2_PROGRESS_2026-05-24.md`.

| What | Status |
|------|--------|
| 5 agents: Jace, Karn, Tibalt, Arbiter, Garfield | ✅ Working |
| Ollama routing — 0 Anthropic calls in normal use | ✅ Working |
| qwen2.5:7b (fast) / 14b (Arbiter) / 32b (deep) | ✅ All running locally |
| Deck context lock — snapshot at conversation start | ✅ Working |
| SSE streaming (Ollama NDJSON + Anthropic SSE) | ✅ Working |
| TrustStrip (provider/deck/cards/cloud per message) | ✅ Working |
| Karn pure cut mode — cuts from locked deck only | ✅ Working |
| Karn/Tibalt 2500 token response cap | ✅ Fixed this session |
| Karn adds-section bleed on cut requests | ✅ Fixed this session |
| validate:arbiter A1 (Axiom 4 / dies trigger) | ✅ Passing |
| validate:arbiter A2 (3-way replacement scenario) | ❌ Known 14B limit — Phase 2 fixes |
| UI model-tier toggle | ❌ Not built — Phase 2 Step 1 |
| T12 browser smoke test (post-fix) | ✅ Passed through browser on 2026-05-24 |

---

## The Phase 2 Problem

Arbiter is currently a **thin LLM proxy**. It sends rules questions to qwen2.5:14b
with a carefully crafted system prompt and mandatory citation rules. The A2 validation
failure proved this approach has a ceiling: the 14B model cannot reliably cite three
rule numbers simultaneously for complex scenarios. Better prompting won't fix it.

The real fix: **deterministic retrieval injection**. Instead of asking the LLM to
remember rule numbers, look them up from the local Comprehensive Rules corpus and
inject them verbatim into the prompt. The LLM elaborates — it cannot hallucinate
citations that weren't given to it.

**The framing from CEO review:** This is a *trust* problem, not an accuracy problem.
At Commander night, the question is "can I show this to my opponent and win the argument?"
The Phase 2 Arbiter output functions as a physical judge ruling — full rule text printed,
not just numbers. You show it across the table and the game moves on.

---

## The Data

### Comprehensive Rules
- Path: `mtg-judge/data/cr/cr_current.json`
- 3,138 rules, JSON keyed by rule number
- Format: `{ "616.1a": { ruleNumber, ruleText, examples, fragment, navigation }, ... }`
- Verified present: 616.1a, 616.1, 614.6, 608.2, 700.4 — all confirmed correct text

### Scryfall Oracle
- Path: `app/data/scryfall-bulk/oracle_cards.json`
- 37,466 cards, standard Scryfall card object shape
- The older `app/data/scryfall.oracle.local.json` also exists — use the bulk file

### Scryfall Rulings
- Available via existing `/api/cards?rulingsFor=<name>` route
- Used for card-name seeded retrieval (critical for card-interaction questions)

---

## Phase 2 Architecture

```
Jace (rules question)
  │
  │  confidence-scored trigger: 2+ keywords OR rule number OR [[Card]]
  ▼
Arbiter Service  (/api/arbiter)
  │
  ├─► Card Name Extraction  ─── [[brackets]] + plain text detection
  │
  ├─► Rule Retrieval  ──────── cr_current.json keyword index
  │     priority:               + card rulings seed (for card-interaction Qs)
  │     1. exact rule numbers in query
  │     2. card rulings → rule numbers mentioned in rulings text
  │     3. keyword overlap (length >= 3 + MTG allowlist)
  │
  ├─► Card Lookup  ─────────── oracle_cards.json in-memory Map (O(1))
  │
  ├─► Citation Injector  ────── assembles: RETRIEVED RULES (full text)
  │                                         + RETRIEVED CARD TEXT
  │                                         + QUESTION
  │
  └─► LLM (qwen2.5:14b)  ───── generates STATE / RESOLUTION / RULE TRACE / CITATIONS
        max_tokens: 2500          using only injected content — cannot hallucinate
        no HTTP loopback          citations that weren't given
```

---

## Why These Design Choices

**Card-name seeding for retrieval** — A pure keyword search fails on the most important
questions. "How does Rest in Peace interact with Reanimate?" has zero long keywords that
match rule text. Without card-name seeding: retrieval returns rules 100.x (game overview).
With seeding: fetch Rest in Peace rulings → rulings text mentions "614.6" → correct rules
retrieved. This was the eng review's most critical finding.

**Confidence-scored Jace trigger** — Binary keyword matching fails both ways: casual
questions that hit "stack" incorrectly invoke Arbiter; rules questions phrased without
trigger words bypass it. Confidence scoring: 2+ keywords OR explicit rule number OR
`[[CardName]]` → call Arbiter. One keyword alone → Jace handles it with the fast model.

**Full rule text injected (not just rule numbers)** — The LLM receives actual rule text
verbatim. The Arbiter trace shows the full text. The trace functions as a readable judge
ruling — no one has to look up rule 616.1a to understand the answer.

**Remove HTTP loopback** — The current Arbiter route calls `/api/engine` via `fetch()`
from inside the route handler. Loopback calls in Next.js are fragile and add latency.
All retrieval functions must be imported as server-side modules. (Eng review finding.)

**Arbiter max_tokens = 2500** — With 500-800 tokens of injected rules in the prompt,
the 14B model needs room for STATE + RESOLUTION + RULE TRACE + CITATIONS. The 900-token
fast/local cap inherited from chat calls truncates Arbiter output. Set explicitly.
(Eng review finding — would have broken the entire new architecture silently.)

**Keyword filter >= 3 chars + MTG allowlist** — The `> 4` filter drops "cast", "copy",
"dies", "draw", "tap", "hand" — the most important MTG vocabulary. (Eng review finding.)

**`retrievalMetadata` shape locked upfront** — The validator is written against this
shape. If it changes after the validator is written, both break. Define it first:
```js
{
  rulesRetrieved: { ruleNumber: string, text: string }[],
  cardsRetrieved: string[],
  hallucinations: string[],
  confidence: 'high' | 'low'
}
```

---

## Build Order

### Step 0 — Verify corpus (~15 min, do first)
```js
const cr = JSON.parse(fs.readFileSync('mtg-judge/data/cr/cr_current.json', 'utf8'));
console.log(Object.keys(cr).length); // expect ~3138
console.log(cr['616.1a'].ruleText);  // expect replacement effect text
```
Confirm `app/data/scryfall-bulk/oracle_cards.json` exists.

### Step 1 — UI Tier Toggle (independent, ~1-2 hrs)
Per-conversation selector: **Fast** (7B) / **Deep** (32B) / **Anthropic**.
Arbiter always uses 14B — not a user-facing tier option.
Persists in chat history. Shows in TrustStrip.
**No dependencies — ship at any point.**

### Step 2 — Rules Index Build Script (~2-3 hrs)
New: `app/scripts/build-rules-index.cjs` → `app/data/rules-index.json`
New npm script: `"build:rules-index": "node scripts/build-rules-index.cjs"`

Reads `cr_current.json`. Per-rule output: `{ ruleNumber, text, keywords, examples }`.
Keywords: words length >= 3 + MTG allowlist:
`["tap", "pay", "add", "put", "die", "cast", "copy", "dies", "draw", "hand", "zone"]`
Exclude English stop words: the, and, for, are, was, that, this, with, from, etc.
Add `app/data/rules-index.json` to `.gitignore` (regenerable artifact).

### Step 3 — Scryfall In-Memory Singleton (~1-2 hrs)
New: `app/src/lib/server/cardIndex.js`

```js
let _cardIndex = null;
function getCardIndex() {
  if (!_cardIndex) _cardIndex = buildCardIndex(); // lazy-init, runs once
  return _cardIndex;
}
export function lookupCard(name) {
  return getCardIndex().get(normalizeName(name)) || null;
}
```
Replaces linear scan in `cardContext.js` and `cards/route.js`.
200-500ms cold-start stall on first post-hot-reload request is acceptable in dev.

### Step 4 — Rules Retrieval Function (~1-2 hrs)
New: `app/src/lib/server/rulesRetrieval.js`

```js
// retrieveRules(query: string, cardNames: string[]) → { rules, confidence }
```
Priority: exact rule numbers → card-name seeding via rulings → keyword overlap.
Zero match → `{ rules: [], confidence: 'low' }` — never return random rules.

Card name extraction: `[[bracketed]]` regex + check 2-4 word phrases against card index.

### Step 5 — Citation Injector (~1-2 hrs)
New: `app/src/lib/server/citationInjector.js`

```js
// buildInjectedContext(question, rules, cards) → string
```
Output format:
```
## RETRIEVED RULES (cite ONLY these)
[616.1a] — "If two or more replacement and/or prevention effects..."
[614.6] — "If an event is replaced, it never happens..."

## RETRIEVED CARD TEXT
[[Rest in Peace]] — "If a card or token would be put into a graveyard..."

## QUESTION
{question}
```
LLM instruction appended: "Only cite rule numbers from RETRIEVED RULES above."

### Step 6 — Arbiter Route Rebuild (~2-3 hrs)
File: `app/src/app/api/arbiter/route.js`

**Remove HTTP loopback** — replace `fetch('/api/engine')` with direct module imports.
**Set max_tokens: 2500** — explicit in `callModelMessages`, not inherited from hook.

Orchestration:
1. Extract card names from query (`[[brackets]]` + plain text)
2. `retrieveRules(query, cardNames)` → rules + confidence
3. `lookupCard()` for each card name → oracle blocks
4. If `confidence === 'low'` AND `rules.length === 0`:
   return `{ status: 'retrieval_miss' }` — not a hallucinated confident answer
5. `buildInjectedContext(question, rules, cards)` → grounded prompt
6. `callModelMessages` with 14B, max_tokens 2500
7. Post-process: extract `[NNN.Xa]` citations from RULE TRACE, verify against retrieved
   set, strip hallucinations, build `retrievalMetadata`
8. Return: `{ state, resolution, ruleTrace, citations, retrievalMetadata, status, provider, trace }`

### Step 7 — Validator Update (~1 hr)
File: `app/scripts/validate-arbiter-knowledge.cjs`

Check `retrievalMetadata.rulesRetrieved`:
- A1: contains a rule with `ruleNumber` starting with `616`
- A2: contains entries for `616.1a`, `614.6`, AND `608.2` — all three
  (injected deterministically now, not LLM-dependent)

Expected result: **`validate:arbiter --limit 2` passes 2/2**

---

## What Gets Cut

| Item | Decision |
|------|----------|
| Forge integration | Deferred — card scripts are gameplay simulation, not rules text |
| RulesGuru expansion past 500 | Hold — 500 covers Arbiter grounding, diminishing returns |
| Semantic/embedding retrieval | Over-engineering — keyword + card seeding is sufficient |
| Learn-to-play mode | Phase 6, separate roadmap |

---

## Success Criteria

- [x] T12 browser smoke test re-run after token fix (Karn cuts, Jace stack, Tibalt roast)
- [ ] `validate:arbiter --limit 2` passes **2/2**
- [ ] UI tier toggle persists per-conversation, shows in TrustStrip
- [ ] "How does Rest in Peace interact with Reanimate?" → 614.6 in `rulesRetrieved`
- [ ] Zero-retrieval case returns `retrieval_miss`, not a hallucinated answer
- [ ] No HTTP loopback in Arbiter route — all module imports
- [ ] Arbiter `max_tokens` = 2500 (confirmed via `/api/model-calls`)
- [ ] `anthropic.total = 0` at `/api/model-calls`

---

## Known Gotchas

**`.next` cache** — After any build step, if dev server returns 500s:
```powershell
Remove-Item .next -Recurse -Force  # from app/
npm.cmd run dev
```

**Ollama streaming** — NDJSON format (newline-delimited JSON), not SSE. Follow the
existing pattern in `chat-stream/route.js`. Do not treat it like Anthropic SSE.

**Never `fetch('/api/...')` inside an API route** — Import the module directly. The
current Arbiter route has this bug. Step 6 removes it.

**`retrievalMetadata` shape is locked** — The validator reads it. Don't change it.

**Card name normalization** — `name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()`
everywhere. Æther Vial normalizes to Aether Vial — already handled in `scryfall.js`.

**Keyword filter** — Must be `>= 3` not `> 4`. The `> 4` filter silently drops "cast",
"copy", "dies", "draw" — the most important MTG rules vocabulary.

**Arbiter token cap** — The hook sets `max_tokens: 900` for fast/local calls at
`useChatAgents.js` line 180. Arbiter calls with injected rules need 2500. The route
must set `max_tokens: 2500` explicitly in `callModelMessages` — it does not inherit
the higher chat cap automatically.

---

## Environment

```
OS: Windows 11
Node: v24.16.0
App: Next.js 15 App Router, app/ directory
Models (all local, Ollama):
  OLLAMA_FAST_MODEL = qwen2.5:7b   (fast chat, Karn/Tibalt/Jace)
  OLLAMA_MODEL      = qwen2.5:32b  (deep mode)
  OLLAMA_ARBITER_MODEL = qwen2.5:14b (Arbiter validation)
Dev server: cd app && npm.cmd run dev
Verify: http://localhost:3000
Model calls log: http://localhost:3000/api/model-calls
```

---

## Files on Disk

| File | Purpose |
|------|---------|
| `PHASE2_PLAN.md` | This file — full session handoff + Phase 2 plan |
| `CODEX_PHASE2_HANDOFF.md` | Detailed implementation brief for Codex |
| `CODEX_PHASE2_PROMPT.md` | Paste-in starter prompt for Codex |
| `SPRINT_HANDOFF.md` | Phase 1 closeout record (Codex session) |
| `CODEX_PHASE1_HANDOFF_2026-05-24.md` | Phase 1 Codex session record |
| `CLAUDE.md` | Prime directives — read this before touching anything |
| `app/README.md` | App overview, scripts, env vars |
| `app/src/app/api/arbiter/route.js` | Current Arbiter — what Phase 2 replaces |
| `app/src/hooks/useChatAgents.js` | How agents call Arbiter, token budgets |
| `mtg-judge/data/cr/cr_current.json` | 3,138 CR rules — source for rules index |
| `app/data/scryfall-bulk/oracle_cards.json` | 37,466 cards — source for card index |
| `C:\Users\colto\.gstack\projects\MTG-TOOL\`<br>`colto-master-design-phase2-20260524-172023.md` | Full design doc (APPROVED) |
