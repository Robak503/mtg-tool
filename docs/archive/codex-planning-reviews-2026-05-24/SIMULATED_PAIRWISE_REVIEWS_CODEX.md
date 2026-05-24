# MTG Tool - Simulated Pairwise Review Sessions

Produced by Codex as a deeper synthesis of the simulated Office Hours, CEO Review, and Engineering Review.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Purpose

The prior simulated planning meeting produced a shared direction:

```text
Cost-first foundation, with knowledge contracts and conversation locking.
```

This document splits the three review lenses into pairs so each pair can explore the overlap between their viewpoints more deeply and generate new ideas together.

## Participants

- **Office Hours**: momentum, scope, product truth, real usage.
- **CEO Review**: prioritization, user value, what to cut.
- **Engineering Review**: contracts, architecture, failure modes, tests.

---

# Pair 1 - Office Hours + CEO Review

## Shared Concern

Both Office Hours and CEO Review care about avoiding platform sprawl. They agree that MTG Tool should not turn the first sprint into a grand rewrite disguised as "foundation."

Their shared question:

```text
What is the smallest useful version of the app that Colton will actually use?
```

## Conversation

**Office Hours:**

The danger is ambition fog. Every part of the roadmap sounds justified, so everything tries to become Phase 1. That is how the project loses momentum.

**CEO Review:**

Agreed. The product does not need all data sources integrated to become useful. It needs one credible experience: ask Karn or Jace something and get an answer grounded in local facts.

**Office Hours:**

And the answer has to change Colton's behavior. If the app saves him money but still feels blind, he stops using it. If it sees cards but every answer costs Anthropic, he hesitates to use it. The first sprint has to remove both friction points enough to create habit.

**CEO Review:**

So the user-value test is not "architecture complete." It is "Colton naturally opens this during brewing."

**Office Hours:**

Exactly. After the first sprint, he should be able to say: "I can ask Karn about this deck without worrying about cost, and it knows what deck and cards I'm talking about."

**CEO Review:**

That suggests a product gate: the sprint is not done until there is one real usage script.

## New Ideas From This Pair

### 1. The Brewing Session Acceptance Test

At the end of the sprint, run a scripted but real brewing session:

```text
1. Open the app from the canonical Claude project.
2. Select Colton's Sliver Hivelord deck.
3. Start a new Karn chat.
4. Ask for 5 cuts and 5 adds.
5. Confirm Karn cites local card facts for at least 10 mentioned cards.
6. Switch sidebar deck to Joe's Kinnan deck.
7. Ask Karn a follow-up about Sliver Hivelord.
8. Confirm Karn stays locked to Sliver Hivelord.
9. Ask Jace one rules question involving a card from the locked deck.
10. Confirm Jace uses Arbiter or local rules context.
11. Trigger or simulate an Ollama failure.
12. Confirm Anthropic fallback requires explicit approval.
```

This becomes a product-level smoke test, not only an engineering test.

### 2. The "Actually Useful" Definition

Define Phase 1 success in human terms:

```text
Colton can complete one deck-brewing conversation without:
- paying for hidden API calls
- losing chat context
- seeing an agent claim it cannot access local data
- having the active deck silently change under the chat
```

### 3. Weekly Backlog Reset

At the end of each sprint, classify every roadmap item into:

- `Used this week`
- `Blocked usage this week`
- `Interesting but unused`

Only `Used` and `Blocked` items can enter the next sprint by default.

### 4. The Canonical Copy Warning

Because two project copies currently exist, add a visible local-only warning later:

