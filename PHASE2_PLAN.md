# MTG Tool — Phase 2 Plan
*Generated 2026-05-24 — office hours + CEO review + eng review synthesized*

---

## What This Is

A complete Phase 2 implementation plan for the MTG Tool — a local-first Magic: The
Gathering Commander assistant. Phase 1 is done. This document covers what Phase 2
builds, why, and exactly how.

---

## Phase 1 Status (Complete)

Working on commit `c007a5c`. Clean tree.

| What | Status |
|------|--------|
| 5 agents (Jace, Karn, Tibalt, Arbiter, Garfield) | ✅ Working |
| Ollama local routing — 0 Anthropic calls in normal use | ✅ Working |
| qwen2.5:7b (fast chat) / 14b (Arbiter) / 32b (deep) | ✅ Running |
| Deck context lock — snapshot at conversation start | ✅ Working |
| SSE streaming (Ollama NDJSON + Anthropic SSE) | ✅ Working |
| TrustStrip (provider/deck/cards/cloud per message) | ✅ Working |
| validate:arbiter A1 | ✅ Passing |
| validate:arbiter A2 | ❌ Known 14B limit — Phase 2 fixes this |
| UI model-tier toggle | ❌ Not built — Phase 2 |

---

## The Phase 2 Problem

Arbiter is currently a **thin LLM proxy**. It sends rules questions to qwen2.5:14b
with a carefully crafted system prompt and mandatory citation rules. The A2 validation
failure proved this approach has a ceiling: the 14B model cannot reliably cite three
rule numbers simultaneously for complex scenarios. Better prompting won't fix it.

The real fix: **deterministic retrieval injection**. Instead of asking the LLM to
remember rule numbers, we look them up from the local Comprehensive Rules corpus and
inject them verbatim into the prompt. The LLM elaborates — it cannot hallucinate
citations that weren't given to it.

**The framing shift (from CEO review):** This is a *trust* problem, not just an
accuracy problem. At Commander night, the question is "can I show this to my opponent
and win the argument?" The Phase 2 Arbiter output functions as a physical judge ruling —
full rule text printed, not just numbers. You show it across the table and the game
moves on.

---

## The Data

### Comprehensive Rules
- Path: `mtg-judge/data/cr/cr_current.json`
- 3,138 rules, keyed by rule number
- Format: `{ "616.1a": { ruleNumber, ruleText, examples, ... }, ... }`
- All critical rules confirmed: 616.1a, 616.1, 614.6, 608.2, 700.4

### Scryfall Oracle
- Path: `app/data/scryfall-bulk/oracle_cards.json`
- 37,466 cards, standard Scryfall card object shape

### Scryfall Rulings
- Available via existing `/api/cards?rulingsFor=<name>` route
- Used for card-name seeded rule retrieval

---

## The Architecture

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
  │     3. keyword overlap
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

### Card-name seeding for retrieval
A pure keyword search fails on the most important questions. "How does Rest in Peace
interact with Reanimate?" has zero long keywords that match rule text. Without card-name
seeding: retrieval returns rules 100.x (game overview). With seeding: fetch Rest in
Peace rulings → rulings text mentions "614.6" → correct replacement effect rules found.

### Confidence-scored Jace trigger (not binary)
Binary keyword matching fails both ways: casual questions that hit "stack" incorrectly
call Arbiter, rules questions phrased without trigger words bypass it. Confidence
scoring: 2+ keywords OR explicit rule number OR `[[CardName]]` syntax → call Arbiter.
One keyword alone → Jace handles it directly with the fast model.

### Full rule text injected (not just numbers)
The LLM receives the actual rule text verbatim. The output shows the full text in
the Arbiter trace. This makes the trace function as a readable judge ruling — no one
has to go look up rule 616.1a to understand the answer.

### No HTTP loopback in Arbiter route
The current route calls `/api/engine` via `fetch()` from inside the route handler.
Loopback calls in Next.js API routes are fragile, add latency, and make isolation
impossible. All retrieval functions are imported as server-side modules.

### 2500 token cap for Arbiter (not 900)
With 500-800 tokens of injected rules in the prompt, the 14B model needs room for
all four output sections (STATE / RESOLUTION / RULE TRACE / CITATIONS). The 900-token
fast/local cap that applies to chat calls would truncate Arbiter output. Arbiter
explicitly sets `max_tokens: 2500`.

---

## Build Order

### Step 0 — Verify corpus (15 min, do first)
Confirm `mtg-judge/data/cr/cr_current.json` has ~3,138 rules with expected shape.
Confirm `app/data/scryfall-bulk/oracle_cards.json` exists.

### Step 1 — UI Tier Toggle (independent, ~1-2 hrs)
Per-conversation selector: **Fast** (7B) / **Deep** (32B) / **Anthropic**.
Arbiter always uses 14B — not exposed as a user-facing tier.
Persists in chat history. Shows in TrustStrip.
*This step has no dependencies — ship it at any point.*

### Step 2 — Rules Index Build Script (~2-3 hrs)
New: `app/scripts/build-rules-index.cjs` → writes `app/data/rules-index.json`
New npm script: `build:rules-index`

