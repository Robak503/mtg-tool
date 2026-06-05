# Phase 6 — Playable Engine (the missing wiring)

**Status:** ✅ SHIPPED in v0.22.0 (2026-06-05). PRs 10.1–10.6 landed; The
Academy plays end-to-end in both modes at all difficulties. Independent code
review (Codex plan-stage + an adversarial diff review + an 800k-case mana fuzz)
found and fixed a hybrid-payment divergence; no correctness bugs remain. Live
QA confirmed in-browser with the owner's real Omnath deck.
**Created:** 2026-06-05.
**Owner:** Colton.
**Slots:** before PR 11 in `docs/phase6-learn-to-play.md` §11.7. PRs 11–13
(4P UI layout, expert mode, persistence) all assume a loop that plays a
real game; this phase makes that loop actually function.

---

## 1. The bug that started this

The owner opened **The Academy** (learn-to-play) on a Commander 4P pod and
got:

> ⚠️ Engine got stuck: safety cap (1000 ticks) hit

with all four players at 40 life, empty boards, "No actions yet," on turn 17.

That fingerprint — many turns elapsed, nothing on the battlefield, no
decisions — is the tell. The engine auto-piloted ~17 empty turns and gave up
at its 1000-tick safety backstop (`learnSession.js` `advanceUntilDecision`).

## 2. Root cause

The learn engine was built in pieces (PRs 1–10) that were each unit-tested in
isolation but **never wired into an end-to-end playable loop**. Three gaps,
stacked:

### 2.1 No mana is ever produced (the stall)

- `addMana()` exists in `gameState.js` but is **never called by any
  production code** — only tests. Lands enter the battlefield and just sit
  there; nothing taps them.
- Therefore every player's `manaPool` stays empty for the whole game.
- `legalChoices.actionsCastSpell` checks affordability against that empty
  pool → **no spell is ever castable**.
- No casts → no creatures reach the battlefield → no combat → no damage → no
  winner.
- In intermediate/expert difficulty the user is therefore never asked
  anything (there's nothing to decide), so `advanceUntilDecision` just
  auto-plays land drops + priority passes, turn after turn, until it burns
  the 1000-tick cap. **This is the "engine got stuck" the owner saw.**

### 2.2 Combat is never orchestrated by the driver

Even if a creature existed, combat wouldn't work:

- **AI never attacks.** `opponentAI.pickAction` (what the decision loop calls
  via `decisionGate`) returns `pass-priority` for combat. The batch pickers
  `pickAttackPlan` / `pickBlockPlan` exist but are **never called outside
  their own tests**.
- **User auto-attack infinite-loops.** `actionsDeclareAttacker` lists every
  untapped, non-summoning-sick creature but **never excludes creatures
  already declared this combat** (`state.combat.attackers`), and
  `applyDeclareAttacker` doesn't tap them. Intermediate auto-attack picks
  `attacks[0]`, dispatches it, and on the next tick the same creature is
  *still* legal → `attacks[0]` again → forever. (Currently masked only
  because §2.1 prevents any creature from existing.)
- **Blockers are never enumerated.** `actionsDeclareBlocker` needs the list
  of declared attackers, but the session driver calls
  `legalActionsForPlayer(state, actor)` **without** `declaredAttackers` —
  only tests pass it. So blocking never happens in a real session.

### 2.3 No graceful termination

With no damage, nobody's life ever changes, so `recordOutcomeIfChanged`
never fires a winner. The 1000-tick cap is the only exit, and it surfaces as
a scary "engine stuck" error rather than a meaningful end state.

> Combat *resolution* is fine — `combatResolution.js` (PR 10) correctly deals
> damage, kills lethal creatures, and drops unblocked damage on the chosen
> defender. It just never receives a populated `state.combat`.

## 3. Goal

Make The Academy play a full game end-to-end, in both Standard (1v1) and
Commander (4P FFA), at all three difficulties — a deck can cast its spells,
creatures hit the board, combat happens, damage flows, and someone wins (or
the game ends as a stalemate) without ever hitting the safety cap in normal
play.

This is the §7 "success criteria" of the parent design doc, finally made
true for the core loop. UI polish (PR 11), expert post-game analysis (PR 12),
and persistence (PR 13) build on top.

## 4. Design decisions (locked in plan-eng-review, 2026-06-05)

- **D1 — Full, float-capable mana, all source types.** Mana comes from
  lands **+ mana rocks + mana dorks** (dorks gated by summoning sickness).
  A real, persistent mana pool you can fill and *hold*: tap for 8, spend 3,
  float 5. This is required for "use all your mana every turn" decks like
  [[Omnath, Locus of Mana]], and it's the more teachable design (a learn tool
  should teach "tap → you have mana → spend it" as its own step). The owner
  chose the full version over auto-tap-on-cast.
