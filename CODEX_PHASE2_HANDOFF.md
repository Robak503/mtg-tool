# MTG Tool — Phase 2 Handoff for Codex

## Read This First

This is the Phase 2 implementation brief. Phase 1 is complete, committed, and the
post-token-fix browser smoke test has passed. You are picking up after commit
`9a76183` plus the Phase 1 smoke closeout doc update.

Project root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`
App root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app`

Before writing a single line of code, read these files in order:

1. `CLAUDE.md` — prime directives, architecture, forbidden patterns
2. `app/README.md` — app overview, scripts, env setup
3. `app/src/app/api/arbiter/route.js` — what you are replacing
4. `app/src/lib/server/modelProvider.js` — how LLM calls work
5. `app/src/hooks/useChatAgents.js` — how the frontend calls Arbiter
6. `C:\Users\colto\.gstack\projects\MTG-TOOL\colto-master-design-phase2-20260524-172023.md`
   — the full Phase 2 design doc (office hours + CEO + eng review, APPROVED)

---

## Current State (Phase 1 Complete)

### What works
- 5 agents: Jace (rules chat), Karn (deck builder), Tibalt (deck roaster),
  Arbiter (rules engine), Garfield (goldfish simulator)
- Ollama routing: `qwen2.5:7b` (fast/chat), `qwen2.5:14b` (Arbiter), `qwen2.5:32b` (deep)
- `OLLAMA_FAST_MODEL=qwen2.5:7b`, `OLLAMA_MODEL=qwen2.5:32b` in `.env.local`
- Deck context lock: conversation snapshots the active deck at first message
- SSE streaming end-to-end (Ollama NDJSON + Anthropic SSE)
- TrustStrip on every assistant message (provider/deck/cards/cloud)
- `validate:arbiter --limit 2` passes 1/2 (A1 ✓, A2 ✗ — A2 is what Phase 2 fixes)
- All non-LLM checks pass: `check`, `check:decks`, `check:oracle`, `check:engine`
- 0 Anthropic calls in normal use
- T12 browser smoke passed after the 2500-token fix:
  - Karn cut mode returned 10 complete bullets and no Additions section
  - Jace stack primer attached Arbiter trace and stayed local
  - Tibalt roast reached Final Verdict and persisted after reload
  - `/api/model-calls` stayed at `anthropic.total = 0`

### What Phase 2 fixes
Arbiter is currently a thin LLM proxy. It uses prompting to ask the model to cite
rules correctly. The A2 failure proved this approach has a ceiling — the 14B model
cannot reliably cite three rule numbers simultaneously for complex scenarios.

Phase 2 makes Arbiter a real retrieval+reasoning service: query → retrieve relevant
rules from the local CR corpus → inject them verbatim into the prompt → LLM elaborates
using only the injected rules, cannot hallucinate citations.

---

## The Data You Are Working With

### Comprehensive Rules
- File: `mtg-judge/data/cr/cr_current.json`
- Format: JSON object keyed by rule number
  ```json
  {
    "616.1a": {
      "ruleNumber": "616.1a",
      "ruleText": "If any of the replacement and/or prevention effects...",
      "examples": null,
      "fragment": "1a",
      "navigation": { "previousRule": "616.1", "nextRule": "616.1b" }
    }
  }
  ```
- Size: 3,138 rules
- Key rules confirmed present: 616.1, 616.1a, 614.6, 608.2, 700.4

### Scryfall Oracle
- File: `app/data/scryfall-bulk/oracle_cards.json`
- 37,466 cards, standard Scryfall card object shape
- The older `app/data/scryfall.oracle.local.json` also exists — use the bulk file

### Scryfall Rulings
- Available via `/api/cards?rulingsFor=<cardname>` (already implemented)
- Used for card-name seeded rule retrieval (critical for card-interaction questions)

---

## What to Build — Ordered Steps

### Step 0: Verify corpus (do this first, ~15 min)
```js
// Verify cr_current.json is valid and has expected shape
const cr = JSON.parse(fs.readFileSync('mtg-judge/data/cr/cr_current.json', 'utf8'));
console.log(Object.keys(cr).length); // expect ~3138
console.log(cr['616.1a'].ruleText);  // expect replacement effect ordering text
```
Also confirm `app/data/scryfall-bulk/oracle_cards.json` exists.
If it does not, fall back to `app/data/scryfall.oracle.local.json` and note it.

