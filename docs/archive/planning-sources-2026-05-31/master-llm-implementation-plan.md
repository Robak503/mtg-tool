# MTG Tool Master LLM Implementation Plan

Date: 2026-05-31

Purpose: this file consolidates three prior reviews into one master implementation plan that another LLM or coding agent can read and execute without needing the original conversation.

Source reviews consolidated:

1. Full code, structure, security, tooling, and maintainability review.
2. Product and public-release readiness review.
3. Public web feature research from MTG deckbuilding, collection, scanner, playtest, and Commander tool communities.

No implementation has been done as part of this document. This is a work plan.

## How To Use This File

Read this file first, then implement one task or one phase at a time.

Rules for future LLM agents:

1. Do not attempt all work in one PR.
2. Keep each PR focused on one task group.
3. Before changing code, inspect current files because the repo may have moved on.
4. Preserve user data and local-first behavior.
5. Prefer local data and local Ollama by default.
6. Do not introduce cloud calls without explicit user control and clear UI copy.
7. Add or update tests for every behavior change.
8. Run targeted tests first, then full tests and lint before handoff.
9. Do not remove user changes or unrelated dirty worktree changes.
10. Update docs and changelog when user-facing behavior changes.

Recommended verification baseline:

```powershell
cd app
npm.cmd test
npm.cmd run lint
npm.cmd run deadcode
npm.cmd audit --omit=dev
```

Only run a build when the task requires build verification:

```powershell
cd app
npm.cmd run build
npm.cmd run tauri:build
```

## Product North Star

MTG Tool should become a local-first Commander workbench that connects:

- what the user owns
- what the user is building
- what the user is missing
- how the deck plays
- how strong the deck is
- what the pod will think
- what should change next
- how to practice the deck

Best positioning:

MTG Tool is a local-first Windows desktop assistant for Commander players who want to understand, tune, track, and practice their decks without sending everything to the cloud.

Do not position it as:

- a complete tournament judge replacement
- a full MTG rules engine
- a universal social collection platform
- a mobile-first app
- a finished learn-to-play simulator

Recommended stability labels:

- Stable: chat, deck import, deck sessions, The Vault collection manager, updates/data sync, feedback capture.
- Beta: goldfish scoring, deck power ranking, deck-cost optimization.
- Preview: The Academy learn-to-play, 4-player Commander simulation, Expert mode.

## Current App Surface

Known current features:

- Next.js 15 plus React 19 app.
- Tauri 2 Windows desktop shell.
- Bundled local Node runtime.
- Local-first data directory.
- Local Ollama default with Anthropic opt-in fallback.
- Jace, Karn, Tibalt as front-facing agents.
- Arbiter as hidden local-only rules engine.
- Garfield as goldfish and learn-to-play engine.
- Multi-session chat.
- Per-session locked deck snapshots.
- Chat archive, rename, export, and clear.
- Arbiter trace and source display.
- Message thumbs up/down feedback.
- Floating feedback modal and feedback inbox.
- Deck import by paste, Moxfield URL, and Archidekt URL.
- Saved deck library.
- Deck notes, owner, tags, power-level memory, board snapshot.
- Right-panel card search, stats, and legality.
- Garfield goldfish simulation and saved game records.
- The Vault collection manager.
- Exact printing, finish, treatment, quantity, condition, notes.
- Wishlist and color tags.
- CSV import for collection.
- Collection value, price refresh, Card Kingdom fallback.
- Cross-deck conflicts.
- Deck cost-to-finish panel.
- The Academy learn-to-play mode.
- Standard 1v1 and Commander 4P setup.
- Table strip and Ask Jace mid-game.
- In-app data sync.
- App update modal.
- Ollama health/install/model-pull banner.

## Global Priorities

Use this order unless the user says otherwise:

1. Safety and correctness fixes.
2. Public release readiness.
3. User data import/export and backup.
4. Collection-aware deckbuilding.
5. Deck report and actionable Karn workflows.
6. Deck versioning and diffs.
7. Academy and goldfish polish.
8. Larger refactors.
9. Future differentiators.

## Workstream A: Critical Safety And Correctness

### A1. Fix Feedback Bundle Path Traversal

Priority: P0

Files:

