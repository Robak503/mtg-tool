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
- Single-deck "solitaire" mode: user pilots their deck against a fixed
  AI-piloted opponent deck. Turns alternate, agent narrates per
  difficulty level.
- Three difficulty levels with explicit curriculum specs (below).
- Rules-accurate execution via Arbiter — every trigger, SBA, priority
  window, replacement effect surfaces as a discrete decision point.
- Game-state model: zones (library, hand, battlefield, graveyard, exile,
  command, stack), per-player life + commander damage + mana pools +
  poison + experience counters + monarch + initiative, the stack with
  ordered objects + targets, the active player and priority holder, the
  current phase/step.
- Save learning sessions: same shape as `data/games/` but tagged
  `mode: "learn"` with difficulty, mistakes-made, hints-shown,
  duration, opponent-deck.
- Surface "you keep missing X" insights via the same
  `gameInsights.js` style helper, scoped to learning runs.
- Jace voice for explanations (CLAUDE.md §6); Arbiter for rules
  citations.

### NOT in scope (defer to Phase 6.5+ or later)
- Multiplayer (3-player or 4-player Commander). Solitaire only for v1.
- Opponent deck-building UI. Use existing saved decks as opponents.
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
4. **PR4 — opponentAI reusing goldfish v2 logic.** ~200 lines.
5. **PR5 — decisionGate + narrator stubs.** Beginner only, narration
   from templates. ~300 lines + tests.
6. **PR6 — LearnView + ZoneStack + StackPanel + DecisionModal + initial
   wiring through `/api/learn/start` and `/api/learn/step`.** Beginner
   playable end-to-end against a fixed opponent deck.
7. **PR7 — Intermediate difficulty:** swap narration templates,
   auto-pass on no-decision points, surface trap warnings.
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

These need user input before implementation starts:

1. **Opponent deck.** Static fixed deck (e.g. precon) or rotates through
   saved decks? Recommend: pick from saved decks at session start, so
   the user trains against their actual playgroup's archetypes.
2. **Difficulty switching mid-game.** Allowed? Recommend: no, lock
   difficulty at session start. Restart for a new level.
3. **Save outcome to deck memory?** Should "won 3 of last 5 learn
   sessions with Atraxa" appear in DeckView? Recommend: yes, alongside
   goldfish runs.
4. **Cards engine doesn't understand.** When Arbiter says "unresolved"
   on a card's ability, default behavior? Recommend: pause and ask the
   user to manually resolve, log it, and continue. Build the
   unresolved-card pattern library over time.

---

## 7. Success criteria

Phase 6 v1 ships when:
- A user can pick a deck, pick an opponent deck, pick a difficulty, and
  play a full 6-12 turn solitaire game with narration.
- All three difficulty levels are playable end-to-end.
- Learning sessions persist to `data/learn-sessions/` and surface in
  insights ("you've abandoned 4 of 5 Beginner runs at the combat
  step — try Intermediate?").
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
- It is not multiplayer. Solitaire only for v1.

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
