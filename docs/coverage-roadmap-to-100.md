# Academy Engine — Roadmap to ~94% Native Coverage

*Synthesized 2026-06-17 from a four-agent analysis pass (mechanism inventory, corpus
data backlog, foundation dependency ordering, realistic-ceiling + risk register), all
grounded in the real `classifyCard` over `oracle_cards.json` + the 16 sample decks.*

> Companion doc: **`docs/coverage-autopilot-prompt.md`** — the no-stop execution prompt a
> fresh session pastes to run the next slice end-to-end. This doc is the *map*; that one is
> the *engine*. The per-slice mechanics live in **`docs/coverage-handoff.md`** (the
> load-bearing discipline) — this roadmap sits above it.

---

## 0. TL;DR

- **Where we are:** **47% native** on the 16 sample decks (15.3% corpus-wide). The
  manabase is a ~44% auto-native floor; the real gap is `body-only` (545 slots) +
  `arbiter-spell` (294) + `arbiter-pw` (9).
- **The honest target:** **~94% native on real decks** is the realistic ceiling, reached by
  completing the Phase-2 vocabulary (effect-atom family + trigger/static/activated grammar).
  The hard subsystems push to ~99%. **The last ~1% (decks) / ~2-4% (corpus) is irreducible**
  and stays on the Arbiter forever. "100% native" is not an honest goal — the corpus tail is
  unbounded (every new set adds to it), which is exactly why the Arbiter is a permanent,
  load-bearing fail-safe, not a temporary gap.
- **The strategy:** two interleaved tracks — **force-multiplier foundations** that un-gate
  whole *classes* of already-built atoms, and **high-count atom/vocab slices** that convert
  gap→native directly. Front-load the foundations whose leverage-per-effort is highest, then
  grind the vocabulary clusters, then the heavy subsystems last.
- **Non-negotiable:** the per-slice discipline (corpus sweep → adversarial review → live
  real-enrichment QA → PR) is the load-bearing defense against the one cardinal sin: a
  parser **false-positive** (claiming native, then mis-resolving). A false-negative (route to
  Arbiter) is always safe; a false-positive is forbidden.

---

## 1. Where we are (measured ground truth)

`npm run coverage` (run from `app/`), 16 decks, 1601 slots:

```
AGGREGATE: 47% native (753/1601)

TIER BREAKDOWN                 THE GAP (unmodeled, by mechanism)
  568  land                      320  Spell effect (other)   ← biggest; complex spells
  137  native-mana               130  ETB trigger            ← effects unmodeled
    5  native-body                81  Other / copies
   25  native-spell               78  Attacks/blocks trigger
    8  native-trigger             50  Static anthem/buff
    1  native-activated           48  Upkeep/phase trigger
    7  native-static              39  Activated ability
    2  native-equipment           33  Cast/spell trigger
  545  body-only  ← biggest gap   32  Static (aura/equip)
  294  arbiter-spell              28  Dies/LTB trigger
    9  arbiter-pw                   9  Enters-as/replacement
```

**Read this correctly:** the deck % (47%) is ~3× the corpus % (15%) because real decks are
~44% lands+rocks (auto-native) plus simple staples, while the corpus tail is unbounded
one-off complexity. **The deck number is the real signal; corpus counts drive prioritization
(the deck sample is small and lumpy).**

What's already modeled (the substrate the plan builds on):
- ~15 effect atoms: damage, destroy, draw, pump, grant-keyword, create-token, gain-life,
  lose-life, tap, untap, bounce, exile, add-counter, tutor, scry, surveil, mill.
- Triggers: etb / dies / attacks / blocks / upkeep / draw / endStep / cast, with you/opponent
  controller scopes; whole-effect (multi-sentence) capture.
- Statics: anthems + tribal lords + attach (equipment/aura) bonuses + indestructible grants;
  CR-613 layers 4-7 (layers 1-3 are no-op stubs).
- Activated abilities: mana + `{T}` costs only.
- Resolution-time choices: tutor picker, scry/surveil, clone-copy (the `pendingChoice`
  suspend/resume seam).
- Game structure: zones, serializable stack, priority, multiplayer (1v1 + 4P FFA), combat
  (first/double strike, trample, deathtouch, lifelink, multi-defender), mana, SBAs, win/loss.

> ⚠️ **Indestructible (CR 702.12) is in flight on PR #194, NOT yet on master.** It is already
> in `COVERED_KEYWORDS` (coverage.js), so on master a keyword-only "Indestructible" creature
> classifies `native-body` while the engine **ignores** the keyword in combat and under
> removal — a live false-positive of the exact cardinal-sin class. **Land #194 first** (it
> adds the enforcement + the layer-aware `isIndestructible`); until then the ~47% floor
> includes this small over-credit (see §2 caveat, §7 R10).