- `app/src/app/api/feedback/bundle/route.js`

Problem:

Imported feedback bundle timestamps are used to build filenames. Current sanitization does not strip path separators or `..`, so malicious bundle data could write outside the intended feedback directory.

Implementation:

1. Treat imported timestamp as display metadata only.
2. Generate server-side filenames.
3. If timestamp is accepted, validate it strictly as ISO date.
4. Sanitize with basename-only policy.
5. Resolve final write path.
6. Assert resolved path starts inside `FEEDBACK_DIR`.
7. Reject invalid entries with safe error messages.

Tests:

- Import timestamp with `../`.
- Import timestamp with `..\\`.
- Import timestamp with absolute path attempt.
- Import valid bundle still works.
- Duplicate entries still dedupe correctly.

Acceptance criteria:

- No imported field can alter the feedback output directory.
- Tests prove traversal fails safely.

### A2. Preserve Chat And Session Metadata

Priority: P0

Files:

- `app/src/app/api/chats/route.js`
- `app/src/hooks/useChatSessions.js`
- related chat tests

Problem:

Chat persistence normalizes away important fields such as `deckDeclined`, message ids, retry metadata, source receipts, and Arbiter metadata.

Implementation:

1. Extend session normalization to preserve:
   - `deckDeclined`
   - relevant deck-selection state
   - future feature flags only if safe
2. Extend message normalization to preserve:
   - `id`
   - `isError`
   - `fallbackAvailable`
   - `originalPrompt`
   - `errorProvider`
   - `factReceipt`
   - `arbiterStatus`
   - `arbiterSources`
   - `arbiterTrace`
3. Keep a strict allowlist. Do not persist arbitrary unknown fields.
4. Add migration/backward compatibility tests.

Tests:

- Save and reload session with `deckDeclined`.
- Save and reload assistant message with `factReceipt`.
- Save and reload error message with retry metadata.
- Old sessions without these fields still load.

Acceptance criteria:

- Deck-required-agent flow survives app reload.
- Retry/fallback buttons survive app reload when appropriate.
- Arbiter sources and trust metadata survive app reload.

### A3. Strict Model Provider Selection

Priority: P0

Files:

- `app/src/lib/server/modelProvider.js`
- `app/src/app/api/chat-stream/route.js`
- model provider tests

Problem:

Unexpected provider strings can route to Anthropic instead of failing or staying local.

Implementation:

1. Create `normalizeProvider(input)` with explicit allowlist.
2. Allow:
   - `fast`
   - `deep`
   - `ollama`
   - `local`
   - `anthropic`
   - `api`
   - `auto` only if intentionally supported
3. Unknown provider should return 400 or local-only fallback, depending on route context.
4. Only explicit `anthropic` or `api` may call Anthropic.
5. Arbiter remains Ollama-only regardless of UI provider.

Tests:

- `anthropic` calls Anthropic.
- `api` calls Anthropic.
- `fast` and `deep` call Ollama.
- typo provider does not call Anthropic.
- Arbiter ignores cloud provider request.

Acceptance criteria:

- A typo cannot spend API credits.
- Provider behavior is clear and tested.

### A4. Add Full Streaming Timeouts

Priority: P0

Files:

- `app/src/lib/server/modelProvider.js`
- `app/src/app/api/chat-stream/route.js`
- `app/src/hooks/useChatSessions.js`

Problem:

Ollama timeout is cleared after response headers. Body stream can hang. Anthropic stream lacks full body idle timeout.

Implementation:

1. Add shared stream idle timeout helper.
2. Timeout applies while reading response body chunks.
3. Reset timeout on every chunk.
4. Abort upstream request on timeout.
5. Propagate client cancellation.
6. Surface a useful UI error.
7. Clear `sending` state reliably.

Tests:

- Headers arrive then body stalls.
- Body chunks keep stream alive.
- Abort produces controlled error.
- UI can retry after timeout.

Acceptance criteria:

- No stream can leave the UI indefinitely stuck.

### A5. Invalidate Server Caches After Data Sync

Priority: P0

Files:

- `app/src/app/api/sync-data/route.js`
- `app/src/lib/server/cardIndex.js`
- `app/src/lib/server/printingIndex.js`
- rules, spellbook, salt loaders as applicable

