# Codex Handoff - 2026-05-23

This handoff summarizes what Codex did after the project root was corrected to:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

No Phase 1 implementation work was started. Everything below is audit, verification, planning, and preflight documentation.

## Corrected Project Root

The active repo is:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

The older Codex working copy still exists at:

```text
C:\Users\colto\Documents\Codex\MTG TOOL
```

That old copy was still serving on `http://localhost:3000` during preflight. The Claude project booted on `http://localhost:3001` when tested because port `3000` was occupied.

## First-Run Protocol Verification

Codex read or checked:

- `CLAUDE.md`
- `README.md`
- `ROADMAP.md`
- `app/README.md`
- `app/docs/APP_ROADMAP.md`
- `MTG ENGINE/META_layer_index.md`
- `MTG ENGINE/META_query_router.md`
- `mtg-judge/META_test_cases.md`

Important note:

```text
mtg-judge/META_layer_index.md
mtg-judge/META_query_router.md
```

do not exist. The actual router/index files live in:

```text
MTG ENGINE/META_layer_index.md
MTG ENGINE/META_query_router.md
```

## Tooling Verified

- Node: `v24.16.0`
- npm via `npm.cmd`: `11.13.0`
- Git: `2.51.0.windows.2`
- gstack skills are present on disk, including:
  - `office-hours`
  - `plan-ceo-review`
  - `plan-eng-review`

PowerShell note:

```text
Use npm.cmd, not npm.
```

Plain `npm` resolves to `npm.ps1`, which is blocked by the Windows execution policy.

GBrain note:

```text
gbrain is not on PATH and .claude.json does not show an active mcpServers.gbrain entry.
```

Treat GBrain search/MCP as not configured until `/setup-gbrain` or equivalent verification succeeds.

## Cleanup And Boot Check

Codex deleted ignored stale artifacts in the Claude project copy only:

- `app/node_modules`
- `app/.next`
- `app/local-dev.out.log`
- `app/local-dev.err.log`

Then Codex ran:

```powershell
npm.cmd install
```

Result:

- 20 packages installed
- 2 moderate npm audit vulnerabilities reported
- no forced audit fix was run

Dev server verification:

```powershell
npm.cmd run dev
```

Result:

- Next.js `15.5.18`
- Claude project app became ready on `http://localhost:3001`
- Codex stopped the Claude-project dev server child processes after verification

## Security Verification

The owner reported the Anthropic key was rotated.

Codex verified the local git history scrub:

```powershell
git log --all --full-history -- "MTG ENGINE/THE KEY.txt"
git log -p --all -S "JLjShFSC9ZCSkFHr"
```

Both returned nothing.

Interpretation:

```text
THE KEY.txt no longer appears in local git history, and the searched key fragment is not present in git history.
```

## Audit Update

Codex updated:

```text
AUDIT.md
```

with a "Codex Verification Addendum - 2026-05-23" covering:

- corrected project root
- stale old Codex project copy
- tooling verification
- GBrain status
- cleanup and reinstall
- dev boot check
- security scrub verification
- current deltas from the original audit

Committed as:

```text
2cfc4c9 docs: add Codex verification addendum
```

## Simulated Planning Docs Created

Codex simulated the planning/review workflow because this Codex session cannot actually invoke Claude Code slash commands.

Created docs:

- `OFFICE_HOURS_SIMULATED_CODEX.md`
- `PLAN_CEO_REVIEW_SIMULATED_CODEX.md`
- `PLAN_ENG_REVIEW_SIMULATED_CODEX.md`
- `SIMULATED_PLANNING_MEETING_CODEX.md`
- `SIMULATED_PAIRWISE_REVIEWS_CODEX.md`
- `SIMULATED_FINAL_TABLE_REVIEW_CODEX.md`
- `PHASE1_PREFLIGHT_CODEX.md`

Committed as:

```text
8cf3f03 docs: add simulated planning reviews
```

