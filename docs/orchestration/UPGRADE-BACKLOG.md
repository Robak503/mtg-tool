# UPGRADE BACKLOG — the ranked feature/upgrade queue (LIVING)

> Product of the 2026-07-04 six-surveyor creative review (final Fable 5 session): every
> surface, every bundled dataset, the engine-enabled possibilities, and every parked ledger
> were swept by grounded read-only agents; 51 findings were verified against real files and
> synthesized here. **This is the forward work queue.** Any session may execute items —
> follow [MASTER-GUIDE.md](MASTER-GUIDE.md) (boot §1, model policy §2, method §3) and each
> item's verify line. Mark items ✅-with-version when shipped; add new items with the same
> shape; prune what Colton kills.
>
> Effort: S = hours · M = a day · L = days. Impact 1–5 (5 = Colton would love it).
> Every item is LOCAL-FIRST — zero new external calls; bundled/user data only.

**Recommended execution order:** wave Q (one session, the whole app feels newer) → wave V
(the Vault order, `memory/orders/vault-overhaul.md`) → P1–P2 (the records program — the
open Q8 answer) → K by taste → E coordinated with the grind lane → D opportunistic.

---

## Wave Q — quick-win battery (all S; one session, one PR, one battery run)

Gate for the wave: suite + lint + engine fence (tier fp 0-diff, trajectory hash holds —
Q2 touches deck-memory serialization, so prove the fence, don't assume it).

- ✅ v0.89.0 (modal layer; area-hop keys parked) — **Q1 · Escape-to-close + kiosk key layer** (impact 4) — one shared `useEscapeClose` hook
  (or a single global keydown layer in `MTGAssistant.jsx`) wired into every overlay that
  lacks it: UpdatesModal, SettingsModal, ProfileManageModal, CollectionAddModal,
  CollectionImportModal, CollectionRoastModal, CollectionDecksModal, CollectionCardDetail,
  SimCenter's report overlay. Escape with nothing open walks UP the IA (surface → area home
  → landing via existing `goHome`); Ctrl+1/2/3 jump to the three doors. Guard: never
  swallow Escape from a focused input or mid-flight sync. *Promotes the v0.87.0 parked
  item.* Where: `MTGAssistant.jsx` + the listed modals.
- ✅ v0.89.0 (stat card + menu meta + serializer; staleness cue/Rate button parked) — **Q2 · powerRank on every deck surface + in agent prompts** (impact 5) — (a) DeckView's
  Power stat card shows `memory.powerRank` (bracket chip via PodBalanceView's
  `bracketColor`), manual `powerLevel` text as fallback, Rate/Re-rate button (POST
  `/api/power-rank` exists); (b) `DeckMenu` rows get "6.8 · B3" meta; (c) staleness cue
  when `memory.updatedAt` > `ratedAt`; (d) `serializeDeckMemory`
  (`app/src/lib/deck/deckMemory.js:121`) emits "Machine Power Rating: 6.8/10 — Bracket 3"
  so Jace/Karn/Tibalt see it (flows via `deckContextBuilder.js`); serializer test beside
  the existing deckMemory tests. *Promotes the v0.88.0 parked item.*
- ✅ v0.91.0 — **Q3 · Post-import "deck ready" moment** (impact 4) — after `importDeck()`
  (`MTGAssistant.jsx` ~704) show a confirmation panel: deck name, counts, the auto-rating
  streaming in when it lands ("Power 6.8 · Bracket 3 — rated locally"), and next-step
  buttons with existing handlers (Karn plan / Tibalt roast / View deck / Pod Balance).
  Needs a small callback so the UI can await the currently fire-and-forget auto-rate
  (`useDeckStore.js:203-243`).
- ◐ v0.91.0 (hand-hex constants fixed — the styleguide violation; the ~25-usage alias sweep + globals block deletion still open) — **Q4 · LEYLINE alias sweep + hand-hex fix** (impact 2, rider) — rename the ~25 legacy
  Aether-token usages (DeckView 14, RightPanel 5, AppHeader 3, ProfileManageModal 2,
  DeckConfirmModal 1) to `--ley-*`, delete the alias block (`globals.css:68-104`), and fix
  the un-logged violation: `MTGAssistant.jsx:732` hand-hexes BG/BG2/LINE/GOLD constants —
  convert to `var(--ley-*)`.
