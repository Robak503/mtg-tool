# Damage-Replacement Seam — build spec (zero-Arbiter for the 13 training decks)

> **Origin.** Colton (2026-06-21): "we don't wanna defer any of the training decks to the Arbiter."
> The Wolverine damage-doubling deferral is **reversed**. This doc is the CREED-safe build spec for the
> reusable damage-replacement layer (Wolverine first), produced by a 6-agent grounding workflow
> (verified oracle from bundled Scryfall, real engine line-reads) **and corrected by an adversarial
> stress-test that returned SHIP-WITH-FIXES**. The four MUST-FIX corrections are folded in below — build
> the **corrected** version, not the first draft.
>
> Policy memory: `project_no_arbiter_for_training_decks.md`. This OVERRIDES the prior "scope support
> shells, NOT commander engines" stance in `brain-13-coverage-plan.md` (VERIFICATION ADDENDUM),
> `cindy-trunk-plan.md`, and STATUS.md "DECKS AT RISK" — the 13 commanders ALSO go native now.
>
> **⚠️ Verify every file/line citation live before editing.** The first-draft plan mis-cited
> `gameState.js L435` for machinery that actually lives in `layers.js` (stress-test MUST-FIX 1). Treat
> the line numbers here as "approximately here, grep to confirm" — never edit by trusting a stale citation.

---

## 0. The CREED floor (holds even if shipped imperfectly)

An **unparsed** doubler stays a safe **false-negative → Arbiter**. The seam only changes behavior for cards
whose doubler we parse and model whole. A board with **no** damage-replacement effect must run the
**byte-identical** code path it does today (the gating proof in §3, test 12). Model the whole card or route it.

---

## 1. The seam — a damage-amount-finalization CONSULT (never a `loseLife` hook)

