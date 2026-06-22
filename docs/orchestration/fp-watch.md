# FP-WATCH — running false-positive log (the channel to Hans)

> **Why (Colton, 2026-06-19):** Cindy's TRUNK PLAN flips cards in bulk (150–600/slice). A broad matcher's
> blast radius scales with it — one over-broad pattern can mint *dozens* of false positives at once. CREED:
> a false positive (a card flipped native that then mis-resolves / drops a clause / fabricates) is
> **FORBIDDEN**. This file is the durable "noted for Hans" channel so nothing slips through the cracks as
> volume scales.
>
> **This is NOT the same as `retired-fp-ledger.md`.** That ledger = mechanics we *deliberately* deferred and
> will enforce later (enforce-don't-drop). THIS file = cards that **shipped native but are WRONG** and need a
> fix NOW (correct the model, or drop-to-LOW with a pin).

## Protocol

**Who APPENDS (anyone who spots one):**
- **Clyde** — at the merge gate, when a high-volume slice's sample looks risky or a shape isn't pinned.
- **Colton** — anything caught in live play / a goldfish.
- **Hans** — everything her corpus sweep surfaces.

**Who DRAINS:** **Hans** (FIX lane). Each row → either (a) tighten the matcher + add a `MUST_DROP_TO_LOW`
pin so it can never re-flip, or (b) if the whole mechanic is intractable, drop-to-LOW + log it in
`retired-fp-ledger.md` keyed to the future enforcement. Batch fixes on `fix/<batch>-hans`. Mark the row
DONE (with the fixing PR #) — don't delete it (the history is the regression record).

## High-volume guardrails (the net for bulk slices)

1. **Builder (Cindy):** every slice flipping **>100 cards** MUST paste a **sample of 15–20 newly-native
   card names** (from the adversarial corpus run) into the PR body, + the `MUST_DROP_TO_LOW` shapes it
   excludes. No sample on a big slice = Clyde holds the merge.
2. **Integrator (Clyde):** on a >100-card slice, spot-check the sample + confirm the over-broad shapes are
   pinned. Any doubt → append the suspect here and either hold for Hans or merge-with-a-watch-row.
3. **QA (Hans):** sweep the **new flip-set of every merged slice** (not just periodically) — `qa-sweep.mjs`
   over the cards that slice added — and log every FP here same-cycle.
4. **Release gate (Clyde):** don't cut a release whose >100-card slices haven't been Hans-swept yet (or note
   the unswept slices in the release entry so a fast-follow can patch).

## The log

_(newest first · status: 🔴 open · 🟡 in-fix · ✅ fixed)_

| Date | Card(s) | Slice / PR | Symptom (why it's a FP) | Severity | Status |
|---|---|---|---|---|---|
| 2026-06-22 | (#361 atom comments + tests) | #361 WAVE 1a (Clyde adversarial sweep) | **More fabricated/miscited CR numbers** (runtime CLEAN — comment/test-string only): treasure `tokens.js:140` + `tokenFactoryDynamic.test.js:7` cite **608.2g** (governs paying mana during resolution) for the count-lock → should be **608.2h**; manifest `manifest.js` + `gameState.js` moveCardToZone cite **701.34 / 701.34d / 701.34g** (701.34 = Proliferate; .34d/.34g don't exist) → **701.62 / 701.62a** (manifest dread) + **701.40 / 701.40a** (face-down 2/2); amass `amass.js` + 2 `amass.test.js` descs cite **701.43 / 701.43c** (= Exert) → **701.47 / 701.47a**. Keep 110.5 / 603.6a / 107.3 (verified real). | P2 | ⏳ OPEN — sweep-flagged; **verify each vs `cr_current.json` by rule text, then one citation-cleanup PR** (next session). #361 + #362 otherwise CLEAN (no P0/P1; both safe as-merged). Latent (no change now): matcher-(c) `"create that many <tok>"` hardcodes `combatDamageAmount` — safe today (Poetic Ingenuity stays body-only), tighten when the attack-batch trigger wave lands. |
| 2026-06-22 | (8 TRUNK-ENTERSTAPPED/COUNTERS comments + 2 CHANGELOG entries + 2 test headers) | TRUNK-ENTERSTAPPED/COUNTERS (#296/#299 era) | **Fabricated CR sub-rules (CREED §1.2 — never invent rule numbers):** `CR 614.1f` (enters-with-counters) + `CR 614.1g` (enters-tapped) were cited in 8 code/test sites but **DO NOT EXIST** in `cr_current.json` (614.1 tops out at **614.1e**). Comment-only, runtime correct, but a standing invented-rule-number violation; the cycle-48 landfall fix (#344 row below) wrongly affirmed them as correct. | P2 | ✅ FIXED 2026-06-22 (Clyde, absorbing Hans's CR-verify role on her retirement). Corrected all 8 code/test sites + 2 CHANGELOG entries: enters-tapped → **614.1c**, enters-with-counters → **614.1c + 122.6a**, static framing **603.6d** — all three verified present in `cr_current.json` by rule text. Surfaced in Hans's retirement handoff. |
| 2026-06-21 | **Slimefoot, the Stowaway** (LIVE) · Setzer · Edward Kenway · Adéwalé · Sophia (latent) | #335 SUBTYPE attacks/dies (widened the #333/#330 shared scope) | **LIVE P0.** `subtypeYouControl` (`triggers.js` scopeMatches) is shared across ETB-SELF (#330), combat-damage (#333), attacks + dies (#335). Its self-inclusion clause (`triggeringPermanent.id === sourcePermanent.id`) fired a watcher on its OWN event even when the watcher isn't the named subtype. #335 widening to `dies` made it REACHABLE: **Slimefoot** (`native-mixed` Fungus) watches "a *Saproling* you control dies" → self-fires its "deal 1 to each opponent + gain 1 life" drain when Slimefoot ITSELF (a non-Saproling) dies. Real mis-resolve. | **P0 LIVE** | ✅ FIXED `fix/hans-fp-batch-cycle46` (cycle 42→46 — gated self-inclusion on the SOURCE carrying the subtype; no native card regresses. +4 regression tests incl. Slimefoot dies-guard. **Re-cut clean off current master — the original branch accumulated merge-commit conflicts.**) |
| 2026-06-21 | **Treacherous Trapezist** | #341 CAST-SUBTYPE | LIVE never-firing native: `castSpellFilter` captured "alliterative" from "cast an **alliterative** spell" as `subtype:Alliterative`, flipping the card `native-trigger`. But "alliterative" is an Un-set name-property, NOT a type-line subtype → the trigger could never fire (a do-nothing native = CREED FP). The denylist leaked it. | P1 (do-nothing native) | ✅ FIXED `fix/hans-fp-batch-cycle46` (cycle 44 — added "alliterative" to `NON_SUBTYPE_CAST_WORDS`; Trapezist → `body-only`; re-scan = 5 real-subtype natives, 0 never-firing. +1 regression test.) |
| 2026-06-21 | (Living Weapon + For Mirrodin! comments) | #346 TOKEN-ETB-FIRE | CR-citation hygiene (not a runtime FP): `resolvers.js` cited **CR 702.91** for Living Weapon (702.91 = "Battle Cry"; Living Weapon is **702.92**). Hans also caught a SECOND in the same comment: **For Mirrodin! was cited 702.157** (= "Squad"; For Mirrodin! is **702.163**). Both comment-only, runtime correct. | P2 | ✅ FIXED `fix/hans-fp-batch-cycle46` (cycle 46 — corrected all 3 sites to 702.92 / 702.163, **verified against `cr_current.json`**; Clyde flagged the first, Hans caught the For-Mirrodin one too). |
| 2026-06-21 | (landfall comment) | #344 RAMP-LANDFALL | CR-citation hygiene (not a runtime FP): landfall comments cite **CR 614** (Replacement Effects); landfall as a *triggered* ability is **CR 603** (ability word CR 207.2c). 614 is a real section, just loosely applied. **#344 (merged 300caad) ADDED 2 more sites** (`effects/effectAtoms.js` enterCardFromZone, `rampLandfall.test.js`) on top of the 3 in the existing landfall code — 5 total. | P2 | ✅ FIXED `fix/landfall-cr-cite-v2-hans` (cycle 48 — corrected ALL 5 landfall sites 614→603: triggers.js, actionDispatcher.js, effects/effectAtoms.js, landfall.test.js, rampLandfall.test.js. ⚠️ This fix ALSO claimed "left the 8 TRUNK-ENTERSTAPPED/COUNTERS 614.1f/g cites intact — genuinely replacement effects" — **that was WRONG**: 614.1f/g DON'T EXIST in `cr_current.json` (614.1 tops out at 614.1e). Corrected 2026-06-22 — see the row above. Verified 603.2/614.1 vs `cr_current.json`. Supersedes the cycle-47 3-site `fix/landfall-cr-cite-hans` which predated #344's 2 new sites.) |
| 2026-06-19 | (regeneration creatures) | #300 REGEN | LATENT/unreachable today: `regeneratePermanent` omits CR 701.15a "remove from combat" — a creature regenerated in the FIRST-STRIKE sub-step could deal damage again in the regular sub-step. Nothing sets a shield before combat damage today, so unreachable. Fix = skip dead/regenerated attackers in the combat-damage loop. (Cindy self-flagged in the #300 4b.) | latent | ✅ FIXED #303 (2026-06-20 — `removeFromCombat` flag + `combatant()` guard skips regenerated creatures in later combat-damage steps; Cindy) |

> Severity: **P0** mis-resolves in a normal game (silent wrong result) · **P1** drops a clause/rider ·
> **P2** metric-only over-claim (no runtime harm, e.g. FIX-MANA-class). P0/P1 block the next release.
