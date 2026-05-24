# MTG Tool Roadmap

## Current Addendum - 2026-05-23

The first-run audit and simulated planning docs are complete. Codex also implemented a focused deck-lock/local-Oracle fix before full Phase 1 rollout: loaded decks can now lock per-agent and attach local Oracle text to the conversation context.

Karn also now has a V0 local Scryfall search bridge: `/api/cards?search=...` searches local Oracle data, filters Commander legality/color identity, and can attach compact local candidate pools to Karn deck-building prompts.

Next full sprint remains the Local-First Trust Foundation: provider routing, manual Anthropic fallback, cost visibility, and a unified knowledge service.

This is the working roadmap. Claude Code updates this as phases complete.

## Status: Phase 0 — Initial Setup

Awaiting first Claude Code session. Audit document (`AUDIT.md`) will be produced on first run.

---

## Phase 1 — Foundation (audit + git + critical fixes)

- [ ] Read CLAUDE.md and existing docs
- [ ] Verify Node, git, gstack, GBrain are installed and functional
- [ ] Delete `node_modules/` and `.next/` from working copy
- [ ] `git init` and create `.gitignore`
- [ ] Initial commit
- [ ] Walk owner through GitHub backup setup
- [ ] `npm install`
- [ ] Verify dev server boots
- [ ] Produce `AUDIT.md` covering current state, broken/half-wired things, recommended Phase 1 actions
- [ ] Stop and wait for owner review
- [ ] Execute Phase 1 critical fixes based on audit findings

---

## Phase 2 — Unified Knowledge Layer

The big architectural shift. All data sources local and queryable through Arbiter.

- [ ] Sync all 5 Scryfall bulk datasets to `data/scryfall/`
  - [ ] oracle-cards.json
  - [ ] default-cards.json
  - [ ] all-cards.json
  - [ ] unique-artwork.json
  - [ ] rulings.json
  - [ ] Build indexes (name → card, ID → printings, color → cards, etc.)
  - [ ] Scheduled refresh logic
  - [ ] Versioned backups before refresh
- [ ] RulesGuru full import
  - [ ] Investigate API limits and coverage strategy
  - [ ] Build paginating importer with resume logic
  - [ ] Maximize unique question coverage
  - [ ] Build synthetic fallback question generator
  - [ ] Document the strategy chosen
- [ ] Forge integration
  - [ ] Audit existing Forge-related files (`mtg_forge_lookup.py`, etc.)
  - [ ] Determine what's useful (card scripts? rules data?)
  - [ ] Import to `data/forge/`
  - [ ] Document what was imported and what was skipped
- [ ] Wire mtg-judge codex into runtime retrieval
  - [ ] Build retrieval interface for `_v` and `_t` files
  - [ ] Add addendums section structure for elaborations
  - [ ] Expose codex to Karn, Jace, Tibalt via Arbiter
- [ ] Rebuild Arbiter as a real service
  - [ ] Accepts structured queries (rule question, card lookup, state assessment)
  - [ ] Retrieves from codex, Scryfall data, rulings
  - [ ] Returns structured response with citations
  - [ ] Uses local model for reasoning

---

## Phase 3 — Ollama Integration

Stop bleeding API credits.

- [x] Install Ollama (verified v0.24.0 on Windows)
- [x] Pull first recommended model (`qwen2.5:14b`, 9.0 GB, Q4_K_M)
- [ ] Pull optional fast model for table-side use
- [ ] Pull optional deep model for offline deck analysis
- [x] Add Ollama as a provider in the chat infrastructure
  - [x] V0 provider abstraction shared by `/api/anthropic` and `/api/arbiter`
  - [x] V0 Ollama HTTP adapter for `localhost:11434`
  - [x] V0 no-cost failure response when Ollama is unavailable
- [x] Default routing: Ollama for all agents
- [ ] Fallback routing: Anthropic if Ollama fails
- [ ] UI toggle: "Local" / "Anthropic" / "Auto"
  - [x] V0 Local/API manual switch in app header
  - [ ] Auto mode UI
- [ ] Tune prompts for local model (smaller models need more explicit instructions)
- [ ] Verify each agent gives coherent answers through Ollama
  - [x] Arbiter route verified through Ollama with local Oracle auto-context for named cards
- [ ] Add a cost dashboard showing local vs API calls
  - [x] V0 private provider-call metadata log
  - [x] V0 header badge with local/API call counts
  - [ ] Full visible dashboard UI
- [ ] Track API spend over time so it's visible
  - [x] V0 route-level provider/status/count logging
  - [ ] Dollar estimate and daily/session rollups

---

## Phase 4 — Agent Rewiring + UI Improvements

Fix the things the previous AI half-built.

- [ ] Karn → Arbiter → unified knowledge layer (Karn can finally see Scryfall data)
  - [x] V0 local Scryfall deck Oracle attachment
  - [x] V0 local Scryfall rulings attachment for locked decks
  - [x] V0 local Scryfall search candidate context for Karn
  - [x] V0 source receipt for locked-deck card data
  - [ ] Route through final KnowledgeService/Arbiter abstraction
