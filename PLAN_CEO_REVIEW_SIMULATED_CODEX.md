# MTG Tool - Simulated CEO Plan Review

Produced by Codex for comparison with Claude Code planning.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Feature In Scope

Unified knowledge layer: the central architectural piece that lets every agent read from local Scryfall data, the rules codex, RulesGuru, and Forge through a single retrieval interface, with Arbiter as the rules/data authority.

## Executive Verdict

Build the unified knowledge layer, but shrink the first version.

The pain is real: the app has local data, but the agents behave like they are blind. That is a product-breaking mismatch. Karn saying he cannot access Scryfall when Scryfall data is on disk is exactly the kind of thing that makes the whole tool feel fake.

But the proposed scope is too big for the first pass. "All 5 Scryfall datasets + full RulesGuru + Forge + Arbiter rebuild + all agents" is not a foundation sprint. That is a platform migration.

## Scope To Hold

The real Phase 1 knowledge-layer goal should be:

```text
Every agent can ask one local interface for card data, rule context,
rulings, deck context, and supported Arbiter traces.
```

That does not require importing everything immediately.

## Keep In Scope

- Unified `KnowledgeService` interface.
- Local Oracle card lookup.
- Local Scryfall rulings lookup.
- Runtime `mtg-judge` / `MTG ENGINE` codex retrieval.
- Arbiter structured response shape.
- Karn, Jace, and Tibalt reading through the same retrieval interface.
- Clear `UNRESOLVED` behavior when data is missing or citations cannot be verified.

## Cut Or Defer

### All 5 Scryfall Datasets

Defer. Start with Oracle cards plus rulings. Add default cards only if the app needs printings, art, collector data, or prices. `all_cards.json` and `unique_artwork.json` are not needed for agent reasoning.

### Full RulesGuru Import

Defer. The app already has 500 questions. Use them to test retrieval quality first.

### Forge Integration

Timebox as an investigation only. Do not let Java card scripts become a dependency before Arbiter can reliably use Oracle text and Comprehensive Rules data.

### Embeddings / Vector Search

Defer. Use keyword/router retrieval first. Add embeddings only after actual retrieval misses prove the need.

### Garfield Integration

Defer beyond making sure the contract can support it later. Garfield should not pull the first knowledge-layer pass into simulator architecture.

## Correct Order

1. Define the retrieval contract.
2. Wire local Scryfall Oracle cards plus rulings.
3. Wire the local rules codex into runtime retrieval.
4. Rebuild Arbiter around retrieved facts plus citation verification.
5. Connect Jace, Karn, and Tibalt to Arbiter / `KnowledgeService`.
6. Only then expand RulesGuru, Forge, and larger Scryfall datasets.

## Hidden Assumption

You are assuming "more data" equals "better answers."

It does not. More data without ranking, source precedence, and failure states makes the app more likely to confuse itself. The first knowledge layer should be small, strict, and verifiable.

## Source Precedence

Use this precedence order when sources conflict:

1. Verbatim Comprehensive Rules / `mtg-judge` `_v` files.
2. Oracle card text.
3. Official / Scryfall rulings.
4. `mtg-judge` / `MTG ENGINE` `_t` operational notes.
5. RulesGuru examples.
6. Forge, only after proven useful.

## CEO Decision

Approve the unified knowledge layer, but redefine success.

Do not define success as:

```text
All sources imported.
```

Define success as:

```text
Karn, Jace, and Tibalt can reliably answer from local cards/rules
and admit when they cannot.
```

That is the right foundation. The rest is expansion.

## Recommended First Milestone

Ship a small, strict, local-first knowledge layer with:

- `KnowledgeService.query()`
- card lookup from local Oracle data
- rulings lookup from local rulings data
- rule retrieval from local codex/CR JSON
- structured Arbiter statuses
- agent integration for Jace, Karn, and Tibalt

This milestone fixes the product-breaking blind-agent problem without turning Phase 1 into a multi-source data platform migration.