```text
Running from: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

If the app detects the old Codex path, it warns:

```text
This is the old Codex working copy. Use the Claude project copy for current development.
```

This prevents the user from testing the wrong app and thinking fixes failed.

## Pair 1 Recommendation

Phase 1 should be judged by real usage, not architectural completeness. Every technical task should map to one of these product outcomes:

- cheaper to use
- more grounded in local facts
- harder to lose context
- easier to trust when it says "I don't know"

---

# Pair 2 - Office Hours + Engineering Review

## Shared Concern

Office Hours wants speed and momentum. Engineering Review wants the quick work not to become permanent debt.

Their shared question:

```text
How do we move fast without hard-coding the wrong shape?
```

## Conversation

**Office Hours:**

I am defending speed. The app is costing money now. But I accept that a sloppy provider swap can become a future mess.

**Engineering Review:**

Then the rule is: every quick fix gets a seam, but not a framework. Small boundary, small implementation.

**Office Hours:**

No grand abstraction. Just enough structure so the work can be replaced.

**Engineering Review:**

Right. For example, do not rename `/api/anthropic` into a fake "universal AI brain" and cram logic there. Create `/api/chat` or a provider module that has one job: normalize model calls.

**Office Hours:**

What is the least annoying version of that?

**Engineering Review:**

One local module:

```text
src/lib/modelProviders.js
```

with:

```text
callModelProvider({ provider, model, system, messages, stream })
```

Then `/api/chat` can choose provider without agent code caring.

**Office Hours:**

That is acceptable. Fast enough, but not disposable garbage.

**Engineering Review:**

Same for knowledge. Do not build a full retrieval platform first. Create a `KnowledgeService.query()` shape and return only cards/rules/rulings for now.

**Office Hours:**

And test the contract, not the fantasy future implementation.

## New Ideas From This Pair

### 1. Contract Smoke Tests Before Full Features

Before implementing deep behavior, add tiny smoke tests for the boundary shapes:

```text
ModelProvider returns:
- provider
- model
- status
- text
- usage
- costEstimate

KnowledgeService returns:
- cards
- rules
- rulings
- unresolved
- sources

ConversationSnapshot returns:
- agentId
- lockedDeckHash
- cardDataVersion
- rulesVersion
- status
```

The tests do not need to prove intelligence. They prove the architecture can carry facts.

### 2. Context Budget Envelope

Every chat request gets a budget before text is assembled:

```text
System/persona: 10%
Recent messages: 25%
Locked deck summary: 20%
Card Oracle excerpts: 25%
Rules/rulings context: 15%
Safety/fallback metadata: 5%
```

This prevents "just include everything" from silently destroying local model performance.

### 3. The Fact Receipt

Every agent response can optionally carry a hidden/debug metadata receipt:

```json
{
  "provider": "ollama",
  "deckLocked": "Sliver Hivelord",
  "cardsProvided": 12,
  "rulesProvided": 3,
  "rulingsProvided": 2,
  "fallbackUsed": false
}
```

This helps debug "Karn says he can't see Scryfall" by showing exactly what context was attached.

### 4. Feature Flags For Risky Transitions

Use local flags in config or environment:

```text
MODEL_PROVIDER=ollama
ENABLE_KNOWLEDGE_SERVICE=true
ENABLE_PER_CHAT_FILES=false
ENABLE_SYMBOLIC_ARBITER=false
```

This lets Colton compare old and new paths during transition without deleting working behavior.

### 5. No Streaming Requirement For Arbiter Initially

Chat should stream because local models may be slow. Arbiter does not need to stream in v1. Arbiter can show:

```text
Retrieving local rules...
Checking citations...
Generating ruling...
```

This avoids contorting the retrieval pipeline around streaming before it is stable.

## Pair 2 Recommendation

Move fast by building the smallest useful contracts:

- one provider boundary
- one knowledge boundary
- one snapshot boundary

No large framework. No direct hard-coding into every agent.

---

# Pair 3 - CEO Review + Engineering Review

## Shared Concern

CEO Review wants the product to become trustworthy. Engineering Review wants the system to have explicit source precedence and failure states.

Their shared question:

```text
How do we make trust a system property instead of a prompt vibe?
```

## Conversation

**CEO Review:**

The app wins if the user trusts it. The fastest way to lose trust is a confident wrong rules answer or a deck answer based on invented card text.

**Engineering Review:**

Then trust cannot live only in the agent prompt. It has to live in data contracts and response statuses.

**CEO Review:**

So "UNRESOLVED" is not a failure. It is a product feature.

**Engineering Review:**

Exactly. Arbiter should be stricter than Jace. Jace can explain uncertainty conversationally, but Arbiter must return a machine-readable status.

**CEO Review:**

And source conflicts need a business rule. If RulesGuru says one thing and the codex says another, codex wins.

**Engineering Review:**

Source precedence should be encoded, not implied:

```text
CR/codex verbatim > Oracle > official rulings > operational notes > examples > Forge
```

**CEO Review:**

This also helps scope. If the first three sources are enough for 90% of use, do not rush Forge.

**Engineering Review:**

Right. The architecture should report missing source coverage instead of pretending all sources are equal.

## New Ideas From This Pair

### 1. Source Health Panel

Add a later lightweight health panel:

```text
Card data: READY - Oracle synced 2026-05-23
Rulings: READY - synced 2026-05-23
Rules codex: READY - CR baseline Feb 27, 2026
RulesGuru: READY - 500 questions
Forge: NOT WIRED
Ollama: READY / OFFLINE
Anthropic: CONFIGURED / NOT CONFIGURED
```

This turns invisible architecture into visible trust.

### 2. Arbiter Confidence Is Procedural, Not Emotional

Avoid vague confidence scores. Use procedural confidence:

```text
resolved: citations verified and enough state supplied
needs_clarification: missing board state or ambiguous wording
citation_failed: generated answer cited unavailable/unverified rule
unresolved: local corpus does not cover the case
```

This is clearer than "82% confident."

### 3. Source Conflict Report

When sources disagree, Arbiter should return:

```text
sourceConflict: {
  winner: "CR_VERBATIM",
  losers: ["RulesGuru example"],
  reason: "Verbatim Comprehensive Rules outrank examples."
}
```

This is especially useful later if RulesGuru, Forge, and operational notes are all in play.

### 4. Dataset Tiers

Classify data sources by runtime priority:

```text
Tier 1 - Required runtime
- Oracle cards
- Rulings
- CR/codex
- decks/chats