Problem:

Data sync updates files but singleton caches may continue serving stale data until restart.

Implementation:

1. Export reset functions from cache modules.
2. After successful sync action, call relevant resets.
3. Alternative acceptable approach: make loaders mtime-aware.
4. Return refreshed status after sync.

Tests:

- Load old index.
- Simulate sync output.
- Verify next lookup uses new data without server restart.

Acceptance criteria:

- In-app sync updates are visible immediately.

### A6. Add Tauri Webview CSP

Priority: P0, verification-gated

Files:

- `app/src-tauri/tauri.conf.json`
- Tauri runtime config if needed

Problem:

Tauri CSP is disabled.

Implementation:

1. Start with measured CSP that permits only required local resources.
2. Test in dev and packaged app.
3. Verify:
   - app loads
   - local Next server loads
   - art proxy images render
   - Tauri update modal works
   - no blank webview

Acceptance criteria:

- CSP exists.
- Webview is not blank.
- Required app features still work.

## Workstream B: Public Release Readiness

### B1. Add Central Settings Screen

Priority: P0

Why:

Settings are currently scattered across header controls, update modal, local storage, env files, and feature-specific panels.

Settings sections:

1. Models
   - local-only mode
   - provider default
   - fast model name
   - deep model name
   - test model button
   - Anthropic API key setup
2. Privacy
   - never use cloud
   - warn before cloud request
   - explain what can leave machine
3. Data
   - data directory
   - backup now
   - restore backup
   - export all data
   - reset data
4. Updates
   - app update behavior
   - data sync behavior
   - backup before sync
5. Display
   - theme options later
6. Support
   - copy support bundle
   - open logs/data folder
7. About
   - app version
   - license
   - unofficial fan content disclaimer

Acceptance criteria:

- Header links to Settings.
- User can manage model/privacy/data/update/support basics in one place.

### B2. First-Run Onboarding Wizard

Priority: P0

Flow:

1. Welcome.
2. Explain local-first posture.
3. Choose local-only or local with API fallback.
4. Check Ollama.
5. Install Ollama if missing.
6. Pull/test model.
7. Check bundled data.
8. Offer data sync.
9. Import first deck.
10. Optional collection import.
11. Start suggested action:
    - ask Jace
    - analyze deck with Karn
    - open Vault
    - start Academy preview

Acceptance criteria:

- New user can get to first useful result without reading README.
- Cloud behavior is explicit.

### B3. Privacy, Legal, And About Page

Priority: P0

Content:

- Source-available license.
- Unofficial Fan Content disclaimer.
- Not affiliated with Wizards of the Coast.
- Local data paths.
- Which actions call external services.
- What happens when Anthropic/API mode is enabled.
- What update checks do.
- What data sync downloads.
- How to delete local data.
- How to export data.

Acceptance criteria:

- A non-technical user can understand privacy tradeoffs.
- Public release docs and in-app copy are aligned.

### B4. Installer Trust Story

Priority: P0 for public release

Problem:

Unsigned Authenticode installer triggers Windows SmartScreen.

Options:

1. Buy Authenticode certificate.
2. Publish through Microsoft Store.
3. Closed beta only until signing is solved.
4. Keep current flow but add clear install screenshots and SmartScreen explanation.

Acceptance criteria:

- Public download page tells users exactly what to expect.
- Product manager explicitly chooses signing path.

### B5. Public Download / Landing Docs

Priority: P0

Needed:

- What MTG Tool is.
- Who it is for.
- Windows requirements.
- Ollama requirements.
- Download instructions.
- SmartScreen note if unsigned.
- Local-first privacy explanation.
- Screenshots or GIFs.
- Known limitations.
- Support link.

Acceptance criteria:

- README has developer section and user section, or separate public docs exist.

### B6. Feature Stability Labels

Priority: P0

Implementation:

- Label Academy as Preview.
- Label goldfish scoring/power ranking as Beta.
- Label stable features as such in docs and UI where helpful.

Acceptance criteria:

- Users are not misled about simulation fidelity.

### B7. Support Bundle

Priority: P1

Feature:

Add "Copy support bundle" or "Export support bundle."

