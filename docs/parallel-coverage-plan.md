# Parallel Coverage Push — 4-Chat Plan (2026-06-18)

Baseline: **v0.38.0 / master `d2fb8d6`**, corpus ~16.1% native. All four chats branch from this.

## Why parallel + how it stays safe

Naive parallel branches collide on the hot shared files (`parser.js`, `effectAtoms.js`,
`parser.test.js`) and their corpus sweeps interfere. The safe model is **fan-out build, serialized
integrate**: the four chats *build* their mechanics in parallel (the expensive part), but **only Chat 1
(the integrator) merges**, one PR at a time, rebasing the others as it goes.

## The four mechanics (disjoint — no two chats touch the same atom)

| Chat | Mechanic | Gross lever | Owns |
|---|---|---:|---|
| **1** | **Tokens** + **Integrator** | 3,632 | `master`, all merges, releases |
| **2** | **+1/+1 / −1/−1 counter distribution** | 2,256 | counter atoms |
| **3** | **Edicts + sacrifice-as-effect** | 1,575 | all sacrifice/edict atoms |
| **4** | **Each-player draw / discard / life / mill** | 1,846 | non-sacrifice each-player/target-player atoms |

Clean boundary between 3 and 4: **Chat 3 owns every "sacrifice" verb** (each-player, target-player,
as-effect); **Chat 4 owns each-player/target-player draw, discard, lose-life, mill** (no sacrifice).

## Coordination protocol (every chat follows this)

1. **One mechanic = one branch off `master`** (`feat/tokens`, `feat/counters`, `feat/edicts`,
   `feat/each-player`). Re-`git pull origin master` before branching so you're on `d2fb8d6`+.
2. **Go deep, in slices.** Don't try to land the whole mechanic in one giant PR — ship 2–4 focused
   sub-slices (e.g. tokens: typed creature tokens → named Treasure/Clue/Food → tokens-with-keywords).
   Each sub-slice is its own branch + PR + gate.
