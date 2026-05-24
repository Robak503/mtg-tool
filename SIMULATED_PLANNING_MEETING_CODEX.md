# MTG Tool - Simulated Planning Meeting

Produced by Codex as a synthesis of the simulated Office Hours, CEO Review, and Engineering Review.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Participants

- **Office Hours**: builder/product strategy lens. Challenges premises, scope, and momentum.
- **CEO Review**: prioritization lens. Protects the user's actual goal and avoids platform sprawl.
- **Engineering Review**: architecture lens. Protects contracts, failure modes, storage, and tests.
- **Moderator**: Codex synthesis. Captures decisions and unresolved questions.

## Meeting Goal

Reach consensus on the next build plan for MTG Tool after the audit, with scope held to foundation work:

- stop API credit bleed
- make agents reliably use local card/rule data
- keep the app local-first
- avoid overbuilding the unified knowledge layer before contracts are stable

---

## Transcript

**Moderator:**

We have three reviews on the table. Office Hours says lock five days, not six phases. CEO Review says shrink the first unified knowledge layer. Engineering Review says build contracts first, then implementations. Let's resolve the tension.

**Office Hours:**

The first mistake would be calling this sprint "build the unified knowledge layer." That's too abstract. The user's pain is immediate: Anthropic costs money, Karn feels blind, and deck context can drift. The next sprint should create real usage signal.

**CEO Review:**

Agreed. The product does not need a data platform yet. It needs to stop feeling fake. If local data exists and Karn says he can't access it, trust collapses. The first product win is simple: agents can see the facts they claim to see.

**Engineering Review:**

Yes, but don't patch that directly into every agent. The smallest safe move is a set of contracts:

```text
ModelProvider
KnowledgeService
ConversationSnapshot
ArbiterTrace
```

These can start thin. But if we skip the contracts, the quick Ollama work becomes future cleanup debt.

**Office Hours:**

I accept that. Quick Ollama wiring still comes first, but only if it's shallow and replaceable. API costs are not theoretical; the user feels them now. Waiting weeks for the perfect knowledge layer while every chat costs money is the wrong trade.

**CEO Review:**

Then we should explicitly reject automatic Anthropic fallback. It breaks the promise. The user must know when paid calls happen.

**Engineering Review:**

Make fallback a state, not a hidden retry. The model provider should return:

```text
ok | error | timeout | refused | citation_failed
```

If Ollama fails, the UI offers:

```text
Retry local
Use Anthropic once
Cancel
```

For Arbiter, citation failure can recommend Anthropic, but cannot call it silently.

**Office Hours:**

Good. That aligns with the user's answer: manual fallback with consent.

**Moderator:**

Next dispute: Scryfall. All five datasets or Oracle + rulings?

**CEO Review:**

Oracle + rulings first. The goal is agent reasoning. The all-cards file and artwork file are not required for that.

**Engineering Review:**

Also, don't load giant JSON into memory. Keep bulk JSON as source archives, but runtime should use an index. SQLite or PGLite is the correct shape if querying grows. For the first pass, an indexed local Oracle/rulings store is enough.

**Office Hours:**

This is the "more data is not better answers" trap. Start with strict, small, verifiable data. Expand only when missing data blocks actual usage.

**Moderator:**

RulesGuru and Forge?

**CEO Review:**

Defer both from the sprint. RulesGuru already has 500 cases. Forge is an investigation, not a dependency.

**Engineering Review:**

Forge can become a deep rabbit hole. Java engine scripts in proprietary-ish formats are not needed before Arbiter can reliably retrieve CR rules and Oracle text. Timebox it later.

**Office Hours:**

Exactly. Forge is not the first win. Neither is a 5000-question RulesGuru import. The first win is local answers that don't bluff.

**Moderator:**

Conversation lifecycle?

**Engineering Review:**

This should be formalized now. A conversation needs an immutable snapshot captured on first message:

```text
agentId
lockedDeck
lockedDeckHash
cardDataVersion
rulesVersion
boardSnapshot
createdAt
schemaVersion
```

Switching the sidebar deck must not mutate an active conversation.

**CEO Review:**

That directly supports the user experience. It prevents Karn from changing subjects halfway through a deck discussion.

**Office Hours:**

And it creates a visible five-day outcome. The user can feel that improvement.

