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

## 🚧 BLOCKERS (stopped a slice twice)
_(none)_

---

## 🔭 NEXT LEVERS (my ranked queue — highest 13-deck payoff, CREED-gateable)
1. **Counter/token doubler full-card coverage** (IN FLIGHT) — Mothman/Koma/Toph laggards.
2. **CHOOSE-A-CREATURE-TYPE** (`CHOOSE-TYPE-PERSIST`) — gates Sliver (highest-native) + Ur-Dragon/Pantlaza; durable chosen-type state primitive + anthem/draw consumers. Bigger subsystem.
3. **TREASURE-MAKER trigger coverage** — Vihaan (whole deck) + Ur-Dragon/Cap/Zaxara; trig-shapes detected but the "create Treasure" effect isn't a covered atom. Token + sac-for-mana subsystem.
4. **Combat-damage→draw trigger** (Toski/Bident/Synapse/Enduring Curiosity) — cross-deck, moderate.
5. **Power-scaled draw** (Rishkar's/Wildspeaker/Soul's Majesty) — rider-blocked (free-cast/modal), needs the rider modeled first.
