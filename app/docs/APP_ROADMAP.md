# MTG Tool Roadmap

This app is local-first on Colton's Windows PC. Do not optimize for the Mac mini move until the tool is useful locally.

## Agent Roles

- Jace: broad MTG chat assistant. Answers general questions and can use active deck memory.
- Karn: deck builder and deck assistant. Works from saved deck lists, card data, and deck memory.
- Tibalt: commander-specific deck roaster. Roasts the commander plan, the 99, mana base, curve, interaction, win lines, and suspicious pet cards.
- Arbiter: backend rules and engine source of truth. Jace is the normal face; Arbiter supplies formal traces.
- Garfield: simulator/stat engine and future learn-to-play coach for imported decks and learned game history. V1 is a goldfish runner.

## Current Foundation

- Deck seeds live in `src/data/deckSeeds.js`.
- Agent prompts live in `src/lib/agents.js`.
- Deck parsing/memory helpers live in `src/lib/deckMemory.js`.
- Scryfall helpers live in `src/lib/scryfall.js`; the app now prefers the local Oracle repository before live Scryfall calls.
- Full Scryfall bulk data can be downloaded with `npm.cmd run sync:scryfall-bulk` into `data/scryfall-bulk`; the compact Oracle/rulings files remain the runtime path.
- Saved deck memory is mirrored to `data/decks.local.json`, with browser storage under `mtg-decks-v3` as backup.
- Chat history is mirrored to `data/chats.local.json`, with browser storage as a fast fallback.
- Local Oracle/ruling data lives in `data/scryfall.oracle.local.json` and `data/scryfall.rulings.local.json`.
- `npm.cmd run sync:oracle` refreshes local Scryfall Oracle cards, rulings, and `public/card-names.json`.
- `/api/engine` performs rule-aware retrieval: direct CR JSON lookup, `META_query_router.md`/`META_layer_index.md` route hints, and ranked local MTG ENGINE snippets.
- `/api/symbolic-engine` exposes the first local deterministic rules executor. It runs supported rule primitives without AI calls and returns an execution trace.
- `npm.cmd run check:engine` verifies the local engine and judge files are present.
- `npm.cmd run check:symbolic-engine` runs deterministic symbolic scenarios for replacement effects, dies triggers, commander tax, commander zone movement, shield counters, lethal damage SBAs, adapter-backed real card-name hydration, life-drain trigger resolution, Koma/Soul Warden token-trigger chains, basic stack interaction spells such as Swords, Murder, Counterspell, can't-be-countered Koma, shield-counter damage prevention, and indestructible lethal-damage survival.
- Deck note edits are debounced before writing the local JSON file; imports, deletes, and explicit backups save immediately.
- The saved deck sidebar can export the whole library, import a previous library JSON, and create timestamped backups under `data/backups`.
- Seeds merge into local deck memory by owner plus deck name, so Joe's and Colton's decks stay separate.
- Known Scryfall token names are stored in `public/token-names.json`.
- Known Scryfall card names are stored in `public/card-names.json`.
- Token rows are saved in their own `Tokens` section and ignored by normal Commander deck counts.
- The deck view now works as a command center with deck stats, one-click Jace/Karn/Tibalt prompts, Arbiter question prep, saved agent notes, and game logs.
- The visible agent list is Jace, Karn, and Tibalt. Jace consults Arbiter in the background for rules-sensitive questions.
- Jace responses that used Arbiter expose the raw formal trace behind a collapsed "View Arbiter Trace" control.
- The deck command center includes a Board / Rules Snapshot field for stateful Jace-Arbiter questions.
- Arbiter is wired into the app through `/api/arbiter`. Jace/Karn/Arbiter can now receive direct local CR JSON entries and routed MTG ENGINE layer snippets through `/api/engine`. The new symbolic executor covers the first deterministic rule primitives, and the first Scryfall-to-symbolic adapter can hydrate real card names into executable object capabilities. Arbitrary Oracle text still needs broader adapters before chat can hand every scenario to code.
- Karn conversations now lock to the active deck snapshot when the conversation starts. Switching the sidebar deck does not silently change an existing Karn analysis thread.
- Karn plans and Tibalt roasts can be saved as structured per-deck histories.
- Saved Karn/Tibalt history entries keep a deck snapshot and show how many cards changed since the note was saved.
- Garfield Goldfish v1 simulates opening hand plus turns 1-6, auto-loads Scryfall analytics, includes mulligans and 10-run batches, and saves runs to deck memory/game logs.

## Garfield Learn-To-Play Mode

Long-term Garfield should become a teaching engine, not only a simulator. A user should be able to upload a deck or choose a pre-saved deck, choose opponent decks from the local library, and be coached through a full game with rules, decisions, sequencing, and stack actions explained as they happen.

This is a post-foundation roadmap track. Do not fully roadmap or build the comprehensive Garfield teaching engine until the current app roadmap is mostly complete: stable deck memory, judge update/health flow, Arbiter retrieval, Karn/Tibalt saved-history workflow, and the core UI split. Until then, Garfield work should stay limited to goldfish scoring, data capture, and small architecture choices that will not need to be thrown away.

Core requirements:

