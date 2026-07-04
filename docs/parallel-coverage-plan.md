> ⚠️ **HISTORICAL — coverage-chat era (bannered 2026-07-04).** Pre-dates the one-owner model and the playbooks; standing directives here (e.g. release holds) are VOID. Live: `memory/orders/clyde-grind-relaunch.md` + docs/orchestration/MASTER-GUIDE.md.

# Parallel Coverage Push — 4-Chat Plan (2026-06-18)

Baseline: **v0.38.0 / master `d2fb8d6`**, corpus ~16.1% native. All four chats branch from this.

## Filesystem isolation — one git worktree per chat (CRITICAL)

The chats collide if they share one folder, because each Claude Code chat's working directory is fixed
at launch — so any file op that isn't explicitly pointed elsewhere lands in *that* folder. Fix: **every
chat runs from its OWN git worktree** (separate folder, separate branch, shared `.git`). **Launch each
chat rooted in its own folder** (not the main repo) and it's automatically isolated.

| Chat | Folder (cwd at launch) | Branch |
|---|---|---|
| **Command** (this) | `…/MTG-TOOL` (the main repo) | `master` |
| Harold — tokens | `…/mtg-tokens` | `feat/tokens-*` |
| Cindy — counters | `…/MTG-TOOL-counters` | `feat/counters-*` |
| Erin — edicts | `…/MTG-TOOL-edicts` | `feat/edicts-*` |
| Paula — each-player | `…/MTG-TOOL-each-player` | `feat/each-player-*` |
| Hans — scout | `…/MTG-TOOL-scout` | detached (read-only) |
| Rod — QA | `…/MTG-TOOL-qa` | detached (read-only) |

**Per-worktree setup (once):** `cd app && npm ci` (worktrees do NOT share `node_modules`).
**Dev-server port (live QA):** each chat uses a distinct port to avoid the 3000 collision — Command 3000,
tokens 3001, counters 3002, edicts 3003, each-player 3004, QA 3005 (`PORT=300X npm run dev`).

**Git flow in a worktree** (a worktree CANNOT `git checkout master` — master is checked out in the main
repo): builders, per sub-slice → `git fetch origin && git checkout -B feat/<mech>-<short> origin/master`
(fresh off the latest master, no rebase ever), build + gate, `git push -u origin feat/<mech>-<short>`,
open a PR, wait for it to merge (poll `gh pr view`), repeat. Support chats (detached) → `git fetch origin
&& git reset --hard origin/master` each cycle to analyze the latest. **Only the Command chat ever touches
`master` or merges.**

## Why parallel + how it stays safe

Naive parallel branches collide on the hot shared files (`parser.js`, `effectAtoms.js`,
`parser.test.js`) and their corpus sweeps interfere. The safe model is **fan-out build, serialized
integrate**: the builder chats *build* their mechanics in parallel (the expensive part), but **only the
Command chat merges**, one PR at a time, rebasing the others as it goes.

## Roles — 1 Command + 3 builders (+ on-demand support)

Trimmed from 4→3 builders on 2026-06-18 to stay under the 5-hr usage window. **Edicts is PARKED** (lowest
gross lever + hadn't shipped a PR yet; its worktree `MTG-TOOL-edicts` + WIP stay on disk to resume later).

| Chat | Role / mechanic | Gross lever | Cadence |
|---|---|---:|---|
| **Command** (Omnath) | Integrator — owns `master`, merges every PR serially, cuts releases, keeps the scoreboard. **Builds nothing.** | — | looping |
| Builder — **Tokens** | typed creature → named Treasure/Clue/Food w/ abilities → keyword tokens → counts | 3,632 | looping |
| Builder — **Counters** | +1/+1 / −1/−1 distribution | 2,256 | looping |
| Builder — **Each-player** | draw / discard / life / mill (non-sacrifice) | 1,846 | looping |
| ~~Builder — Edicts~~ | sacrifice-as-effect / edicts — **PARKED (resume first when capacity returns)** | 1,575 | paused |
| Support — **Scout** (Hans) | next-target + honest yields | — | **on-demand** (when a builder finishes a mechanic) |
| Support — **QA** (Rod) | interaction / regression / live-UI | — | **on-demand** (after every ~2-3 merges / at a milestone) |

Hans + Rod run **on-demand, not in a tight loop** — their value doesn't need continuous polling, and that
keeps the token burn down. Trigger them when their input is actually needed.

## Coordination protocol — autonomous loops, no human relay

Each builder runs as a **self-paced `/loop`**; the Command chat runs as a **self-paced `/loop`**. They
coordinate entirely through the GitHub PR queue — no "rebase now" relay is needed, because each builder
branches **fresh off the latest `master` every sub-slice** and **polls its own PR until it merges**.

**Builder loop** (repeat until the mechanic's clean templates are exhausted, then stop + report):
1. `git checkout master && git pull` → `git checkout -b feat/<mech>-<short-name>` (a FRESH branch per
   sub-slice off the now-current master — so no rebase is ever needed).
2. Build **one focused sub-slice**. **Full self-gate** (the project's bar — `docs/coverage-autopilot-prompt.md`):
   a **REAL-parser corpus sweep** (your matcher over all cards via `publicCard`; **0 false-positives**;
   list newly-native cards) → `npm test` + `npm run lint` (from `app/`) → a **3-lens adversarial `Workflow`
   review** on Opus, **fix every P0 / false-positive / regression** → **live QA** (`npm run dev`).
3. Push + **open a PR** (sweep count + verification in the body). Do **not** merge.
4. **Wait for YOUR PR to merge:** self-pace (`ScheduleWakeup` ~10 min), poll `gh pr view <#> --json state`.
   When `MERGED` → go to step 1 (next sub-slice off the updated master). If `CHANGES`/closed → address + re-push.
5. When every clean template of your mechanic is covered, **stop** and post "mechanic done — deferred: …".

**Command loop** (this chat): `git checkout master && git pull` → `gh pr list`. For each builder PR with
CI green: re-run the corpus sweep + `npm test` + `npm run lint` on the merged result, spot-review the
diff for CREED violations (escalate to a full 3-lens review only on concern — the builder self-reviewed);
**merge serially** (`gh pr merge <#> --squash --delete-branch`), one at a time. After merges: update the
scoreboard + live coverage number; cut a release at milestones. Then self-pace (~15–20 min) and re-poll.

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
