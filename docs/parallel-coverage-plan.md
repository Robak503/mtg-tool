# Parallel Coverage Push — 4-Chat Plan (2026-06-18)

Baseline: **v0.38.0 / master `d2fb8d6`**, corpus ~16.1% native. All four chats branch from this.

## Why parallel + how it stays safe

Naive parallel branches collide on the hot shared files (`parser.js`, `effectAtoms.js`,
`parser.test.js`) and their corpus sweeps interfere. The safe model is **fan-out build, serialized
integrate**: the builder chats *build* their mechanics in parallel (the expensive part), but **only the
Command chat merges**, one PR at a time, rebasing the others as it goes.

## Roles — 1 Command + 4 builders

| Chat | Role / mechanic | Gross lever |
|---|---|---:|
| **Command** | Integrator — owns `master`, reviews + merges every PR serially, manages the rebase rotation, cuts releases, keeps the scoreboard + coverage number. **Builds nothing.** | — |
| Builder | **Tokens** (typed creature → named Treasure/Clue/Food w/ abilities → keyword tokens → counts) | 3,632 |
| Builder | **+1/+1 / −1/−1 counter distribution** | 2,256 |
| Builder | **Edicts + sacrifice-as-effect** (owns every "sacrifice" verb) | 1,575 |
| Builder | **Each-player draw / discard / life / mill** (non-sacrifice) | 1,846 |

Clean boundary between edicts and each-player: **edicts owns every "sacrifice" verb** (each-player,
target-player, as-effect); **each-player owns draw, discard, lose-life, mill** (no sacrifice).

## Coordination protocol

**Builders:**
1. **One mechanic = one branch off latest `master`** (`feat/tokens`, `feat/counters`, `feat/edicts`,
   `feat/each-player`). `git pull origin master` before branching.
2. **Go deep, in sub-slices.** Don't land a whole mechanic in one giant PR — ship 2–4 focused sub-slices.
   Each sub-slice is its own branch + PR + gate.
3. **Full self-gate per sub-slice** (the project's bar — see `docs/coverage-autopilot-prompt.md`): build →
   a **REAL-parser corpus sweep** (your matcher over all cards via `publicCard`; **0 false-positives**;
   list every newly-native card) → `npm test` + `npm run lint` (both from `app/`) → a **3-lens adversarial
   `Workflow` review** on Opus, **fix every P0 / false-positive / regression** → **live QA** (`npm run dev`).
   Then open a PR with the sweep count + verification in the body — do **not** merge.
4. **Rebase on demand.** When the Command chat posts "rebase now", `git pull origin master` +
   `git rebase origin/master` onto your branch, re-run tests, force-push.

**Command (integrator):**
1. Watch `gh pr list`. For each PR: re-run the corpus sweep + `npm test` + `npm run lint` on the
   merged-into-master result, spot-review the diff for CREED violations; escalate to a **full 3-lens
   review** only on concern (the builder already self-reviewed).
2. **Merge serially** (`gh pr merge <#> --squash --delete-branch`), one at a time. After each merge,
   post "**Builder X: rebase**" for the human to relay.
3. Update the scoreboard + the live coverage number; cut a release at each sensible milestone.

**Shared-file convention** (minimizes merge conflicts): each builder adds its matchers, its
`ATOM_RESOLVERS` entries, and its `parser.test.js` pins inside a clearly-labeled block, e.g.
`// ===== TOKENS =====`. Append at distinct points; conflicts then auto-merge or are trivial.

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
> NOT merge (the Command chat integrates). Run a REAL-parser corpus sweep (0 false-positives) + a 3-lens Workflow
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
> Branch `feat/edicts` off latest master; PRs only, the Command chat merges. REAL-parser sweep (0 false-positives)
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
> can't model → Arbiter. Branch `feat/each-player` off latest master; PRs only, the Command chat merges.
> REAL-parser sweep (0 false-positives) + 3-lens Workflow review + live QA per sub-slice. `npm`/`lint`
> from `app/`. CREED: false-positive forbidden.

### BUILDER — TOKENS (the biggest lever)

> You are working in the MTG-TOOL repo (the Academy learn engine). Read `CLAUDE.md` and
> `docs/parallel-coverage-plan.md` first — you are the **TOKENS** builder. Today the `create-token` atom
> in `effects/parser.js` (`parseExtendedAtom`) + `applyCreateToken` in `effects/effectAtoms.js` only
> handles vanilla typed creature tokens ("Create N P/T Subtype creature token"). Go DEEP in focused
> sub-slices, full gate each: **(T1) keyword tokens** ("…creature token with flying" / "…with flying and
> vigilance") — grant via `GRANTABLE_STATIC_KEYWORDS`; mint the token card with a real `keywords: []`
> array so `hasKeyword`/`permanentHasKeyword` see it. **(T2) named artifact tokens with their built-in
> abilities** — Treasure, Clue, Food, Blood, Map, Powerstone, Gold — a canonical token table
> (name → type/oracle/P-T) so each enters as a real permanent with its working ability (Treasure:
> `{T}, Sacrifice this: Add one mana of any color`); reuse the activated-ability machinery; the biggest
> token + ramp lever. **(T3) counts** ("Create X …" X-spells, "Create N …" beyond five). ALL-OR-NOTHING:
> a token shape you can't fully model (copy tokens, tokens with *triggered* abilities) → Arbiter. Branch
> `feat/tokens` off latest master; open PRs, do NOT merge (the Command chat integrates; rebase when
> pinged). Stage explicit paths (never `git add -A`). CREED: a false-positive is forbidden.

### COMMAND (this chat) — integrator

Builds nothing. Owns `master`: watches `gh pr list`, integration-checks each PR (re-run the corpus sweep
+ `npm test` + `npm run lint` on the merged result; full 3-lens review only on concern), merges serially
one at a time, posts "**Builder X: rebase**" after each merge, keeps the scoreboard + coverage number,
and cuts releases at milestones.