---

## 2. The honest ceiling (measured)

Categorizing the 848 non-native sample-deck slots by what they'd need:

| Bucket | Deck slots | Cumulative native if modeled |
|---|---|---|
| **now** | — | 47.0% |
| **(a1) near-term clean** — a known atom shape, 1-2 slices away | 126 (7.9%) | **54.9%** |
| **(a2) vocab grind** — full Phase-2 atom/trigger/static/cost vocabulary | 622 (38.9%) | **93.8%** |
| **(b) hard subsystems** — replacement effects, copy layer-1, PW loyalty, control-change, full modal | 89 (5.6%) | **99.3%** |
| **(c) irreducible** — hidden-info, morph/manifest, "as you cast", name-a-card, voting | 12 (0.7%) | stays Arbiter |

Corpus-wide (30,947 Commander-legal): now 15.3% → +a1 36.7% → +a1+a2 **90.1%** → +b 97.7%
→ irreducible ~2.3%.

> *Caveat:* these % inherit any over-credit in `classifyCard` itself (it's the same
> classifier the metric uses). At least one is known — indestructible-as-keyword counts native
> on master while unenforced (§1, §7 R10) — so treat the floor as exact only once PR #194
> lands. The bias is small and applies uniformly to baseline and targets.

**The target, stated honestly:**
> **~94% native on real decks** is the realistic ceiling from the Phase-2 vocabulary work
> (buckets a1+a2). The **high-90s** additionally needs the hard subsystems (bucket b). The
> **last ~1% on decks (~2-4% corpus) is irreducible** — it needs full priority/timing
> windows, hidden information, table-talk/voting, or hyper-unique one-card templating — and
> should stay on the Arbiter permanently by design.

**The gap is not cheap single-card wins.** Only ~8% of deck slots (a1) are near-term; the
bulk (~39%, a2) is a methodical vocabulary grind. That is what this roadmap sequences.

---

## 3. Strategy: two interleaved tracks

**Track 1 — Force-multiplier FOUNDATIONS.** A handful of mechanisms un-gate whole classes of
*already-built, already-correct* atom **resolvers**. The standout: the **enemy-aware
trigger-target chooser** — counter, chosen-permanent-removal, and targeted-pump atoms already
resolve correctly on the cast path; only the first-legal flush chooser blocks them on the
*trigger* path. Building the chooser converts dozens of ETB/dies/attack cards with **no new
atom resolver**.

> ⚠️ **"No new atom" ≠ "low effort."** The chooser itself is genuinely new logic. The flush
> seam hands candidates shaped `{ targets: [{type,id,controller,atomIndex}], chosenMode? }`
> (from `expandCastChoices`), keyed by atom `.op`. `spellEffects.chooseAITarget` can NOT be
> reused directly — it's `.kind`-keyed (damage/destroy only), returns null for `pump`, and has
> no `counter`/`add-counter` case. α1 must build a **program-atom-aware enemy chooser** that,
> per atom op, maps each candidate's `targets[].controller` against `opponentsOf(...)` and
> proves an enemy-only pick before any gate is lifted. It is the highest-leverage slice AND the
> one most able to *introduce* a false-positive — test it hardest.

**Track 2 — High-count ATOM/vocab slices.** The biggest direct converters (sample-deck slot
counts): "you may" wrapper (189), token creation (103), the anthem cluster (~134), the
counter cluster (~106), the library-search family (~100), combat/attacks-trigger payoffs
(~88). Most *compose* — they wrap or feed atoms the engine already has.

**The interleave:** ship a foundation, then immediately harvest the slices it unblocks.
Foundations first where leverage-per-effort is highest; never let the AI cast a mechanic it
can't yet value (add a hold-gate instead — holding is always safe).

---

## 4. The phased roadmap

Each slice ships through the **full per-slice discipline** (§6). Counts are sample-deck slots
(`S`) unless noted; they overlap (one card may need several mechanics), so phase % gains are
ranges, not sums.

### Phase α — "Unlock what already works" (highest ROI, mostly no new atoms)

