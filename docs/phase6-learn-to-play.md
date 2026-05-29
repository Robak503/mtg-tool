# Phase 6 — Learn-to-Play Mode

**Status:** design doc, not started.
**Prereq:** Phases 1-5 done. Goldfish v2 + game records + insights shipped on master.
**Owner:** Colton.
**Last updated:** 2026-05-26 (end-of-session handoff).

This document specifies the next big build per `CLAUDE.md`. The foundation
phases gave us a working multi-agent assistant with archetype-aware
simulation, real rules retrieval, and persistent game history. Phase 6
turns that into a teaching tool: pick a deck, pick a difficulty, sit
down and learn how to actually pilot it.

---

## 1. Why this exists

The CLAUDE.md description:

> Phase 6 — Learn-to-Play Mode (separate roadmap):
> - Owner uploads or selects a deck to learn
> - Garfield runs against another saved deck
> - Three difficulty levels: Beginner, Intermediate, Expert
> - Beginner: explains every step, every priority window, every trigger,
>   every SBA, every legal choice. Slow. Hand-held.
> - Intermediate: explains key decisions and tricky interactions. Mostly
>   plays the game.
> - Expert: plays the game at speed. Only explains on mistakes, missed
>   lines, or rules edge cases.
> - Each difficulty has a curriculum spec — define what knowledge gets
>   parsed and explained at each level
> - Uses Arbiter for rules accuracy
> - Uses Jace's voice for explanations
> - Saved learning sessions become memory — "I keep missing this trigger"
>   gets surfaced

The user's goal: "I just bought this deck. I don't know how to play it
yet. Walk me through 10 hands."

The existing /qa and goldfish surfaces score the deck. This phase
**teaches** the deck.

---

## 2. Scope boundaries

### In scope (Phase 6 v1)
- **Two play modes** (the only formats the owner and his pod use):
  - **Standard (1v1)** — user pilots their deck against a single
    AI-piloted opponent. The original "solitaire" framing; everything
    PRs 1-7 shipped against. Turns alternate.
  - **Commander (4P FFA)** — user pilots their deck against three
    AI-piloted opponents in a free-for-all. Turns rotate clockwise
    (user → ai1 → ai2 → ai3 → user). Attackers choose which
    opponent to attack. The mode the owner actually plays — the
    primary use case for the learn tool going forward.
- Three difficulty levels with explicit curriculum specs (below).
  Difficulty applies the same way in both modes.
- Rules-accurate execution via Arbiter — every trigger, SBA, priority
  window, replacement effect surfaces as a discrete decision point.
- Game-state model: zones (library, hand, battlefield, graveyard, exile,
  command, stack), per-player life + commander damage + mana pools +
  poison + experience counters + monarch + initiative, the stack with
  ordered objects + targets, the active player and priority holder, the
  current phase/step. Player set is `{user, ai}` in Standard or
  `{user, ai1, ai2, ai3}` in Commander; the engine reads
  `Object.keys(state.players)` rather than hardcoding the two.
- Save learning sessions: same shape as `data/games/` but tagged
  `mode: "learn"` with difficulty, format (`standard`/`commander`),
  mistakes-made, hints-shown, duration, opponent-deck(s).
- Surface "you keep missing X" insights via the same
  `gameInsights.js` style helper, scoped to learning runs.
- Jace voice for explanations (CLAUDE.md §6); Arbiter for rules
  citations.

### NOT in scope (defer to Phase 6.5+ or later)
- 5-player or 6-player Commander, two-headed-giant, Brawl, Standard
  60-card, or any non-Commander format. Owner only plays 1v1 and
  4P FFA.
- Opponent deck-building UI. Use existing saved decks as opponents.
  In Commander, pick 3 of your saved decks per session (default
  pod model — see §11.4).
- Politics modeling beyond mechanical play. Engine doesn't track
  "deals," kingmaker awareness, or threat negotiation. The AI plays
  each opponent to maximize their own win probability against the
  field; emergent kingmaker scenarios are fine but unplanned.
- Complex effects that would require full MTG engine fidelity
  (replacement effects stacking, copies of triggered abilities, Cascade
  vs Discover, time-walks). v1 punts on edge cases by surfacing
  "Arbiter unresolved — manual decision" and letting the user resolve.
- Voice/audio narration. Text only.
- Mobile. Desktop-first; mobile is Phase 6.5.
- Networked multiplayer. Local-first.

