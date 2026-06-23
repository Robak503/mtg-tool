# Cindy — TRUNK PLAN: stop modeling the tail, attack the trunk

> **Why this exists (Clyde, 2026-06-19):** coverage crawled ~0.5pp over a long night because the
> trigger slices targeted *rare conditions* (TRIG-LIFEGAIN ~16 cards, TRIG-DRAW ~8, TRIG-SACRIFICE ~7)
> while the **mass of the game sat untouched**. This is the re-aim. **Walt keeps the keyword lane —
> this is CINDY's lane.** Strict CREED stays (model the whole card or route it; no partial-native).

---

## ⭐ NEXT SLICE — TRIG-COUNTER-SELF (Hans → Cindy, 2026-06-21, Colton-relayed)

**Build the clean self-counter primitive.** Your own TRIG-COUNTER finding was the right call — Hans
ground-truthed it against the corpus. The strict, all-or-nothing-safe subset:

> **Scope:** a permanent whose *only* non-keyword line is ONE trigger — `Whenever/When/At …, put a`
> *(or `one`/`two`/`three`)* `+1/+1 counter on this creature` (self-reference: "this creature" / "it" /
> the card's own name). Fixed amount, self only.

**Grounded yield (Hans scan, `_hans_selfcounter_scan.mjs`, full oracle corpus):**
- **105** single-clause fixed-amount self-counter creatures total → **81 are NOT yet native = 81 real flips.**
  (e.g. Elvish Vanguard, Dirtcowl Wurm, Bulette, Fungusaur, Cosi's Trickster, Nimana Sell-Sword,
  Gideon's Avenger, Rising Populace, Oran-Rief Survivalist, Mold Adder…)
- The trigger *events* are already modeled (cast / dies / attacks / end-step / land-enters / damage-dealt);
  the gap is just the **self-counter effect atom on the trigger's source**. One atom flips the batch.

**CREED guardrails — EXCLUDE from this slice (each is a different/harder shape, do NOT let them ride along):**
- **Count-scaled** — "put **that many** +1/+1 counters", "for each", "equal to", "X counters". (9 corpus
  cards.) Different atom (dynamic amount). → its own later slice.
- **Targeted** — "on **target** creature", "**another** creature", "**each** creature you control". (Generous
  Visitor shape — already partly handled via the trigger-target chooser; not this slice.)
- **Multi-clause** — a 2nd non-keyword line (move-counters, endures X, graveyard-cast, sac-a-Clue). **134
  corpus cards** sit here — all-or-nothing keeps them LOW until the 2nd clause is also modeled. Leave them.
- **Granted versions** — equipment/aura that *grants* "this creature gets a counter" (Power Fist). Layer-6
  grant + count-scaled; not the bare self-trigger.

**Acceptance:** pin `MUST_STAY_HIGH` (the 81) + `MUST_DROP_TO_LOW` (count-scaled / targeted / multi-clause
samples) + an engine sim that the counter actually lands on the source. Big slice → paste the 15–20 sample
into the PR for Hans (the FP net).

> **⚠️ HONEST SCOPE CORRECTION (Hans):** this slice is **general coverage (+81 corpus), NOT a deck-realism
> fix.** **Zero of the 81 are in the 13 training decks** — I over-claimed in cycle 40 that TRIG-COUNTER
> would unstick Wolverine; the ground-truth says otherwise. Wolverine's own counter cards (and the
> commander itself: a 3-clause damage-doubling + *intervening-if* end-step counter + regenerate) are
> **multi-clause / count-scaled / intervening-if** — the HARD tail, not a clean Cindy slice. Wolverine's
> 39%-for-4-cycles lag is a **separate, harder effort** (likely Walt's intervening-if + count-scaled lanes),
> tracked apart from this. Build TRIG-COUNTER-SELF because it's 81 clean corpus flips — not because it
> moves Wolverine (it doesn't).

## ✅ DECISION — COVERAGE-% FIRST, via the COMPLETION FRONTIER (Colton, 2026-06-19)

After 3 slices confirmed per-slice metric gains are tiny (most cards are multi-clause; all-or-nothing scores
them 0 until FULLY modeled), Colton chose: **optimize the native coverage-% directly.** The naive version
(grind whole cards one at a time) is slow. The sharp version:

**Rank unmodeled clauses by how many cards each would COMPLETE — not by raw frequency.** A card flips native
only when its LAST unmodeled clause is covered. So:
1. **Build a completion analysis** (extend the gap script): for every `body-only` / `arbiter-spell` card,
   list its unmodeled clause-types; then for each clause-type, count the cards for which it is **the only
   remaining unmodeled clause** ("on the completion frontier").
2. **Model the highest-completion clauses first** — each one flips a whole batch of otherwise-ready cards.
3. For cards needing 2+ new clauses, model the **cluster of clauses that together completes the most cards**.
4. Effect-atom widening is still the TOOL (a shared effect/ability atom helps many cards); the TARGET is now
   whole-card completion, measured by cards-flipped-to-native. Expect lumpy % gains (an atom may flip few
   immediately, then a later atom completes a backlog of cards waiting on it).

Same strict CREED + the FP net (>100-card slices need a sample). The single-atom infra already shipped
(#295 self-buff, #296 enters-with-counters) stands and feeds the frontier.

> **FUTURE LANE (flagged, not active):** Colton may spin up a separate workstream solely for **personal-deck
> unlocks** — making his actual decks (Vihaan & co.) play correctly end-to-end for gameplay/cEDH-sim,
> independent of the corpus-% grind. When greenlit it gets its own brief; until then this coverage-% lane is
> Cindy's focus.

---

## 🔄 EARLIER LEVER NOTE (2026-06-19, after slice 1 — superseded by the DECISION above)

**Slice 1 (TRUNK-SELFBUFF #295) flipped only 6 cards and proved the permanent-ability families FRAGMENT.**
Cindy re-ran the gap analysis: the `this creature …` 1,035-bucket is heterogeneous (30+ shapes, ≤7 per
shape), and most are multi-line (a 2nd clause keeps them LOW). "Static anthem/buff" is only **652** — not a
hundreds-per-slice trunk.

**The real hundreds-per-slice lever is EFFECT-ATOM WIDENING** — and it's better than the families because an
effect is **shared across buckets**: model one common effect ONCE and it flips cards wherever it appears —
ETB triggers (**5,049**) + activated abilities (**3,263**) + spells (**8,472**) simultaneously. The trigger
*conditions* and the *bodies* are already largely modeled; the wall is the **effect vocabulary**.

**NEW ORDER for Cindy:** frequency-rank the unmodeled EFFECT clauses (the verb-phrases, not conditions) across
those three buckets, then model the most common effects first (e.g. "create a token with <rider>", "exile
target …", "each opponent loses N life / sacrifices …", "return target … from graveyard", "put N counters
on …", modal "choose one"). Each common effect-atom flips cards across ETB + activated + spell at once. The
permanent-ability families below are now SECONDARY (cleanup once the effect vocabulary is wide). The reusable
infra slice 1 shipped (count-driven static hook + name-normalization) stands.

---

## The data that reframes everything

Measured against the full corpus (`npm run coverage` → `analyze-gap`):

- **34,160 real cards · 5,961 native (17.5%) · 28,199 NOT native.**
- **21,241 are `body-only`** — permanents the engine already plays as a *body*, blocked on an unmodeled
  ability. That's **62% of Magic**.
- **11,179 of those are blocked on a SINGLE ability line** — one modeled atom flips the whole card to
  native. **This is the trunk.**

**The rule change: work by CARD-FREQUENCY, not by condition name.** Before you build a slice, it must
plausibly flip **hundreds** of cards, not a dozen. Pick the family, then frequency-rank *within* it.

## The ranked trunk (single-line-blocked `body-only` permanents, by leading signature)

| # | Family (leading text) | ~single-line cards | Buildable slice | GREP-first note |
|---|---|---|---|---|
| 1 | **`This creature …`** | **1,035** | Split it: static self-buff (`gets +X/+Y`, `has <kw>`), `can't be blocked…`, `attacks each combat if able`, self-activated. Each sub-pattern is its own PR. | Layer engine + anthem machinery already exist (`layers.js`, `staticAbilityParser.js`). EXTEND, don't rebuild. |
| 2 | **Auras — `Enchant creature …`** | **328** (+ more multi-line) | Aura attaches (`attachPermanent` exists) + grants a static (P/T, keyword, can't-attack/block). | `isNativeAura` / `staticAbilityParser.js` ALREADY cover some Auras — frequency-rank the ones that AREN'T native yet and close that gap. |
| 3 | **`… creature gets / can / has …`** | ~250 combined | Same layer-grant machinery as #1/#2 applied to other-creature targets (Auras, equip, anthems). | Reuse the grant atom from #1/#2. |
| 4 | **Common activated abilities** (`{cost}: <effect>`, `: Sacrifice …`, `activate only …`) | ~130 single-line, 3,264 total bucket | The activated-ability pipeline exists (756 already native-activated). Pick activated abilities whose EFFECT is an already-modeled atom → they flip for free. | `parseActivatedAbilities` in `effects/abilities.js`. |
| 5 | **ETB with a modeled effect** (`When this enters, <draw/create token/gain life/deal damage/destroy>`) | (of the 5,049 ETB bucket) | The ETB hook (`checkEnterTriggers`) EXISTS — the gate is the effect. Target ETBs whose effect routes via EFFECT_PROGRAM today → instant flips. | Don't build new conditions; build/confirm the EFFECT atoms the ETBs need. |

## Method per slice (unchanged CREED, just bigger targets)

1. **Pick a family from the table, GREP the corpus first** to confirm it isn't already modeled and to get
   the real card-count (the numbers above are leading-signature estimates, not exact).
2. Model the whole pattern (matcher + resolver/layer effect + the body) — **all-or-nothing**; a card with
   a second unmodeled clause stays LOW until that's covered too. A single-line permanent is the sweet spot
   because there IS no second clause.
3. Pin `MUST_STAY_HIGH` (the cards that should flip) + `MUST_DROP_TO_LOW` (the shapes you're excluding) +
   an engine-first sim that the ability actually resolves.
4. Adversarial self-check: run the real parser over the whole corpus, eyeball what your matcher now
   catches — hunt dropped riders / over-broad self-reference.
5. Full gate (`npm test` "Tests N passed" + `npm run lint`), open the PR with the **card count it adds**.
6. **FP NET (bulk slices, Colton 2026-06-19):** a broad matcher's blast radius scales with the slice — one
   over-broad pattern mints *dozens* of false positives at once. So for any slice flipping **>100 cards**,
   the PR body MUST include a **sample of 15–20 newly-native card names** (from your step-4 corpus run) + the
   `MUST_DROP_TO_LOW` shapes you excluded. No sample on a big slice → Clyde holds the merge. Anything that
   smells off goes in `fp-watch.md` for Hans. See `fp-watch.md` for the full net.

## The target

A single good slice here (e.g. "static self-buff `this creature gets +X/+Y`") should add **150–600 cards**
— 20–60× a trigger-condition slice. Three or four of these and the headline moves a **full point or more**
per night instead of half. The 11,179 single-line trunk is months of *high-yield* work; you will not run
out. When the single-line trunk thins, move to the 10,062 multi-line `body-only` (model the 2nd clause's
family next).

— Clyde

---

## Cindy field note — fresh frontier (2026-06-22, post-EXPLORE)

The **trigger+activated composite is ALREADY BUILT** (`permanentFullyCovered` → `native-mixed`,
coverage.js:500). Do NOT re-investigate it — the old "240 composite cards" lever is closed.

Fresh diagnostic over the 19,483 body-only **permanents** (probe buckets the dominant blocker):
- `static-only-unmodeled`: 7498 — diffuse (every static is its own shape)
- `trigger-not-routing`: 6627 — many are **intervening-if** conditioned (CR 603.4, hard) or new subsystems
- `activated-not-modeled`: 4078
- `residue-static-or-count`: 1280

The remaining real levers are **new subsystems**, measured by CLEAN flip yield (rest of card already modeled):
- **EXPLORE — DONE** (#376, +20): parser atom + library resolver + "it"-rewrite.
- **monarch**: ~18 clean — player.isMonarch + end-step draw + combat-damage steal (cross-cutting but contained).
- **energy**: ~11 clean pure-gainers (more if pay-`{E}` cost is also modeled — bigger).
- **time-counters/suspend**: ~31 raw but TANGLED (suspend keyword uncredited + reminder triggers) — not clean.
- **initiative**: ~6 (too small + Undercity dungeon complexity).

Next recommended: **monarch** (cleanest 15+ subsystem), then **energy**.

— Cindy

---

## Cindy field note — refined frontier (2026-06-22, post-CANT-BLOCK)

CANT-BLOCK shipped (#377, +17: "target creature can't block this turn" → layer-6 cantBlock grant).

MONARCH was DROPPED: tight yield only ~9 (most "become monarch" cards bundle unmodeled monarch-conditional
statics/triggers — "as long as you're the monarch…", "whenever you become the monarch…") and the subsystem
is cross-cutting (player state + end-step draw + combat steal). Not a clean ≥10 slice. Same for energy
(~11 raw, but pure-gainers only; spenders need pay-{E}).

A "one-atom-away" scan (2412 body-only permanents — residue empty, count matches, activated modeled, only
a non-routing trigger blocks) ranks the highest-yield SINGLE atoms. Top clean single-atom levers remaining:
- **intervening-if (THE BIG ONE):** "draw a card" (25), "put +1/+1 on this" (19), "you gain N life" (12)
  are all HIGH-routing effects blocked ONLY by an intervening-if condition (CR 603.4). 56+ in the top-3
  alone; likely 200+ total. The lever: a CONDITION EVALUATOR ("if you control an artifact", "if you control
  another Spirit", "if a creature died this turn") + route the trigger when the condition is parseable.
  High-yield but needs care (mis-eval = FP). Build incrementally, simplest conditions first.
- "that player discards a card" (Specters, 9) — reuses ctx.damagedPlayerId (already threaded for rad).
- "this creature deals N damage to you" (8) — upkeep self-damage drawback (Juzám Djinn family).
- "sacrifice a creature" (8, Demon upkeep), "bolster N" (7).

Next recommended: **intervening-if subsystem** (measure the simple-condition subset first; biggest lever
by far), or the clean small atoms (discard-damaged-player / self-damage) if intervening-if is too risky.

— Cindy
