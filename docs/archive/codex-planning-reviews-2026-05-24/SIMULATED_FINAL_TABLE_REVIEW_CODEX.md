# MTG Tool - Simulated Final Table Review

Produced by Codex as the final synthesis pass after:

- simulated Office Hours
- simulated CEO Review
- simulated Engineering Review
- simulated planning meeting
- simulated pairwise review sessions

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Purpose

Each pair from the pairwise review was given the output from the other pair meetings. They digested the new information, revised their thinking, and brought updated ideas back to one final table with all three review lenses present.

The goal is to reach the strongest shared plan before implementation starts.

## Participants

- **Office Hours**: momentum, scope, real use, builder psychology.
- **CEO Review**: user value, prioritization, what to cut.
- **Engineering Review**: architecture, contracts, failure modes, tests.
- **Moderator**: captures synthesis and final decision.

---

# Round 1 - Pair Reflections After Reading All Pairwise Notes

## Pair 1 Reflection: Office Hours + CEO Review

### What They Learned From The Other Pairs

Office Hours and CEO Review came in focused on scope and user value. After reading the engineering-heavy pair notes, they accepted that trust cannot be only a product feeling. Trust needs visible system evidence.

The biggest useful ideas from the other pairs:

- Fact Receipt
- Source Health Panel
- Dataset Tiers
- Procedural Arbiter statuses
- Context Budget Envelope

### Updated Thinking

**Office Hours:**

I originally wanted to avoid turning this into architecture theater. I still do. But the Fact Receipt idea is not architecture theater. It is a direct product answer to the user's pain.

The pain is:

```text
Karn says he cannot access Scryfall even though the data is local.
```

The Fact Receipt says:

```text
Here are the cards, rules, rulings, and deck snapshot actually supplied.
```

That turns an invisible trust problem into a visible debugging tool.

**CEO Review:**

The Source Health Panel also matters more than I first thought. This is a local-first app. Local-first systems fail in boring ways: stale data, missing indexes, wrong project copy, model offline. If those states are invisible, the user blames the agent.

### New Ideas From Pair 1

#### 1. Trust Strip

Add a small debug/status strip in chat responses or the chat panel:

```text
Local model: Ollama
Deck lock: Sliver Hivelord
Cards attached: 14
Rules attached: 3
Anthropic: not used
```

This can be hidden behind "Details" later, but during development it should be visible enough to debug.

#### 2. Real Usage Gate Before Expansion

No expansion to Forge, embeddings, or full Scryfall bulk runtime until the Brewing Session Acceptance Test passes.

#### 3. Product Definition Of Trust

For MTG Tool, "trustworthy" means:

```text
The app can show what facts it used,
what source won if sources conflict,
and when it refused to answer.
```

Not just "the response sounds good."

## Pair 2 Reflection: Office Hours + Engineering Review

### What They Learned From The Other Pairs

Office Hours and Engineering Review already agreed on thin contracts. After reading CEO Review's data-tiering and trust arguments, they revised the first sprint to include slightly more observability.

The biggest useful ideas from the other pairs:

- Dataset Tiers
- Source Conflict Report
- Brewing Session Acceptance Test
- Actually Useful definition

### Updated Thinking

**Engineering Review:**

The first contracts should include observability from the start. Not a full dashboard, but enough metadata to know what happened.

If we build `ModelProvider` without provider/cost metadata, we immediately need to reopen it. If we build `KnowledgeService` without source metadata, we cannot debug grounding.

**Office Hours:**

That is acceptable as long as it stays small. Metadata is not scope creep if it prevents confusion during real use.

### New Ideas From Pair 2

#### 1. Contract V0 Must Include Metadata

Every contract should return its own receipt:

```js
{
  status: "ok",
  data: {},
  meta: {
    sourceCount: 0,
    sources: [],
    stale: false,
    elapsedMs: 0
  }
}
```

#### 2. Three-Layer Context Builder

Instead of one big `buildConversationContext`, split context assembly into:

```text
1. Conversation snapshot
2. Knowledge retrieval
3. Model prompt packing
```

This keeps deck locking, fact retrieval, and token budgeting separate.

#### 3. Context Budget As A Hard Limit

The context budget envelope should be enforced in code, not just documented. If too many card/rule facts are found, the context packer chooses the highest-ranked facts and records what was omitted.

#### 4. Feature Flag Expiration