### Step 1: UI Tier Toggle (~1-2 hrs)
**This step is INDEPENDENT — ship it at any point, doesn't block other steps.**

Files: `app/src/hooks/useChatAgents.js`, `app/src/components/mtg/ChatPanel.jsx`

Add a per-conversation tier selector:
- Options: **Fast** (7B, `OLLAMA_FAST_MODEL`) / **Deep** (32B, `OLLAMA_MODEL`) / **Anthropic**
- Arbiter always uses 14B regardless of conversation tier (it is a separate routing
  decision, not exposed as a user-facing tier option)
- Default: Fast for Karn/Tibalt/Jace general questions
- Persist the tier choice in the chat's saved history in `data/chats.local.json`
- Display active tier in the TrustStrip alongside provider/deck info

### Step 2: Rules Index Build Script (~2-3 hrs)
**New file:** `app/scripts/build-rules-index.cjs`
**Output:** `app/data/rules-index.json`
**New npm script:** `"build:rules-index": "node scripts/build-rules-index.cjs"`

The script reads `mtg-judge/data/cr/cr_current.json` and builds:
```js
// rules-index.json shape
[
  {
    ruleNumber: "616.1a",
    text: "If any of the replacement and/or prevention effects...",
    keywords: ["replacement", "prevention", "effects", "attempting", ...],
    examples: null  // from cr_current.json examples field
  },
  ...
]
```

Keyword extraction rules:
- Lowercase words from `ruleText`
- Include words with length **>= 3** (not > 4 — the > 4 filter would drop critical
  MTG keywords like "cast", "copy", "dies", "draw", "tap", "pay", "add", "put")
- PLUS explicit MTG allowlist regardless of length:
  `["tap", "pay", "add", "put", "die", "cast", "copy", "dies", "draw", "hand", "zone"]`
- Exclude common English stop words: "the", "and", "for", "are", "was", "that", "this",
  "with", "from", "they", "have", "been", "will", "would", "its", "not", "but"

After building, write the array to `app/data/rules-index.json`.
Add `app/data/rules-index.json` to `.gitignore` (regenerable artifact).

### Step 3: Scryfall In-Memory Lookup Singleton (~1-2 hrs)
**New file:** `app/src/lib/server/cardIndex.js`

```js
// Lazy-init singleton pattern — works correctly with Next.js hot reload
let _cardIndex = null;

function getCardIndex() {
  if (!_cardIndex) _cardIndex = buildCardIndex();
  return _cardIndex;
}

function buildCardIndex() {
  const cards = JSON.parse(fs.readFileSync(ORACLE_PATH, 'utf8'));
  const map = new Map();
  for (const card of cards) {
    const key = normalizeName(card.name);
    map.set(key, {
      name: card.name,
      oracleText: card.oracle_text || '',
      typeLine: card.type_line || '',
      manaCost: card.mana_cost || '',
      cmc: card.cmc || 0,
    });
  }
  return map;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
}

export function lookupCard(name) {
  return getCardIndex().get(normalizeName(name)) || null;
}
```

This replaces the linear scan in `cardContext.js` and `cards/route.js`.
Note: the 200-500ms cold-start stall on first request after hot reload is acceptable —
it does not crash and only happens during development after code edits.

### Step 4: Rules Retrieval Function (~1-2 hrs)
**New file:** `app/src/lib/server/rulesRetrieval.js`

```js
// Input: query string + optional cardNames string[]
// Output: top-5 matching rule entries sorted by relevance
export function retrieveRules(query, cardNames = []) { ... }
```

Retrieval priority order:
1. **Exact rule number in query** — regex `\b(\d{3}\.\d+[a-z]?)\b` on query text.
   Any matched rule numbers → look them up directly in rules-index, always include.
2. **Card-name ruling seed** — for each card name in `cardNames`, fetch its Scryfall
   rulings (call `lookupCard()` then fetch rulings via existing `/api/cards?rulingsFor=`
   logic or import the rulings data directly). Extract rule numbers mentioned in ruling
   text. Add those rules to the candidate set.