3. **Full gate per sub-slice** (this is the project's bar — see `docs/coverage-autopilot-prompt.md`):
   build → a **REAL-parser corpus sweep** (run your matcher over all cards via `publicCard`, confirm
   **0 false-positives**, list every newly-native card) → `npm test` + `npm run lint` (both from `app/`)
   → a **3-lens adversarial review** (a `Workflow` with 3 Opus agents; fix every P0 / false-positive /
   regression) → **live QA** (`npm run dev`, exercise the real path). Then open a PR — do **not** merge.
4. **Only Chat 1 merges.** It reviews each PR, merges one at a time, and posts "rebase now" — at which
   point you `git checkout master && git pull && git rebase origin/master` onto your branch.
5. **Shared-file convention** (minimizes merge conflicts): add your matchers, your `ATOM_RESOLVERS`
   entries, and your `parser.test.js` pins inside a clearly-labeled block, e.g.
   `// ===== TOKENS (chat 1) =====`. Append at distinct points; conflicts then auto-merge or are trivial.

## THE CREED (non-negotiable, every chat)

A **false-negative is SAFE** — if you can't fully model a card's text, route it to the Arbiter (the
program parses LOW). A **false-positive is FORBIDDEN**: claiming a card is native and then mis-resolving
it, dropping a clause, hitting the wrong target, or losing/duplicating a card. Anchored, all-or-nothing
matchers (`^…$`), front-face type only (CR 712.4a), and a guard for every rider. Never invent rule
numbers or card text. `npm`/`lint`/`coverage` always from `app/`. Stage explicit paths (`git add <path>`,
never `git add -A` — it re-adds an untracked `ACADEMY-CONVO.md`). Sweep stray scratch `.mjs` before lint.

## Study these as templates (the pattern every atom follows)

- A **spell-effect atom**: `effects/parser.js` `parseExtendedAtom` (the anchored matchers) + a resolver
  in `effects/effectAtoms.js` registered in `ATOM_RESOLVERS`. The program is native automatically when
  every atom is `KNOWN` (no coverage edit needed for instants/sorceries).
- An **interactive (resolution-time choice) atom**: the impulse-dig slice (#210) is the cleanest, most
  recent end-to-end example — `impulse-dig` in `parser.js` + `applyImpulseDigAtom` in `effectAtoms.js` +
  `setPendingImpulseDigChoice` (`pendingChoice.js`) + `resolveImpulseDigChoice` (`effects/runProgram.js`)
  + the driver branch / `applyImpulseDigChoice` / dispatch in `learnSession.js` + `ImpulseDigPanel`
  (`components/mtg/LearnView.jsx`) + `useLearnSession.js` + `impulseDig.test.js`. Mirror it for any
  mechanic that needs the player to make a choice as the effect resolves.
- The **target enumerator**: `spellEffects.enumerateTargets` (single source of truth) +
  `effects/targeting.atomTargetSpec` for cast-time target binding.

---

## Per-chat kickoff briefs (paste-ready)

### CHAT 2 — +1/+1 / −1/−1 COUNTER DISTRIBUTION

> You are working in the MTG-TOOL repo (the Academy learn engine). Read `CLAUDE.md` and
> `docs/parallel-coverage-plan.md` first — you are **Chat 2** in that plan. Your mechanic:
> **counter distribution**. The engine already models "put a +1/+1 counter on target creature" (N=1,
> single target). Go DEEP on the rest, in focused sub-slices, each behind the full gate:
> (a) **N counters** ("put two/three/N +1/+1 counters on target creature"); (b) **distribute to a set**
> ("put a +1/+1 counter on each creature you control"); (c) **multi-target** ("put a +1/+1 counter on
> each of up to N target creatures" / "on N target creatures"); (d) **−1/−1 counters** (the removal
> forms — reuse the lethal-SBA path the existing `-1/-1` add-counter uses); optionally
> (e) "distribute N +1/+1 counters among any number of target creatures". Reuse `applyAddCounter` +
> the `eachCreature`/`youControl` scope conventions already in `effectAtoms.js`. ALL-OR-NOTHING:
> any rider/filter you can't model → Arbiter. Branch `feat/counters` off latest master; open PRs, do
> NOT merge (Chat 1 integrates). Run a REAL-parser corpus sweep (0 false-positives) + a 3-lens Workflow
> review + live QA per sub-slice. `npm`/`lint` from `app/`. CREED: a false-positive is forbidden.

### CHAT 3 — EDICTS + SACRIFICE-AS-EFFECT (aristocrats)

> You are working in the MTG-TOOL repo (the Academy learn engine). Read `CLAUDE.md` and
> `docs/parallel-coverage-plan.md` first — you are **Chat 3**. Your mechanic: **sacrifice as an effect /
> edicts** (the engine already models sacrifice as a *cost*; this is the *effect* side). You own EVERY
> "sacrifice" verb. Sub-slices, full gate each: (a) **edicts** — "target player sacrifices a creature"
> (Diabolic Edict), "each opponent sacrifices a creature" (Fleshbag Marauder / Plaguecrafter),
> "each player sacrifices a creature"; (b) **sacrifice-as-effect** — "sacrifice a creature: <effect>"
> appearing as an effect clause, and "you sacrifice a/another <type>"; (c) the **victim choice** — the
> sacrificing player picks; reuse the resolution-time pending-choice seam (study the impulse-dig /
> hand-discard slices) for the human, an AI heuristic (sac the least valuable) for opponents. Watch the
> dies-trigger interaction (the `sacrificeDropsTrigger` fail-safe already exists in
> `effects/abilities.js` — a sacrifice that would drop a leave/dies trigger routes to Arbiter). Filtered
> edicts ("with the greatest power", "you don't control") → Arbiter unless you can model them exactly.
> Branch `feat/edicts` off latest master; PRs only, Chat 1 merges. REAL-parser sweep (0 false-positives)
> + 3-lens Workflow review + live QA per sub-slice. `npm`/`lint` from `app/`. CREED: false-positive forbidden.

### CHAT 4 — EACH-PLAYER DRAW / DISCARD / LIFE / MILL

> You are working in the MTG-TOOL repo (the Academy learn engine). Read `CLAUDE.md` and
> `docs/parallel-coverage-plan.md` first — you are **Chat 4**. Your mechanic: **each-player /
> target-player symmetric effects** EXCEPT sacrifice (Chat 3 owns all sacrifice). The engine models
> draw / lose-life / mill for the CONTROLLER (and some each-opponent forms). Extend to other players,
> in focused sub-slices, full gate each: (a) **each player draws N** (wheels-lite — Howling Mine class)
> and **target player draws N**; (b) **discard** — "target player discards N cards" (Mind Rot; the
> discarding player chooses — reuse the resolution-time pending-choice picker for the human, AI picks
> its worst cards) and "each player discards N"; (c) **lose/gain life for each player** ("each player
> loses N life"); (d) **each-player mill** ("each player mills N"). Study the existing `draw` /
> `lose-life` / `mill` atoms + the impulse-dig pending-choice slice (for the discard picker). The
> "who acts" must be enforceable (each player / target player / each opponent) — a filtered subset you
> can't model → Arbiter. Branch `feat/each-player` off latest master; PRs only, Chat 1 merges.
> REAL-parser sweep (0 false-positives) + 3-lens Workflow review + live QA per sub-slice. `npm`/`lint`
> from `app/`. CREED: false-positive forbidden.

### CHAT 1 — TOKENS + INTEGRATOR (this chat)

Tokens (3,632, the biggest lever): typed creature tokens ("a 1/1 white Soldier creature token", N×, X×)
→ named predefined tokens **with their built-in abilities** (Treasure, Clue, Food, Blood, Map,
Powerstone, Gold) → tokens with keywords. Plus: own `master`, run the 3-lens review + merge each worker
PR one at a time, post "rebase now", cut the next release at the milestone.