Reads `cr_current.json`, extracts keywords per rule (length >= 3 + MTG allowlist:
"tap", "pay", "add", "put", "die", "cast", "copy", "dies", "draw", "hand", "zone").
Output shape per entry: `{ ruleNumber, text, keywords, examples }`

### Step 3 — Scryfall In-Memory Singleton (~1-2 hrs)
New: `app/src/lib/server/cardIndex.js`

Lazy-init singleton: `let _cardIndex = null` — builds on first request, survives
hot reload correctly. Exposes `lookupCard(name)` → oracle block in <1ms.
Replaces linear scan in `cardContext.js` and `cards/route.js`.

### Step 4 — Rules Retrieval Function (~1-2 hrs)
New: `app/src/lib/server/rulesRetrieval.js`

`retrieveRules(query, cardNames[])` → top-5 rules + confidence.
Returns `{ rules: RuleEntry[], confidence: 'high'|'low' }`.
Zero-match case: return empty + `confidence: 'low'` — do not return random rules.

### Step 5 — Citation Injector (~1-2 hrs)
New: `app/src/lib/server/citationInjector.js`

`buildInjectedContext(question, rules, cards)` → assembled string.
Rules injected with full text. LLM instructed: cite only from RETRIEVED RULES list.

### Step 6 — Arbiter Route Rebuild (~2-3 hrs)
File: `app/src/app/api/arbiter/route.js`

Full rebuild. Remove HTTP loopback. Import retrieval modules directly.
Orchestrate: extract card names → retrieve rules → lookup cards → inject → call LLM
(max_tokens: 2500) → post-process citations → return with retrievalMetadata.

Zero-retrieval case returns `{ status: 'retrieval_miss' }` — not a hallucinated answer.

**`retrievalMetadata` shape (locked — validator depends on this):**
```js
{
  rulesRetrieved: { ruleNumber: string, text: string }[],
  cardsRetrieved: string[],
  hallucinations: string[],
  confidence: 'high' | 'low'
}
```

### Step 7 — Validator Update (~1 hr)
File: `app/scripts/validate-arbiter-knowledge.cjs`

Update to check `retrievalMetadata`:
- A1: `rulesRetrieved` contains a rule starting with `616`
- A2: `rulesRetrieved` contains `616.1a`, `614.6`, AND `608.2`
  (now injected deterministically — LLM compliance no longer required)

Run: `npm run validate:arbiter -- --limit 2`
Expected: **2/2 passing**

---

## What Gets Cut

| Item | Decision |
|------|----------|
| Forge integration | Deferred — card scripts are gameplay simulation, not rules text |
| RulesGuru expansion past 500 | Hold — 500 covers Arbiter grounding, diminishing returns |
| Semantic/embedding retrieval | Over-engineering for a personal tool — keyword + card seeding is sufficient |
| Learn-to-play mode | Phase 6, separate roadmap |

---

## Success Criteria

- [ ] `validate:arbiter --limit 2` passes **2/2** (A1 + A2)
- [ ] UI tier toggle persists per-conversation, shows in TrustStrip
- [ ] Jace rules question trace shows `retrievalMetadata` with correct rules retrieved
- [ ] "How does Rest in Peace interact with Reanimate?" → 614.6 appears in retrieved rules
- [ ] Zero-retrieval case shows yellow banner, not a confident hallucinated answer
- [ ] No HTTP loopback in Arbiter route — all module imports
- [ ] Arbiter `max_tokens` = 2500 (confirmed via `/api/model-calls`)
- [ ] `anthropic.total = 0` at `/api/model-calls`

---

## Known Gotchas

**`.next` cache** — After any build step, if the dev server returns 500s:
```powershell
Remove-Item .next -Recurse -Force
npm.cmd run dev
```

**Ollama format** — Returns NDJSON (newline-delimited JSON), not SSE. Follow the
existing pattern in `chat-stream/route.js`.

**Never `fetch('/api/...')` inside an API route** — Import the module directly.

**`retrievalMetadata` shape is locked** — Don't change it. The validator reads it.

**Card name normalization** — Use `name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()`
consistently. Æther Vial → Aether Vial is already handled in `scryfall.js`.

**Keyword filter** — Use length `>= 3` not `> 4`. The `> 4` filter drops "cast",
"copy", "dies", "draw" — the most important MTG keywords.

---

## Environment

```
OS: Windows 11
Node: v24.16.0
App: Next.js 15 App Router
Models: qwen2.5:7b / qwen2.5:14b / qwen2.5:32b (all local via Ollama)
OLLAMA_FAST_MODEL=qwen2.5:7b
OLLAMA_MODEL=qwen2.5:32b
OLLAMA_ARBITER_MODEL=qwen2.5:14b (or default falls through to 14b)
Dev server: npm run dev (from app/)
```

---

## Handoff Files on Disk

| File | Purpose |
|------|---------|
| `CODEX_PHASE2_HANDOFF.md` | Full implementation brief for Codex |
| `CODEX_PHASE2_PROMPT.md` | Paste-in starter prompt for Codex |
| `PHASE2_PLAN.md` | This file — shareable summary |
| `SPRINT_HANDOFF.md` | Phase 1 closeout record |
| `C:\Users\colto\.gstack\projects\MTG-TOOL\colto-master-design-phase2-20260524-172023.md` | Full design doc (APPROVED) |
