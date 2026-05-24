# Codex Handoff - 2026-05-23

This handoff summarizes what Codex did after the project root was corrected to:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
```

Initial note: at the time this handoff was first written, no Phase 1 implementation work had been started. Later Codex work on the same date did add a small but important deck-lock and local Oracle-context implementation. See the addendum at the end of this file.

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

Historical note: at the time this original handoff section was produced, no Phase 1 code had been implemented by Codex after switching to the Claude directory. This is now superseded by the implementation addendum below.

---

## Implementation Addendum - 2026-05-23

Codex did implement a focused pre-Phase/early-Phase fix after the planning handoff: loaded deck context now drives local Oracle attachment and agent deck locking.

### User problem that triggered the work

Karn responded to a loaded Vihaan deck with:

```text
I don't see any "## CARDS REFERENCED" block attached to your message...
```

The user correctly identified that a loaded deck conversation should automatically attach Oracle text for the loaded deck, not require the user to name every card in the prompt.

### Implemented behavior

1. When an agent locks onto a deck, the deck snapshot becomes the trigger point for Oracle context.
2. The app builds a `## CARDS REFERENCED` block from the locked deck's non-token, non-sideboard card names.
3. The block is attached to the model request so Karn/Tibalt/Jace/Arbiter can reason from local Scryfall Oracle text instead of memory.
4. The agent is instructed to briefly confirm when a deck is newly locked.
5. Deck locks now exist for all agents, not only Karn.
6. Sidebar deck changes do not mutate an existing locked conversation.
7. The user now has explicit controls:
   - `Unlock Deck`: removes the current agent's locked deck snapshot while keeping the chat.
   - `Unload`: clears the active deck selection.
   - `Clear Chat`: still clears chat and removes that agent's lock.

### Files changed

```text
app/src/lib/scryfall.js
app/src/hooks/useChatAgents.js
app/src/lib/agents.js
app/src/components/MTGAssistant.jsx
app/src/components/mtg/ChatPanel.jsx
app/src/components/mtg/AppHeader.jsx
app/src/components/mtg/Sidebar.jsx
```

### Important code changes

`app/src/lib/scryfall.js`

- Added `buildCardContextForNames(names, options)`.
- This function fetches a batch of card names through the existing local `/api/cards` route and formats a `## CARDS REFERENCED` prompt block.
- It is used for deck-level Oracle attachment, while the older `buildCardContext(text, options)` still handles card names mentioned in a user's message.

`app/src/hooks/useChatAgents.js`

- Added deck card-name extraction helpers.
- `createDeckLock()` now stores `cardNames`.
- Deck locking now uses a shared lock path for Jace, Karn, Tibalt, and Arbiter.
- When a deck lock exists, `buildCardContextForNames()` attaches Oracle text for the locked deck.
- If a persisted older lock lacks `cardNames`, the hook falls back to parsing card names from `lock.deckText`.
- Added `unlockDeck(agentOverride)` and `unlockAllDecks()`.
- Arbiter trace requests now receive locked-deck Oracle context when available.

`app/src/lib/agents.js`

- Jace, Karn, and Tibalt prompts now explicitly respect locked deck snapshots until the deck is unlocked, the chat is cleared, or the user explicitly starts a new deck conversation.

`app/src/components/mtg/ChatPanel.jsx`

- Shows the loaded deck banner with `View` and `Unload`.
- Shows the current agent's deck lock banner with `Unlock`.
- Lock banner explains that sidebar deck changes will not alter the current chat.

`app/src/components/mtg/AppHeader.jsx`

- Adds `Unlock Deck` in the header when the active agent has a locked deck.

`app/src/components/mtg/Sidebar.jsx`

- Adds `Unload Deck` when an active deck is selected.

`app/src/components/MTGAssistant.jsx`

- Wires unlock/unload controls into the app shell.

### Current semantics

```text
Loaded deck = what the sidebar currently has selected.
Locked deck = immutable per-agent conversation snapshot.
Unlock = remove the current agent's locked snapshot, keep the chat.
Unload = clear the sidebar's active deck selection.
Clear Chat = clear current agent chat and remove that agent's lock.
```