- [ ] Jace → Arbiter wrapping (Jace silently calls Arbiter for rules-sensitive questions)
- [ ] Tibalt → Arbiter → unified knowledge layer (rules-aware roasts)
- [ ] Deck context hard lock per conversation
  - [x] V0 per-agent lock snapshot for Jace/Karn/Tibalt/Arbiter
  - [x] Locked deck triggers local Oracle/rulings context attachment
  - [x] Locked deck triggers local engine/rules fringe-context retrieval
  - [x] Unlock Deck and Unload Deck controls
  - [ ] Full chat session manager with multiple active/archived conversations
- [ ] Chat session manager UI
  - [ ] List of active chats grouped by agent
  - [ ] Show locked deck per chat
  - [ ] "New chat" button (select agent + deck context)
  - [ ] "Close/archive chat" button
  - [ ] Easy switching between active chats
- [ ] "View Arbiter Trace" toggle for Jace's rules answers
- [ ] In-app feedback capture system (so real usage feeds back into priorities)

---

## Phase 5 — Garfield Goldfish Improvements

Better simulation, smarter play.

- [ ] Smarter mulligan logic per archetype
- [ ] Commander-specific play priorities (voltron, combo, control, aristocrats, etc.)
- [ ] Better card classification using full Scryfall data
- [ ] Save game records to `data/games/`
- [ ] Trend analysis across multiple games per deck
- [ ] Surface insights ("this deck floods 30% of the time")

---

## Phase 6 — Learn-to-Play Mode

Major separate roadmap. Do not start until Phases 1-5 are solid.

- [ ] Design doc for the curriculum (what knowledge at which level)
- [ ] Game state model (battlefield, hand, stack, graveyard, exile, command, library)
- [ ] Legal action generator
- [ ] Opponent profiles (deck personalities to play against)
- [ ] Beginner mode (explain every step)
- [ ] Intermediate mode (explain key decisions)
- [ ] Expert mode (play at speed, explain mistakes)
- [ ] Saved learning sessions and progress tracking
- [ ] Integration with Arbiter for rule accuracy
- [ ] Integration with Jace voice for explanations

---

## Phase 7+ — Continuous Improvement

- [ ] In-app feedback review and prioritization
- [ ] Codex (mtg-judge) addendums for clarifications as they come up
- [ ] Cost reduction (less Anthropic, more local)
- [ ] Performance optimization (Scryfall indexes, query caching)
- [ ] Mac mini migration when ready
- [ ] Consider server option (Weaviate / Qdrant / Supabase) if local outgrows the laptop

---

## Decisions Log

Significant architectural decisions get logged here as they're made.

- 2026-05-23: Deck context is now split into two UX concepts: **loaded deck** (sidebar selection) and **locked deck** (immutable per-agent conversation snapshot). `Unlock` removes the current agent's snapshot while keeping chat history. `Unload` clears the sidebar deck selection. A locked deck triggers local Scryfall Oracle text attachment for the deck's non-token cards.
- 2026-05-23: Local Scryfall is the source of truth for normal chat card data. The owner will update local Scryfall data when cards change. Karn now receives local Scryfall search candidate pools for deck-building prompts, but model generation is still Anthropic until Ollama/provider routing is implemented.
- 2026-05-23: Locked deck context now attaches a local-first fact bundle: Oracle text, local rulings capped per card, source receipt, and local `/api/engine` rules/fringe context. Live Scryfall fallback is allowed only for missing card facts, not normal search.
- 2026-05-23: ModelProvider V0 added. `/api/anthropic` remains backward-compatible but can route to Ollama via provider settings. `/api/arbiter` now uses the same provider layer. Automatic paid fallback is off by default; Ollama failures return a visible error instead of silently spending Anthropic credits.
- 2026-05-23: Provider/cost telemetry V0 added at `app/data/model-calls.local.json`. It logs provider/model/status/count metadata only, not prompt text, and is ignored by git.
- 2026-05-23: Provider status is now visible in the app header as `Local N | API N`, fed by `GET /api/model-calls`.
- 2026-05-23: Manual Local/API provider switch added to the app header. Chat messages and silent Arbiter trace calls pass the selected provider. The choice is saved in browser local storage as `mtg-model-provider`.
- 2026-05-23: Provider default is now Local/Ollama for cost safety. Anthropic is only used when the user selects `API` or explicitly configures the provider to `anthropic`.
- 2026-05-24: Ollama installed and verified on Windows. `qwen2.5:14b` is pulled, configured as the app default, and verified through `/api/anthropic` and `/api/arbiter`. Ollama context default raised to 32K for locked-deck Oracle/rulings prompts.
- 2026-05-24: `/api/arbiter` now auto-attaches local Scryfall Oracle/rulings context for card names in direct Arbiter questions when the caller did not already provide a card context block. This fixes direct local-model rules calls that mention cards outside the chat UI's client-side context builder.
- 2026-05-23: The canonical project is `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`. The older Codex project may still run on port 3000; use `http://localhost:3001` for the canonical project when port 3000 is occupied.

---

## Known Limitations / Future Investigations

- RulesGuru API limits (TBD — Claude Code investigates Phase 2)
- Reach out to RulesGuru for a bulk dump request (low priority, if API insufficient)
- Forge integration depth (TBD — Claude Code investigates Phase 2)
- Move from PGLite to Supabase when transitioning to Mac mini
- Server option for if/when local data outgrows the laptop
