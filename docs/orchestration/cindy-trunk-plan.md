# Cindy — TRUNK PLAN: stop modeling the tail, attack the trunk

> **Why this exists (Clyde, 2026-06-19):** coverage crawled ~0.5pp over a long night because the
> trigger slices targeted *rare conditions* (TRIG-LIFEGAIN ~16 cards, TRIG-DRAW ~8, TRIG-SACRIFICE ~7)
> while the **mass of the game sat untouched**. This is the re-aim. **Walt keeps the keyword lane —
> this is CINDY's lane.** Strict CREED stays (model the whole card or route it; no partial-native).

## 🔄 REVISED PRIMARY LEVER (2026-06-19, after slice 1 — Cindy's finding, adopted)

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