- ✅ v0.89.0 (name+deck filter; group-by-deck parked) — **Q5 · Session search + deck filter in the chat sidebar** (impact 3) — filter input over
  `session.name` / `lockedDeck.name` / message content (all client-side already in
  `useChatSessions`), plus a group-by-deck alternative. Where: `SessionSidebar.jsx`.
- ✅ v0.89.0 — **Q6 · Pod salt spread in Pod Balance** (impact 3) — add per-deck salt score + top-3
  saltiest cards to `/api/pod-balance` `summarize()` (the 11 MB `edhrec-salt.local.json`
  is already wired through `edhrecSalt.js` into deckReport/powerRanker) and a "misery
  meter" row in `PodBalanceView`.
- ✅ v0.91.0 (result pane; per-report history trend still open) — **Q7 · Show the win tables the engine already saves** (impact 4) — render `seatSummary`
  (win rate by seat / by deck / on-the-play with Wilson CI95 — computed and persisted per
  run at `app/src/app/api/self-play/route.js:224`, rendered NOWHERE) in SimCenter's result
  pane + saved-report history; per-deck trend via existing `Sparkline.jsx`.
- ✅ v0.91.0 — **Q8 · Per-message chat actions** (impact 4) — Copy on every message; "Save plan/roast"
  chips on Karn/Tibalt replies reusing `saveLatestAgentArtifact` (`MTGAssistant.jsx:643`)
  but targeting THIS message; Jace "Save to notes" via `updateAgentNote`. Locked-deck
  sessions save into the LOCKED deck's memory, not the sidebar-active deck.
- ✅ v0.91.0 (forward link; reverse sim→pod link still open) — **Q9 · Pod Balance ⇄ Sim Center round trip** (impact 3) — "Run this pod in the Sim
  Center" on a ready comparison (seed SimCenter via an `initialSelection` prop; selection
  state at `SimCenter.jsx:71`); reverse link on sim results.

## Wave V — THE VAULT (the flagship; executable order = `memory/orders/vault-overhaul.md`)

The one surface Colton called out as old. Full detail + phases live in the order file;
summary here for the queue:

- ✅ v0.89.0 — **V1 · Vault kiosk redesign — four live door-panes replace the tab strip** (L, 5) — new
  `VaultHome.jsx` on the ProvingHome pattern: **The Stacks** (browse/manage; recent-adds
  art strip) · **The Ledger** (Finance+Stats merged; value big-number + 30d arrow) ·
  **The Atlas** (sets; closest-to-complete progress) · **The Forge** (build/buildable +
  deck costs; CollectionDecksModal PROMOTED to a pane). Tab strip + mode state die;
  Conflicts becomes an inline callout; ColorTagManager a slide-over. All four `Vault*View`s
  restyled from pre-LEYLINE flat boxes to `.ley-card`/glass. Zero new endpoints.
- ✅ v0.89.0 — **V2 · Ledger value chart** (S, 4) — real SVG area chart (no dep; Sparkline proves the
  pattern) over `/api/collection/stats` `value.series` + range toggles + per-grail overlay.
- ✅ v0.89.0 (rides VaultHome) — **V3 · Vault Pulse strip** (S, 4) — "since you last looked": adds this week (`addedAt`),
  owned movers (`/api/finance` risers/fallers), alerts hit, wishlist deals, conflicts —
  each deep-linking into its surface.
- ✅ v0.89.0 (bars + % + cost-to-complete; art-tile grid mode parked) — **V4 · Atlas upgrade** (M, 4) — completion bars + % per set, cost-to-complete (fold in
  `setBrowser.js` — per-card usd + owned flags already in the payload), art-tile grid mode
  with unowned dimmed.
- ✅ v0.90.0 (schema shipped; fields appear in bundles from the next CI index build — verify in the release log; flavor text deliberately dropped from scope, see K9) — **V5 · Printings-index schema pass** (M, 4) — extend
  `build-collection-printings-index.cjs` to carry `artist` (+ `fullArt`, `borderColor`,
  `reserved`, `story_spotlight`, flavor text scoped to owned/deck cards). Source data is
  already bundled (full default-cards bulk); UI degrades gracefully until the index is
  rebuilt via sync/release. **Gates V6 autofill + V7.**