Tier 2 - Validation/runtime examples
- RulesGuru
- generated test cases

Tier 3 - Future enhancement
- Forge
- default cards
- all cards
- artwork data
- embeddings
```

This keeps "downloaded" from becoming "required."

### 5. Rebuildable Data Rule

Any generated index must be disposable:

```text
If an index corrupts, delete it and rebuild from raw local sources.
```

Do not make generated indexes the only source of truth.

## Pair 3 Recommendation

Trust comes from:

- source precedence
- citation verification
- explicit failure statuses
- visible data health
- rebuildable indexes

Do not rely on prompts alone to enforce truth.

---

# Combined New Ideas Worth Carrying Forward

## Product-Level Ideas

1. Brewing Session Acceptance Test
2. Actually Useful definition
3. Weekly backlog reset by real usage
4. Canonical project copy warning

## Architecture Ideas

1. Contract smoke tests
2. Context budget envelope
3. Fact receipt metadata
4. Feature flags for risky transitions
5. Non-streaming Arbiter v1 with staged loading states

## Trust And Data Ideas

1. Source health panel
2. Procedural Arbiter confidence statuses
3. Source conflict report
4. Dataset tiers
5. Rebuildable data rule

---

# Pairwise Consensus

The pairs all converge on the same practical thesis:

```text
The first build should make MTG Tool cheap enough to use,
grounded enough to trust, and small enough to finish.
```

Do not make the knowledge layer a giant ingestion project. Make it a thin local truth interface with strict source precedence and honest failure states.

The best new idea from the pairwise sessions is the **Fact Receipt**:

```text
Every response should be able to show what local facts were actually attached.
```

That directly attacks the core failure mode: agents claiming they cannot access data or silently answering without using it.

The second best new idea is the **Brewing Session Acceptance Test**, because it turns architecture into a real-world usage gate.

The third best new idea is **Dataset Tiers**, because it prevents all downloaded data from becoming mandatory runtime complexity.