This boundary is critical. The trap with learn-to-play is implementing
80% of an MTG engine and discovering the last 20% is harder than the
first 80%. We use Arbiter's "unresolved" state as the escape valve —
the engine doesn't need to handle every edge case, only the common
ones, with Arbiter consulted on the rest.

---

## 3. Curriculum specs

Each difficulty has a **decision-point list** — moments where the
engine pauses and either (a) explains and asks, (b) explains and
auto-picks, or (c) skips entirely.

### Beginner — "Hand-held"

| Decision point | Behavior |
|---|---|
| Mulligan | Explain London. Show keep score. Ask. |
| Untap step | Explain "untap everything you control." Skip ask. |
| Upkeep triggers | List every trigger; explain stack order; ask order if >1. |
| Draw step | Explain draw. Show card. Skip ask. |
| Main phase 1 — land drop | Remind about one-per-turn rule. Ask which land if 2+. |
| Main phase 1 — cast spells | For each castable: explain mana cost, what it does, when to cast vs hold. Ask which to cast. Show all available targets when prompting. |
| Combat — declare attackers | Explain summoning sickness, vigilance, evasion. Show every legal attacker. Ask. |
| Combat — declare blockers | Show every legal blocker. Explain trample/first strike interactions. Ask. |
| Combat damage | Step through assignment. Explain lethal. |
| End step triggers | List, explain order, ask if ambiguous. |
| Opponent triggers | Explain every "they get to do X" moment. |
| State-based actions | Explain when they're checked, what they do. |
| Priority windows | Surface every priority window. Explain why this is the window for instants/abilities. |

Pacing: hand turns take 5-10 minutes. The point isn't speed.

### Intermediate — "Light coaching"

| Decision point | Behavior |
|---|---|
| Mulligan | Show keep score; ask without London tutorial. |
| Untap/upkeep/draw | Auto. Surface only triggers that matter (replacement effects, optional abilities, conditional triggers). |
| Land drop | Auto-pick by archetype hint (color priority + curve). Allow override. |
| Cast spells | Suggest a play ("Karn would cast Sol Ring before commander"); ask for confirmation. Explain when the suggested play is non-obvious. |
| Combat | Auto-attack unless there's a "this is a trap" pattern (e.g. opponent has flash, untapped open mana matching a counter, etc.) — surface the trap, ask. |
| Triggers | Auto-stack in default order. Surface only when there's a real decision (target choice, order matters). |
| Priority | Skip auto-pass windows. Surface when there's a real decision (opponent cast something you might counter; they're attacking and you might fog). |

Pacing: hand turns take 1-2 minutes. The agent does the busywork; the
user makes the decisions that actually matter.

### Expert — "Silent until trouble"

| Decision point | Behavior |
|---|---|
| Everything | Auto, including casting decisions, blocks, sequencing. |
| Mistakes | Surfaced post-hoc. "You held up mana for a counter; the opponent untapped and you didn't trigger your ETB tax." |
| Rules edge cases | Arbiter consulted silently; if it resolves cleanly, just play it. If unresolved, surface to user with the trace. |
| Missed lines | Detect after-the-fact via game-tree replay. "You could have won this turn by sequencing X before Y." |
| Win/loss summary | Detailed post-game analysis with mistakes-counted, optimal-line-missed-counted, archetype-fit score. |

Pacing: hand turns take 15-30 seconds. The agent runs the game; the
user watches and learns from the post-game.

---

## 4. Architecture sketch

### New components

```
app/src/lib/learn/
  gameState.js         — pure game-state object + zone helpers
  gameEngine.js        — turn/phase/step state machine, trigger queue
  legalChoices.js      — generate legal actions given current state
  decisionGate.js      — bridge: ask user (beginner), auto + explain
                         (intermediate), or auto-silent (expert)
  opponentAI.js        — opposing-deck pilot. Reuses goldfish v2
                         classifier + archetype priority for cast
                         decisions; uses simple aggression heuristics
                         for attack/block. v1 doesn't try to be a
                         strong opponent — just a coherent one.
  narrator.js          — Jace-voice explanation formatter for each
                         decision-point class. Pulls from a per-class
                         template library at the matching difficulty.
  learnSession.js      — session manager: state, history, save record

app/src/components/mtg/learn/
  LearnView.jsx        — top-level UI; replaces ChatPanel in centerView
                         when active. Has zones, stack panel, hand,
                         decision modal, narrator pane.
  ZoneStack.jsx        — battlefield/graveyard/exile/library/hand
                         renderers
  StackPanel.jsx       — current stack with target chains
  DecisionModal.jsx    — render one decision point + legal choices
  NarratorPane.jsx     — scrolling Jace narration with collapse-to-
                         summary on Expert mode

app/src/app/api/learn/
  start/route.js       — POST: { deckId, opponentDeckId, difficulty }
                         → new learn session
  step/route.js        — POST: { sessionId, decision } → next state
  save/route.js        — POST: { sessionId } → persist to
                         data/learn-sessions/
```