Feature flags are useful, but each one should have a planned removal condition:

```text
ENABLE_KNOWLEDGE_SERVICE=false
Remove when KnowledgeService passes brewing acceptance test.
```

This prevents the app from becoming a graveyard of toggles.

## Pair 3 Reflection: CEO Review + Engineering Review

### What They Learned From The Other Pairs

CEO Review and Engineering Review came in focused on trust and source precedence. After reading the Office Hours pair notes, they accepted that the first build must be felt by the user quickly.

The biggest useful ideas from the other pairs:

- Actually Useful definition
- Weekly Backlog Reset
- Canonical Copy Warning
- No large framework

### Updated Thinking

**CEO Review:**

The health panel and source precedence are valuable, but they should not become a dashboard project. The user needs confidence during use, not an admin console.

**Engineering Review:**

Agreed. Start with status metadata and maybe a small visible health indicator. A full health panel can wait.

### New Ideas From Pair 3

#### 1. Health Is A Response Property Before It Is A Page

Before building a health dashboard, expose health in API responses:

```js
{
  health: {
    cardStore: "ready",
    ruleStore: "ready",
    modelProvider: "ollama",
    fallbackAvailable: true
  }
}
```

The UI can surface this lightly.

#### 2. Source Precedence Test Fixtures

Create tiny fixtures that intentionally cause source conflicts:

```text
CR says X
RulesGuru example says Y
Expected: CR wins
```

This makes source precedence executable.

#### 3. Canonical Project Guard

Because two app copies exist, add a guard that reads the project root and can display:

```text
Canonical project: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
Current project:   C:\Users\colto\Documents\Codex\MTG TOOL
Warning: old project copy
```

This should be simple and local-only.

#### 4. Dataset Tier Manifest

Create a local manifest:

```json
{
  "requiredRuntime": ["oracle_cards", "rulings", "cr_codex"],
  "validation": ["rulesguru_500"],
  "future": ["forge", "default_cards", "all_cards", "unique_artwork"]
}
```

This gives the app and docs the same definition of what is required now.

---

# Round 2 - Final Table Meeting

## Opening

**Moderator:**

Each pair has read the other pair notes. The question now is: what changes in the final plan?

## Point 1 - Does The First Sprint Still Start With Ollama?

**Office Hours:**

Yes. Cost is still the active pain. But the first day should not only be "make Ollama work." It should make provider behavior observable.

**CEO Review:**

Agree. The product promise is "no hidden paid calls." That requires logging and visible fallback status from the beginning.

**Engineering Review:**

Then Day 1 is:

```text
ModelProvider contract + Ollama path + provider metadata.
```

Day 2 is:

```text
Manual fallback UX + cost log.
```

Not a deep provider framework.

**Consensus:**

Ollama still comes first, but with a minimal provider contract and provider receipt metadata.

## Point 2 - Is KnowledgeService Still Day 3?

**Engineering Review:**

Yes, but it needs to start as a contract plus first adapters:

```text
cards: local Oracle
rulings: local rulings
rules: local CR/codex retrieval
```

**CEO Review:**

Do not include Forge, embeddings, or all five Scryfall datasets in Day 3. They do not serve the immediate trust gap.

**Office Hours:**

Add Fact Receipt here. If Karn mentions cards, we need to know which card facts were actually attached.

**Consensus:**

Day 3 builds a small KnowledgeService and Fact Receipt metadata. It does not perform a full data-platform migration.

## Point 3 - How Much UI Is Allowed?

**CEO Review:**

Avoid a dashboard project. But the user needs visible proof that the app is local and grounded.

**Office Hours:**

A small Trust Strip is allowed. It is not feature creep because it helps the user and the builder debug the app.

**Engineering Review:**

Make it development-friendly first:

```text
Provider: Ollama
Deck: Sliver Hivelord locked
Cards: 14
Rules: 3
Cloud: not used
```

No charts, no settings wall.

**Consensus:**

Add a minimal Trust Strip or response details area. Defer full Source Health Panel.

## Point 4 - Chat Persistence And Snapshots

**Engineering Review:**

ConversationSnapshot is non-negotiable. It prevents deck drift and future migration pain.

**Office Hours:**

But per-chat files might be a larger change. Does that threaten five days?

**Engineering Review:**

Snapshot shape first. Per-chat files can follow if simple. If it grows, defer file split but keep schema version and immutable snapshot.

**CEO Review:**

