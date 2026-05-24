# MTG Tool Roadmap

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

- [ ] Install Ollama (verify the owner has it; recommend models for the RTX 5080)
- [ ] Pull recommended models (Qwen 2.5 32B primary, Qwen 2.5 7B fast)
- [ ] Add Ollama as a provider in the chat infrastructure
- [ ] Default routing: Ollama for all agents
- [ ] Fallback routing: Anthropic if Ollama fails
- [ ] UI toggle: "Local" / "Anthropic" / "Auto"
- [ ] Tune prompts for local model (smaller models need more explicit instructions)
- [ ] Verify each agent gives coherent answers through Ollama
- [ ] Add a cost dashboard showing local vs API calls
- [ ] Track API spend over time so it's visible

---

## Phase 4 — Agent Rewiring + UI Improvements

Fix the things the previous AI half-built.

- [ ] Karn → Arbiter → unified knowledge layer (Karn can finally see Scryfall data)
- [ ] Jace → Arbiter wrapping (Jace silently calls Arbiter for rules-sensitive questions)
- [ ] Tibalt → Arbiter → unified knowledge layer (rules-aware roasts)
- [ ] Deck context hard lock per conversation
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

*(empty — Claude Code populates this)*

---

## Known Limitations / Future Investigations

- RulesGuru API limits (TBD — Claude Code investigates Phase 2)
- Reach out to RulesGuru for a bulk dump request (low priority, if API insufficient)
- Forge integration depth (TBD — Claude Code investigates Phase 2)
- Move from PGLite to Supabase when transitioning to Mac mini
- Server option for if/when local data outgrows the laptop