### Reuses

- Goldfish v2 classifier (`classifyCard`) for opponent decision-making
- Goldfish v2 archetype detector for opponent priority
- Arbiter for rules questions (existing `/api/arbiter`)
- Card index (`cardIndex.js`) for oracle text + type lines
- Power ranker (existing) for deck-fit scoring
- gameInsights pattern for learn-run summaries

### Data shapes

```ts
GameState {
  turn: number;
  activePlayer: "user" | "ai";
  priorityHolder: "user" | "ai" | null;
  phase: "beginning" | "precombat-main" | "combat" | "postcombat-main" | "ending";
  step: string;  // "untap" | "upkeep" | "draw" | "main" | "beginning-of-combat" | ...
  stack: StackObject[];
  players: { user: PlayerState; ai: PlayerState };
  pendingTriggers: TriggerWaiting[];  // waiting to be put on stack at next checkpoint
}

PlayerState {
  life: number;
  commanderDamageFrom: { [opponentId]: number };
  poison: number;
  manaPool: { W: number; U: number; B: number; R: number; G: number; C: number };
  library: Card[];
  hand: Card[];
  battlefield: Permanent[];
  graveyard: Card[];
  exile: Card[];
  command: Card[];
  experience: number;
  cardsDrawnThisTurn: number;
  landsPlayedThisTurn: number;
}

Permanent {
  card: Card;
  tapped: boolean;
  summoningSick: boolean;
  counters: { [type]: number };
  attachments: PermanentId[];
  attachedTo: PermanentId | null;
}

LearnSession {
  id: string;
  startedAt: ISO8601;
  deckId: string;
  opponentDeckId: string;
  difficulty: "beginner" | "intermediate" | "expert";
  state: GameState;
  decisionLog: { turn, phase, step, prompt, options, chosen, correct }[];
  outcome: "user-wins" | "ai-wins" | "abandoned" | null;
}
```

---

## 5. Build sequence

Each step is a self-contained PR with tests. Don't skip ahead.

1. **PR1 — gameState + zone helpers + tests.** ✅ DONE (master, 2026-05-26).
   `app/src/lib/learn/gameState.js` + `gameState.test.js`. Pure data,
   no game logic. 56 tests covering factories (createGameState,
   createPlayerState, createPermanent, createStackObject), zone
   transitions (moveCardToZone, drawCards, shuffleLibrary,
   putCardsOnBottom), permanent mutators (tap/untap, addCounter +
   getCounter + removeCounter, untapAll), mana pool (addMana,
   emptyManaPoolForPlayer, emptyAllManaPools, totalAvailableMana),
   life and damage (loseLife, gainLife, addCommanderDamage with
   self-damage guard), turn counter reset, findPermanent across
   players, logEvent, and immutability spot checks. All helpers are
   pure — they return new state, never mutate.
2. **PR2 — gameEngine state machine.** ✅ DONE (master, 2026-05-26).
   `app/src/lib/learn/gameEngine.js` (~290 LOC) + 29 tests.
   `advanceStep` / `runStepActions` / `nextStep` walk the turn
   sequence; `passPriority` handles the priority loop including
   step-end-on-empty-stack and stack-resolution-on-non-empty;
   `resolveTopOfStack` runs `payload.onResolve` callbacks; trigger
   queue via `enqueueTrigger` + `flushTriggers` with APNAP ordering;
   `startGame` covers the opening 7 + first-turn draw-skip per CR
   103.7a. Untap/cleanup correctly skip the priority grant per
   CR 117.3a.