Include:

- app version
- OS
- Tauri/dev mode
- data freshness
- model provider status
- Ollama status
- last sync status
- last error
- no secrets
- no deck/chat content unless user opts in

Acceptance criteria:

- A user can report a bug without manually digging through files.

## Workstream C: Deck Report And Actionable Analysis

### C1. Unified Deck Report

Priority: P0

Why:

Deck analysis is currently scattered across chat, deck view, right panel, legality, Garfield, and Vault.

Deck Report must include:

- deck name
- commander
- color identity
- strategy summary
- role counts
- mana curve
- color distribution
- land/ramp/draw/removal/wipe/protection/win-con counts
- Commander legality
- power level estimate
- Commander bracket estimate
- game changers
- combo signals
- EDHREC salt/friction signals
- goldfish summary
- real-game history if available
- cards owned
- cards missing
- cost to finish
- top cuts
- top adds
- collection-aware recommendations
- export Markdown

Implementation steps:

1. Create server/report builder that composes existing local modules.
2. Add `GET/POST /api/deck-report`.
3. Add Deck Report panel or button in DeckView.
4. Add Markdown export.
5. Add tests for report sections.

Acceptance criteria:

- User can click one button and get a complete deck report without prompting Karn manually.

### C2. Rule 0 Card

Priority: P1

Feature:

Generate a short table-ready deck introduction.

Includes:

- bracket estimate
- power level
- expected win speed
- tutors
- combos
- fast mana
- stax/prison warnings
- salt/friction notes
- "what this deck is trying to do"

Acceptance criteria:

- User can copy/paste or export the Rule 0 summary.

### C3. Actionable Karn Suggestions

Priority: P1

Feature:

Karn recommendations should be structured, not only prose.

Actions:

- add suggestion to wishlist
- mark card as cut candidate
- add to maybeboard
- replace card with suggested card
- save upgrade plan
- create deck version before applying

Acceptance criteria:

- At least one Karn plan can be converted into structured deck tasks.

## Workstream D: Collection-Aware Deckbuilding

### D1. Build From Vault Mode

Priority: P0

Feature:

Deckbuilding mode that prioritizes owned cards.

Card statuses:

- owned and available
- owned but allocated to another deck
- owned but different printing
- wishlist
- missing
- proxy allowed

Outputs:

- proposed deck list
- pull list by binder/location
- cards already in other decks
- missing shopping list
- cheapest alternatives

Acceptance criteria:

- Karn can recommend upgrades from owned cards before missing cards.

### D2. Shopping List Export

Priority: P0

Feature:

Export missing cards for a deck.

Formats:

- CSV
- plain text
- Moxfield-compatible text
- Archidekt-compatible text
- store-cart format if feasible later

Options:

- exclude basics
- cheapest printing
- preferred finish
- include set/collector number
- include price

Acceptance criteria:

- User can go from deck-cost panel to actionable shopping list.

### D3. Physical Location Tracking

Priority: P0

Feature:

Track where physical cards live.

Fields:

- location type: binder, box, deck, trade binder, sold, missing, proxy
- location name
- page
- row/slot
- notes

Acceptance criteria:

- Deck completion can say "pull these cards from Binder A" and "these are in Deck B."

### D4. Collection Export

Priority: P0

Feature:

Export The Vault.

Formats:

- MTG Tool JSON
- CSV
- Deckbox-like CSV
- Moxfield/Archidekt compatible if feasible
- selected cards export

Acceptance criteria:

- User has an escape hatch and backup-friendly format.

### D5. Collection Update/Merge Import

Priority: P0

Feature:

Import scanner or collection CSV as update, not only one-time import.

Modes:

- add only new cards
- merge quantities
- replace selected location
- reconcile differences
- mark absent as removed

Preview:

- new cards
- changed quantities
- changed printings
- conflicts
- unmatched rows

Acceptance criteria:

- User can update collection from scanner export without deleting everything.

### D6. Scanner CSV Compatibility

Priority: P1

Start with import compatibility, not native camera scanning.

Formats to support:

- ManaBox CSV
- Delver Lens CSV
- Dragon Shield CSV
- TCGplayer app CSV
- Deckbox/Moxfield existing formats

