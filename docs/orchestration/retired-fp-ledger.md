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
These buckets are **live false positives right now** (the cards mis-play until enforcement ships). We are
**not** dropping them (per the policy above) — we're building the fix. That's an accepted, time-boxed
trade: prioritize the enforcement so the window is short. (#255's blanket keyword-drop is **superseded** —
see STATUS; Hans reworks it to keep only the PW-before-land reclassification.)

## Enforcement backlog — by capability

### 🔨 CAP: combat-evasion enforcement (the `canBlock` / attack-legality chokepoint) — **PRIORITY (easy win)**
**Board task:** `EVADE` (expanded) + folds in `VERIFY-MENACE`. One chokepoint the engine actually consults
for block/attack legality. Today these keywords are display-only (in `COVERED_KEYWORDS` for the body, rules
enforced nowhere) → the creature mis-plays.

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| menace | must be blocked by 2+ creatures | 🔨 ENFORCE (live FP until built) |
| skulk · intimidate · fear · horsemanship | conditional "can only be blocked by …" restrictions | 🔨 ENFORCE |
| defender | can't attack | 🔨 ENFORCE |

### 🔨 CAP: targeting-restriction enforcement — **PRIORITY (easy win)**
**Board task:** `TARGET-RESTRICT` (new). Target selection must honor these so illegal targets are refused.

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| hexproof · shroud | can't be targeted by opponents / by anyone | 🔨 ENFORCE (live FP until built) |
| ward | targeting it costs the opponent (else countered) | 🔨 ENFORCE |
| protection | can't be targeted/blocked/enchanted/equipped/damaged by the quality | 🔨 ENFORCE |

### 🔨 CAP: prowess via the cast-trigger compiler — **PRIORITY (easy win)**
**Board task:** `PROWESS` (new). A noncreature-cast trigger → +1/+1 until end of turn.

| Keyword | Rule to enforce (plain) | Status |
|---|---|---|
| prowess | +1/+1 until EOT whenever you cast a noncreature spell | 🔨 ENFORCE (live FP until built) |

## Corrected reclassifications (not FPs — already right)
| Item | Fix | Note |
|---|---|---|
| Wrenn and One — `land` tier matched before the planeswalker gate | check planeswalker-before-land | Keep (was in #255; harmless metric over-count of 1). |

---
_Reframed 2026-06-18 (cycle 4) from "retired-FP ledger" to "enforcement backlog" per Colton's enforce-first
directive. The 11 display-only keywords are the seed batch — all PRIORITY easy wins, none dropped._
