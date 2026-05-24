# Codex Claude Next Prompt - MTG Tool Handoff

Copy/paste the prompt below into Claude Code.

```text
You are continuing work on the MTG Tool project.

Canonical project root:
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL

Important: the older Codex working copy may still exist and may still be running on port 3000:
C:\Users\colto\Documents\Codex\MTG TOOL\app

Use the canonical Claude project only. If port 3000 is occupied, the canonical app normally runs on:
http://localhost:3001

Before changing code, read these files in this order:

1. CLAUDE.md
2. CODEX_HANDOFF_2026-05-23.md
3. ROADMAP.md
4. AUDIT.md
5. README.md
6. PHASE1_PREFLIGHT_CODEX.md
7. OFFICE_HOURS_SIMULATED_CODEX.md
8. PLAN_CEO_REVIEW_SIMULATED_CODEX.md
9. PLAN_ENG_REVIEW_SIMULATED_CODEX.md
10. SIMULATED_FINAL_TABLE_REVIEW_CODEX.md

Then inspect these implementation files because Codex recently changed them:

1. app/src/hooks/useChatAgents.js
2. app/src/lib/scryfall.js
3. app/src/lib/agents.js
4. app/src/components/MTGAssistant.jsx
5. app/src/components/mtg/ChatPanel.jsx
6. app/src/components/mtg/AppHeader.jsx
7. app/src/components/mtg/Sidebar.jsx
8. app/src/app/api/cards/route.js
9. app/src/app/api/anthropic/route.js

Start by running:

git status --short
git diff -- app/src/hooks/useChatAgents.js app/src/lib/scryfall.js app/src/lib/agents.js app/src/components/MTGAssistant.jsx app/src/components/mtg/ChatPanel.jsx app/src/components/mtg/AppHeader.jsx app/src/components/mtg/Sidebar.jsx

Do not discard, reset, or revert the current uncommitted Codex changes unless I explicitly tell you to. They are intentional.

What Codex just implemented:

- Loaded deck context now drives local Oracle attachment.
- app/src/lib/scryfall.js has a new buildCardContextForNames(names, options) function.
- app/src/hooks/useChatAgents.js now stores cardNames in deck locks and builds a full ## CARDS REFERENCED block from the locked deck's non-token, non-sideboard cards.
- Deck locks now apply across Jace, Karn, Tibalt, and Arbiter, not only Karn.
- Sidebar deck switches should not silently change an already locked conversation.
- The app now has Unlock Deck and Unload Deck controls:
  - Unlock removes the current agent's locked snapshot but keeps chat history.
  - Unload clears the sidebar active deck selection.
  - Clear Chat still clears the current chat and removes that agent's lock.
- Jace, Karn, and Tibalt prompts were updated to respect locked deck snapshots.

Current intended semantics:

Loaded deck = currently selected sidebar deck.
Locked deck = immutable per-agent conversation snapshot.
Unlock = remove the current agent's locked snapshot while keeping the chat.
Unload = clear the sidebar deck selection.
If a deck is still loaded after Unlock, the next message may lock onto that loaded deck again.
For no deck context at all, use Unload.

Verification already performed by Codex:

cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check

The build passed. The canonical app returned HTTP 200 on localhost:3001. /api/cards successfully returned local Oracle text for Vihaan, Goldwaker. The in-app browser reloaded with no console errors.

PowerShell note:
Use npm.cmd, not npm. Plain npm may resolve to npm.ps1 and be blocked by execution policy.

Environment note:
app/.env.local contains ANTHROPIC_API_KEY and it is not the placeholder. Do not print or copy the key. The user saw one POST /api/anthropic 401 before Next logged "Reload env: .env.local". If Anthropic still 401s on a fresh request, the key itself likely needs verification in Anthropic Console.

Current known port state:

- Old Codex copy: often on localhost:3000
- Canonical Claude project: localhost:3001

Immediate task:

First, validate the new deck-lock/oracle-context behavior in the browser:

1. Open http://localhost:3001.
2. Load the Vihaan, Goldwaker deck or another saved deck.
3. Clear Karn chat if needed so a fresh lock is created.
4. Ask Karn: "What is weak about this deck?"
5. Confirm Karn briefly says the deck is locked and no longer claims local Oracle context is missing.
6. Switch the sidebar to another deck.
7. Continue the same Karn chat and confirm it still answers about the original locked deck.
8. Click Unlock Deck and verify the lock banner disappears.
9. Click Unload and verify the loaded deck banner disappears.

If this fails, fix the deck-lock/oracle-context path before starting new architecture.

After that, recommend the next implementation step from the Local-First Trust Foundation:

1. ModelProvider V0 and Ollama provider wiring, or
2. Manual Anthropic fallback and cost log, or
3. KnowledgeService V0 / Fact Receipt.

Do not start a large rewrite until the lock/oracle behavior is verified.
```