Acceptance criteria:

- Scanner exports can be reviewed and merged into Vault.

## Workstream E: Deck Editing, Versioning, And Organization

### E1. Deck Version History

Priority: P0

Feature:

Every deck mutation creates a lightweight version snapshot or diff.

Triggers:

- import
- manual edit
- AI-applied change
- URL refresh
- bulk update

UI:

- version timeline
- compare two versions
- restore version
- name milestone
- export diff

Acceptance criteria:

- User can safely apply recommendations and roll back.

### E2. Deck Diff

Priority: P0

Feature:

Show:

- added cards
- removed cards
- quantity changes
- section changes
- commander changes
- metadata changes

Acceptance criteria:

- User can compare current deck against previous version or imported URL.

### E3. Role View And Auto-Categorization

Priority: P1

Roles:

- lands
- ramp
- draw
- single-target removal
- board wipes
- counters
- protection
- tutors
- combo pieces
- win conditions
- synergy
- utility
- flex
- tokens
- sideboard
- maybeboard

Feature:

- Karn can auto-classify.
- User can override roles.
- Role counts feed Deck Report.

Acceptance criteria:

- Deck can be viewed and edited by function, not only section/type.

### E4. Refresh From Source URL

Priority: P1

Feature:

If deck was imported from Moxfield or Archidekt:

- refresh from original URL
- show diff
- ask to apply
- create version before apply

Acceptance criteria:

- User can keep local deck synced without reimporting manually.

## Workstream F: Search, Recommendations, And Combo Intelligence

### F1. Visual Search Builder

Priority: P1

Filters:

- color identity
- card type
- mana value
- oracle text
- price
- owned/missing
- physical location
- role
- commander legality
- game changer
- salt score
- combo piece
- set/printing/language
- finish

Natural-language examples:

- "cheap red board wipes I own"
- "green ramp under 3 mana not already in decks"
- "cards that make Treasure and are legal in Commander"

Acceptance criteria:

- User can build advanced searches without knowing Scryfall syntax.

### F2. Saved Filters

Priority: P1

Feature:

- Save search/filter presets.
- Use in Vault and deckbuilder.

Acceptance criteria:

- User can save common searches like "owned staples not in decks."

### F3. Combo Lens

Priority: P1

Feature:

Use Commander Spellbook/local combo data to show:

- combos in deck
- one-card-away combos
- two-card-away combos
- commander-required combos
- combo result type
- bracket impact
- salt impact
- missing pieces

Actions:

- add missing piece to wishlist
- remove combo to lower bracket
- ask Karn to explain combo

Acceptance criteria:

- Combo data is visible as a product feature, not only hidden prompt context.

### F4. New Cards For My Decks

Priority: P2

Feature:

After Scryfall/data sync:

- detect new set cards
- match to saved decks and commanders
- show likely upgrades
- show price and owned status
- add to wishlist
- ask Karn why it matters

Acceptance criteria:

- User gets proactive, local-first upgrade discovery.

## Workstream G: Game Tracking, Goldfish, And Academy

### G1. Game Night Tracker

Priority: P1

Feature:

Track real Commander games.

Fields:

- date
- playgroup
- players
- guest players
- decks
- winner
- placement
- turn count
- win condition
- notes
- bracket/power snapshot

Stats:

- deck win rate
- player win rate
- matchup matrix
- average game length
- deck too strong/too weak signal

Acceptance criteria:

- Real-game stats feed Karn/Tibalt/Jace context.

### G2. Card Performance Insights

Priority: P1

Signals:

- drawn but not cast
- stuck in hand
- cast on curve
- mulligan liability
- contributed to win/score
- frequently cut after games

Acceptance criteria:

- Karn can recommend cuts based on simulation and game evidence.

### G3. Goldfish Dashboard

Priority: P1

Feature:

- trend chart
- average score
- mulligan rate
- on-curve rate
- threat by turn 5
- batch comparison
- before/after deck version comparison

Acceptance criteria:

- Goldfish data is browsable without reading individual logs.

### G4. Academy Preview Polish

Priority: P1

Required:

- Label as Preview.
- Explain limitations.
- Add resume/save sessions.
- Add post-game analysis.
- Add better visual zones.
- Add recommended-choice highlighting.
- Add keyboard shortcuts.