**The core insight (and the original deferral's real reason):** damage and **life-payment** both flow through
`loseLife`. A naive "double the damage" hook on that sink would also double life *payments* — an FP on
already-correct game actions. **The fix is NOT a hook on `loseLife`.** It is a **consult** placed at every
point where a damage *amount* is finalized, **before** it is handed to `loseLife` / `markCombatDamage` /
`addPoison` / `adjustLoyalty`. Life payment never constructs a damage-event, so it is **structurally immune**.

New file `app/src/lib/learn/damageReplacements.js`:

```
applyDamageReplacements(state, event) -> { amount, prevented }
isDamageReplacement(entry)            // predicate
buildSourceFilter(entry, state)       // source-side AND target-side (affected-player) predicates
```

`event` = a damage-event object:
```
{ sourceId, sourceController, amount /* raw, post-keyword-reroute */, targetKind /* "player"|"creature"|"planeswalker" */, targetId, isCombat }
```

`amount` returned replaces the event amount; `prevented` short-circuits to a no-op.

**The op carries a multiplier/addend, NOT a boolean.** Use `{op:"multiply",factor:2}` (not "double=true") so
triple / "+N" / future `damage-prevent-n` drop in without a rewrite (stress-test coverage note).

### CR backing (all verified against `cr_current.json`)
- **614.1** — "deals double instead" is a replacement effect.
- **616.1 / 616.1a** — multiple applicable replacements: the **affected player/controller** chooses order;
  self-replacement first. Implement: collect all applicable entries, apply in controller-chosen order
  (deterministic default = registration order; expose an order hook for future multi-doubler boards). **Route
  everything through this 616-ordered helper now** even though only doubling ships first — do NOT hard-code
  "double always wins" (it breaks when partial-prevent lands).
- **614.5** — a replacement applies **at most once per event** (the re-doubling guard).

---

## 2. The FOUR MUST-FIX corrections (from the adversarial stress-test — build these, not the first draft)

**MUST-FIX 1 — storage model: a static ability is SYNTHESIZED-ON-READ, never a stored `continuousEffect`.**
Wolverine's "double all damage" is a **static ability of a permanent** (CR 603.3e / 611.2) — it exists exactly
while Wolverine is on the battlefield, has no registration event, no duration, and must vanish the instant he
leaves. `state.continuousEffects` (created by `addContinuousEffect`, expired by `expireContinuousEffects` —
**these live in `layers.js`, not `gameState.js`; grep to confirm**) is for **resolution-generated,
duration-scoped** effects (until-EOT pumps). Registering the doubler there would (a) need an ETB hook + a
removal hook on **every** leave-the-battlefield path (the exact "distributed death paths, no checkpoint"
problem that got LTB deferred) and (b) **leak** the doubler if Wolverine dies mid-combat-step. **Correct
model:** `isDamageReplacement` scans the **synthesized static effects** (the same path every anthem/lord uses:
`staticEffectsOf` → `collectContinuousEffects`, ~`layers.js`), OR scans the battlefield for permanents whose
card carries the parsed doubler. No stored entry, no removal hook.

**MUST-FIX 2 — the filter must support BOTH source-side AND target-side (affected-player) predicates, with the
LITERAL oracle scope.** Do not assume "self-only." Many "double damage" cards read "If a source **you control**
would deal damage…" (controller-scoped, all your sources) and some read "damage dealt **to you** is doubled"
(target/affected-player scoped — filters on `targetId`/target's controller, not source). The first-draft
`sourceId === wolverineId` predicate models only one shape. **Build both sides**, and register Wolverine using
the **verified oracle scope from bundled Scryfall**, not from memory.

**MUST-FIX 3 — the `triggers.js case "damage"` reroute can REGRESS a currently-correct path.** Today
(~`triggers.js` L1131-1136) only `targetType === "eachOpponent"` is handled (raw `loseLife`); everything else
logs `trigger-effect-unresolved` (a safe FN). `applyDamageEffect` takes `{targets, source}` — the trigger path
threads **neither** a `source` permanent nor `targets[]`, so a naive reroute would silently no-op the doubler
**and** risk changing the existing eachOpponent life-loss semantics. **Fix:** thread the triggering permanent as
`source` before rerouting, and ship a test asserting **non-Wolverine eachOpponent trigger damage is
byte-identical**.

**MUST-FIX 4 — double-strike vs the 614.5 once-per-event guard: scope the applied-set PER `resolveCombatDamage`
CALL, not globally.** Each combat sub-step (first-strike, regular) is its own `resolveCombatDamage` call, so a
double-striker correctly deals doubled damage **twice** (consult fires per step). But if the once-per-event
applied-set keys on `sourceId+targetId` **globally**, the second strike step looks identical to the first and
the guard wrongly suppresses the second doubling. **Fix:** a **fresh applied-set per consult invocation**
(per sub-step). This makes guard 614.5 trivially satisfied AND makes per-step doubling automatic — and the
implementer must **never** additionally ×2 "for two steps."

---

## 3. FP guards (each maps to a stress-tested risk)

1. **Life payments not doubled** — structural: no hook on `loseLife`; life-payment callers never build a
   damage-event. *(the original landmine)*
2. **614.5 once-per-event** — one consult call site per logical event; per-**call** applied-set (MUST-FIX 4).
3. **Double-strike** — consult doubles the per-event amount only; never multiply by step count.
4. **119.3 life-loss exclusion** — `applyLoseLife` (~`effectAtoms.js` L282-307) and `triggers.js case
   "loseLife"` (~L1121-1127) are life LOSS, not damage → never call the consult.
5. **120.8 zero guard** — re-run `if (amount > 0)` (~`spellEffects.js` L611, `addDmg` ~L145) **after** doubling.
6. **120.3c loyalty** — damage to a planeswalker uses the **doubled** amount; consult runs before the loyalty
   event is constructed (~`combatResolution.js` L196, `spellEffects.js` adjustLoyalty L636).
7. **903.10a commander damage** — accrual reads `playerEvents` amounts → consult runs in `spillToDefender`
   **before** the combat-damage-player event is pushed (~`combatResolution.js` L297-301).
8. **Toxic-N NOT doubled** — toxic is a fixed rider, not damage. The infect/wither **magnitude** IS doubled
   (2N → 2N poison/-1/-1); the toxic-N rider is added separately, after the consult
   (~`combatResolution.js` L210-214; `spellEffects.js` L601-608).
9. **Fog / prevent-all** — fires before any per-source amount exists, so the whole step short-circuits and the
   consult never runs (~`combatResolution.js` L94-96, `state.preventCombatDamageTurn`) — naturally correct.
10. **AI stale-number (misplay, NOT an FP — see §5)** — `opponentAI`/`trapDetector` compute lethal off base
    power; expose a read-only doubled-value preview so the AI blocks/warns on the doubled number.

---

## 4. Call sites (consult EXACTLY ONCE per logical event)

| File | Site |
|---|---|
| `damageReplacements.js` (**new**) | the helper + predicate builder (both filter sides) |
| `combatResolution.js` | `spillToDefender` (~L187, before pushing combat-damage-player/planeswalker events) and `addDmg` (~L144) for creature combat damage. Re-check `if (amount > 0)` (~L145) **after** |
| `spellEffects.js` | inside `applyDamageEffect` (~L592) right before hitPlayer/hitCreature/adjustLoyalty (~L632-636), **after** the infect/wither reroute. Re-check `amount > 0` (~L611) after. (= the δ2 hook at `coverage-roadmap-to-100.md:205`) |
| `triggers.js` | `case "damage"` (~L1131-1136): thread `source`, then route through `applyDamageEffect` (MUST-FIX 3) + byte-identical guard test |
| `opponentAI.js`, `trapDetector.js` | read-only doubled-value preview (§5 — fast-follow OK) |
| `coverage.js` | `classifyCard` flips to native once Wolverine is parsed whole |

**Gate every consult call on `state...some(isDamageReplacement)`** (the synthesized-static scan, MUST-FIX 1) so a
no-doubler board is byte-identical.

---

## 5. Out of scope / disclosed gaps (do NOT silently claim these)

- **AI lethal awareness (guard 10)** — `swingIsLethal`/`attackerDiesForNothing` (~`opponentAI.js` L459, L500-515)
  operate on raw power arrays with no per-event hook; "read-only preview" doesn't fit that shape cleanly. This
  is **not** a CREED FP (the engine resolves correctly; only the AI mis-evaluates), so land the seam first and
  file AI-awareness as a **fast-follow**. Say so — don't imply it's in PR1.
- **Ur-Dragon** — do **NOT** claim the seam flips Ur-Dragon. The audit JSON does **not** list it among the
  `damage-double` cards; asserting a damage-doubling clause is unverified card text (CLAUDE.md §1.2).
- **Kediss, Emberclaw Familiar** — redirect/COPY of combat damage to each other opponent (CR 614.9 family), NOT
  amount-multiplication. The `{amount, prevented}` return shape **cannot** express "copy this damage to a new
  target" — that's a separate damage-**redirect/copy** primitive. **Out of PR1 scope.**

---

## 6. Wolverine — all three clauses or none (CREED)

Native Wolverine = **all three** modeled:
1. **double-all-damage** replacement (the §1 seam; source/target scope from the **verified oracle**, MUST-FIX 2).
2. **end-step intervening-if**: "if Wolverine dealt damage to **another creature** this turn → +1/+1 counter on
   him." Needs a per-turn `dealtDamageToCreature` flag set at every damage-apply site where Wolverine is the
   source, checked at the end-step trigger.
3. **`{1}{G}` regenerate** via the existing `addRegenShield`/`regeneratePermanent` precedent
   (~`gameState.js` L867/L878).

Ship fewer than three → the whole card stays on the Arbiter.

---

## 7. Test plan (vitest — `damageReplacements.test.js` + combat/spell suite additions)

Combat doubled · spell doubled · double-strike (two steps, each doubled, NOT ×4 for "two steps") ·
prevention-then-double 616 ordering · commander damage doubled (903.10a, 11 base/22 doubled) · loyalty doubled
(120.3c) · infect 2N poison + toxic-N NOT doubled · **life-payment NOT doubled (the landmine)** · 0-damage guard
(120.8) · end-step counter intervening-if (creature yes / player-only no) · AI sees doubled value ·
**NEGATIVE / byte-identical** (no-doubler board → identical state/log vs pre-change baseline — the CREED proof) ·
**non-Wolverine eachOpponent trigger damage byte-identical** (MUST-FIX 3 regression guard).

---

## 8. Builder assignment & sequencing

- **Walt — DMG-REPLACE PR1 (headline, blocks the zero-Arbiter push):** build the reusable damage-replacement
  LAYER per §1-§5 + §7 (the seam + gating + the NEGATIVE byte-identical test + the life-payment landmine test).
  This is the continuous-effect-consult template every doubling family (counter / token / mana / mill) later
  plugs into — squarely Walt's replacement-adjacent lane. Ships the LAYER; Wolverine's card registration is Dex.
- **Dex — WOLVERINE WHOLE-CARD (depends on Walt's PR1):** register all three §6 clauses in `cardEffects.js`,
  drive the deck's counter-doublers onto Walt's counter layer, register Kediss as a redirect (separate
  primitive), and verify the live Wolverine deck plays 1v1 + 4P (`npm run dev`); confirm doubled commander
  damage tracks the 21-rule.

### Roadmap after PR1 (biggest lever first — the LAYER is reused)
Counter-doubling layer (~12: Doubling Season, Branching Evolution, Primal Vigor, Hardened Scales, Corpsejack,
Winding Constrictor, Vorinclex, The Ozolith, High Score, Loading Zone, The Earth Crystal — hits Wolverine/Toph/
Mothman) · token-doubling · mana-multiplication (Nyxbloom ×3, Kinnan — needed for native Kinnan commander) ·
mill-doubling (Bruvac) · clone subsystem (~10) — all reuse the consult pattern at their value-producing event.
The big trigger buckets (ETB 96, attacks/blocks 57, cast 21) are Cindy's trigger-compiler lane once unpaused.

---

## 9. Owner decisions (waiting on Colton — surfaced in STATUS.md)

1. **Emrakul, the Promised End** (Yuriko) — "control target opponent during their next turn." Piloting another
   player's whole turn under your control is the ONE effect more "route-to-Arbiter" than build. **The lone
   candidate for a named keep-on-Arbiter exception.** Confirm zero-Arbiter applies even here, or grant it.
2. **Data-scope gap** — only **9 of 13** training decks are saved on disk (`prof_b1412fcc`); the other 4
   (some of Colton's Vihaan/Koma/Rograkh/Slivers/Zaxara/Omnath) are empty stubs. They must be saved into
   profile data before they can be audited/driven native.
3. **Fund the replacement-layer subsystems** (damage/counter/token/mana doubling) as multi-PR engine work —
   ~476 deferred cards across the 9 saved decks; 8 of 9 commanders are body-only today. This is months of
   builder lanes, not one PR. Confirm the scope expansion.