| # | Slice | Lever | Notes |
|---|---|---|---|
| α1 | **Enemy-aware trigger-target chooser** | force multiplier | Build a NEW program-atom-aware enemy `chooseTargets` (per atom `.op`, pick an `opponentsOf` controller; NOT `chooseAITarget` — see Track-1 note) and inject it into `gameEngine.buildTriggerStack`'s flush. Only after it provably picks enemy-only, lift the `programContainsCounter` / `programContainsChosenPermanentRemoval` gates in `parser.js` **and** the `coverage.js` mirror in lockstep. Un-gates counter + removal + targeted-pump on every trigger. **Serialize-stable** (choice frozen onto the payload at flush; chooser must be a pure function of state). **Blocks the targeted-on-trigger form of β1/β3/β6 (see S4 dep).** |
| α2 | **"you may" optional wrapper** | S189 | Remove `may` from `UNMODELED_MARKERS`; add an `optional` flag honored via the existing `pendingChoice` (player) / auto-decision (AI/Expert) seam. Scope the `may` to effect vs cost. Charm precondition. |
| α3 | **Combat-damage + attacks-trigger payoffs** | ~88 | The events are already detected; route their effects through the flush (rides α1 for any targeted payoff). Add the `deals combat damage to a player` event. |
| α4 | **Trigger-effect atom-family parity + simultaneous-dies look-back fix** | rides α1 | Broaden the small `parseTriggerEffect` fallback; fix co-dying watchers (CR 603.6e — the known spawned follow-up). |

*Exit ~α: ~55-62%.* High-confidence, but α1 is genuinely new logic (not a reuse) — test hardest.

> **⚠️ Dependency gate (S3/S4): flip the flush gate to an ALLOWLIST.** Today only
> `programContainsCounter` + `programContainsChosenPermanentRemoval` are gated out of the
> trigger flush — a 2-item *denylist*. Every OTHER chosen-target atom (pump, add-counter,
> bounce, tap, …) currently routes through `firstLegalChoice` with **no gate**, so on a
> trigger it can first-legal-target a *friendly*. Before β adds any new chosen-target atom,
> change `buildTriggerStack` (+ the `coverage.js` `triggerRoutesNatively` mirror) to **gate
> EVERY chosen-target atom out of the flush by default**, lifting per-op only once α1's chooser
> proves an enemy-only pick. Concretely: **α1 blocks the targeted-on-trigger form of β1
> (token-on-ETB is non-targeted, safe), β3 (+1/+1 counter on target), and β6 (bounce target).**
> Their CAST form is always safe (player/AI pick); their TRIGGER form must wait for α1 or carry
> a flush gate. This is a hard edge, not a soft interleave.

### Phase β — "High-count atom clusters" (the vocabulary core)

| # | Slice | Lever | Notes |
|---|---|---|---|
| β1 | **Token creation atom** | S103 | `create N [P/T] [color] [type] token(s)` + a token-permanent shape. Cleanest big atom; foundational (feeds ETB-token triggers, anthem tokens). |
| β2 | **Library-search destination family** | ~100 | One `search library for <filter>, move to <zone>` machine, parameterized: → battlefield (Green Sun's Zenith / Chord), → hand (Trophy Mage / Kodama's Reach), → top. Reuses the tutor `pendingChoice` picker. |
| β3 | **Counter cluster**: +1/+1 on chosen target + proliferate + counter-doubler replacement | ~106 | `put N +1/+1 counters on target` + proliferate atom + the CR-614 "twice that many counters" replacement (Doubling Season). Deck-defining in counters decks. |
| β4 | **Anthem cluster**: type-anthem + plain anthem + keyword-grant-to-team | ~134 | Generalize the existing anthem static to typed subsets ("Dragons you control get +1/+1") and keyword grants. Watch the med false-positive risk (the regex also catches one-shot pumps — anchor to static). |
| β5 | **Cost-reduction static** ("this spell costs {N} less") | S33 | Cast-path cost modification; clean anchor; appears in nearly every tribal/big-creature deck. |
| β6 | **Bounce / untap / discard / loot atoms** | ~56 | `return target to hand`, `untap target/all <filter>`, `discard N`, loot (draw+discard, needs the discard atom + interactive pick). |
| β7 | **Counterspell on the cast path** | S21 | First true stack-interaction atom ("counter target spell [unless pays {N}]"); AI holds. Strategic leverage beyond slot count (prerequisite for a believable opponent). |
| β8 | **Modal "choose one" widening** | S15 + corpus | Machinery already shipped (parser emits `{modes}`, `runProgram` executes `chosenMode`); widen which modes parse + add "choose two / up to one". Unlocks charms (with α1 for modal removal/counter on triggers). |
| β9 | **Targeting enforcement: hexproof / shroud / protection** | correctness multiplier | Filter in `spellEffects.enumerateTargets`. Makes all existing + new native removal CR-faithful (closes a latent silent-gap where these keywords "count covered" but do nothing). |

*Exit ~β: ~78-85%.* This is the long grind; most slices compose on existing atoms.