Acceptance criteria:

- Academy feels honest and useful, not over-promised.

### G5. Academy Sandbox Mode

Priority: P2

Feature:

- draw sample hand
- mulligan practice
- manually play lands/spells
- add counters
- create/copy tokens
- track life/commander damage
- Ask Jace about board
- let Garfield continue from current state

Acceptance criteria:

- User can practice a deck manually without full engine fidelity.

## Workstream H: Rules And Trust UX

### H1. Ruling Card UI

Priority: P1

Feature:

Replace raw trace-first presentation with user-friendly ruling cards.

Sections:

- short answer
- why
- relevant rules
- involved cards
- confidence
- unresolved notes
- copy ruling
- run formal Arbiter check

Acceptance criteria:

- Normal players can understand Arbiter value without reading raw traces.

### H2. Rules/Data Freshness Warnings

Priority: P1

Feature:

- Show CR baseline date.
- Warn if rules index is stale.
- Warn if Scryfall data is stale.
- Link to data sync.

Acceptance criteria:

- Trust status is visible before relying on a ruling.

## Workstream I: Import, Export, Backup, And Recovery

### I1. Export All User Data

Priority: P0/P1

Include:

- decks
- chats
- collection
- feedback
- games
- learn sessions
- settings except secrets

Acceptance criteria:

- User can migrate machines or back up all data.

### I2. Restore From Backup

Priority: P1

Feature:

- pick backup
- preview contents
- restore selected data types
- create backup before restore

Acceptance criteria:

- User can recover from bad import/sync.

### I3. Backup Before Destructive Operations

Priority: P1

Operations:

- collection merge replace
- data sync
- restore
- bulk delete
- deck URL refresh apply

Acceptance criteria:

- No large data mutation happens without easy rollback.

## Workstream J: House Rules, Brackets, And Pod Fit

### J1. House Rules Profiles

Priority: P2

Profile fields:

- banned cards
- allowed proxies
- budget cap
- bracket target
- no fast mana
- no game changers
- no mass land destruction
- no extra turns
- custom notes

Acceptance criteria:

- Deck Report can evaluate against a named pod/LGS profile.

### J2. Pod Power Comparison

Priority: P2

Feature:

- compare selected decks
- estimate bracket mismatch
- expected win pressure
- salt mismatch
- Rule 0 warning

Acceptance criteria:

- User can select four decks and see whether the table looks balanced.

## Workstream K: Collector Metadata And Trade Tools

### K1. Collector Metadata

Priority: P2

Fields:

- proxy
- signed
- altered
- misprint
- serialized number
- language
- custom art note
- purchase price
- purchase date
- source
- for trade
- not for trade

Acceptance criteria:

- Vault can track collector-relevant variants beyond finish/condition.

### K2. Local Trade Sheet

Priority: P3

Feature:

- mark cards for trade
- create trade proposal
- compare values
- export text/CSV

Acceptance criteria:

- User can prepare local trades without a social platform.

## Workstream L: Code Quality And Refactors

### L1. Break Up Oversized Files

Priority: P2, after safety work

Targets:

- `app/src/components/MTGAssistant.jsx`
- `app/src/components/mtg/FeedbackButton.jsx`
- `app/src/hooks/useChatSessions.js`
- `app/src/lib/agents.js`
- `app/src/lib/server/powerRanker.js`
- `app/src/lib/symbolicEngine.cjs`
- `app/src-tauri/src/lib.rs`

Split suggestions:

- MTGAssistant: app shell state, layout, tooltip/card preview, update/Ollama status, deck/chat orchestration.
- FeedbackButton: launcher, modal, inbox, bundle import/export, submit form.
- useChatSessions: persistence, message operations, deck-lock operations, session lifecycle.
- agents: registry plus separate prompt/template files.
- powerRanker: parser, classifier, combo evaluator, salt evaluator, scoring, report formatting.
- lib.rs: tray, server spawn, updater/startup, Windows cleanup.

Acceptance criteria:

- No behavior change.
- Tests/lint pass.
- Smaller modules have clear ownership.

### L2. Dead Code Cleanup

Priority: P2

Known dead-code scan findings:

- unused file: `app/src/lib/server/cardContext.js`
- unused exports from prompts, symbolic adapters, stats helpers, rules helpers, version/constants

Implementation:

1. Rerun `npm.cmd run deadcode`.
2. Remove truly unused code.
3. Mark intentional test/internal exports if needed.
4. Update knip config only with clear reason.

Acceptance criteria:

- Dead-code check passes or has documented intentional exceptions.

### L3. Lint Warning Cleanup

Priority: P2

Known warning types:

- unused variables/imports
- React hook dependency warnings
- direct `img` warnings
- empty catch blocks
- unused props

Acceptance criteria:

- Lint passes with zero warnings, or warnings are documented and intentional.

### L4. Local-First Art Completion

Priority: P1

Remaining surfaces:

- hover tooltip
- right search preview
- CollectionAddModal search/preview

Implementation:

- Route through `/api/art-crop`.
- Use `artCropProxySrc` or equivalent.

Acceptance criteria:

- No direct Scryfall image URLs in UI rendering paths except sync/proxy internals.

### L5. Art Proxy Hardening

Priority: P1

Add:

- timeout
- response size cap
- content-type validation
- safe fallback

Acceptance criteria:

- Slow or huge image response cannot hang or exhaust local server.

### L6. Atomic Write Temp Names

Priority: P2

Problem:

Some atomic writes use predictable `.tmp` or timestamp-only temp paths.

Implementation:

- Use UUID/random temp suffix.
- Write temp in same directory.
- Atomic rename/replace.

Acceptance criteria:

- Concurrent writes do not collide.

## Workstream M: Docs, Versioning, CI, And Release Hygiene

### M1. Align Version Sources

Priority: P1

Files:

- `app/package.json`
- `app/src-tauri/tauri.conf.json`
- changelog
- release docs
- hardcoded user agents

Acceptance criteria:

- One source of truth or automated sync for app version.

### M2. Archive Or Update Stale Docs

Priority: P1

Known stale/conflicting docs:

- `TODOS.md`
- `ROADMAP.md`
- `docs/phase6-learn-to-play.md`
- some release version references

Acceptance criteria:

- `docs/HANDOFF.md` or successor is clearly current.
- Historical docs are marked historical.

### M3. Resolve Local Data `.gitignore` Strategy

Priority: P1

Problem:

Root and app-level ignore rules conflict around `app/data/*.local.json`.

Acceptance criteria:

- It is clear whether local JSON files are tracked seeds or ignored user data.

### M4. CI Improvements

Priority: P2

Add or improve:

- fail lint on warnings after cleanup
- format check
- dead-code check
- audit policy
- lightweight browser smoke test
- release verification checklist

Acceptance criteria:

- CI protects current quality gates without excessive noise.

## Testing Backlog

Add tests for:

1. Feedback bundle traversal.
2. Provider allowlist.
3. Stream timeout.
4. Chat metadata persistence.
5. Data sync cache invalidation.
6. Deck Confirm Modal flows.
7. ChatPanel deck gate.
8. Deck Report generation.
9. Shopping list export.
10. Collection export.
11. Collection update/merge import.
12. Deck version diff.
13. Role auto-categorization.
14. Search builder.
15. Combo Lens.
16. Game Night Tracker.
17. Academy resume/post-game flow.
18. Settings model/privacy behavior.
19. First-run onboarding.
20. Support bundle redaction.

## Suggested PR Sequence

### PR 1: Security Hotfixes

- A1 feedback bundle path traversal
- A3 provider allowlist
- tests

### PR 2: Chat Persistence And Deck Gate Durability

- A2 metadata persistence
- deck-required-agent reload tests

### PR 3: Streaming Reliability

- A4 full stream timeouts
- UI error recovery

### PR 4: Sync Cache Freshness

- A5 cache invalidation
- tests

### PR 5: Public Release Skeleton

- B1 Settings shell
- B3 About/Privacy page
- B6 feature labels

### PR 6: First-Run Onboarding

- B2 onboarding wizard
- Ollama/data/deck setup steps

### PR 7: Support And Export Safety

- B7 support bundle
- I1 export all user data
- I3 backup-before-destructive foundations

### PR 8: Deck Report