**Moderator:**

Single chat file or per-chat files?

**Engineering Review:**

Per-chat files sooner rather than later. One large `chats.local.json` creates write-race risk and makes archiving clumsy. Use:

```text
data/chats/index.json
data/chats/{conversationId}.json
```

But I would not block Day 1 on this if Ollama routing is first.

**CEO Review:**

Agree. It is important, but the sprint's first promise is cost and grounding. If needed, per-chat files can be Day 2 or Day 4 depending on implementation size.

**Office Hours:**

Keep the sprint shippable. Don't turn conversation persistence into a side quest.

**Moderator:**

Arbiter behavior?

**Engineering Review:**

Arbiter needs first-class uncertainty:

```text
resolved
unresolved
needs_clarification
citation_failed
```

Every cited rule number must resolve to local CR/codex data. If not, Arbiter does not answer confidently.

**CEO Review:**

This is central to trust. The product is allowed to say "I don't know." It is not allowed to hallucinate a judge ruling.

**Office Hours:**

Yes. A local-first tool with honest failure states is more useful than a confident chatbot with fake citations.

**Moderator:**

What about Garfield and learn-to-play?

**Office Hours:**

Leave it deferred. It is the most interesting long-term product angle, but the user explicitly chose personal polish. Don't pull it forward.

**CEO Review:**

Right. Garfield should influence architecture only enough that we don't block it later. It should not own the current sprint.

**Engineering Review:**

The contracts already protect it. A future Garfield can call `KnowledgeService`, `ArbiterTrace`, and the symbolic engine. No separate work needed now.

---

## Consensus

The three reviews converge on this:

```text
Do not build the full unified knowledge layer as a monolith.
Build a thin, stable foundation that makes the current app cheap,
grounded, and reliable.
```

The first sprint should prove:

1. The app can answer through a local model by default.
2. Agents can access local card/rule facts through a shared boundary.
3. Deck context is locked and agent-specific.
4. Paid API calls are explicit and logged.
5. Arbiter can fail honestly instead of bluffing.

## Final Five-Day Plan

### Day 1 - Model Provider Boundary

Build a minimal provider layer:

```text
ModelProvider
  - ollama
  - anthropic
```

Route current chat through Ollama by default. Keep this shallow and replaceable.

### Day 2 - Manual Fallback And Cost Logging

Add visible fallback flow:

```text
Retry local
Use Anthropic once
Cancel
```

Log every Anthropic call with provider, agent, timestamp, and estimated cost.

### Day 3 - Local Knowledge Contract

Define a first `KnowledgeService` contract and wire:

- local Oracle card lookup
- local rulings lookup
- local rules/codex retrieval

Do not import all Scryfall datasets yet. Do not expand RulesGuru yet. Do not depend on Forge yet.

### Day 4 - Conversation Snapshot And Agent Lock

Formalize immutable conversation snapshots:

- agent-specific lock labels
- deck hash
- card/rule data versions
- board snapshot
- archived/read-only status

Switching decks in the sidebar must not mutate an active conversation.

### Day 5 - Arbiter Status And Real Usage Smoke Test

Add structured Arbiter statuses:

```text
resolved
unresolved
needs_clarification
citation_failed
```

Run one real brewing/rules session and capture:

- local model speed
- local answer quality
- missing card/rule context
- fallback events
- deck-lock confusion
- crashes or persistence issues

## Deferred Explicitly

- all 5 Scryfall datasets as runtime dependencies
- full RulesGuru import beyond current 500
- Forge import beyond later investigation
- embeddings/vector search
- full TypeScript migration
- Garfield learn-to-play expansion
- separate Arbiter service

## Source Precedence

When sources conflict, use:

1. Verbatim Comprehensive Rules / `_v` codex text
2. Oracle card text
3. Official/Scryfall rulings
4. Operational `_t` codex notes
5. RulesGuru examples
6. Forge only after proven reliable

## Final Decision

Approved plan:

```text
Cost-first foundation, with knowledge contracts and conversation locking.
```

Rejected plan:

```text
Full unified knowledge platform migration before local model routing.
```

Reason:

The user needs a usable local-first assistant now. The safest path is to stop cost bleed, make local facts available through stable contracts, and let real usage decide the next expansion.