- **D2 — Card-specific effects via a targeted registry, not a general
  engine.** `cardEffects.js` maps known card names to explicit effect
  descriptors. The engine gets two narrow hooks: a static P/T modifier pass
  and a mana-empty replacement. Ships Omnath + a few siblings (Kruphix,
  Horizon Stone, Upwelling). Unknown cards get no special effect (generic
  fallback). This is the design doc's own per-card-resolver pattern — NOT a
  general oracle-text-parsing rules engine (that's the 80/20 trap §2 warns
  against). `knowledge/mtg-engine/` is a rules *spec* (markdown CR reference
  the Arbiter cites), not executable code — we follow it for correctness
  (mana emptying = CR 500.4, SBAs = 704, P/T layers = CR 613) but can't
  import it. Notably it marks the 611–613 "layers" system as not built, which
  is exactly why a general P/T engine is out and the registry is in.
- **D3 — Attacking taps the creature** (with a vigilance exception). Rules-
  correct, self-dedups the infinite-attack loop via the existing `!tapped`
  filter, and stops an attacker from also blocking before its next untap.
  `combatResolution` reads `creaturePower` regardless of tapped, so damage is
  unaffected.

### Scope guardrails (carried from the parent doc §2/§8)

- **Still not a full MTG engine.** No first strike, trample, deathtouch,
  combat tricks (combat resolution already documents these). Card effects are
  a hand-curated registry, not a general system.
- **Simplified-but-honest mana payment.** Color matters (we keep the existing
  color-aware `canPayManaCost`), but source→pip assignment is greedy, not a
  full constraint solver. Edge cases (heavy multicolor pips off awkward duals)
  fall to "can't afford" rather than fabricating mana.
- **No new external calls.** Card data (type, oracle, mana) is already on the
  in-session card objects (`{ id, name, type, mana, oracle }`). Mana
  production is derived locally from name + oracle text.
- **Don't break the existing learn tests.** Existing cast tests pre-fill
  `manaPool`; casting still pays from the pool, so those stay green. Mana-
  emptying timing changes touch some engine tests — adjust them to the rules-
  correct behavior, don't paper over.

---

## 5. PR sequence

Each PR is self-contained, test-backed, and verified (`npm test`) before the
next. Naming continues the parent doc; these slot in as **PR 10.1–10.6**.
Nothing ships until 10.6 — phases are gated on `npm test` green, not on the
app being playable mid-sequence (avoids the `pr-split-broken-intermediate`
trap, since 10.1 makes creatures castable which exposes the 10.3 combat loop).

### PR 10.1 — Mana system: pool, sources, tap, casting *(the unblock)*

New `app/src/lib/learn/manaModel.js`:

- `manaProduction(card) → string[]` — colors a permanent's mana ability taps
  for.
  - Basic lands by name: Plains→W, Island→U, Swamp→B, Mountain→R, Forest→G,
    Wastes→C (snow basics too).
  - Otherwise: scan oracle for `Add ...` clauses, collect `{W|U|B|R|G|C}`
    symbols; "any color" → `[W,U,B,R,G]`. No `Add` clause → not a source.
  - Unparseable land that's clearly a land → `[C]` (pays generic; never
    fabricates a color it can't prove).
  - **Metadata fallback (Codex):** card objects carry `{type, oracle}`, not
    Scryfall's `produced_mana`. Back the oracle parse with a basics-by-name
    table (always correct for basics) + a small known-rock table (Sol Ring,
    Signets, Arcane Signet, Mind Stone…) so thin/missing oracle text doesn't
    silently break mana.
- `manaSources(state, playerId) → { permanentId, colors }[]` — untapped
  permanents with a mana ability: lands + non-creature rocks (no sickness
  gate) + creature dorks (excluded while `summoningSick && !Haste`).
- `canAfford(pool, sources, cost) → boolean` — colored pips first from a
  matching unused source, then generic from pool + any remaining source.
- `planPayment(pool, sources, cost) → { fromPool, tapSources } | null` —
  **most-constrained-source-first (Codex):** assign each colored pip from the
  untapped source with the FEWEST color options, so a dual that's the only
  source of a needed color isn't wasted paying generic. Avoids stranding
  colored mana. Pathological multicolor costs still fall to "can't afford"
  (honest), never to fabricated mana.

Wiring:

- New **`tap-for-mana`** legal action (one per untapped source) in
  `legalChoices` + an `actionDispatcher` handler (`tap` the source, `addMana`
  to the pool). Floating falls out naturally — tap more than you spend.
