# Copy/Paste Prompt For Next Codex Or Claude Session

```text
You are continuing work on MTG Tool.

Project root:
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL

App root:
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app

Branch:
feat/phase2-arbiter-retrieval

Before changing code, read these files in order:
1. CLAUDE.md
2. CODEX_PHASE2_PROGRESS_2026-05-24.md
3. CODEX_SPELLBOOK_HANDOFF_2026-05-25.md
4. app/src/lib/agents.js
5. app/src/hooks/useChatAgents.js
6. app/src/lib/server/spellbook.js
7. app/src/app/api/spellbook/route.js
8. app/scripts/sync-spellbook.cjs

Current state:
- Phase 2 Arbiter retrieval is already built and validated.
- Karn quality work has started: inventory framework, power/bracket framework, CRISPI-style evaluation, land/ramp math, and local Spellbook context.
- Commander Spellbook local sync is complete:
  - 89,362 combo variants
  - 7,639 card flag records
- Generated local Spellbook data lives in app/data/*.local.json and is intentionally gitignored.
- Build passed after the Spellbook work:
  npm.cmd run build

Uncommitted work you may see:
- .gitignore adds .gstack/
- app/package.json adds sync:spellbook and sync:spellbook-cards
- app/scripts/sync-spellbook.cjs is new
- app/src/lib/server/spellbook.js is new
- app/src/app/api/spellbook/route.js is new
- app/src/hooks/useChatAgents.js injects local Spellbook context for Karn
- app/src/lib/agents.js has deeper Karn power-evaluation instructions
- CODEX_SPELLBOOK_HANDOFF_2026-05-25.md and CODEX_SPELLBOOK_PROMPT_2026-05-25.md document this work

Immediate task:
1. Inspect git status and the files above.
2. Do not force-add generated app/data/*.local.json files.
3. Re-run:
   cd app
   npm.cmd run build
4. Commit the Spellbook integration if build passes:
   git add .gitignore app/package.json app/scripts/sync-spellbook.cjs app/src/app/api/spellbook/route.js app/src/lib/server/spellbook.js app/src/hooks/useChatAgents.js app/src/lib/agents.js CODEX_SPELLBOOK_HANDOFF_2026-05-25.md CODEX_SPELLBOOK_PROMPT_2026-05-25.md
   git commit -m "feat: add local Commander Spellbook combo grounding"

Then run a browser smoke test:
- Start the app:
  cd app
  npm.cmd run dev
- Load a saved deck.
- Switch to Karn.
- Ask:
  "Give me a full power level and bracket analysis."
- Expected:
  - Karn gives inventory first.
  - Karn includes power level and bracket.
  - Karn references local Spellbook combo facts if present.
  - Karn distinguishes current combos from one-card-away combos.
  - Anthropic API cost remains 0 unless Colton explicitly selects API.

Important constraints:
- Do not scrape DeckCheck or EDHPowerLevel at runtime.
- Commander Spellbook is the local combo source.
- EDHREC salt should be treated as a future optional dataset after API/terms review.
- New handoff/review docs for Claude/Codex must start with CODEX_.
- Colton wants cleanup/archive eventually, but do not reorganize files until the current Spellbook/Karn work is committed and smoke-tested.
```

