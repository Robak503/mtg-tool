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

## 🅿️ PARKED
- **EARTHBEND ETB cluster (Toph, ~7 cards) — parked: unexplained coverage-gate inconsistency, FP-prone.** Earthbend is runtime-complete (`applyEarthbend`, 21 tests, `parseEffectClause("earthbend N")`=HIGH). The cards are body-only because `permanentTriggersCovered` doesn't `stripReminder`. BUT `permanentFullyCovered` (which DOES strip reminders) ALSO returns false for Badgermole Cub, while a doubler-stripped Solid Ground passed it (the wave-1 FP). I could NOT explain that asymmetry in 2 analysis rounds → FAIL-FAST park. **To unpark: first verify earthbend ETB RESOLVES end-to-end in a real game (does the dies/leaves path fire? is the target "a land you control" resolvable at trigger time?), then decide between a targeted `isNativeEarthbendCard` classifier (safer) vs fixing `permanentTriggersCovered` reminder-handling (broad, needs full-corpus flip-diff).** Do NOT flip until earthbend-ETB end-to-end resolution is positively verified.
- _(design calls awaiting Colton — pick a disposition, I'll build it)_
- **Doubler recipient-precision edges (minor pre-existing runtime over-fires, NOT in any flip set):**
  - `Benevolent Hydra` — "another creature you control" counter doubler applies to ITSELF too (the "another" self-exclusion is dropped; `applyCounterDoubling` only gets the controller id, not the recipient permanent id). Tiny over-buff on Benevolent Hydra itself. Fixing needs a recipient-id arg threaded through the counter pipeline.
  - `Caradora, Heart of Alacria` / similar "creature or Vehicle you control" — applies to all your permanents, a slight super-set. Both stay non-native (mixed bodies), so no metric FP — logged for when the doubler pipeline gains recipient-identity precision.

## 🚧 BLOCKERS
- **⚠️ DIRECT PUSH TO `master` IS PERMISSION-BLOCKED (harness auto-mode classifier).** It can't see that my standing orders authorize Clyde as single-writer to master, so `git push origin HEAD:master` is denied. **Adaptation:** the night's waves accumulate on branch **`claude/ecstatic-feynman-5fa8a1`** → **PR [#381](https://github.com/Robak503/mtg-tool/pull/381)** (each wave committed + fully gated + adversarially verified; always green). **MORNING ACTION (pick one):**
  1. **Fast-forward merge PR #381** — it's ff-clean off master, every wave gated. (Recommended — simplest, preserves the per-wave history.)
  2. **Grant me push-to-master permission** (add a Bash allow rule for `git push origin HEAD:master`) so the rest of the grind auto-integrates per the standing orders.
  - Until then the grind continues ON THE BRANCH — no work is lost, nothing is on master yet.

---

## 🧭 STRATEGIC FINDING (fire 2 — important)
**The clean "honesty-flip" vein is largely mined out.** Wave 1 (doublers) worked because the runtime was ahead of the classifier. I scouted 5 more families this fire and found the same shape everywhere: **the trigger/effect ALREADY routes, but the actual 13-deck cards carry an unmodeled RIDER** (a 2nd ability, an activated cost, an alt-cast keyword, a conditional). So the remaining 13-deck gains require **building the rider subsystems**, not grabbing quick flips. Verified routing-already-works for: counter/token doublers (shipped), combat-damage→draw, treasure-creation, aristocrat dies-drain. Next gains = subsystem builds (below), each deserving its own fresh-context fire.

## 🔭 NEXT LEVERS (ranked actionable builds — scouting done, just build)
1. **TREASURE-SAC activated-rider system (biggest single-deck lever — Vihaan).** Treasure CREATION + Treasure-as-mana already work end-to-end (proven: synthetic "Whenever X attacks/etb/cdmg, create a Treasure token" all classify native-trigger; Pitiless Plunderer native). The blocker on the real cards is the **"Sacrifice N Treasures: <effect>" activated ability** (Grim Hireling "{B}, Sac X Treasures: target −X/−X", Professional Face-Breaker "Sac a Treasure: exile top, may play", Kellogg "Sac five Treasures: gain control", Jan Jansen, Mastermind Plum, Kellogg). Build: parse "Sacrifice N Treasure(s)" / "Sacrifice a Treasure" as an activation COST (treasure-sac), wire into the activated-ability cost system so the sim can pay it, model the effects (most already covered: −X/−X, exile-top-cast, gain-control, draw). All-or-nothing per card. Also small adjacent riders: "becomes tapped → pump" (Captain Lannery), Xorn (Treasure-specific additive token doubler — extend tokenMultiplier to additive+typed, low ROI).
2. **CHOOSE-A-CREATURE-TYPE** (`CHOOSE-TYPE-PERSIST`) — gates Sliver (highest-native, blocked from 100% per the brief) + Ur-Dragon/Pantlaza; durable chosen-type state primitive + anthem/draw/cost consumers. ~10 cards. State-primitive subsystem.
3. **EARTHBEND ETB cluster** — PARKED (see Parked; verify earthbend-ETB end-to-end resolution first, then targeted classifier).
4. **dies-subject "…or planeswalker you control"** — INTENTIONAL CREED deferral (triggers.js:264-267): the creature∪planeswalker union isn't enforceable by the creature-only scope, and needs planeswalker-death events to fire. Only 3 corpus cards (Cruel Celebrant/Rising Populace/Ajani's Last Stand). Low ROI; needs PW-death events. Skip unless bundled.
5. **Power-scaled draw** (Rishkar's ×4/Wildspeaker ×3/Inspiring Call ×4) — highest cross-deck COUNT but ALL rider-blocked (free-cast / modal / indestructible-rider). Each needs its rider modeled.

## 🔎 SCOUTING NOTES (don't re-investigate — already checked)
- **Treasure creation ROUTES** (synthetic pure treasure-trigger cards all native-trigger; Pitiless Plunderer native). Blocker = sac-Treasure activated riders (→ lever #1).
- **combat-damage→draw ROUTES** (Reconnaissance Mission native-trigger). Deck candidates rider-blocked: Bident (force-attack activated), Enduring Curiosity (dies-return), Starwinder (Warp), Marcus (conditional). Synapse Sliver/Coastal Piracy = detection gaps.
- **Aristocrat dies-drain mostly DONE** (Zulaport/Blood Artist/Bastion/Corpse Knight/Elas il-Kor native). Remainder = riders or the intentional "or planeswalker" defer.
