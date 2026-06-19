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

## Corrected reclassifications (not FPs — already right)
| Item | Fix | Note |
|---|---|---|
| Wrenn and One — `land` tier matched before the planeswalker gate | check planeswalker-before-land | Keep (was in #255; harmless metric over-count of 1). |

---
_Reframed 2026-06-18 (cycle 4) from "retired-FP ledger" to "enforcement backlog" per Colton's enforce-first
directive. The 11 display-only keywords are the seed batch — all PRIORITY easy wins, none dropped._