- `actionsCastSpell` affordability = `canAfford(pool, manaSources, cost)` so a
  spell is castable if you *could* tap for it.
- `decisionGate`: **Beginner** surfaces tapping as its own narrated step;
  **Intermediate/Expert** auto-tap exactly enough to pay (no prompt).
  `opponentAI` taps-to-pay before casts.
- `applyCastSpell` still pays from the pool (existing tests stay green); the
  auto-tap path tops the pool up first.

Tests: `manaModel.test.js` (production parse incl. rocks/dorks, affordability,
payment plan, dork sickness gate); `tap-for-mana` dispatch; castable-off-
untapped-sources; float (tap 3, spend 1, pool holds 2).

### PR 10.2 — Mana emptying + floating semantics

- `gameEngine`: empty mana pools at the end of each **step and phase**
  (CR 500.4) via one helper hooked into **`advanceStep` — the single
  step-transition chokepoint (Codex)** so bulk/forced advances (e.g.
  `removePlayerFromGame` jumping straight to a new turn) can't skip emptying.
- A `manaDoesNotEmpty(state, playerId) → colors[]` hook (reads `cardEffects`,
  wired in 10.5) that preserves specified colors at empty-time. Default: empty
  everything.
- Tests: mana floats within a step, empties at the boundary; adjust any
  existing engine tests to the rules-correct timing.

### PR 10.3 — Combat orchestration

- `applyDeclareAttacker` — set `tapped: true` unless the card has Vigilance.
- `actionsDeclareAttacker` — also exclude permanents already in
  `state.combat.attackers` (belt-and-suspenders with the tap).
- `actionsDeclareBlocker` — exclude permanents already in
  `state.combat.blockers`.
- `learnSession.advanceUntilDecision` / `applyChoice` — thread
  `declaredAttackers` = `state.combat.attackers.map(a => a.permanentId)` into
  `legalActionsForPlayer` so blocker candidates appear.
- `opponentAI.pickAction` — combat-aware: in `declare-attackers` use
  `pickAttackPlan` (returns first planned attacker); in `declare-blockers` use
  `pickBlockPlan` (first planned block). Each tick drains one; plan recomputes
  until the step empties and the AI passes. Fixes AI combat **and**
  expert-user combat in one place.