3. **PR3 — legalChoices generator.** ✅ DONE (master, 2026-05-26).
   `app/src/lib/learn/legalChoices.js` (~280 LOC) + 40 tests.
   Mana-cost parser handles generic/colored/colorless/X/hybrid/
   phyrexian; `canPayManaCost` checks pool affordability with
   hybrid resolution; `legalActionsForPlayer` surfaces pass-priority,
   play-land (sorcery-speed + own-turn + stack-empty + once-per-turn),
   cast-spell (timing + cost), declare-attacker (untapped, not
   summoning sick unless Haste), declare-blocker (untapped, defender
   only). Activate-ability and target selection deferred per design
   doc anti-goals.
4. **PR4 — opponentAI reusing goldfish v2 logic.** ✅ DONE (master,
   2026-05-26). `app/src/lib/learn/opponentAI.js` (~240 LOC) + 15
   tests. `pickAction` runs the priority order land → cast → pass
   with archetype-aware cast scoring matching goldfish v2's internal
   `buildCastScorer`. `pickAttackPlan` attacks with every legal
   attacker (v1 policy). `pickBlockPlan` assigns one blocker per
   attacker preferring smallest power (chump-block). archetype
   resolves lazily via `detectArchetype` over `deriveDeckRepresentation`
   when not supplied.
5. **PR5 — decisionGate + narrator stubs.** Beginner only, narration
   from templates. ~300 lines + tests.
6. **PR6 — wiring + UI.** ✅ DONE in 4 sub-PRs (master, 2026-05-26):
   - **PR6.1** `actionDispatcher.js` + 20 tests — applies a legal
     action to state with type-aware spell resolution.
   - **PR6.2** `learnSession.js` + 18 tests — session lifecycle
     container with advanceUntilDecision driver.
   - **PR6.3** `/api/learn/start` + `/api/learn/step` + in-memory
     session store + 19 tests — HTTP boundary.
   - **PR6.4** `useLearnSession` hook + `LearnView.jsx` — minimal
     but functional React UI: deck pickers, difficulty radio,
     decision modal with options + recommended badge, recent-
     actions feed, abandon button, win/lose screen. No fancy zone
     graphics — that's PR8 polish.
7. **PR7 — Intermediate difficulty.** ✅ DONE (master, 2026-05-28).
   `app/src/lib/learn/trapDetector.js` (~210 LOC) + 18 tests, plus
   wiring in `decisionGate.js` and `narrateAttackTrap` in
   `narrator.js`. Two combat trap detectors ship:
   `detectInstantSpeedResponse` (opponent has 2+ untapped lands +
   1+ in hand → warn; 4+ lands + 2+ hand → danger) and
   `detectCounterAttackLethal` (opponent's untapped ready creatures
   have enough power to lethal you on the swing-back after this
   attack, accounting for blockers staying home). Intermediate
   gate now auto-attacks when no trap fires; when one does, it
   asks with a Jace-voice trap-warning prefix on the prompt.
   Narration template swap (one-line step header at intermediate)
   and auto-pass on no-decision-points were already shipped in PR5.
8. **PR8 — Expert difficulty:** silent run, post-game analysis,
   missed-line detection via game-tree replay.
9. **PR9 — Learn session persistence** (`data/learn-sessions/`) +
   learn-session insights matching the gameInsights pattern.
10. **PR10 — Polish:** mobile, accessibility, narrator voice tuning,
    edge-case Arbiter integration.

Realistic timeline: 4-6 weeks of focused work, given the foundation is
in place. The hardest part is the engine — getting trigger ordering
+ priority + replacement effects right. Plan to iterate hard against
real cards from the user's actual decks.

---

## 6. Open questions

Resolved during the v2 design pass (2026-05-28):

1. **Opponent deck.** Resolved: pick from saved decks at session start.
   In Standard mode the user picks one opponent; in Commander mode
   the user picks three. (See §11.4 for the persistent-pod alternative
   we may layer later.)
2. **Difficulty switching mid-game.** Resolved: no. Difficulty locks
   at session start; restart for a different level.
3. **Save outcome to deck memory?** Resolved: yes. "Won 3 of last 5
   Commander learn runs with Atraxa" surfaces in DeckView alongside
   goldfish stats. Format-tagged so Standard and Commander histories
   stay separable.
4. **Cards engine doesn't understand.** Resolved: pause and ask the
   user to manually resolve, log it, continue. Build the
   unresolved-card pattern library over time.

---

## 7. Success criteria

