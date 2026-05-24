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
10. app/src/app/api/arbiter/route.js
11. app/src/app/api/model-calls/route.js
12. app/src/lib/server/modelProvider.js

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
- Karn now has a local Scryfall search bridge:
  - /api/cards supports GET ?search=...&colorIdentity=...&limit=...
  - search uses app/data/scryfall.oracle.local.json
  - search defaults to Commander-legal cards
  - returned cards include colors, colorIdentity, edhrecRank, rarity, set, setName, and producedMana
  - app/src/lib/scryfall.js has buildKarnScryfallSearchContext(prompt, options)
  - Karn receives a compact ## LOCAL SCRYFALL SEARCH RESULTS FOR KARN block for upgrade/add/cut/tuning prompts
  - normal chat context defaults to local-only Scryfall lookup; live Scryfall fallback is opt-in, not normal behavior
- Locked deck context now attaches a local-first fact bundle:
  - full local Oracle text for non-token, non-sideboard locked deck cards
  - local Scryfall rulings when available
  - max 2 rulings per card for locked-deck context
  - source receipt showing local card count, live fallback count, and unresolved count
  - local /api/engine rules/fringe context for Jace, Karn, Tibalt, and Arbiter when a deck is locked
- Live Scryfall fallback is now narrow and explicit:
  - allowed for missing locked-deck card facts
  - allowed for missing directly mentioned card facts
  - not used for normal local card search
  - not used by Karn's banlist post-processor

Important distinction:

Local Scryfall lookup is now local/free for Karn context. The model response itself is only free after Ollama is installed/running. Chat still posts to /api/anthropic, but that endpoint now has provider routing behind it. The app defaults to Local/Ollama for cost safety; Anthropic is used only when the user selects API or configures provider=anthropic.

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

The build passed. The canonical app returned HTTP 200 on localhost:3001. /api/cards successfully returned local Oracle text for Vihaan, Goldwaker. The in-app browser DOM loaded the MTG Assistant UI.

Additional Scryfall verification performed:

- GET /api/cards?search=draw%20a%20card&colorIdentity=RWB&limit=5 returned local Commander-legal results.
- GET /api/cards?search=create%20treasure%20token&colorIdentity=RWB&limit=5 returned local Commander-legal results.
- POST /api/cards for Vihaan, Goldwaker returned local Oracle text, colorIdentity {B,R,W}, and edhrecRank.
- POST /api/cards for Vihaan, Goldwaker with includeRulings=true returned source=local, rulingsSource=local, and 5 local rulings.
- POST /api/engine with a Vihaan treasure/combat edge-case query returned local MTG ENGINE / judge context and direct CR lookup text.
- POST /api/anthropic with provider=ollama returned a visible 502 provider=ollama error when Ollama was unavailable; it did not silently call Anthropic.
- POST /api/arbiter with provider=ollama returned the same visible 502 provider=ollama error.
- GET /api/model-calls returned one logged Ollama failure and zero Anthropic calls.
- The in-app browser DOM showed Local 1 | API 0 in the header.
- The in-app browser DOM showed Local and API provider buttons.

Provider V0 added:

- app/src/lib/server/modelProvider.js
- /api/anthropic remains backward-compatible with the current chat UI
- /api/arbiter now uses the shared provider layer
- Supported provider values: anthropic, ollama, local, auto
- auto only falls back to Anthropic if ALLOW_ANTHROPIC_AUTO_FALLBACK=true
- app/.env.local.example now documents MTG_MODEL_PROVIDER, OLLAMA_BASE_URL, OLLAMA_MODEL, and ALLOW_ANTHROPIC_AUTO_FALLBACK
- Initial Get-Command ollama returned nothing, but Ollama was then installed successfully and is reachable through the explicit executable path.
- app/data/model-calls.local.json is a new privacy-safe provider/cost metadata log
- app/data/model-calls.local.json is ignored by git
- the log stores provider/model/status/count metadata only, not prompt or chat text
- GET /api/model-calls returns the local model-call summary
- the app header now shows a compact Local N | API N badge
- the app header now has a Local/API manual provider switch
- the selected provider is saved in browser local storage as mtg-model-provider
- chat messages and silent Arbiter trace calls pass the selected provider

Ollama update after that note:

- Ollama is now installed and running.
- Verified executable: C:\Users\colto\AppData\Local\Programs\Ollama\ollama.exe
- Verified version: 0.24.0
- Verified server: http://127.0.0.1:11434
- Pulled model: qwen2.5:14b
- Model size: 9.0 GB, 14.8B params, Q4_K_M
- app/.env.local was updated without printing secrets:
  - MTG_MODEL_PROVIDER=ollama
  - OLLAMA_BASE_URL=http://127.0.0.1:11434
  - OLLAMA_MODEL=qwen2.5:14b
  - OLLAMA_NUM_CTX=32768
  - ALLOW_ANTHROPIC_AUTO_FALLBACK=false
- app/.env.local.example was updated to match.
- app/src/lib/server/modelProvider.js now defaults to qwen2.5:14b and 32K context.
- /api/anthropic default local test returned provider=ollama, model=qwen2.5:14b, content=app local ok.
- /api/arbiter provider=ollama fast=true returned a structured local Arbiter trace.
- ollama ps after an app request showed qwen2.5:14b using a larger local context with slight CPU spill.
- app/start-local.ps1 now checks/starts Ollama and starts the app on http://localhost:3001.
- Latest Codex fix: /api/arbiter now auto-attaches local Scryfall Oracle/rulings context for direct questions that mention card names and do not already include a card-context block.
- Regression check after that fix: POST /api/arbiter with fast=true for "Can Sol Ring tap for colored mana?" returned provider=ollama and a verdict saying Sol Ring only adds colorless mana unless another effect changes it. Model calls remain API 0 / Ollama only.
- Full locked-deck-sized context check: POST /api/anthropic with provider=ollama plus Vihaan's local deck Oracle context returned provider=ollama in ~11 seconds and correctly identified the locked commander as Vihaan, Goldwaker.
- Current model-call summary after this check: API/Anthropic total 0, Ollama total 7, Ollama ok 6, Ollama failed 1.

Dev server recovery note:

During verification, the in-app browser exposed the known stale .next cache error:

Cannot find module './873.js'

Codex recovered by stopping the process on port 3001, deleting only:

C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\.next

and restarting:

npm.cmd run dev -- --port 3001

The app then returned HTTP 200 and the MTG Assistant DOM loaded.

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
10. Ask Karn: "Give me 10 adds and 10 cuts using local Scryfall card data."
11. Confirm Karn does not claim it lacks Scryfall/API access and produces suggestions grounded in the local context.

If this fails, fix the deck-lock/oracle-context path before starting new architecture.

After that, recommend the next implementation step from the Local-First Trust Foundation:

1. Install/configure Ollama and verify one local model call, or
2. Expand the provider/cost UI into a full dashboard and add per-message provider labels, or
3. Build KnowledgeService V0 / Fact Receipt UI around the source receipt now being generated.

Do not start a large rewrite until the lock/oracle behavior is verified.
```