3. **Keyword overlap** — tokenize query using the same keyword extraction rules as
   Step 2. Score each rule in rules-index by overlap count. Return top-5 by score.
   Tie-break: lower rule number first.
4. **Zero match case** — if no rules scored > 0, return empty array and set
   `confidence: 'low'`. Do NOT return random rules.

Card name extraction from query:
- `[[CardName]]` syntax: regex `\[\[([^\]]+)\]\]`
- Plain card names: use a lightweight approach — check each 2-4 word phrase against
  the card index. If `lookupCard(phrase)` returns a hit, it's a card name.

### Step 5: Citation Injector (~1-2 hrs)
**New file:** `app/src/lib/server/citationInjector.js`

```js
// Input: question string, retrieved rules, retrieved cards
// Output: assembled context string for injection into Arbiter system prompt
export function buildInjectedContext(question, rules, cards) { ... }
```

Output format:
```
## RETRIEVED RULES (cite ONLY these — do not cite rules not in this list)
[616.1a] — "If two or more replacement and/or prevention effects are attempting to
            modify the way an event affects an object or player, the affected object's
            controller chooses one to apply first."
[614.6] — "If an event is replaced, it never happens. A modified event occurs instead..."

## RETRIEVED CARD TEXT
[[Rest in Peace]] — "If a card or token would be put into a graveyard from anywhere,
                     exile it instead."

## QUESTION
{question}
```

Rules injected with **full rule text**, not just the number.
The LLM instruction (added to system prompt): "Only cite rule numbers from RETRIEVED
RULES above. Format each RULE TRACE entry as: [NNN.Xa] — one-line explanation."

### Step 6: Arbiter Route Rebuild (~2-3 hrs)
**File:** `app/src/app/api/arbiter/route.js`

**Critical: remove the HTTP loopback.** The current route calls `/api/engine` via
`fetch()` from inside the route handler. This is fragile in Next.js and adds latency.
Replace with direct server-side imports of `rulesRetrieval`, `cardIndex`, and
`citationInjector`. No HTTP calls to other routes.

**Critical: fix the token cap.** `useChatAgents.js` line 180 sets `max_tokens: 900`
for fast/local calls. With 500-800 tokens of injected rules, the 14B model needs
room for all four output sections. Arbiter calls must use `max_tokens: 2500`.
Set this explicitly in the Arbiter route's call to `callModelMessages` — do not
let it inherit the 900 cap from the hook.

New orchestration flow:
```
1. Parse: question, cardNames (from [[brackets]] + plain text detection), boardState
2. retrieveRules(question, cardNames) → top-5 rules + confidence
3. lookupCard() for each cardName → oracle blocks
4. If confidence === 'low' AND rules.length === 0:
     return { status: 'retrieval_miss', message: 'No relevant rules found...' }
5. buildInjectedContext(question, rules, cards) → grounded prompt
6. callModelMessages with:
     - model: OLLAMA_ARBITER_MODEL (qwen2.5:14b default)
     - max_tokens: 2500
     - system: ARBITER_PROMPT_FAST + grounded prompt injected
7. Post-process response:
     a. Extract all [NNN.Xa] citations from RULE TRACE using regex /\[(\d{3}\.\d+[a-z]?)\]/g
     b. Check each against retrieved rule numbers
     c. Strip hallucinated citations (not in retrieved set), add to hallucinations[]
8. Build retrievalMetadata:
   {
     rulesRetrieved: { ruleNumber, text }[],
     cardsRetrieved: string[],
     hallucinations: string[],
     confidence: 'high' | 'low'
   }
9. Return: { state, resolution, ruleTrace, citations, retrievalMetadata, status, provider, trace }
```

### Step 7: Validator Update (~1 hr)
**File:** `app/scripts/validate-arbiter-knowledge.cjs`

Update the validator to check `retrievalMetadata`:
- A1 test: verify `rulesRetrieved` contains an entry with ruleNumber starting with `616`
  (the Axiom 4 / dies trigger scenario)
- A2 test: verify `rulesRetrieved` contains entries for `616.1a`, `614.6`, AND `608.2`
  (the three-way replacement scenario — now injected deterministically, not LLM-dependent)
- Both tests should now pass 2/2
- Check `hallucinations` array is empty or very short for well-formed queries