The user-facing promise is deck lock, not file layout. Prioritize behavior.

**Consensus:**

Day 4 must deliver immutable agent-specific deck locks. Per-chat files are desirable but not required if they risk the sprint.

## Point 5 - Arbiter Scope

**CEO Review:**

Arbiter must stop bluffing. That is more important than making Arbiter expansive.

**Engineering Review:**

Day 5 should add Arbiter statuses and citation verification shape. It does not need to symbolically solve all Magic.

**Office Hours:**

And test with a real user scenario, not only fixtures.

**Consensus:**

Arbiter v1 for this sprint means structured statuses and honest failure, not full Magic execution.

## Point 6 - What New Ideas Make The Final Plan Better?

**Moderator:**

The pairwise sessions introduced several ideas. Which belong in the final plan?

**Office Hours:**

Brewing Session Acceptance Test. This is the practical finish line.

**CEO Review:**

Trust Strip and Dataset Tiers.

**Engineering Review:**

Fact Receipt, contract metadata, source precedence, and canonical project guard.

**Consensus:**

Carry forward:

- Fact Receipt
- Trust Strip
- Brewing Session Acceptance Test
- Dataset Tier Manifest
- Canonical Project Guard
- Contract metadata

Defer:

- full health dashboard
- embeddings
- Forge import
- all-cards runtime migration
- per-chat files if too large for this sprint

---

# Final Refined Plan

## Sprint Name

```text
Local-First Trust Foundation
```

## Sprint Goal

```text
Make MTG Tool cheap to use, grounded in local facts, and resistant to deck-context drift.
```

## Day 1 - ModelProvider V0

Build:

- minimal provider contract
- Ollama call path
- Anthropic call path still available
- provider result metadata

Must return:

```js
{
  provider,
  model,
  status,
  text,
  usage,
  costEstimate,
  elapsedMs,
  error
}
```

## Day 2 - Manual Fallback And Cost Log

Build:

- visible fallback choices
- no automatic Anthropic calls
- local cost log file
- basic provider display in chat

User experience:

```text
Local model failed.
[Retry local] [Use Anthropic once] [Cancel]
```

## Day 3 - KnowledgeService V0 + Fact Receipt

Build:

- `KnowledgeService.query()`
- local Oracle card lookup
- local rulings lookup
- local CR/codex retrieval
- Fact Receipt metadata

Fact Receipt:

```json
{
  "cardsAttached": 14,
  "rulesAttached": 3,
  "rulingsAttached": 2,
  "sources": ["oracle", "rulings", "cr_codex"],
  "omitted": []
}
```

## Day 4 - ConversationSnapshot V0

Build:

- immutable deck snapshot on first message
- agent-specific lock labels
- deck hash
- schema version
- card/rules version fields
- archived/read-only status if feasible

Must prove:

```text
Switching sidebar decks does not change an active chat.
```

## Day 5 - Arbiter Statuses + Acceptance Test

Build:

- Arbiter status shape:

```text
resolved
unresolved
needs_clarification
citation_failed
```

- source precedence rules
- citation verification shell
- Brewing Session Acceptance Test

Do not build full symbolic Magic execution in this sprint.

---

# Final Acceptance Test

The sprint is successful if this works:

```text
1. Open canonical Claude project app.
2. Start a Karn chat on Colton's Sliver Hivelord deck.
3. Ask for cuts/adds.
4. Response uses Ollama by default.
5. Trust Strip shows local provider, locked deck, attached card facts, and no cloud call.
6. Switch sidebar to Joe's Kinnan deck.
7. Continue Karn chat.
8. Karn remains locked to Sliver Hivelord.
9. Ask Jace a rules question involving a known card.
10. Jace retrieves local rules/card context.
11. If local model or citation verification fails, app offers manual Anthropic fallback.
12. No Anthropic call happens without explicit approval.
```

---

# Final Table Consensus

All three reviewers agree:

```text
Do not start with a giant unified knowledge platform.
Start with a local-first trust foundation.
```

The final plan is stronger than the original because it adds observability:

- provider metadata
- fact receipt
- trust strip
- dataset tiers
- source precedence
- acceptance test

The project should move forward only after the owner approves this narrowed sprint.

## One-Sentence Decision

Build the smallest local-first foundation that makes the agents cheap, fact-grounded, and deck-locked; defer every data source or engine feature that does not directly serve that first trust loop.