### Phase γ — "Costs and X" (the second force multiplier)

| # | Slice | Lever | Notes |
|---|---|---|---|
| γ1 | **Cost structures** — sacrifice / discard / pay-life / exile-as-cost / `{X}` | force multiplier | Break the hard `return null` wall in `abilities.parseAbilityCost`; add cost-payment in `actionDispatcher.applyActivateAbility`. Unlocks the entire sacrifice-outlet/aristocrats archetype + all pay-life/discard/X activated abilities. All-or-nothing: an unpayable/partial cost → don't offer the ability. **AI caveat (S1): `opponentAI.js` never activates abilities or chooses X — γ1/γ2 are PLAYER-only; the coverage % rises but the AI opponent gains nothing until an AI activation/X heuristic ships. Accept explicitly or schedule the heuristic alongside.** |
| γ2 | **X in non-damage contexts** | rides γ1 | Extend `rewriteAmountX` to "gain X life", "X +1/+1 counters", "create X tokens", "each opponent loses X". Bounded cast-time X-choice (the `X_CHOICE_CAP` in `affordableXValues`, legalChoices.js, is the X backstop). |
| γ3 | **Ward enforcement** | rides γ1 | Ward is a cost, so it leans on γ1's payment planner; pairs with β9. |

*Exit ~γ: ~88-91%.*

### Phase δ — "Heavy subsystems" (lower yield, fresh context, end of line)

| # | Slice | Lever | Notes |
|---|---|---|---|
| δ1 | **Replacement: enters-tapped / enters-with-counters** | cheap half of CR-614 | A static read at the existing ETB seam (`resolvers.enterPermanent`) — **no event layer needed**, no chooser/AI dependency. **(N5) Pull this forward into α/β opportunistically** — it's cheap and self-contained; it doesn't belong at the back with the heavy subsystems. |
| δ2 | **Replacement: prevention / fog** | architectural | Maps onto the existing `addContinuousEffect`/`expireContinuousEffects` machinery (a prevention shield is an endOfTurn continuous effect); only the *consult-before-damage* hook in `applyDamageEffect` is new. A miss is safe (→ Arbiter). |
| δ3 | **Copy (Layer 1) beyond pure-clone** | S20-ish | Clone "except" riders (Spark Double / Phyrexian Metamorph), "copy target creature/artifact". `copiableValues` is reserved but unused — delicate (interacts with every layer). Fresh session. |
| δ4 | **Planeswalker loyalty** | S10 (whole `arbiter-pw` tier) | Self-contained subsystem: loyalty sub-state + loyalty-ability action kind + the per-turn activation flag (schema migration). Leans on γ1 for loyalty-as-cost. Schedule by product priority. |
| δ5 | **Control-change (Layer 2)** | S5-6 | Deliberately last / optional — high cross-cutting cost (every `controller`-keyed read assumes controller == owner), low yield. |

*Exit ~δ: ~93-99% on decks.* Stop when the remaining gap is bucket (c) — irreducible.

### Independent / opportunistic
- **Named-card override hook** (small `cardEffects` registry shim) — slot anytime.
- **Intervening-if completion** — rides δ2's event-hook work.

---

## 5. Milestone map (the % trajectory)

```
  47% ──α──▶ ~58% ──β──▶ ~82% ──γ──▶ ~90% ──δ──▶ ~94-99%
        ▲           ▲            ▲             ▲
   un-gate the   the vocab    costs + X    heavy subsystems
   built atoms   grind (the   (aristocrats  (PW, copy,
   (no new       bulk of the  + X spells)   replacement,
   atoms)        work)                      control)
```

Targets are ranges because slot counts overlap and the 16-deck metric is lumpy — a multi-
ability card flips to native only when *all* its mechanics land, so the headline jumps in
steps. **Trust the per-mechanism corpus counts as the per-slice progress signal, not the
headline %** (the §6 lesson). Realistic stopping point: **~94% on real decks** (end of γ +
the cheap δ items); the final push to ~99% is bucket (b) and worth it only if the product
needs it.

---

## 6. The discipline (non-negotiable, per slice)

Every slice, no exceptions (full detail in `docs/coverage-handoff.md`):

1. **Branch + build** the atom/parser/resolver + the `coverage.js` classifier update *in
   lockstep* (the metric must call the runtime parser, never a parallel heuristic).
2. **Corpus sweep** — run the REAL parser/classifier over all ~37k cards via `publicCard`.
   Require **0 false-positives** (claims native but mis-resolves). Hand-verify the newly-
   native set. Update the parser pins (MUST_STAY_HIGH / MUST_DROP).