---

## Known Gotchas — Do Not Repeat These Mistakes

### The `.next` cache problem
After `next build` or any build step, the dev server may hit 500s from stale cache.
Standard recovery (always works):
```powershell
# Stop any running node processes for this project first
Remove-Item .next -Recurse -Force
npm.cmd run dev
```

### Ollama streaming format
Ollama returns NDJSON (newline-delimited JSON), not SSE. The existing streaming code
in `chat-stream/route.js` handles this correctly — follow the same pattern for any
new Ollama calls.

### Never use `fetch('/api/...')` inside an API route
HTTP loopback calls in Next.js route handlers are fragile and add latency. Import
server-side modules directly. The current Arbiter route has this bug — Step 6 fixes it.

### The 900-token cap
`useChatAgents.js` line 180: `max_tokens: fast || isLocal ? 900 : undefined`
This applies to chat calls, not to Arbiter calls made from the route. But verify
that any Arbiter invocation from the hook does not inherit this cap. The Arbiter
route should set `max_tokens: 2500` explicitly in its `callModelMessages` call.

### `retrievalMetadata` shape is locked
Do not change the shape defined in the design doc:
```js
{
  rulesRetrieved: { ruleNumber: string, text: string }[],
  cardsRetrieved: string[],
  hallucinations: string[],
  confidence: 'high' | 'low'
}
```
The validator in Step 7 is written against this shape. If you change it, the
validator breaks silently.

### Card name normalization
The oracle index uses `name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()`.
When extracting card names from query text, normalize the same way before lookup.
Æther Vial → Aether Vial is handled by the existing `normalizeName` in scryfall.js.

---

## Verification Checkpoints

After Step 2 (rules index):
```powershell
node -e "const r = require('./app/data/rules-index.json'); console.log(r.length, r.find(x => x.ruleNumber === '616.1a')?.text?.slice(0,50))"
# expect: ~3138  "If any of the replacement and/or prevention"
```

After Step 3 (card index):
```
GET http://localhost:3000/api/cards?name=Sol+Ring
# expect: { card: { source: 'local', ... } } with < 5ms response
```

After Step 6 (Arbiter rebuild):
```
POST http://localhost:3000/api/arbiter
{ "query": "If Rest in Peace is on the battlefield, does a creature that dies go to
            the graveyard or exile? Does its dies trigger trigger?" }
# expect: retrievalMetadata.rulesRetrieved contains 614.6 and 700.4
# expect: retrievalMetadata.hallucinations is empty
# expect: VERDICT begins with "No." (creature goes to exile, dies trigger does not trigger)
```

After Step 7 (validator):
```powershell
cd app && npm.cmd run validate:arbiter -- --limit 2
# expect: 2/2 passing
```

Full smoke (browser):
1. Load Sliver Hivelord
2. Jace → "If Rest in Peace is in play, does [[Viscera Seer]] see [[Yawgmoth, Thran Physician]] die?"
   - Expect: Arbiter trace fires, retrievalMetadata visible, 614.6 + 700.4 in sources
   - Expect: Verdict says no dies trigger
3. Check `http://localhost:3000/api/model-calls` — anthropic.total = 0

---

## Commit Conventions

Branch: `feat/phase2-arbiter-retrieval`
Format: Conventional Commits (`feat:`, `fix:`, `chore:`, `refactor:`)
Commit after each completed step — do not batch multiple steps into one commit.

---

## What NOT to Build in Phase 2

- Forge integration (deferred — card scripts are gameplay simulation, not rules text)
- RulesGuru expansion beyond 500 (diminishing returns, hold at 500)
- Semantic/embedding-based retrieval (over-engineering for a personal tool — keyword
  + card-name seeding is sufficient for now)
- Learn-to-play mode (Phase 6, separate roadmap)
- Any external API calls that don't have a local fallback path

---

## Phase 2 Success Definition

`validate:arbiter --limit 2` passes 2/2.
Jace's Arbiter trace on a card-interaction rules question shows:
  - `retrievalMetadata.rulesRetrieved` with the correct rules
  - Full rule text visible in the collapsed Sources section
  - `hallucinations: []`
  - `confidence: 'high'`
Anthropic total = 0.
