# MTG Tool - Simulated Engineering Plan Review

Produced by Codex for comparison with Claude Code planning.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Engineering Verdict

The plan is directionally right, but the biggest risk is trying to build "unified knowledge layer" as one giant subsystem. The correct engineering move is to lock a small set of stable contracts first, then swap storage and provider implementations underneath them.

The five-day build should not be "build the whole knowledge layer." It should be:

1. `KnowledgeService` contract
2. `ModelProvider` contract
3. `ConversationSnapshot` contract
4. Minimal local Scryfall-backed card lookup
5. Ollama default routing through the new provider layer

That lets the app stop API credit bleed without painting the architecture into a bad data shape.

## Recommended Data Flow

```text
ChatPanel
  |
  v
useChatAgents
  |
  v
ConversationService
  - creates immutable snapshot on first message
  - stores message history
  - enforces archived/read-only states
  |
  v
/api/chat
  |
  +--> KnowledgeService
  |      +--> CardStore
  |      +--> RuleStore
  |      +--> RulingStore
  |      +--> DeckStore
  |
  +--> ArbiterService, for rules-sensitive Jace calls
  |
  v
ModelProvider
  +--> Ollama default
  +--> Anthropic manual/explicit fallback
```

## Arbiter Flow

```text
Rule question
  |
  v
Query parser
  - card names
  - mechanics
  - rule intent
  - board state present?
  |
  v
Retrieve local facts
  - CR/codex
  - Oracle text
  - rulings
  - RulesGuru examples
  |
  v
Deterministic checks where supported
  - symbolic engine
  - citation verification
  |
  v
Local model explains
  |
  v
Verify citations
  |
  +--> pass: structured Arbiter trace
  +--> fail: UNRESOLVED or ask user to allow Anthropic
```

## Highest-Risk Findings

1. Manual Anthropic fallback must be explicit, not automatic.

   If Ollama crashes mid-conversation, show: "Local model failed. Retry local / Use Anthropic once / Cancel." Auto-fallback silently spends money and violates the local-first product promise.

2. Do not load 2GB Scryfall JSON into memory.

   Oracle cards and rulings should move into SQLite or PGLite indexes. Keep raw bulk JSON as an archive. Runtime should query indexed storage.

3. Conversation snapshots need versioning now.

   Snapshot should include `schemaVersion`, `deckVersion`, `cardDataVersion`, `rulesVersion`, and `createdAt`. This solves external deck edits, future migrations, stale rule baselines, and reproducibility.

4. Single `chats.local.json` will become fragile.

   Use one file per conversation:

   ```text
   data/chats/{conversationId}.json
   ```

   Keep `data/chats/index.json` for listing. This avoids write races and makes archived chats cheap.

5. Arbiter cannot be trusted until `UNRESOLVED` is first-class.

   Every Arbiter response needs:

   ```text
   status: "resolved" | "unresolved" | "needs_clarification" | "citation_failed"
   ```

## Architecture Decisions

### Scryfall JSON vs SQLite/PGLite

Use SQLite or PGLite for runtime indexes. Keep bulk JSON for sync and rebuild. This is not over-engineering; 2GB JSON is the wrong runtime primitive.

### Arbiter API Route vs Separate Service

Keep Arbiter in-process as a Next.js API route for now. Move to a separate service only when Garfield parallel simulations actually cause contention.

### Keyword vs Embeddings

Start with keyword search plus the structured router. Add embeddings later only for retrieval misses. For roughly 88 codex files, embeddings are premature.

### TypeScript Migration

Defer full TypeScript migration. Add JSDoc typedefs for the core contracts:

- `ConversationSnapshot`
- `KnowledgeResult`
- `ArbiterTrace`
- `ModelProviderResult`

Revisit TypeScript after the contracts stabilize.

### Single File vs Per-Chat Files

Move chats to per-conversation files early. Keep decks as one file for now unless writes become contentious.

## Missing Failure Modes

- Ollama returns valid JSON-shaped garbage.
- Local model ignores instruction to use only retrieved context.
- Scryfall card name collisions: split cards, Universes Beyond reskins, art cards, Alchemy variants.
- Rule baseline mismatch: codex says February 2026 while Scryfall/rulings may be newer.
- Multiple app copies running against different `data/` folders, as currently happened with Codex vs Claude paths.
- Windows path and encoding issues in docs and generated files.
- User opens app on port `3000` but edits happen in the port `3001` project copy.

## Contracts To Define First

```js
/**
 * Immutable snapshot captured on the first message of a conversation.
 */
const ConversationSnapshot = {
  id: "",
  agentId: "",
  status: "draft", // draft | active | archived | read_only
  createdAt: "",
  lockedDeck: null,
  lockedDeckHash: "",
  cardDataVersion: "",
  rulesVersion: "",
  boardSnapshot: "",
  messages: [],
};

/**
 * Local knowledge payload supplied to agents and Arbiter.
 */
const KnowledgeResult = {
  cards: [],
  rules: [],
  rulings: [],
  examples: [],
  unresolved: [],
  sources: [],
};

/**
 * Standard result from Ollama or Anthropic.
 */
const ModelProviderResult = {
  provider: "", // ollama | anthropic
  model: "",
  status: "", // ok | error | timeout | refused
  text: "",
  usage: null,
  costEstimate: 0,
  error: null,
};

/**
 * Formal rules result returned by Arbiter.
 */
const ArbiterTrace = {
  status: "", // resolved | unresolved | needs_clarification | citation_failed
  state: [],
  resolution: [],
  ruleTrace: [],
  citations: [],
  unresolvedReasons: [],
};
```

## Test Matrix Additions

- Snapshot hash remains unchanged after live deck edit.
- Archived chat rejects new messages.
- Two simultaneous chat writes do not corrupt files.
- Ollama timeout produces visible fallback choice.
- Anthropic fallback logs provider, timestamp, agent, and estimated cost.
- Card lookup resolves split cards and exact-name collisions.
- Bulk sync refuses to start if free disk space is below required size plus buffer.
- Corrupt card index triggers rebuild from raw bulk JSON.
- Arbiter citation verifier rejects fake rule numbers.
- Arbiter returns `UNRESOLVED` when citation verification fails.
- `/api/chat` never exposes `.env.local` values to client responses.
- App warns if running from old Codex path instead of canonical Claude path.

## Recommended Build Plan

### Day 1

Create contracts and `/api/chat` provider abstraction. Add shallow Ollama routing. Add manual Anthropic fallback.

### Day 2

Add per-conversation snapshot model and immutable deck lock.

### Day 3

Build Scryfall runtime index using PGLite or SQLite from Oracle cards plus rulings only.

### Day 4

Add Arbiter retrieval contract and citation verification status shape.

### Day 5

Run smoke tests. Clean up docs paths. Add canonical project warning. Add cost logging.

## Engineering Conclusion

Approve the plan with one change: do not build the unified knowledge layer as a monolith. Build stable contracts first, then fill them in piece by piece.

This keeps the project local-first, stops API credit bleed quickly, and avoids locking the app to a storage or retrieval design that will need to be undone later.
