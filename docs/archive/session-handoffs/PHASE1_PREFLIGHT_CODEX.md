# MTG Tool - Phase 1 Preflight

Produced by Codex before Phase 1 implementation.

Project root:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

## Current Status

Phase 1 implementation has not started. The planning docs are now ready for comparison and review.

## Planning Artifacts

- `OFFICE_HOURS_SIMULATED_CODEX.md`
- `PLAN_CEO_REVIEW_SIMULATED_CODEX.md`
- `PLAN_ENG_REVIEW_SIMULATED_CODEX.md`
- `SIMULATED_PLANNING_MEETING_CODEX.md`
- `SIMULATED_PAIRWISE_REVIEWS_CODEX.md`
- `SIMULATED_FINAL_TABLE_REVIEW_CODEX.md`

## Preflight Findings

### Ollama

Current check:

```powershell
ollama list
```

Result:

```text
ollama is not recognized as a command
```

Current local server check:

```text
http://localhost:11434 unavailable
```

Phase 1 implication:

Day 1 cannot fully verify local-provider routing until Ollama is installed, added to PATH, and running. The code can still be written to support Ollama, but the acceptance test will remain blocked until the local service responds.

### App Ports

Current check:

```text
http://localhost:3000 status 200
http://localhost:3001 unavailable
```

Interpretation:

The older Codex working copy is still serving on port 3000. The canonical Claude project is not currently running.

Phase 1 implication:

Add or keep a canonical-project guard in the plan. Testing the wrong app copy is a real risk.

### npm

Use `npm.cmd` on this Windows machine. Plain `npm` resolves to `npm.ps1` and is blocked by PowerShell execution policy.

## Safe Work Before Phase 1

These are allowed before implementation:

1. Review and compare planning docs.
2. Install and start Ollama.
3. Pull a starter model for testing.
4. Stop the old Codex-copy dev server if the user wants port 3000 freed.
5. Decide whether Phase 1 uses the canonical Claude project exclusively.
6. Approve the final sprint plan.

These are Phase 1 implementation and should wait for approval:

1. Creating `/api/chat`.
2. Adding `ModelProvider`.
3. Modifying agent chat flow.
4. Adding KnowledgeService.
5. Changing card/rule retrieval behavior.
6. Adding conversation snapshot behavior.
7. Adding Trust Strip or Fact Receipt UI.

## Recommended Approval Gate

Before Phase 1 starts, confirm:

```text
Approved sprint: Local-First Trust Foundation
Canonical project: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
Fallback policy: Manual Anthropic only
Ollama status: installed/running or accepted as a temporary verification blocker
```

