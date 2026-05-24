# MTG Tool App

Personal Commander/EDH rules and deck assistant.

Current goal: run the app locally on this Windows PC while it is still in development.

Later goal: move the finished app to a private Mac mini server for personal use and maybe 2-3 trusted users. It is not designed as a public SaaS app.

## What Is Connected

- `src/components/MTGAssistant.jsx` is the main browser UI shell.
- `src/app/api/anthropic/route.js` is the private backend endpoint that talks to Anthropic.
- `src/app/api/arbiter/route.js` is the backend rules-engine endpoint Jace can consult for formal traces.
- `src/app/api/cards/route.js` reads the local Scryfall Oracle/rulings repository.
- `src/app/api/chats/route.js` mirrors chat history to a local JSON file.
- `src/app/api/decks/route.js` mirrors saved deck memory to a local JSON file.
- `src/app/api/engine/route.js` does rule-aware retrieval over local `MTG ENGINE` markdown, `META_query_router.md`, `META_layer_index.md`, and `mtg-judge` CR JSON.
- `src/app/api/symbolic-engine/route.js` runs the first deterministic local rules executor without AI calls.
- The browser calls `/api/anthropic`, so the Anthropic API key stays on the server and is not exposed in frontend code.
- Card lookup prefers the local Scryfall Oracle repository, then falls back to Scryfall's public API if the local repository is missing or stale.
- `src/data/deckSeeds.js` is the built-in deck memory seed list for Colton's and Joe's saved Commander decks.
- `src/lib/agents.js` holds Jace, Karn, Tibalt, and Arbiter prompts/config.
- `src/lib/deckMemory.js` holds deck parsing, token separation, seed merging helpers, and deck memory serialization.
- `src/lib/scryfall.js` holds Scryfall search/card/rulings helpers.
- `docs/APP_ROADMAP.md` is the quick handoff map for Jace, Karn, Tibalt, Arbiter, and future Garfield work.

## Deck Memory

Saved decks are mirrored to:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\data\decks.local.json
```

The browser also keeps a backup under `mtg-decks-v3`. On startup, the app loads the local file first, then browser storage, then merges decks from `src/data/deckSeeds.js` by owner plus deck name, so seeded personal decks survive resets without overwriting edited local copies.

The saved deck sidebar includes full-library safety controls:

- `Export Library` downloads every saved deck, note, roast, Karn plan, and game entry as JSON.
- `Backup Library` creates a timestamped copy under `data\backups`.
- `Import Library` merges a previously exported JSON library back into the app.

Typing in deck notes, board snapshots, and saved agent notes updates browser storage immediately, then batches the local file write after a short pause. Imports, deletes, and manual backups still save immediately.

Chat history is mirrored to:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\data\chats.local.json
```

The browser still keeps a quick copy, but the file-backed chat history is the crash-resistant source after it exists.

Known Scryfall token names are kept in `public/token-names.json`. When a deck import includes token rows, the parser moves those entries into a separate `Tokens` section so deck size, Karn analysis, and Tibalt roasts focus on the real Commander deck.

## Local Card Data

The app keeps local Scryfall Oracle and ruling data here:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\data\scryfall.oracle.local.json
C:\Users\colto\Documents\Codex\MTG TOOL\app\data\scryfall.rulings.local.json
```

Refresh the local card repository:

```powershell
npm.cmd run sync:oracle
```

Refresh local card and token catalogs together:

```powershell
npm.cmd run sync:local-data
```

The current local sync writes tens of thousands of Oracle cards and WOTC/Scryfall rulings. Karn, Jace, Tibalt, deck analytics, and hover previews should prefer this local repository before making live Scryfall calls.

Full Scryfall bulk archive:

```powershell
npm.cmd run sync:scryfall-bulk
```

This writes every Scryfall bulk dataset to:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\data\scryfall-bulk
```

The compact Oracle/ruling repository is what the app reads at runtime. The full bulk folder is the raw archive for future indexing, search, and server/vector-store migration.

## Local Engine Data

The app has a first local retrieval bridge over:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\MTG ENGINE
C:\Users\colto\Documents\Codex\MTG TOOL\mtg-judge
```

`/api/engine` now performs direct Comprehensive Rules JSON lookup first, then ranks local engine layer files with query-router/layer hints. That means rules questions like commander tax, replacement effects, layers, priority, triggers, SBAs, and copy effects can pull exact CR entries plus the relevant MTG ENGINE execution snippets instead of only nearby keyword matches.

The first symbolic executor lives in:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\src\lib\symbolicEngine.cjs
```

It implements the local L00-style pipeline as executable code: would-event, replacement effects, final event, trigger detection, SBA checkpoint, trigger insertion, and priority. Current covered primitives include commander tax, commander zone movement, Rest in Peace/Leyline-style graveyard replacement, shield counters, simple dies/ETB triggers, lethal damage SBAs, token cleanup, APNAP trigger insertion, and custom action payloads.