Important nuance:

```text
If the user clicks Unlock while a deck remains loaded, the next message can lock the agent to that currently loaded deck again.
For no deck context at all, use Unload.
```

### Verification performed

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check
```

Result:

```text
Next.js build passed.
```

Runtime checks:

- `http://localhost:3001/` returned `200`.
- `/api/cards` successfully returned local Oracle data for `Vihaan, Goldwaker`.
- In-app browser reloaded `http://localhost:3001/`.
- Browser console showed no app errors after reload.

### Current server/port state

At the last check:

```text
Old Codex copy:
C:\Users\colto\Documents\Codex\MTG TOOL\app
listening on http://localhost:3000

Canonical Claude project:
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app
listening on http://localhost:3001
```

Use `http://localhost:3001` for the canonical project.

### Environment note

The user's `app/.env.local` has an `ANTHROPIC_API_KEY=` line present and it is not the placeholder. The key value was not copied into docs.

The user saw one `POST /api/anthropic 401` before Next logged:

```text
Reload env: .env.local
```

Interpretation:

```text
That 401 likely occurred before or during env reload. If new chat requests still 401, verify the Anthropic key itself in the Anthropic console.
```

### Current worktree state

This addendum was written while the code changes were still uncommitted. Claude should begin by running:

```powershell
git status --short
git diff -- app/src/hooks/useChatAgents.js app/src/lib/scryfall.js app/src/lib/agents.js app/src/components/MTGAssistant.jsx app/src/components/mtg/ChatPanel.jsx app/src/components/mtg/AppHeader.jsx app/src/components/mtg/Sidebar.jsx
```

Do not discard these changes unless the owner explicitly asks.

### Next recommended checks

1. Open `http://localhost:3001`.
2. Load `Vihaan, Goldwaker`.
3. Start or clear Karn chat so a fresh lock is created.
4. Ask: `What is weak about this deck?`
5. Confirm Karn says the deck is locked and no longer claims local Oracle context is missing.
6. Switch sidebar to another deck.
7. Continue the Karn chat and confirm it still answers around Vihaan.
8. Click `Unlock Deck`, then send a message and confirm it relocks only if a deck is still loaded.
9. Click `Unload`, then send a general question and confirm no deck frame is assumed.

### Still not done

- Ollama/local provider routing has a V0 server-side adapter, Ollama is now installed/running, and the app has a Local/API manual provider switch.
- Manual Anthropic fallback is not implemented yet.
- `/api/chat` unified endpoint is not implemented yet.
- Fact Receipt / Trust Strip UI is not implemented yet.
- Full KnowledgeService V0 is not implemented yet.
- Chat session manager with multiple archived/read-only conversations is not implemented yet.

---

## Karn Local Scryfall Addendum - 2026-05-23

The user clarified:

```text
ok lets get karn connected to scryfall so i can use it functionaly
also since we have all the scryfall data stored locally make sure to use it free convos
i will always upgrade the local scryfall data when things change
```

Codex implemented a local-first Scryfall search bridge for Karn.

### Implemented behavior

1. `/api/cards` now supports local search:

```text
GET /api/cards?search=draw%20a%20card&colorIdentity=RWB&limit=5
```

2. Search results come from `app/data/scryfall.oracle.local.json`.
3. Search defaults to Commander-legal cards.
4. Search can filter by Commander color identity.
5. Returned card payloads now include:
   - `colors`
   - `colorIdentity`
   - `edhrecRank`
   - `rarity`
   - `set`
   - `setName`
   - `producedMana`
6. The app's card search UI now searches local Scryfall first and no longer falls through to live Scryfall in normal search.
7. Karn now receives a compact `## LOCAL SCRYFALL SEARCH RESULTS FOR KARN` context block when the prompt asks for deck-building work such as upgrades, adds/cuts, ramp, draw, removal, protection, mana base, or tuning.
8. Karn's local search context is filtered by the locked commander's color identity when that color identity can be read from local Scryfall.
9. Chat prompt card-context builders now default to local-only lookup. Live fallback is opt-in, not normal conversation behavior.
10. Karn's banlist post-processor now checks local Scryfall only.

### Files changed by this addendum