1. Support uploaded decks and pre-saved decks as the learner's deck.
2. Support opponent decks from the local deck database, starting with scripted profiles before full autonomous play.
3. Teach through every game step: untap, upkeep, draw, main phases, combat, end step, priority windows, stack usage, triggers, SBAs, replacement effects, and legal actions.
4. Explain every player action at the chosen skill level, including why the action is legal, what alternatives exist, and what the likely strategic consequence is.
5. Record game knowledge after each teaching game so Garfield can improve deck-specific coaching, common mistakes, mulligan advice, sequencing heuristics, matchup notes, and card performance.
6. Include three teaching levels:
   - Beginner: explain turn structure, card types, mana, priority only when it matters, obvious legal actions, combat basics, and why simple choices are good or bad.
   - Intermediate: explain stack timing, triggers, replacement effects, sequencing, threat assessment, resource trading, mulligans, combat math, and commander-specific game plans.
   - Expert: explain shortcut handling, priority traps, layered/rules-dense interactions, probabilistic lines, matchup-specific role assignment, hidden information assumptions, and tight sequencing with minimal hand-holding.
7. Let the skill level change mid-game so the same board state can be explained in beginner, intermediate, or expert language.
8. Use Arbiter for rules-grounded action validation and Jace for plain-English teaching when a rules interaction is complex.
9. Keep a "knowledge parsed by level" design document before implementation, so we decide exactly which rules, strategy concepts, and UI explanations belong at each level.

After the current roadmap is complete, create a dedicated Garfield master roadmap covering:

1. Game-state model and legal-action model.
2. Opponent deck profiles and scripted play policies.
3. Teaching-level curriculum for beginner, intermediate, and expert.
4. Arbiter integration for action validation.
5. Jace integration for explanations.
6. Saved learning memory from completed games.
7. Player-facing UI for hand, battlefield, stack, turn structure, choices, and explanations.
8. Evaluation metrics: win/loss, mistake tracking, missed triggers, sequencing errors, matchup notes, and card-performance stats.

## Judge Engine Gaps To Close

These are required before calling the judge engine fully production-ready:

1. Add a one-command rules update pipeline that fetches or imports the newest official Comprehensive Rules, updates `knowledge/mtg-judge/data/cr/cr_current.json`, records the CR effective date, regenerates expanded validation cases, and reports what changed.
2. Update Arbiter/Jace prompts from the rules baseline automatically or from a generated rules summary, instead of hand-maintaining the CR date and rule anchors in `src/lib/agents.js`.
3. Add a visible Arbiter health/version panel in the app showing current CR baseline, local CR file date, last validation run, RulesGuru import count, and whether the judge suite is stale.
4. Continue improving runtime retrieval quality after the first rule-aware pass: add citation-aware answer grading, card-specific interaction routing, and stronger ranking for multi-card layer/replacement/copy questions.
5. Add a regression gate command that runs deck checks, the 500 local Arbiter dry-run parse, a small live Arbiter sample, and a RulesGuru sample before marking a rules update as accepted.
6. Maintain an explicit "known limits" file for Arbiter. The engine should be bounded and deterministic where it has enough state, but it should not claim exhaustive correctness for every possible Magic board state/card combination.
7. Expand validation from fixed questions into generated scenario families for the hardest areas: replacement ordering, layers/dependencies, linked abilities, copies, loops/shortcuts, multiplayer APNAP, commander replacement/tax/damage, and newly released mechanics.
8. Expand the symbolic card-adapter system beyond the first patterns: target parsing, activated abilities, modal choices, replacement chooser prompts, static layer effects, copy effects, and generated token definitions.
9. Add a symbolic state editor in the app so board snapshots can be converted into executable objects instead of only prompt text.

## Local Agent And Cost-Control Roadmap

The current app still uses Anthropic for Jace, Karn, Tibalt, and Arbiter language generation. Immediate cost control now limits the chat history sent per request, but the long-term target is local-first agent operation.

Required path:

1. Persist all chat, deck, card, rule, and game memory locally first. Crash recovery should not depend on browser storage.
2. Keep local card/ruling data current with `sync:oracle`, and make every agent prefer local Oracle context before live APIs.
3. Add an agent context planner that sends only the relevant locked deck snapshot, card text, rules, and recent messages instead of the whole conversation.
4. Add local summarization/memory compaction per agent so old chats become durable notes instead of repeated API context.
5. Add a pluggable model provider layer: Anthropic now, local CLI/provider later.
6. Investigate local model runners for this Windows PC once the data contracts are stable: Ollama, llama.cpp, LM Studio, or a custom CLI wrapper.
7. If local data outgrows this PC, move retrieval storage to a server option such as Weaviate/Qdrant/Postgres vector search while keeping the same app-level data contracts.
8. Arbiter should remain stricter than chat agents: local retrieval plus validation gates first, local model execution only after outputs are reliable enough.

## Good Next Builds

1. Build the judge engine update/health flow from the Judge Engine Gaps list.
2. Grow `/api/symbolic-engine` into the source-of-truth executor for supported scenarios, then make Arbiter call it before falling back to language-only trace generation.
3. Build the local-agent cost-control layer: context planner, memory compaction, and pluggable provider.
4. Make Karn plans machine-readable: parse cuts/adds/maybe-board/testing plan into structured fields.
5. Add a dedicated Tibalt roast view with richer old-roast versus current-list comparison.
6. Improve Garfield goldfish with commander-specific priorities and archetype-aware sequencing.
7. Add scripted opposing deck profiles for Garfield after goldfish scoring is stable.
8. Split the remaining large UI component into smaller view components once the command center layout stabilizes.
9. After the current roadmap is mostly complete, start the dedicated Garfield master roadmap for the fully encompassed learn-to-play/simulation engine.

## Decisions Needed Later

- Whether Tibalt should roast in PG-13 mode only or support adjustable heat levels.
- Whether deck ownership should support more people than Colton and Joe as first-class library filters.
- Whether Garfield should next become a scripted-opponent simulator or a smarter goldfish coach.
- What exact rules/strategy knowledge belongs in Garfield's beginner, intermediate, and expert teaching levels.