3. **Adversarial review** — independent agent (and `/code-review ultra` when available) over
   the diff; verify against code + corpus + suite. It earns its cost: it has repeatedly
   caught pre-existing partials the sweep + units missed (#191, #192).
4. **Live real-enrichment QA** — drive the REAL `lookupCard → publicCard → engine` path, not
   hand-built fixtures (fixtures mask slim-index gaps — the documented #1 silent-gap risk).
5. **Test + lint** from `app/` (`npx vitest run` + `npm run lint`; a root-dir run grabs the
   wrong vitest/config and reports spurious failures).
6. **PR** — verify `gh pr checks` says pass.

**The cardinal rule:** a false-negative (route to Arbiter) is safe; a false-positive (claim
native, mis-apply) is forbidden. All-or-nothing confidence + anchored allowlist + the gates
above enforce it.

---

## 7. Risk register (condensed)

| Risk | L | I | Guardrail |
|---|---|---|---|
| **R1 Parser false-positive** (claims native, mis-resolves) | M | Critical | All-or-nothing `programConfidence`; anchored allowlist; corpus sweep (0 FP) + CI parser pins; adversarial review. |
| **R2 Partial application** (granted effect honored in model, dropped at one read site) | M | High | Single-source accessors (`deriveCharacteristics`/`permanentHasKeyword`); every new grant flows through them; grep all read sites. |
| **R3 Trigger-flush self-target** (first-legal hits own spell/permanent) | M | High | **The gate is a 2-item DENYLIST today (counter + permanent-removal) — flip it to an ALLOWLIST** (S3): gate EVERY chosen-target atom out of the flush by default, lift per-op only once α1's chooser proves enemy-only. Mirror in `coverage.js`. Without this, the next targeted-on-trigger atom (pump/bounce/tap/add-counter) silently first-legals a friendly. |
| **R4 Simultaneous-event ordering** (co-dying watchers) | L-M | Med | Look-back snapshot (CR 603.10a), never a post-resolution diff; fix co-death in α4. |
| **R5 Serialization/determinism** | L | High | Plain-JSON payloads, no closures (CI-linted); threaded PRNG; schema bump + migration + fixture in the same PR (CONTRACT-MIG). |
| **R6 Perf at scale** | L | Med | WeakMap memo + empty-board fast path; keep the benchmark assertions. |
| **R7 AI lags mechanic coverage** | High | Med | When a mechanic lands, decide explicitly if the AI can value it; if not, add a hold-gate (holding is safe — costs tempo, never a wrong board). |
| **R8 Coverage-metric over-claiming** | M | High | The metric calls the same runtime parsers; `triggerRoutesNatively` mirrors `buildTriggerStack` exactly. Conservative by construction. |
| **R9 Enrichment silent-gap** (slim index shape change blanks cards) | M | High | Live real-enrichment QA every slice (step 4) — never units only. |
| **R10 Indestructible unenforced on master** (in `COVERED_KEYWORDS` but not enforced until PR #194 lands) | High (until merge) | High | **Land PR #194 first.** Until then, keyword-only-Indestructible creatures classify native while the engine ignores the keyword — a live false-positive. |
| **R11 Static sweep misses runtime mis-resolution** (a card parses HIGH correctly but the trigger flush mis-targets it) | M | High | The corpus sweep is parse-level; it won't catch a first-legal friendly-target on a trigger. Live QA (step 4) must exercise the TRIGGER form (ETB/dies) of any targeted atom, not just the cast form. |

---

## 8. Definition of done

- **Primary target met** when the 16-deck headline reaches **~90-94%** and the remaining
  per-deck gap is dominated by bucket (b)/(c) cards.
- **Stretch** (~99%) only if the product needs the hard subsystems (δ3-δ5).
- **Never** chase "100% native" — the Arbiter is the permanent, correct home for the
  irreducible tail. Success is: *a real Commander deck plays a full game with only rare,
  graceful Arbiter hand-offs.*

---

*Sources: four-agent analysis pass 2026-06-17 (inventory / data backlog / dependency ordering
/ ceiling+risk), all measured against the live `classifyCard` + `oracle_cards.json`, then
red-teamed by an independent fifth review agent. That review (verdict: sound after fixes)
caught and this doc now reflects: indestructible is NOT on master (R10), α1 needs a new
atom-aware chooser not a `chooseAITarget` reuse (Track-1 note), the flush gate must flip from
denylist to allowlist (R3/S4), γ is player-only until the AI activates/chooses-X (S1), and the
static sweep misses runtime mis-targeting (R11). See also `docs/coverage-handoff.md`,
`docs/phase7-engine-rebuild.md`, and the project memory.*