## Planning Consensus

The simulated reviews converged on this sprint name:

```text
Local-First Trust Foundation
```

Final one-sentence decision:

```text
Build the smallest local-first foundation that makes the agents cheap,
fact-grounded, and deck-locked; defer every data source or engine feature
that does not directly serve that first trust loop.
```

## Final Sprint Shape From Simulations

### Day 1 - ModelProvider V0

- Minimal provider contract
- Ollama call path
- Anthropic path still available
- provider result metadata

### Day 2 - Manual Fallback And Cost Log

- visible fallback choices
- no automatic Anthropic calls
- local cost log file
- basic provider display in chat

### Day 3 - KnowledgeService V0 + Fact Receipt

- local Oracle card lookup
- local rulings lookup
- local CR/codex retrieval
- fact receipt metadata

### Day 4 - ConversationSnapshot V0

- immutable deck snapshot on first message
- agent-specific lock labels
- deck hash
- schema version
- card/rule version fields
- archived/read-only status if feasible

### Day 5 - Arbiter Statuses + Acceptance Test

- `resolved`
- `unresolved`
- `needs_clarification`
- `citation_failed`
- source precedence rules
- citation verification shell
- brewing session acceptance test

## New Ideas From Simulations

### Fact Receipt

Every response can show what local facts were actually attached:

```json
{
  "cardsAttached": 14,
  "rulesAttached": 3,
  "rulingsAttached": 2,
  "sources": ["oracle", "rulings", "cr_codex"],
  "omitted": []
}
```

### Trust Strip

Minimal visible/debug response metadata:

```text
Provider: Ollama
Deck: Sliver Hivelord locked
Cards: 14
Rules: 3
Cloud: not used
```

### Dataset Tiers

Required runtime:

- Oracle cards
- rulings
- CR/codex
- decks/chats

Validation/runtime examples:

- RulesGuru 500
- generated test cases

Future enhancement:

- Forge
- default cards
- all cards
- unique artwork
- embeddings

### Brewing Session Acceptance Test

The sprint is successful if:

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

## Phase 1 Preflight Findings

Ollama is not currently available:

```text
ollama is not recognized as a command
http://localhost:11434 unavailable
```

Implication:

```text
Day 1 cannot fully verify Ollama routing until Ollama is installed, added to PATH, and running.
```

Port status during check:

```text
http://localhost:3000 status 200
http://localhost:3001 unavailable
http://localhost:11434 unavailable
```

Interpretation:

```text
The old Codex copy is running on 3000.
The canonical Claude project is not currently running.
Ollama is not running.
```

## Safe Work Before Phase 1

Allowed before code implementation:

1. Review and compare planning docs.
2. Install and start Ollama.
3. Pull a starter model for testing.
4. Stop the old Codex-copy dev server if desired.
5. Confirm the canonical Claude project path.
6. Approve the final sprint plan.

Should wait for Phase 1 approval:

1. Creating `/api/chat`.
2. Adding `ModelProvider`.
3. Modifying agent chat flow.
4. Adding `KnowledgeService`.
5. Changing card/rule retrieval behavior.
6. Adding conversation snapshot behavior.
7. Adding Trust Strip or Fact Receipt UI.

## Current Git Trail

Relevant commits:

```text
8cf3f03 docs: add simulated planning reviews
2cfc4c9 docs: add Codex verification addendum
4f82503 docs: add initial audit report (AUDIT.md)
4c5c1a7 security: remove API key file from git tracking
5927696 chore: initial commit of MTG Tool from Codex working copy
```

## Current Recommendation

Before Claude starts Phase 1, confirm:

```text
Approved sprint: Local-First Trust Foundation
Canonical project: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
Fallback policy: Manual Anthropic only
Ollama status: installed/running or accepted as a temporary verification blocker
```

No Phase 1 code was implemented by Codex after switching to the Claude directory.