```text
app/src/app/api/cards/route.js
app/src/lib/scryfall.js
app/src/hooks/useChatAgents.js
app/src/lib/agents.js
```

### Important current limitation

This makes Scryfall/card facts local and free. The model response is only free after Ollama is installed/running and `MTG_MODEL_PROVIDER=ollama` is set; the UI still posts to `/api/anthropic`, but that endpoint now has provider routing behind it.

### Verification performed

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check
```

Result:

```text
Next.js build passed.
```

Runtime smoke checks:

```powershell
Invoke-WebRequest http://localhost:3001/
Invoke-RestMethod "http://localhost:3001/api/cards?search=draw%20a%20card&colorIdentity=RWB&limit=5"
Invoke-RestMethod "http://localhost:3001/api/cards?search=create%20treasure%20token&colorIdentity=RWB&limit=5"
POST /api/cards with Vihaan, Goldwaker
```

Results:

- App returned HTTP `200`.
- Local search returned Commander-legal cards from local Scryfall.
- `Vihaan, Goldwaker` returned local Oracle text, color identity `{B, R, W}`, and EDHREC rank.

### Recommended next validation

Use Karn in the app with a loaded Mardu deck such as Vihaan:

```text
What are 10 adds and 10 cuts for this deck? Use local Scryfall card data.
```

Expected:

- Karn should confirm the locked deck.
- Karn should no longer say it lacks Scryfall access.
- Karn should produce concrete suggestions from the local search context where possible.
- If Anthropic returns 401, the issue is API key validity, not Scryfall connectivity.

---

## Locked Deck Fact Bundle Addendum - 2026-05-23

The user clarified the desired behavior:

```text
so basically what happens then is the deck is locked in and confirm it then pulls all the oracle text, ruling and fringe case data we have for the cards within the deck list from local sources and then if it cant find some it then will fall back on some sort of call.
```

Codex implemented the V0 version of that behavior.

### Implemented behavior

1. When Jace, Karn, Tibalt, or Arbiter locks a deck, the prompt now attaches a `## CARDS REFERENCED - LOCKED DECK CARD DATA` block.
2. That locked-deck card block includes:
   - Local Scryfall Oracle text for every non-token, non-sideboard card in the locked deck.
   - Local Scryfall rulings where available.
   - Up to 2 rulings per card to keep prompt size bounded.
   - A source receipt showing local card count, live fallback card count, and unresolved card count.
3. `/api/cards` now tags card payloads with:
   - `source`
   - `rulingsSource`
4. The prompt context builder now distinguishes:
   - local rulings were checked and there are no rulings, versus
   - rulings were not requested or not present.
5. Live Scryfall fallback is now narrow and explicit:
   - It is allowed for missing locked-deck card facts.
   - It is allowed for missing directly-mentioned card facts.
   - Normal local search still stays local-only.
   - Karn's banlist post-processor still stays local-only.
6. Locked deck chats now also request local engine/rules context from `/api/engine` even when the user asks a broad deck question.
   - This gives Karn/Jace/Tibalt/Arbiter local MTG ENGINE, RulesGuru, and CR snippets for edge cases and fringe interactions around the locked deck.
7. On first lock, the agent is instructed to briefly confirm:
   - the deck is locked for the conversation, and
   - local card/rules context has been loaded.

### Files changed by this addendum

```text
app/src/app/api/cards/route.js
app/src/lib/scryfall.js
app/src/hooks/useChatAgents.js
app/src/lib/agents.js
```

### Verification performed

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check
```

Result:

```text
Next.js production build passed.
```

Runtime checks:

```powershell
POST /api/cards with Vihaan, Goldwaker, Blood Artist, Revel in Riches and includeRulings=true
GET /api/cards?search=create%20treasure%20token&colorIdentity=RWB&limit=3
POST /api/engine with a Vihaan treasure/combat edge-case query
```

Results:

- `Vihaan, Goldwaker` returned `source: local`.
- `Vihaan, Goldwaker` returned `rulingsSource: local`.
- `Vihaan, Goldwaker` returned color identity `{B,R,W}` and 5 local rulings.
- Local Scryfall search returned Commander-legal local cards.
- `/api/engine` returned local MTG ENGINE / judge context, including direct CR lookup text.

### Dev server recovery during verification

The in-app browser exposed the known stale `.next` cache issue:

```text
Cannot find module './873.js'
```

Codex recovered it by:

1. Stopping the process listening on port `3001`.
2. Deleting only the canonical app build cache:

```text
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app\.next
```

3. Restarting the canonical dev server:

```powershell
npm.cmd run dev -- --port 3001
```

The canonical app then returned HTTP `200` on `http://localhost:3001/`, and the browser DOM loaded the MTG Assistant UI.