The first card adapter lives in:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\app\src\lib\symbolicCardAdapter.cjs
```

It reads the local Scryfall Oracle repository and turns real card names into symbolic objects with types, mana value, power/toughness, keywords, Oracle text metadata, and supported executable abilities. Current adapter-backed abilities include Rest in Peace/Leyline graveyard replacement patterns, Anafenza-style opponent nontoken creature replacement, Blood Artist/Zulaport/Cruel Celebrant life-drain dies triggers, Soul Warden-style creature ETB life gain, Impact Tremors/Purphoros creature ETB damage, Koma upkeep token creation, Swords/Path target creature exile, Murder target creature destroy, Lightning Bolt damage, shield-counter damage prevention, indestructible lethal-damage survival, Counterspell target spell countering, can't-be-countered protection, ETB trigger marking, and keyword tags.

Check the symbolic executor without AI calls:

```powershell
npm.cmd run check:symbolic-engine
```

Inspect the symbolic API:

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/symbolic-engine -UseBasicParsing
```

Run a fixture:

```powershell
$body = @{ scenario = "rest-in-peace-dies" } | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/api/symbolic-engine -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

Inspect how a real card hydrates:

```powershell
$body = @{ card = "Blood Artist" } | ConvertTo-Json
Invoke-WebRequest -Uri http://localhost:3000/api/symbolic-engine -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

Run an adapter-backed state from card names:

```powershell
$body = @{
  hydrateCards = $true
  state = @{
    players = @(@{ id = "p1"; name = "Colton" }, @{ id = "p2"; name = "Opponent" })
    cardZones = @{
      battlefield = @(
        @{ id = "rip"; cardName = "Rest in Peace"; ownerId = "p1"; controllerId = "p1" },
        @{ id = "artist"; cardName = "Blood Artist"; ownerId = "p1"; controllerId = "p1" },
        @{ id = "bear"; cardName = "Runeclaw Bear"; ownerId = "p2"; controllerId = "p2" }
      )
    }
  }
  actions = @(
    @{ type = "MOVE_OBJECT"; objectId = "bear"; toZone = "graveyard" },
    @{ type = "CHECKPOINT" }
  )
} | ConvertTo-Json -Depth 6
Invoke-WebRequest -Uri http://localhost:3000/api/symbolic-engine -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
```

`mtg-judge` is not empty on disk; it currently contains the core suite, expanded suite, RulesGuru suite, CR JSON, validation scripts, and imported rules data. If it looks empty from inside the app, that means a runtime bridge is incomplete, not that the folder has no files.

Check the engine/judge files:

```powershell
npm.cmd run check:engine
```

Karn now locks to a deck snapshot at the start of a Karn conversation. Switching the active deck later does not silently change the deck Karn is analyzing. Clear Karn's chat to unlock and start a new deck conversation.

## Arbiter As Backend

Arbiter is now a backend-first rules engine. The normal user-facing flow is to ask Jace a rules question. If the prompt looks rules-sensitive, Jace asks `/api/arbiter` for a formal trace, then translates that trace into table language. The raw Arbiter agent is hidden from the main agent selector so the app feels cleaner, but the prompt and validation harness remain available for debugging and tests.

When Jace uses Arbiter, the chat response includes a collapsed `View Arbiter Trace` section so you can inspect the formal state/resolution/citation output without making Arbiter the main personality.

The deck command center also has a Board / Rules Snapshot field. Use it for battlefield, graveyard, exile, stack, active player, phase, counters, commander tax, and other state that Jace-Arbiter should consider.

Important current limit: Arbiter is connected to the app and Jace/Karn/Arbiter can receive routed local engine context, including direct CR JSON entries. A first symbolic executor now exists locally, but the live chat answer path still uses Anthropic for language generation and does not yet translate arbitrary Oracle text into executable symbolic card adapters. Treat `/api/engine` as grounded retrieval and `/api/symbolic-engine` as the growing deterministic execution core.

The judge engine should not be described as finite or exhaustive yet. The written rules corpus is finite, and the app has finite validation suites, but real Magic board states and card combinations are too large to exhaustively prove. The target behavior is bounded, versioned, testable, and willing to return `UNRESOLVED` when facts are missing.

## Garfield Goldfish

Garfield v1 lives in the deck command center. It runs a simple saved-deck goldfish:

- draw an opening hand
- mulligan bad openers up to two times
- simulate turns 1-6
- play lands
- estimate ramp, draw, interaction, threats, and commander timing
- score execution out of 100
- save the result into deck memory and the game log
- run one sample or a 10-run consistency batch
- automatically hydrate Scryfall analytics before simulating when analytics are not already loaded

The manual Load Analytics button is still available when you want to inspect stats before running a simulation.

Planned Garfield teaching mode:

