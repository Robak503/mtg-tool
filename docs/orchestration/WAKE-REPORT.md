# 🌅 WAKE REPORT — overnight Clyde grind (started 2026-06-28)

> Colton reads this first. Single source of "what happened overnight." Updated every wave.
> Loop RESUMED 2026-06-28 from the PAUSE (`2497730`) via the deck-focus `/loop`. One owner chat (me), CREED-absolute, park-don't-stop.

**Live baseline at resume (re-censused from AppData decks.local.json):**
- Corpus: **22.5% native (7,717)**. 13-deck non-land realism: **32.9% (272/827, 555 left)**.
- Worst→best: Wolverine 16.9 · Mothman 18.5 · Kellan 23.4 · Cap America 28.1 · Rograkh 28.6 · Ur-Dragon 28.6 · Pantlaza 30.6 · Toph 31.1 · Zaxara 33.3 · Vihaan 37.1 · Omnath 38.1 · Koma 53.2 · Sliver 61.9.

---

## ✅ SHIPPED (waves merged to master)
- **Wave 1 — DOUBLER full-card coverage (+3 native) + Mauhúr over-fire FIX.** Generalized the pure-doubler native seam: a card with a runtime-modeled counter/token doubler (`doublerProfile`→`applyCounterDoubling`/`tokenMultiplier`, applied at every counter-placement/token-mint regardless of tier) whose non-doubler text is keyword-only now classifies native-static — the doubling already happened at runtime; this just corrects the honesty gap. **3 IN / 0 OUT:** Corpsejack Menace (Mothman), Vorinclex (Mothman), Adrix and Nev (Koma). Realism: Mothman 18.5→21.5, Koma 53.2→54.8, aggregate 32.9→33.3 (275/827). Corpus 7,717→7,720.
  - **Runtime FP fixed:** Mauhúr's "Army/Goblin/Orc you control" doubler over-applied to all your permanents → `RECIPIENT_GENERIC` guard (corpus diff = 1 card changed).
  - **FP caught pre-ship:** the mixed-doubler branch falsely flipped Solid Ground (earthbend ETB doesn't route) → branch dropped. Independent refute-skeptic = NOT REFUTED (full master-vs-new diff: 3 flips, 0 regressions, only Mauhúr's runtime changed). Gate: 4509 tests, lint clean.

## 🅿️ PARKED (design calls awaiting Colton — pick a disposition, I'll build it)
- **Doubler recipient-precision edges (minor pre-existing runtime over-fires, NOT in any flip set):**
  - `Benevolent Hydra` — "another creature you control" counter doubler applies to ITSELF too (the "another" self-exclusion is dropped; `applyCounterDoubling` only gets the controller id, not the recipient permanent id). Tiny over-buff on Benevolent Hydra itself. Fixing needs a recipient-id arg threaded through the counter pipeline.
  - `Caradora, Heart of Alacria` / similar "creature or Vehicle you control" — applies to all your permanents, a slight super-set. Both stay non-native (mixed bodies), so no metric FP — logged for when the doubler pipeline gains recipient-identity precision.

## 🚧 BLOCKERS
- **⚠️ DIRECT PUSH TO `master` IS PERMISSION-BLOCKED (harness auto-mode classifier).** It can't see that my standing orders authorize Clyde as single-writer to master, so `git push origin HEAD:master` is denied. **Adaptation:** the night's waves accumulate on branch **`claude/ecstatic-feynman-5fa8a1`** → **PR [#381](https://github.com/Robak503/mtg-tool/pull/381)** (each wave committed + fully gated + adversarially verified; always green). **MORNING ACTION (pick one):**
  1. **Fast-forward merge PR #381** — it's ff-clean off master, every wave gated. (Recommended — simplest, preserves the per-wave history.)
  2. **Grant me push-to-master permission** (add a Bash allow rule for `git push origin HEAD:master`) so the rest of the grind auto-integrates per the standing orders.
  - Until then the grind continues ON THE BRANCH — no work is lost, nothing is on master yet.

---

## 🔭 NEXT LEVERS (ranked; with live scouting intel so the next fire acts immediately)
1. **EARTHBEND ETB cluster → native (Toph laggard, ~7 cards).** Earthbend IS runtime-complete (`applyEarthbend` in `effects/atoms/combat.js`, `parseEffectClause("earthbend N")`=HIGH, 21 tests). The cards (Badgermole Cub, Earthbending Student, Earth Kingdom General, Bumi, Toph, Solid Ground, Earthbender Ascension…) are body-only because **`permanentTriggersCovered` does NOT `stripReminder` before its residue check** (unlike `permanentFullyCovered`), so the earthbend reminder "(Target land… When it dies…)" survives as fake residue. ⚠️ NON-TRIVIAL: there's an unresolved inconsistency — `permanentFullyCovered(Badgermole)` is ALSO false despite stripping reminders, while a doubler-stripped Solid Ground passed it (that was the wave-1 FP). **Untangle the two gates' reminder handling carefully with a FULL-corpus flip-diff before flipping** (broad change — adding stripReminder to permanentTriggersCovered touches every trigger card). High payoff, needs full context.
2. **TREASURE-MAKER trigger coverage** — Vihaan (whole deck) + Ur-Dragon/Cap/Zaxara. Triggers are DETECTED but "create a Treasure token" isn't a covered trigger-effect atom (Captain Lannery/Grim Hireling/Professional Face-Breaker/Mahadi all `trigCovered=false`). Token-with-mana-ability + sac-for-mana subsystem. Biggest single-deck lever (Vihaan).
3. **CHOOSE-A-CREATURE-TYPE** (`CHOOSE-TYPE-PERSIST`) — gates Sliver (highest-native) + Ur-Dragon/Pantlaza; durable chosen-type state primitive + anthem/draw/cost consumers. ~10 cards. State-primitive subsystem.
4. **dies-subject "…or planeswalker you control"** — TINY but clean: extend the dies-trigger subject detector (effect already modeled — Zulaport/Blood Artist/Elas il-Kor are native). Flips Cruel Celebrant (Vihaan) + maybe Rising Populace; corpus-wide only 3 cards match, Ajani's Last Stand stays body-only (optional+sac). Low ROI alone — bundle with another dies/ETB-subject pass.

## 🔎 SCOUTING NOTES (don't re-investigate — already checked this session)
- **combat-damage→draw ROUTES natively** (Reconnaissance Mission is native-trigger). But every 13-deck candidate has a genuinely-unmodeled RIDER: Bident (force-attack activated), Enduring Curiosity (enduring dies-return, conf=low), Starwinder (Warp), Marcus (conditional draw/counter, conf=low). Synapse Sliver + Coastal Piracy = detection gaps ("a Sliver…its controller" / "to an opponent"). NOT a clean wave.
- **Aristocrat dies-drain is mostly DONE** (Zulaport, Blood Artist, Bastion of Remembrance, Corpse Knight, Elas il-Kor all native-trigger). Remaining body-only = riders or the "or planeswalker" subject gap (#4 above).
- **Power-scaled draw** (Rishkar's ×4/Wildspeaker ×3/Inspiring Call ×4) = highest cross-deck count but ALL rider-blocked (free-cast / modal / indestructible-rider). Each needs its specific rider modeled — not one clean wave.