### Important limitation

This does not install or run Ollama. Scryfall/rules context is local-first now, and provider routing exists server-side. The app now defaults to the local provider path; Anthropic is used only when the user selects `API` or the provider is explicitly configured to `anthropic`.

---

## Model Provider V0 Addendum - 2026-05-23

Codex implemented a minimal provider abstraction after the local Scryfall/Karn work.

### Implemented behavior

1. Added shared provider code:

```text
app/src/lib/server/modelProvider.js
```

2. `/api/anthropic` remains backward-compatible with the current chat UI.
3. `/api/anthropic` can now route by `body.provider` or env:
   - `anthropic`
   - `ollama`
   - `local` (alias for Ollama)
   - `auto`
4. `/api/arbiter` now uses the same provider layer.
5. Added Ollama HTTP adapter for:

```text
http://127.0.0.1:11434/api/chat
```

6. Ollama responses are normalized into the existing Anthropic-style response shape:

```json
{ "content": [{ "type": "text", "text": "..." }] }
```

7. Automatic paid fallback is off by default.
   - `provider: "ollama"` returns a visible `502` if Ollama is unavailable.
   - It does not silently call Anthropic.
   - `provider: "auto"` only falls back to Anthropic if `ALLOW_ANTHROPIC_AUTO_FALLBACK=true`.
8. Added a privacy-safe local model-call log:

```text
app/data/model-calls.local.json
```

The log stores provider/model/status/count metadata only. It does not store prompt text or chat content. The file is ignored by git.
9. Added a read-only model-call summary endpoint:

```text
GET /api/model-calls
```

10. Added a small header badge:

```text
Local N | API N
```

This gives immediate visibility into local vs paid-provider call counts.
11. Added a manual provider switch in the header:

```text
Local | API
```

The selected provider is stored in browser local storage under:

```text
mtg-model-provider
```

Chat messages and Jace's silent Arbiter trace calls now pass the selected provider. This is the manual fallback control: use `Local` for Ollama, switch to `API` only when the user wants an Anthropic call.

### Env example updated

```text
app/.env.local.example
```

Added:

```text
MTG_MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_NUM_CTX=32768
ALLOW_ANTHROPIC_AUTO_FALLBACK=false
```