Tests: attacker taps (and vigilance doesn't); AI declares all attackers and
passes; AI blocks per plan; intermediate auto-attack drains without looping;
blockers enumerate; populated `state.combat` flows into `combatResolution`.

### PR 10.4 — Termination + loop safety *(prove the loop before card effects)*

- A full game now ends naturally (damage → life ≤ 0 →
  `recordOutcomeIfChanged` → winner / elimination).
- **Simultaneous-death → draw (Codex):** if the user and all remaining
  opponents die in the same SBA check (mutual lethal in one combat step), end
  as `"draw"`, not a user loss. `recordOutcomeIfChanged` evaluates all seats
  together, not user-first.
- **Anti-loop progress latch (Codex):** the driver tracks a cheap per-tick
  state signature (combat attacker/blocker counts + stack length + active
  player's hand/pool size). If an actor takes a non-pass action that doesn't
  move the signature, force a pass for that actor. Kills *any* re-declaration
  loop as a class, not just the attacker case — defense-in-depth behind the
  10.3 tap/exclusion fix.
- **Turn-limit stalemate:** past a sane ceiling (e.g. 100 turns) with no
  winner, end as `"draw"` carrying a **diagnostic reason** (turn count, last-
  progress turn, board summary) + a dev-mode warn (Codex) — so a turn-limit
  draw that's really an engine bug is visible, not silently "normal."
- Raise the per-call tick cap so an expert full-game run completes in one
  `advanceUntilDecision` call; keep a high cap purely as a true-infinite-loop
  guard. Genuine non-progress → `engine-stuck`; turn-limit → `game-over` draw.

Tests: scripted game reaches a winner; mutual lethal → draw; a re-declaration
attempt is latched to a pass; inert setup → stalemate (not "engine stuck");
expert autopilot runs a full game in one call.

### PR 10.5 — Card-effects registry (static P/T + mana-doesn't-empty)

Now layered on a proven, terminating loop (Codex's "prove the slice first").

- New `app/src/lib/learn/cardEffects.js` — name → descriptor:
  `{ manaDoesNotEmpty: ["G"], staticPT: (state, perm) => ({p, t}) }`.
  Ships [[Omnath, Locus of Mana]] (+1/+1 per unspent green; green doesn't
  empty), [[Kruphix, God of Horizons]], [[Horizon Stone]], [[Upwelling]].
- `gameState.creaturePower` / `creatureToughness` — apply registered static
  P/T modifiers after base + counters via **one shared helper** (the single
  accessor all readers go through — combat, UI, legality stay consistent;
  Codex). Unknown cards unaffected.
- Wire the 10.2 `manaDoesNotEmpty(state, playerId)` hook to the registry
  (per-controller, per-color).

Tests: Omnath is a 1/1 with no floating green, a 6/6 with 5 floating green;
green mana survives the step boundary while other colors empty; a non-
registered creature is unaffected.

### PR 10.6 — Integration + QA + review + docs + release

- Integration tests (`integration.test.js`): full Standard game to a winner;
  full Commander 4P game to a winner; intermediate user gets real decisions;
  expert autopilots to completion; an Omnath floating-mana scenario buffs the
  board.
- Manual QA in the app (dev server + `/qa`): The Academy in both modes at each
  difficulty — decisions render, tapping/casting works, combat resolves, life
  updates, a game ends.
- `/review` the full diff; `/cso` only if something security-relevant surfaces
  (none expected — pure local engine).
- Update `docs/phase6-learn-to-play.md` (wiring gap closed; registry caveat),
  `CHANGELOG.md`, `ROADMAP.md`. Cut a release tag — user-facing (The Academy
  goes from broken to playable).

---

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Breaking the ~292 existing learn tests | Pool-first payment keeps current cast tests byte-identical; run full suite after each PR. |
| Greedy mana assignment mis-pays a tricky multicolor cost | Acceptable v1 failure mode is "can't afford," never "fabricated mana." Note as a known limitation; revisit with a matcher if real decks hit it. |
| Tapping lands interacts with untap/summoning-sick model | Lands aren't summoning-sick-gated for mana; untap step already untaps all. Auto-tap only flips `tapped`. |
| Expert full-game in one call exceeds the tick cap | PR 10.3 raises the cap and adds a turn-limit stalemate so long games end cleanly. |
| AI combat changes regress Standard mode | `pickAttackPlan` already handles the no-`defenderId` Standard shape; gate combat handling by step; Standard integration test guards it. |

## 7. Definition of done

- The Academy plays a full game to a winner (or stalemate) in Standard and
  Commander, at Beginner / Intermediate / Expert, without hitting the safety
  cap in normal play.
- Casting works (lands tap for mana), creatures resolve onto the board,
  combat is declared by both the user and the AI, damage flows, the game ends.
- Full learn test suite green; new tests cover mana, combat orchestration,
  termination, and end-to-end games.
- `/review` clean; docs + CHANGELOG updated; release cut.

---

## GSTACK REVIEW REPORT

Plan-eng-review completed 2026-06-05 (branch `master`). Three architecture
decisions locked (D1–D3), Codex outside voice run and triaged, plan reordered.

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (owner already scoped via the D1/D2 conversation) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_found | 16 raised → 5 already-handled, 6 folded in, 1 reorder accepted |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 3 arch decisions (D1–D3), 2 DRY directives, coverage map, 2 CRITICAL regression tests |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (LearnView 4P polish is PR 11) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run |

**Decisions locked:** D1 full float-capable mana (lands+rocks+dorks, real pool);
D2 targeted `cardEffects.js` registry + 2 narrow hooks (not a general engine);
D3 tap-on-attack (+ vigilance exception). Sequence reordered so the playable
slice (mana → combat → termination) is proven before card effects (Omnath).

**CODEX:** 16 challenge points. 5 already handled in code Codex couldn't read
(AI attacks-with-all, pure castability, immutable-dispatch atomicity, per-color
empty hook, single P/T accessor). 6 folded in as hardening (anti-loop latch,
simultaneous-death draw, most-constrained mana payment, mana-metadata fallback
table, empty-in-`advanceStep`, diagnostic stalemate). 1 structural reorder
accepted (termination before card-effects).

**CROSS-MODEL:** Eng review and Codex agree — prove the terminating loop before
layering card-specific effects. No unresolved tension.

**UNRESOLVED:** 0.

**CRITICAL test gaps flagged:** 2 regression tests (mana-empty timing change;
attacker-tap change) — mandatory, no AskUserQuestion.

**Parallelization:** Sequential implementation, no parallelization opportunity
(every PR touches `app/src/lib/learn/`).

**VERDICT:** ENG CLEARED — ready to implement. Build order: 10.1 mana → 10.2
emptying → 10.3 combat → 10.4 termination → 10.5 card-effects → 10.6
integration/QA/release.