Phase 6 v1 ships when:
- A user can pick a deck, pick a format (**Standard** or **Commander**),
  pick the opponent deck(s), pick a difficulty, and play a full game
  with narration through to a winner.
- Both Standard (1v1) and Commander (4P FFA) are playable end-to-end
  at all three difficulty levels.
- Learning sessions persist to `data/learn-sessions/` and surface in
  insights ("you've abandoned 4 of 5 Beginner runs at the combat
  step — try Intermediate?"). Format and per-opponent breakdowns
  surface in Commander mode.
- Arbiter is consulted for rules questions; the engine doesn't fake
  rulings.
- Zero Anthropic calls in normal operation (CLAUDE.md prime
  directive). Jace voice + Arbiter both via Ollama.

---

## 8. Anti-goals

What this phase explicitly does NOT do:
- It is not a full MTG engine. We don't need to handle every Un-set
  card or every edge case from the comprehensive rules.
- It is not a tournament tool. No DCI shuffling, no judge log, no
  upkeep timer.
- It is not a deck builder. Use existing tools.
- It is not a card database. Cards come from existing
  `cardIndex.js` and Scryfall fallback.
- It is not a format generalizer. Only Standard (1v1) and Commander
  (4P FFA) ship; no 5/6-player, no two-headed giant, no Brawl, no
  60-card. See §2 NOT-in-scope.

---

## Next session checklist

Before starting Phase 6 implementation, the next session should:

1. Set up the GitHub remote (TODOS.md P0 item)
2. Re-read this doc end-to-end
3. Decide: solo focus on PR1 (gameState) OR break this doc into
   smaller "Phase 6.1, 6.2, 6.3..." sub-docs first
4. Confirm or revise the open questions in §6
5. Start a `feat/phase6-foundation` branch (after the remote is set up)
6. PR1: gameState + tests

See you on the other side.

---

## 11. Commander (4P FFA) expansion — design pass v2

**Added 2026-05-28** after the owner confirmed that 4-player Commander
is the format he and his pod actually play. PRs 1-7 shipped against
Standard (1v1); this section specifies how the foundation extends to
Commander mode without rebuilding it.

### 11.1 Two-mode framing

The engine supports exactly two formats — **Standard (1v1)** and
**Commander (4P FFA)**. Format is a session-level config; both share
the same gameState shape, turn machine, action dispatcher, and
narrator templates. The only difference is the number of players and
a handful of helpers that need to fan out across opponents.

The trap to avoid: building an "N-player abstract" engine that can
support 3-player, 5-player, two-headed giant, etc. The owner doesn't
play any of those — generality there is wasted work and surface area.
The codepaths fork at 2 vs 4, nowhere else.

### 11.2 Data-model changes

| Before (Standard-only)              | After (both modes)                         |
|-------------------------------------|---------------------------------------------|
| `state.players: { user, ai }`       | `state.players: { user, ai } \|`           |
|                                     | `{ user, ai1, ai2, ai3 }`                  |
| `opponentOf(playerId)` → string     | `opponentsOf(state, playerId)` → string[]  |
| Implicit `activePlayer`              | Same                                       |
| Implicit defender in combat          | `declare-attacker` action gains            |
|                                      | `defenderId` (auto-filled in Standard)     |
| n/a                                  | `state.mode: "standard" \| "commander"`    |
| n/a                                  | `state.turnOrder: string[]` + helper       |
|                                      | `nextInTurnOrder(state, playerId)`         |

Standard mode keeps `{user, ai}` keys exactly as today — the existing
~250 tests don't shift. Commander mode adds `ai1/ai2/ai3` keys and
the engine just iterates `Object.keys(state.players)` everywhere it
used to hardcode the two.

### 11.3 Turn rotation

Standard: alternating user ↔ ai (unchanged).
Commander: user → ai1 → ai2 → ai3 → user, with `state.turnOrder`
holding the rotation array so the engine can advance via
`turnOrder[(idx + 1) % turnOrder.length]`. Custom seating order is
out of scope for v1 — the array is built deterministically from the
session-start order.

### 11.4 Pod model (opponent selection)

**Default (v1):** at session start the user picks 3 of their saved
decks as the three AI opponents. Maximum realism — the owner trains
against his actual pod. Per-opponent archetype detection picks the
playstyle for each.

**Future option (post v1):** persistent "my pod" config — the user
configures their 3 default opponent decks once via a Settings panel;
every Commander session uses them unless overridden. Saves three
deck-picker clicks per session for the common case where the pod is
stable. Layer this after the per-session flow is shipped and
validated.

**Not building:** generic-archetype opponents (e.g. "Aggro / Control /
Combo"). The owner specifically wants pod-archetype mimicry, not
category stress-testing. If that gap surfaces later we revisit.

### 11.5 Multi-defender combat

In Commander, declaring an attacker now requires picking which of
the three opponents that attacker is targeting (CR 506.2). Engine
changes:

- `declare-attacker` action's payload gains `defenderId: PlayerId`.
- In Standard the dispatcher auto-fills `defenderId` to the lone
  opponent — calling sites can keep emitting the action without
  `defenderId` and the engine fills it in.
- In Commander the decisionGate surfaces defender choice as part of
  the action's option set: each attacker contributes N declare-attacker
  actions (one per legal defender) rather than one.
- The opponentAI picks defender heuristically: lowest-life opponent
  by default; ties broken by who has fewer untapped blockers.
- The trap detector's "counter-attack lethal" check extends to ALL
  opponents: even if the player you attacked can't lethal you back,
  another opponent at the table might. The warning now reads "after
  this attack, ai2 has enough on board to lethal you" with
  ai2-specific detail.

### 11.6 AI opponents

Each AI opponent runs its own `pickAction` via `opponentAI` with its
own archetype detection over its own deck. So a `Krenko aggro` deck
sat next to a `Sheoldred control` deck behaves like both decks at
once — no shared global archetype. `pickAction(state, "ai2", ...)`
just reads `state.players.ai2.battlefield` and so on.

Multi-AI orchestration: when an opponent's turn comes up, the
session loop runs that opponent's full turn (all priority windows,
combat, etc.) via the existing engine. No multi-AI deadlocks because
priority is sequential by definition — only one AI is "thinking" at
a time.

### 11.7 PR sequence

Each PR is shippable independently against the existing user-facing
Standard mode. The user can keep using Standard 1v1 throughout, and
Commander mode lights up at PR 11.

1. **PR 8 — Engine refactor. ✅ Shipped 2026-05-28.** Introduced
   `state.mode` (validated against `MODES`), `state.turnOrder[]`, and
   two seat-aware primitives in `gameState.js`: `opponentsOf(state,
   playerId)` (all enemies, turn-ordered) and `nextInTurnOrder(state,
   playerId)` (rotation, wraps). Player validation broadened to the
   Commander seats (`COMMANDER_PLAYER_IDS = [user, ai1, ai2, ai3]`);
   `findPermanent`/`emptyAllManaPools` now iterate
   `Object.keys(state.players)` instead of a hardcoded constant. The
   engine's turn + priority passing switched from `opponentOf` to
   `nextInTurnOrder`, and the "everyone passed" threshold scales from
   `>= 2` to `>= Object.keys(state.players).length`. The combat
   dispatcher accepts an optional `action.defenderId` (forward-compat
   for PR 10), defaulting to the lone/first opponent. `opponentOf` is
   retained as a documented Standard-only helper. Standard tests stayed
   green (249→263 with 14 new multiplayer-primitive tests in
   `gameState.multiplayer.test.js`); no user-visible change.
2. **PR 9 — Commander session start + turn rotation. ✅ Shipped 2026-05-28.**
   `createLearnSession({ mode: "commander", opponentDecks: [d1,d2,d3],
   opponentCommanders: [[..],[..],[..]] })`. What landed:
   - `createGameState` forks into `buildStandardSeats` / `buildCommanderSeats`;
     commander requires exactly 3 pod decks and seats user + ai1/ai2/ai3.
   - `startGame` deals opening 7s to every seat in turn order (Standard
     still draws user+ai identically).
   - `decisionGate` now treats **any non-user seat** as AI-controlled
     (was hardcoded `=== "ai"`), so ai1/ai2/ai3 auto-pilot at every
     difficulty. Per-opponent archetype is automatic — `opponentAI`
     already detects each AI's archetype from its own board when none is
     passed.
   - Multiplayer win/loss + **player elimination** in `learnSession`:
     user dead → loss; all opponents dead → win; a non-final opponent
     death removes that seat (CR 800.4a) and the game continues. The PR 8
     primitives (`opponentsOf`/`nextInTurnOrder`/seat-count pass
     threshold) adapt automatically because they read live
     `turnOrder`/`players`.
   - `trapDetector` defender resolves via `opponentsOf(state, attacker)[0]`
     instead of a hardcoded `"ai"` (was a crash in Commander; PR 10
     extends the counter-attack check to ALL opponents).
   - `POST /api/learn/start` accepts `mode`/`opponentDecks`/per-opponent
     `opponentCommanders` and returns `mode`.
   - +11 tests (gameState.multiplayer + new learnSession.commander +
     route); full learn suite 263→274, Standard untouched.
   - **Known PR-9 limitation:** with no `defenderId` yet, every AI's
     attacks default to the first opponent in turn order (the user) and
     combat-damage application itself remains a separate engine gap —
     both are PR 10's domain.
3. **PR 10 — Multi-defender combat.** `declare-attacker` payload
   carries `defenderId`. Trap detector + narrator extend to "which
   opponent could swing back lethal."
4. **PR 11 — LearnView 4P layout.** Three opponent strips in the UI,
   each showing name + life + commander damage from you + hand count
   + board count. Defender-pick prompt in combat decisions.
5. **PR 12 — Expert mode + post-game analysis.** The original PR 8
   from §5, now layered on the 4P engine. Silent autopilot in both
   modes; post-game analysis surfaces missed-line detection and
   per-opponent breakdowns in Commander.
6. **PR 13 — Learn-session persistence (4P-aware).** `data/learn-sessions/`
   tags each entry with `format: "standard" | "commander"` and an
   `opponents: PlayerSummary[]` array. Insights render per-format.

PR 7 (Intermediate trap warnings) already shipped — its trap
detector is Standard-mode-aware and gets extended in PR 10.

### 11.8 What this section does NOT change

- The difficulty curriculum in §3 stays unchanged. Beginner /
  Intermediate / Expert apply the same way in both modes.
- The narrator voice in §4 stays unchanged. Jace's tone is the same
  whether there's one opponent or three.
- The Arbiter integration in §4 stays unchanged. Rules questions
  resolve the same way regardless of player count.
- Anti-goals in §8 still apply, with the format-generalizer
  anti-goal added.

### 11.9 Format auto-detection

**Added 2026-05-28** per the owner: *"100 card decks are for commander,
and 60 card decks with or without a sideboard are for standard."*

The session should **infer** the format from the chosen deck rather
than make the user declare it. Detection lives in
`app/src/lib/learn/formatDetection.js` as a pure function
`detectDeckFormat(deck)` returning `{ format, reason, counts }`, where
`format` is `"standard" | "commander"` — deliberately the same string
as `state.mode` (§11.2), so callers pass it straight through to
`createLearnSession({ mode: format })`.

Signals, in priority order:

1. **A designated Commander section → `"commander"`.** Only EDH/Brawl
   decks name a commander, and those are 100-card singleton. This
   overrides size so a mid-build 99 (not yet at 100) still reads as
   Commander.
2. **Maindeck size ≥ 80 → `"commander"`, else `"standard"`.** 80 is
   the midpoint between the two legal sizes (60 and 100), so an
   off-count list snaps to the nearer format. Catches a flat
   100-line paste with no commander tag.
3. **A sideboard with no commander reinforces `"standard"`** — surfaced
   in `reason` for the UI; size already decides it in practice.

Counting rules: `qty` is summed (not entry count); **Tokens never
count** toward deck size; unrecognized section names fall through to
maindeck. Malformed/empty decks resolve to `"standard"` without
throwing.

`opponentCountForFormat(format)` maps `commander → 3`, `standard → 1`,
so the session-start flow knows how many opponent decks to ask for.

**Shipping ahead of the engine refactor.** The detection utility +
tests land independently of PR 8 (it reads only the parsed deck, not
gameState). It gets *wired into the UI* at:

- **PR 9** — session start uses `detectDeckFormat(userDeck)` to choose
  `mode` and `opponentCountForFormat()` to size the opponent picker.
- **PR 11** — the deck picker shows a format badge ("Commander · 100"
  / "Standard · 60") with a manual override toggle for the rare case
  the heuristic guesses wrong (e.g. a deliberately-undersized
  playtest list).

Until then the function is dormant foundation: tested, exported,
unreferenced by the still-Standard-only UI.
