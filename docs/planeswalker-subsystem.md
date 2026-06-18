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

So PR1 flips **0** cards native — the honest CREED baseline. **PW-2's HYBRID model is what makes
walkers actually playable** (below).

## PW-2 — the hybrid model (playability)

A walker doesn't need every ability modelled to be PLAYABLE. Under the hybrid:

- `planeswalkerPlayable(card)` — true when the walker has **no unmodelled static/triggered residue**
  (a static can't be hybrid-routed — it applies continuously). It does NOT require every loyalty
  ability modelled.
- A playable walker **enters the native battlefield** (cast gate uses `planeswalkerPlayable`). Each
  loyalty ability is offered: a **modelled** one resolves natively; an **unmodelled** one is an
  Arbiter-routed action — the loyalty cost is paid natively, then the EFFECT routes to the Arbiter
  seam (`markPendingArbiter`) at activation. Surfacing *every* ability is required by the CREED
  (hiding an unmodelled one would silently drop it).
- New coverage tier **`playable-pw`** — playable but NOT counted native (≥1 ability is Arbiter-routed).
  `native-planeswalker` stays strict (every ability modelled) for the corpus-% metric.
- The AI does not yet pilot loyalty abilities (it passes — no self-play stall on Arbiter-routed
  effects); that's PW-4.

**Result: 185 / 324 castable planeswalkers are now `playable-pw`** (up from 0), 0 native, 138
`arbiter-pw` (static/trigger residue), with **0 false positives**. Live-driven end-to-end on a real
card (Zariel, Archduke of Avernus: enters at 4 loyalty → +1 ticks to 5 natively → a 6/6 attack drops
it to 0 → graveyard).

## Roadmap

- **PR1 — framework foundation.** ✅ 0 cards native; machinery + tests proven.
- **PR2 — hybrid playability.** ✅ 185 walkers `playable-pw`; modelled abilities native, the rest →
  Arbiter at activation.
- **PR3 — AI piloting.** ✅ The AI activates a beneficial MODELED loyalty ability each turn (prefers
  an enemy-side removal, else a loyalty-building +N; never a self-harm variant; skips Arbiter-routed
  ones so self-play never stalls), and diverts a clean swing to remove a dangerous enemy walker
  (no-blocker clean kill, not when going lethal on a player). Deferred: AI blocking to protect its
  own walkers; smarter ultimate timing. Live-driven (AI ticks Zariel 4→5, respects once-per-turn).
- **Native-ability rate rises passively.** The 81% of loyalty abilities that route to the Arbiter are
  GENERAL effects (loot, tokens, gain-control, search, emblems) the coverage builders model
  corpus-wide; loyalty abilities parse through the same `parseEffectClause`, so they convert to native
  automatically as that push advances — no PW-specific atom grind needed.
- **PR4 — teaching layer.** Common planeswalker mistakes (loyalty timing, "can I activate two,"
  summoning-sick walkers CAN activate, combat redirection, protecting a walker) fed to the Academy's
  explanation layer.
- **Optional follow-ups (small).** Static-residue coverage (only ~3 clean anthem walkers — Samut,
  Domri, Ajani the Greathearted); AI walker-protection blocking; per-ability emblem modelling.