- ✅ v0.90.0 (provenance fields + drawer section + Stacks hero strip; artist AUTOFILL from V5 index + a dedicated showcase surface parked to V7's session) — **V6 · The Trophy Case** (M, 5) — signed/altered/artist-proof/grail provenance as
  STRUCTURED fields (`signed {artist,date,inPerson,event}`, `altered`, `artistProof`,
  `showcase`) on collection rows (additive through `collectionValidation.js` + PATCH
  route; today it's a free-text note), a Provenance section in the detail drawer, and the
  showcase surface itself: big art tiles, signature badge, artist + event caption. *The
  collector-identity feature — his signed-showpiece ledger finally lives IN the app.*
- ✅ v0.91.0 (Gallery door + artist wall + drawer autofill; artist token in Stacks filters still open) — **V7 · The Gallery / artists shelf** (M–L, 4) — browse the collection as an art wall;
  artist pages ("you own 12 by Chase Stone"); artist search token in filters; artist in
  detail drawer + set rows. Rides V5 (or the slim art-index variant if unique_artwork is
  preferred — see the order file's data note).
- **V8 · Binder mode** (M, 4) — 9-pocket full-card spread view in The Stacks via the
  existing `/api/card-image` AppData cache; ordered by active sort; page-flip between
  spreads.
- ✅ v0.89.0 — **V9 · Binder combos — "what can I assemble from cards I own"** (S, 4) — new
  `/api/collection/combos`: owned names → existing `spellbook.findCombos()`; complete
  combos grouped by identity + "one card away" priced via printingIndex.
- **V10 · Cost basis** (M, 3) — optional `paidUsd` (+ `acquiredFrom/At`) per stack;
  gain/loss card in the Ledger; per-card gain in the drawer; CSV import column mapping
  later.
- **V11 · Universal shopping list** (S, 3) — merge wishlist + all-deck missing cards
  (`/api/collection/deck-costs` + `shoppingList.js`) + alert-hit grails into one deduped
  buy list tagged with WHY, vendor-paste export.
- **V12 · Finish analytics + foil-upgrade radar** (S, 3) — by-finish/treatment breakdown
  (via `foilTreatments.js` catalog) + flag owned nonfoils whose premium printing exists
  with price (`lookupByName`).

## Wave P — The Proving Grounds: records + insights (the engine dividend; closes open Q8)

- ✅ v0.91.0 — **P1 · Prove the Pod — empirical win rates in Pod Balance** (M, 5) — "Prove it — run 20
  games" button POSTs the picked decks to the EXISTING `/api/self-play`
  (scope:'pod', allProfiles, rotateSeats) and renders `seatSummary.byDeck` (wins, %,
  Wilson CI) beside the static verdict + a calibration flag ("rated 6.8, wins 58%").
  Needs only UI + async progress affordance.
- ◐ v0.91.0 CORE (Academy games persist via gameRecordsStore + /api/records + the Table Records door with list→detail log view; PARKED: replay scrubber w/ turn sparklines, self-play batch records, human game-log merge, opponent fuzzy-grouping) — **P2 · The Records program — game archive + replay browser** (L, 5) — the Q8 answer,
  two data sources, one door: (a) STOP discarding finished Academy games —
  `/api/learn/step` deletes the save at terminal today (`route.js:71`); write a compact
  GameRecord {decks, result, winnerSeat, turns, structured log, per-turn features} to
  `profilePath('records')`; (b) opt-in "save records" on self-play batches (`g.log`,
  `g.meta`, `winnerSeat` are in memory at write time and currently dropped); (c) merge
  the human game log (`memory.games` from DeckView) for real-table W/L. New Records door
  in ProvingHome: filterable list, W/L per deck, record vs named opponents (fuzzy-group
  the free-text field), power-vs-actual-win-rate headline, and a replay view with a turn
  scrubber (life/board sparklines from features + the structured log feed). Cap/compact
  `state.log` per record (reuse `/api/games` pruning pattern).
- **P3 · Academy post-game debrief** (M, 4) — record the user's picks alongside the
  engine's own pick (`decision.metadata.suggestion` — documented, always a member of
  options) via the v1.1 `act(...opts)` instrumentation bag through `/api/learn/step` +
  `/api/learn/choose`; at the existing result scrim: W/L, turns, mulligans, dead turns,
  divergence count + the 3 costliest divergences. Ships standalone; richer with P2.
- **P4 · Pod Matchup Ledger** (M, 4) — persist compact per-game outcome rows in the run
  sidecar (deckNames, winnerDeck via seat→name positional map, turns, seed — all in
  memory at write time, currently dropped), aggregate across sidecars into a matchup
  heat table (A's win rate in pods containing B; true head-to-head in Standard mode)
  with honest game counts + CIs.
- **P5 · Deck Reality Report** (L, 5) — per-deck "how it ACTUALLY plays": curve reality,
  dead-turn rate, casts/lands per game, mulligan rate, combat trades, NEVER-CAST cards —
  promote `analyzeGame()` from `play-quality-probe.mjs:186` into `src/lib/learn` as a
  shared analyzer; needs the small `recordDecisions` passthrough on `/api/self-play`
  POST (additive).
- **P6 · "Practice this deck" — DeckView → Academy handoff** (M, 4) — ribbon button
  navigates to the Academy with the deck preselected (`initialUserDeckId` prop —
  LearnView pickers start empty today) + "Suggest fair opponents" filling the pod with
  closest-powerRank saved decks.
- **P7 · Spectate My Deck** (M, 4) — run ONE recorded self-play game featuring the active
  deck, play it back turn-by-turn in the P2 replay viewer with narration — "watch the
  engine pilot it". Depends on P2.
- **P8 · Mulligan Lab** (M, 3) — seeded opening-7 keep/ship trainer vs the exported
  `decideMulliganForAI` heuristic (`opponentAI.js:1579`); banked keep-rates ride P5's
  passthrough.
- **P9 · Puzzle Mode — "find the line"** (L, 4) — mine self-play for decision points
  (lethal-available, big feature swings), serialize the live session at that decision
  (save-schema v5 machinery exists), grade the user's pick against
  `metadata.suggestion`. Needs an interestingness heuristic; mine default-AI games.

## Wave K — knowledge & card-data features (the bundled-data dividend)

- **K1 · Local card inspector** (M, 4) — stop bouncing every card click to scryfall.com
  (DeckView ~341/~655; chat chips via `renderText`). One shared CardInspector panel:
  image (`/api/card-image`), oracle + type + mana, official rulings (`/api/cards` +
  `rulingsFor` exist), price, legality, Printings tab (`/api/printings/by-name`).
  Also wires into CollectionCardDetail (whose header admits it "omits oracle text /
  rulings"): oracle, rulings accordion, printings timeline, "Ask Jace about this card".
- **K2 · Judge Trials — RulesGuru quiz in the Proving Grounds** (M, 5) — ~500 bundled
  verified judge Q&As with difficulty tiers + CR citations
  (`knowledge/mtg-judge/META_test_cases_rulesguru.md`; parser pattern exists in
  `rulesGuruRetrieval.js`). New quiz door: pick difficulty, read the scenario (oracle
  joined from cardIndex), self-grade against verdict + citations, streak tracking. *He
  wants to GROW as a player — this is the growth feature.*
- **K3 · The Library — rules & rulings search area** (M, 4) — a user-facing door over
  `/api/rules-retrieval` (CR chunks + 92 engine explainers + RulesGuru — live + tested,
  today Arbiter-only): keyword/rule-number search with rule anchors, card-name tab for
  official rulings. Cheap shell per HOW-TO-ADD-AN-AREA.
- **K4 · Tokens-needed "table kit" per deck** (M, 4) — `all_parts` rides 6,675 oracle
  cards and NOTHING reads it: keep token parts in `build-oracle-index.cjs` `slimCard()`,
  expose `tokensForDeck()`, render the strip in DeckView (every token the deck makes,
  with art) + append to the printable deck report.
- **K5 · Combo detail pages** (M, 4) — keep Spellbook's `description` (how-it-works
  steps) + `notablePrerequisites` at sync time (currently stripped by
  `sync-spellbook.cjs`); combo modal from RightPanel Combos tab + Pod Balance: pieces
  with art, steps, bracket badge. Degrades gracefully on old snapshots.
- **K6 · Ctrl+K command palette** (M, 4) — fuzzy overlay over areas/surfaces, saved decks,
  chat sessions, agents, actions, and local card search (`searchLocalCards`,
  `scryfall.js:501`). Every target handler already exists in MTGAssistant. Rides Q1's key
  layer.
- **K7 · Markdown-lite chat rendering** (M, 3) — Karn's `## Cuts` / `**bold**` / lists
  render as raw glyphs today (`renderText` handles only card chips); ~80-line
  zero-dependency line-wise renderer, streaming-safe, composed with the chip splitter.
- **K8 · Landing "continue where you left off" strip** (M, 3) — up to 3 quiet chips under
  the doors: last chat, active deck, in-progress Academy save / latest sim report; all
  deep-link through existing navigation.
- **K9 · Flavor of the day** (S, 2) — date-seeded flavor text from cards in HIS decks in
  the kiosk footer (data rides V5's scoped flavor field).

## Wave E — engine/AI promotions (grind-lane coordination; full battery per playbooks)

- **E1 · EARTHBEND-RETURN delayed trigger** (M, 3) — close the last open enforcement CAP
  in retired-fp-ledger.md: tag animated lands `returnOnDeath` at `applyEarthbend`, fire
  the CR 603.7 delayed trigger in dies/exile (`atoms/combat.js:291` documents the dropped
  rider). Engine battery: tier flip-diff LOST=0.
- **E2 · Offered-X-subset quality** (M, 3) — replace lexicographic-first-64
  `kCombinations` bias in X-count targeting (`targeting.js` ~77/204/293) with
  scored/sampled subsets under the same cap. WILL re-anchor the trajectory hash — A/B
  probe + documented lineage per PLAY-HARNESS §2.1/§3.
- **E3 · AI alt-cost completion** (M, 3) — free-spell HOLDS (stop greedy-casting Flawless
  Maneuver) + paid-alt for the 6 non-interaction carriers; extend `filterAltCastVariants`
  + the altCost POLICY_KEY; keep the "v1" legacy arm; per-slice A/B evidence.
- **E4 · U-F4 durable fix — server-side per-profile color tags** (M, 3) — replace the
  self-labeled localStorage STOPGAP in `useColorTags.js` with a small `/api/color-tags`
  per-profile store + one-time migration.
- **E5 · Cross-profile rating persistence** (M, 4) — **Colton call first** (current
  no-write is BY DESIGN): opt-in persist flag so ratings computed for another profile's
  deck write into that profile's store; then delete PodBalanceView's sessionRatings
  crutch.

## Wave D — docs/data hygiene (remainder after the 2026-07-04 banner wave)

- **D1 · Archive move** (S) — physically move the bannered faculty/coverage-era docs into
  `docs/archive/` per PROJECT-SCAFFOLD §5.1's stated intent (banners are already on;
  the move is cosmetic — verify nothing live links in before moving).
- **D2 · TODOS/ROADMAP retirement** (S) — banners are on; optionally fold the few still-
  live items into this backlog and delete both files (Colton's call — they're his files).
- **D3 · Mobile IA pass** (M, 2) — PARKED pending Colton: does he ever run under ~660px?
  If no, park indefinitely.
- **D4 · Tray-click eyeball** — 30-second manual check on next .exe launch (carried from
  v0.87.0; no build work).
- **D5 · docs/agents.md Garfield refresh** (S) — the Garfield section still says
  learn-to-play is "in progress, PRs 1-6" — years of releases stale; rewrite to Academy
  reality.

---

*Sourced from the 2026-07-04 creative review (6 fable surveyors, ~966k tokens, all findings
file-grounded). Dedupes applied: artist-index/Gallery merged (V5+V7), Escape items merged
(Q1), powerRank items merged (Q2), Records/Table-Records merged (P2). Full raw survey
output lives in the session transcript, not the repo.*