- C1 unified deck report
- C2 Rule 0 card
- Markdown export

### PR 9: Vault Export And Shopping Lists

- D2 shopping list export
- D4 collection export

### PR 10: Collection Update/Merge

- D5 merge import
- D6 scanner CSV compatibility foundations

### PR 11: Deck Versioning

- E1 version history
- E2 diff and restore

### PR 12: Collection-Aware Karn

- D1 Build From Vault
- C3 actionable suggestions foundation

### PR 13: Role View

- E3 role auto-categorization and editing

### PR 14: Search Builder And Combo Lens

- F1 visual search builder
- F2 saved filters
- F3 combo lens

### PR 15: Game Night Tracker

- G1 real-game tracking
- feed stats into agents

### PR 16: Goldfish Dashboard

- G2 card performance insights
- G3 goldfish trends

### PR 17: Academy Preview Polish

- G4 preview label, limitations, save/resume, post-game basics

### PR 18: Larger Refactors

- L1 oversized modules
- L2 dead code cleanup
- L3 lint warning cleanup

## External Research Links For Future Agents

Use these when validating product decisions:

- Archidekt feature voting: https://archidekt.com/features/
- Moxfield undo/history request: https://moxfield.nolt.io/1479
- Moxfield feature wiki mirror: https://github-wiki-see.page/m/moxfield/moxfield-public/wiki/Features
- ManaBox homepage: https://manabox.app/
- ManaBox collection guide: https://manabox.app/guides/collection/getting-started/
- ManaBox collection FAQ: https://www.manabox.app/guides/collection/faq/
- ManaBox decks in collection: https://manabox.app/guides/decks/collection-decks/
- ManaBox scanner guide: https://manabox.app/guides/scanner/getting-started/
- Dragon Shield MTG Scanner: https://apps.apple.com/us/app/mtg-scanner-dragon-shield/id1460657155
- Dragon Shield Card Manager update: https://about.dragonshield.com/gaming-inspiration/new-features-now-available-on-card-manager/
- Delver Lens: https://www.delverlab.com/
- Eldwyn: https://eldwyn.app/
- Dragon Counter: https://dragoncounter.com/
- Lifetap: https://getlifetap.com/
- Gauntlet: https://gauntletapp.com/
- Playgroup.gg Live: https://playgroup.gg/playgroup-live
- Playgroup.gg FAQ: https://playgroup.gg/faqs
- EDHREC Archidekt guide: https://edhrec.com/guides/how-to-use-archidekt-the-mtg-deckbuilding-site
- EDHREC digital deckbuilding guide: https://edhrec.com/articles/digital-deckbuilding-the-how-to-guide-to-building-a-commander-deck-using-edhrec-archidekt-and-commander-spellbook
- EDHREC guide: https://edhrec.com/guides/how-to-use-edhrec
- EDHREC Scryfall syntax guide: https://edhrec.com/guides/guide-to-scryfall-syntax
- Commander Spellbook: https://commanderspellbook.com/
- Commander Spellbook syntax guide: https://commanderspellbook.com/syntax-guide/
- Wizards Commander Brackets Beta: https://magic.wizards.com/en/news/announcements/introducing-commander-brackets-beta
- Wizards Commander Brackets Beta Update: https://magic.wizards.com/en/news/announcements/commander-brackets-beta-update-april-22-2025/
- Rate My Decks: https://www.ratemydecks.com/
- MTG Master features: https://mtgmaster.app/features
- TableCommander deck docs: https://tablecommander.com/docs/decks
- BinderBrew Moxfield workflow: https://binderbrew.com/moxfield-deck-builder
- BuildMyDeck: https://buildmydeck.app/
- Bulk Commander: https://www.bulkcommander.com/

## Final Guidance

The app already has enough features to be compelling. Do not chase every possible MTG app feature before making the existing experience safer and clearer.

The best next move is:

1. Fix safety issues.
2. Make the app public-release understandable.
3. Add Deck Report.
4. Make Karn collection-aware.
5. Add export/backup and deck version safety.

After that, invest in the differentiators:

- owned-card deckbuilding
- Rule 0 readiness
- real game stats
- Academy coaching
- local AI explanations over the user's own data