- choose an uploaded deck or a pre-saved deck as the learner deck
- play against opponent decks from the saved deck database
- teach every step, action, priority window, trigger, SBA, stack interaction, and rules consequence
- offer three explanation levels: beginner, intermediate, and expert
- save game knowledge so Garfield can improve deck-specific coaching, sequencing advice, mulligan advice, matchup notes, and card-performance memory over time

This is intentionally a later phase. Finish the current core roadmap first: stable deck memory, judge update/health flow, Arbiter retrieval, Karn/Tibalt saved-history workflow, and the UI split. Before building the full Garfield mode, define exactly what rules and strategy knowledge belongs at each level so Garfield can explain the same board state differently for a new player, a regular Commander player, or an expert pilot.

## Agent Histories

Karn and Tibalt can now save structured history per deck:

- Karn plans are saved to `deck.memory.karnPlans`
- Tibalt roasts are saved to `deck.memory.tibaltRoasts`
- Saved entries keep a deck snapshot and show how many cards have changed since the plan/roast was saved

Use these when iterating a deck over time instead of overwriting the general notes box.

Refresh local card/token catalogs with:

```powershell
npm.cmd run sync:oracle
npm.cmd run refresh-card-names
npm.cmd run refresh-tokens
```

Check the saved deck library without calling any AI or card APIs:

```powershell
npm.cmd run check:decks
```

Check the local Oracle repository without calling any AI or card APIs:

```powershell
npm.cmd run check:oracle
```

Check the local MTG ENGINE and mtg-judge library:

```powershell
npm.cmd run check:engine
```

## Arbiter Knowledge Validation

The app includes a local validation harness for the Arbiter rules engine. It reads:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\mtg-judge\META_test_cases.md
C:\Users\colto\Documents\Codex\MTG TOOL\mtg-judge\META_test_cases_expanded.md
```

The combined suite has 500 cases: 76 handcrafted core scenarios plus 424 generated rule-anchor scenarios connected to the MTG ENGINE layer docs. Coverage notes live in:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\mtg-judge\META_test_suite_coverage.md
```

Regenerate the expanded suite from local CR data:

```powershell
npm.cmd run generate:arbiter-suite
```

Dry-run the knowledge base without spending API calls:

```powershell
npm.cmd run validate:arbiter -- --suite all --dry-run --all
```

Run a small live batch through the app endpoint:

```powershell
npm.cmd run validate:arbiter -- --category A --limit 3 --report reports/arbiter-category-A.md
```

Run one specific scenario:

```powershell
npm.cmd run validate:arbiter -- --test A1 --report reports/arbiter-A1.md
```

Run the full suite only when you are comfortable spending the API calls:

```powershell
npm.cmd run validate:arbiter -- --suite all --all --report reports/arbiter-full-500.md
```

Import a separate RulesGuru benchmark suite without using Anthropic:

```powershell
npm.cmd run import:rulesguru
```

That writes:

```text
C:\Users\colto\Documents\Codex\MTG TOOL\mtg-judge\META_test_cases_rulesguru.md
```

Dry-run the imported RulesGuru questions:

```powershell
npm.cmd run validate:arbiter -- --suite rulesguru --dry-run --all
```

Run a small live batch from the RulesGuru suite through Arbiter:

```powershell
npm.cmd run validate:arbiter -- --suite rulesguru --limit 5 --report reports/arbiter-rulesguru-sample.md
```

## Run On This PC

Easiest option:

Double-click:

```text
Launch MTG Tool.cmd
```

Optional: double-click this once to add an `MTG Tool` shortcut to your Windows desktop:

```text
Install Desktop Shortcut.cmd
```

That opens the app at:

```text
http://localhost:3000
```

Leave the launcher window open while using the app. Press Enter in that window when you want to stop the local server.

Developer option:

From PowerShell:

```powershell
cd "C:\Users\colto\Documents\Codex\MTG TOOL\app"
.\start-local.ps1
```

Then open:

```text
http://localhost:3000
```

Leave the PowerShell window open while using the app.

## Manual Local Setup

From this folder:

```powershell
npm.cmd install
Copy-Item .env.local.example .env.local
```

Edit `.env.local` and set:

```text
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Then run:

```powershell
npm.cmd run dev
```

Open:

```text
http://localhost:3000
```

## API Key

The app can load without an API key, but judge/chat answers need Anthropic.

Create `.env.local` from `.env.local.example`, then set:

```text
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-sonnet-4-20250514
```

Restart the local app after changing `.env.local`.

## Mac Mini Server Notes

On the Mac mini, the same app can run with:

```bash
npm install
cp .env.local.example .env.local
npm run build
npm run start
```

For a private home setup, the simplest options are:

- Use it only on your local network at `http://mac-mini-name.local:3000`.
- Put it behind Tailscale if you want access away from home without exposing it publicly.
- Add a lightweight login gate before sharing it with anyone else.

Because this app calls a paid AI API, do not expose it openly to the internet without authentication and rate limiting.
