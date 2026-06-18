# Planeswalker / loyalty subsystem (PW-*)

**Owner:** Walt (faculty). **Status:** PR1 (framework foundation) — shipped behind the CREED gate.

The Academy had no concept of planeswalkers — `coverage.js` routed the entire card type to the
Arbiter (`arbiter-pw`) and nothing in the engine modelled loyalty. This subsystem adds the loyalty
machinery so the engine can deploy a planeswalker, tick it up/down, attack it, and have it die — and
classifies a planeswalker as native **only** when every one of its abilities is fully modelled.

## The CREED gate (all-or-nothing)

A planeswalker flips to the `native-planeswalker` tier (and is played by the native engine) **only**
when `planeswalkerNativelyCovered(card)` is true:

- a finite printed starting loyalty, AND
- ≥1 loyalty ability, AND
- **every** loyalty ability's effect parses to a HIGH, non-modal, non-X EffectProgram, AND
- **no** non-loyalty residual text (a static / triggered ability we don't model).

Otherwise the whole card routes to the Ollama-only Arbiter (`arbiter-pw`), exactly as before. A
partially-modelled walker is **never** put on the native battlefield with a subset of its behaviour —
the cast path routes it to the Arbiter seam, and the loyalty-ability offer is gated too
(defence-in-depth). A false negative (a real walker left on the Arbiter) is safe; a partial
application is forbidden.

## What PR1 builds

| Area | File | What |
|---|---|---|
| Loyalty primitives | `gameState.js` | `isPlaneswalker`, `startingLoyalty`, `adjustLoyalty` (signed; keeps the `loyalty` key at 0 so the SBA can see it), `markLoyaltyActivated`, `destroyZeroLoyaltyPlaneswalkers` (CR 704.5i). Untap clears the once-per-turn flag. |
| Ability parsing + coverage | `effects/loyaltyAbilities.js` (new) | `parseLoyaltyAbilities` (`[+N]/[−N]/[0]:`, ASCII **and** Unicode `−`), `planeswalkerNativelyCovered`. |
| Enters with loyalty | `resolvers.js` | `enterPermanent` sets `counters.loyalty` from the printed value (CR 306.5b). |
| Cast gate | `actionDispatcher.js` | native walker → PERMANENT_ETB; partial → Arbiter seam (SPELL_NOOP). |
| Loyalty-ability offer | `legalChoices.js` | `actionsActivateLoyalty`: sorcery-speed + once-per-turn-per-walker (CR 606.3), −N only when loyalty ≥ N (CR 118.3), one action per legal target. Gated on native coverage. |
| Loyalty-ability dispatch | `actionDispatcher.js` | `applyActivateLoyalty`: pay the loyalty cost (CR 602.2b), mark used, push the effect program (sourceId = the walker), then run the 0-loyalty SBA (a −N to 0 dies but its ability still resolves). |
| Combat | `legalChoices.js` + `actionDispatcher.js` + `combatResolution.js` | attack a planeswalker (`defenderPlaneswalkerId`); combat damage removes loyalty, not life (CR 120.3c); the Standard no-PW shape is unchanged. A walker that left before damage is dealt takes none (no redirect to the player). |
| Coverage tier | `coverage.js` + `measure-coverage.mjs` | new `native-planeswalker` tier. |

Tests: `planeswalker.test.js` (34 cases — parsing, ETB, SBA, offer/dispatch, once-per-turn,
combat-into-walker, cast gating) + corpus pins (Jaya/Sorin/Tibalt MUST stay `arbiter-pw`; a synthetic
pure-loyalty walker MUST be `native-planeswalker`).

## Corpus intel (2026-06-18, ~33.5k real cards)

- **339 planeswalkers.** Loyalty costs: +N ×344, −N ×542, 0 ×54. The corpus prints the **Unicode
  minus `−` (U+2212)**, not ASCII `-`.
- **187 are pure-loyalty** (no static/triggered line). **0 of them have every loyalty ability
  modelled today** — each has ≥1 unmodelled effect (emblems, venture, gain-control,
  search-to-battlefield, random discard, …), a long low-frequency tail. No single atom flips a batch.
- **10 are all-loyalty-modelled but blocked by one non-loyalty line** — and several of those lines
  (e.g. "Creatures you control have haste") are anthems the engine **already** models.

So PR1 flips **0** cards native — and that is the honest CREED baseline, not a bug. The framework is
the unblocker; coverage comes in the waves below.

## Roadmap

- **PR1 — framework foundation.** ✅ (this doc). 0 cards native; machinery + tests proven.
- **PR2 — residue coverage.** Treat a non-loyalty line that's an **already-modelled** static/trigger
  (anthem, etc.) as covered rather than residue, reusing `staticAbilityParser` / trigger coverage.
  Flips the ~10 "blocked only by a modelled-shape line" walkers. False-positive-prone → independent
  adversarial review required.
- **PR3 — AI piloting (full heuristics).** AI deploys walkers, activates loyalty abilities with value
  evaluation + ultimate timing, attacks enemy walkers as threats, protects its own. (Today the AI
  defaults to attacking the face — safe, never crashes.)
- **PR4+ — long-tail loyalty atoms.** New effect atoms for the common loyalty shapes (make-a-token,
  +1/+1 on up to two targets, gain-life-per-creature, …), flipping pure-loyalty walkers card by card —
  the coverage-builder lane.