### Verification performed

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check
```

Result:

```text
Next.js production build passed.
```

No-cost provider failure checks:

```text
POST /api/anthropic with provider=ollama
POST /api/arbiter with provider=ollama
```

Both returned:

```json
{
  "error": "Could not reach Ollama at localhost:11434.",
  "provider": "ollama",
  "fallbackAvailable": true
}
```

This confirms the local provider path fails visibly when Ollama is not running and does not silently spend Anthropic credits.

Model-call log verification:

```text
app/data/model-calls.local.json
```

was created and the last entry contained:

```text
provider=ollama
model=qwen2.5:14b
ok=false
status=502
messageCount=1
totalInputChars=5
outputChars=0
```

`git status --ignored app/data/model-calls.local.json` shows the file as ignored.

Visible status verification:

- `GET /api/model-calls` returned one logged Ollama failure and zero Anthropic calls.
- The in-app browser DOM contained `Local 1 | API 0`.
- The in-app browser DOM contained `Local` and `API` provider buttons.

### Superseded limitation

At this point in the timeline, Ollama had not been installed yet. That was fixed in the next addendum below. The app now defaults to Local/Ollama and uses Anthropic only when the user intentionally selects `API`.

---

## Ollama Install + Local Model Addendum - 2026-05-24

The user asked to move forward with Ollama.

### Machine setup completed

Installed Ollama through winget. The winget command timed out after several minutes, but the installer completed successfully in the background.

Verified:

```text
Ollama version: 0.24.0
Executable: C:\Users\colto\AppData\Local\Programs\Ollama\ollama.exe
Server: http://127.0.0.1:11434
```

Pulled and verified the first practical local model:

```powershell
ollama pull qwen2.5:14b
```

Model details from `ollama list` / `/api/tags`:

```text
Name: qwen2.5:14b
Size: 9.0 GB
Parameter size: 14.8B
Quantization: Q4_K_M
```

Direct Ollama test:

```text
Prompt: Reply with exactly: local ok
Response: local ok
```

The first cold response took about 82 seconds. Once warm, the app route returned a tiny test response in about 14 seconds. Arbiter fast-path returned a local trace in about 6 seconds.

### App configuration changed

`app/.env.local` was updated without printing secrets:

```text
MTG_MODEL_PROVIDER=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:14b
OLLAMA_NUM_CTX=32768
ALLOW_ANTHROPIC_AUTO_FALLBACK=false
```

`app/.env.local.example` now matches those local defaults.

`app/src/lib/server/modelProvider.js` now defaults to:

```text
qwen2.5:14b
num_ctx=32768
```

The 32K context matters because locked deck Oracle/rulings context can exceed Ollama's default 4096-token context once full deck Oracle text, local rulings, agent prompt, engine context, and chat history are attached. After an app request, `ollama ps` should show:

```text
qwen2.5:14b | ... | CONTEXT 32768
```

So the larger context works, but may spill slightly to CPU.

### App route verification

Default `/api/anthropic` route now used Ollama without specifying provider:

```text
status=200
provider=ollama
model=qwen2.5:14b
content: app local ok
```

Arbiter route verification:

```text
POST /api/arbiter provider=ollama fast=true
status=200
provider=ollama
trace returned structured STATE / RESOLUTION / RULE TRACE / VERDICT
```

Model-call summary after local testing:

```text
Ollama total: 2
Ollama ok: 1
Ollama failed: 1
Anthropic total: 0
```

Later tests add more Ollama successes; no Anthropic calls were required.

### Launcher update

`app/start-local.ps1` now:

- Finds Ollama from PATH or `C:\Users\colto\AppData\Local\Programs\Ollama\ollama.exe`.
- Checks `http://127.0.0.1:11434/api/tags`.
- Starts `ollama serve` in a hidden window if Ollama is not responding.
- Warns if Ollama is unavailable.
- Starts the canonical app explicitly on `http://localhost:3001`.

Syntax check passed:

```text
start-local.ps1 parse ok
```

### Important performance note

`qwen2.5:14b` works and runs on the GPU, but it is not instant. It is a good correctness-first local default. If the user wants faster table-side Jace answers, consider pulling a smaller model such as a 7B Qwen model later and adding a Fast Local / Deep Local split.

### Arbiter local Oracle regression fix

While verifying Ollama, a direct `/api/arbiter` test exposed a bad local-model answer:

```text
Question: Can Sol Ring tap for colored mana?
Bad behavior: Arbiter did not have Sol Ring Oracle text and answered as if colored mana was possible.
```

Fix applied:

- Added `app/src/lib/server/cardContext.js`.
- Updated `app/src/app/api/arbiter/route.js`.
- Direct Arbiter calls now auto-attach local Scryfall Oracle/rulings context for card names in the question when the caller did not already provide an explicit card-context block.

Regression result after the fix:

```text
POST /api/arbiter fast=true
provider=ollama
question="Can Sol Ring tap for colored mana?"
verdict says Sol Ring only adds colorless mana unless another effect changes its ability.
```

Current model-call summary after verification:

```text
Anthropic total: 0
Ollama total: 7
Ollama ok: 6
Ollama failed: 1
```

Full locked-deck-sized context check:

```text
Route: POST /api/anthropic
Provider: ollama
Deck context: Vihaan, Goldwaker local Oracle context
Elapsed: about 11 seconds
Result: Karn-style test correctly identified the locked commander as Vihaan, Goldwaker.
```
