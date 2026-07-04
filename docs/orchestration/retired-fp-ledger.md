# False-Positive → Enforcement Backlog (enforce, don't drop)

> **Policy (Colton, 2026-06-18 — supersedes the earlier "drop & defer" framing):** when a shipped card is
> a false positive because the engine doesn't **enforce** its mechanic, the **default remediation is to
> BUILD the enforcement** so the card is honestly native AND plays correctly — **not** to drop it to the
> Arbiter. Local-first is the prime directive: a tractable, well-understood mechanic (evasion, targeting
> restriction, prowess, …) is an **easy win**, not a write-off. *Understood → added → fixed to work.*
>
> **Dropping to the Arbiter is now the LAST RESORT** — only for genuinely-hard/exotic mechanics where
> enforcement isn't tractable yet, and even then it's a **temporary** measure logged here with the
> enforcement that will undo it. The only permanent write-offs are the irreducible one-offs ("cast a copy
> chosen at random") — those live on the Arbiter forever and are NOT listed here.

## How it works
- **Hans (FIX lane):** when you find a live FP, first ask *"is the rule tractable to enforce?"* If yes →
  **file a high-priority enforcement task** on the board (don't drop). If genuinely hard/exotic → a
  *temporary* drop + a row here keyed to the enforcement that would restore it. Either way, the live FP
  is recorded so it's never forgotten.
- **Builders (Cindy / Walt):** pull the enforcement tasks like any coverage work — engine-first (the
  engine must honor the rule before the card counts native), full gate, CREED.
- **Clyde:** prioritize these on the board; when an enforcement lands, the bucket's cards become honestly
  native (coverage rises *correctly*). Confirm the backlog row is closed.

## ⚠️ Interim honesty note
The enforce-don't-drop policy has been **proven 3× over** — **9 of the 11 keyword FPs are now honestly enforced**
(EVADE #258, KW-UNTARGET #260, TRIG-PROWESS #262; coverage rose *correctly* as each enforcement converted
interim→honest). **ALL keyword interim-FPs now enforced — ward #305 + protection #306 closed the last two** (both partial-but-honest: the deferred sub-rules are safe false-negatives, never mis-resolved).
The newest backlog row (`native-mana residue gate`, board-10) is a different animal: a **metric-only** over-count,
not a live gameplay FP — see its CAP section. (#255's blanket keyword-drop was **superseded** by #256, which reverted
it to keep the 11 claimed while enforcement shipped.)

## Enforcement backlog — by capability

### ✅ CAP: combat-evasion enforcement (the `canBlock` / attack-legality chokepoint) — **DONE #258**
**Board task:** `EVADE` (expanded) + folded in `VERIFY-MENACE`. One chokepoint (`combatEvasion.canBlockAttacker`)
the engine now consults for block/attack legality + the defender declare-attacker gate. Hans-verified.

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| menace | must be blocked by 2+ creatures | ✅ ENFORCED #258 |
| skulk · intimidate · fear · horsemanship | conditional "can only be blocked by …" restrictions | ✅ ENFORCED #258 |
| defender | can't attack | ✅ ENFORCED #258 |

### 🔨 CAP: targeting-restriction enforcement — **PARTIAL (hexproof/shroud DONE #260; ward remains)**
**Board task:** `KW-UNTARGET` (hexproof/shroud, DONE) + `TARGET-RESTRICT` (ward). `enumerateTargets` now honors
hexproof/shroud untargetability; ward (a TAX, not an exclusion) is its own slice.

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| hexproof · shroud | can't be targeted by opponents / by anyone | ✅ ENFORCED #260 |
| ward | targeting it costs the opponent (else countered) | ✅ ENFORCED #305 (generic-cost mana wards ~142, via the soft-counter machinery; colored/hybrid/non-mana ward = safe FN, PR2) |
| protection | can't be targeted/blocked/enchanted/equipped/damaged by the quality | ✅ ENFORCED #306 (color quality, COMBAT block+damage, 138/214; targeting/enchant-equip/non-combat/non-color = safe FN, PR2) |

### ✅ CAP: prowess via the cast-trigger compiler — **DONE #262**
**Board task:** `TRIG-PROWESS`. A noncreature-cast trigger → +1/+1 until end of turn (CR 702.108, Hans-verified).

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| prowess | +1/+1 until EOT whenever you cast a noncreature spell | ✅ ENFORCED #262 |

### ✅ CAP: native-mana residue gate (the metric all-or-nothing gap) — **DONE #280**
**Board task:** `FIX-MANA-OVERCLAIM` (🔴, FIX lane). `coverage.js:361` returns `native-mana` with **no residue
check**, so ≥110 mana sources with unmodeled non-mana text (Mana Crypt's coin-flip, Sorcerer Class's levels,
Spara's ETB) are counted fully native. **METRIC-ONLY** (no runtime consumer of the tier — the engine routes the
unmodeled trigger to the Arbiter independently), so unlike the keyword rows this is not a live *gameplay* FP — it's a
scoreboard over-count. The fix is a classifier tightening, not a runtime enforcement.

| Capability | Rule to enforce (plain) | Status |
|---|---|---|
| native-mana residue gate | claim native-mana only when every non-mana clause is modeled-or-keyword-only | ✅ ENFORCED #280 (−269 over-claimed; native-mana now all-or-nothing; honest 17.1%. The smaller non-mana *activated*-ability over-claim is a deliberate fragile follow-up — under-correcting is safe) |

### ✅ CAP: earthbend dies-return delayed trigger — **DONE (E1, engine-tail pass 2026-07-04)**
**SHIPPED — the "When it dies or is exiled, return it to the battlefield tapped" rider (CR 603.7 delayed trigger) is
now ENFORCED.** `applyEarthbend` (`effects/atoms/combat.js` — the `effectAtoms.js:763` cite below is stale) tags the
animated land `earthbendReturn`; `triggers.checkLeavesTriggers` synthesizes a delayed trigger (→ `zones.applyEarthbendReturn`)
that returns the land TAPPED, as a plain land, on a graveyard (dies) or exile exit — firing landfall on the re-entry
(Toph's own experience counter). CREED-guarded: bounce-to-hand / tuck-to-library do NOT return; an unflagged land does
NOT return. Tests in `earthbend.test.js`.

**Correction to the original framing (verified live 2026-07-04, BEFORE building):** the "34 permanents stay body-only,
masked by the count bug" premise below was STALE. The reminder-strip in the shaped count had already shipped
(`coverage.js allTriggerSentencesModeled` strips reminders; `coverageReminderStrip.test.js`), so before E1 the earthbend
permanents whose ability otherwise routed were ALREADY `native` (Toph = `native-trigger`, + Haru, Earth Village Ruffians,
The Boulder, Badgermole, Earthbending Student, Earth Kingdom General, Solid Ground) — dropping the return as a tolerated
safe-FN partial (under-delivery, same class as ward #305 / protection #306 PR2). E1 upgraded that partial to a FULL model
→ **0 tier flips** (they were already native; flip-diff LOST=0/GAINED=0, trajectory byte-identical). The body-only
earthbend cards (Aang, Kyoshi, Bumi…) stay body-only for OTHER unmodeled text (transform / ETB-dig), not the return.

**Live surface (so it's not invisible):**
- **3 earthbend SPELLS already ship `native-spell` and drop the rider today:** Earthbending Lesson, Cracked Earth
  Technique, Sandbenders' Storm (they route via `spellIsNative`, not the trigger path).
- **The earthbend PERMANENTS whose ability routes were ALREADY `native` before E1** (the count-strip un-masked them —
  see the correction above); E1 makes them play *honestly* (the return now fires) instead of as a safe-FN partial. The
  remaining body-only earthbend cards are body-only for OTHER unmodeled text, not the return.

**Enforcement (tractable):** tag the animated land with a `returnOnDeath` flag at animation time; in the dies/exile
path (`checkDiesTriggers` already exists) fire a delayed trigger that returns it tapped (CR 603.7 delayed triggered
ability). Engine-first, full gate, then the earthbend cards flip native correctly.

> **⚠️ COUPLED latent bug — RESOLVED before E1 (the strip already shipped):** `allTriggerSentencesModeled`
> (`coverage.js`) now STRIPS reminder text before counting trigger-shaped sentences (the reminder-strip this note once
> prescribed shipped separately — `coverageReminderStrip.test.js`), so `shaped == detected` for earthbend and the
> permanents were no longer held `body-only`. The historical hazard ("stripping BEFORE building the return un-masks the
> partial into dropped-rider FPs") had therefore ALREADY happened: the permanents sat as native safe-FN partials, which is
> why E1's job was runtime return-enforcement (0 tier flips), NOT a count-strip. The prescribed "build return first, then
> strip" ordering is moot — the strip was already in place; E1 supplied the missing return. (Reminder text is never
> rules-bearing, CR 207.2; the routing check still gates unmodeled effects independently.)

## Corrected reclassifications (not FPs — already right)
| Item | Fix | Note |
|---|---|---|
| Wrenn and One — `land` tier matched before the planeswalker gate | check planeswalker-before-land | Keep (was in #255; harmless metric over-count of 1). |

---
_Reframed 2026-06-18 (cycle 4) from "retired-FP ledger" to "enforcement backlog" per Colton's enforce-first
directive. The 11 display-only keywords are the seed batch — all PRIORITY easy wins, none dropped._
