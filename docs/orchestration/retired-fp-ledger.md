# Retired False-Positive Ledger — deferral, not deletion

> **Policy (Colton, 2026-06-18): retiring a false positive is a DEFERRAL, not a verdict.** A card is
> usually dropped from a native tier to the Arbiter because the engine doesn't yet **enforce** its
> mechanic — *not* because the card is unmodelable. What's "not worth it today" often becomes easy once
> the engine has a fuller breadth. So every retirement is logged here, keyed by **the engine capability
> that would make it honest-native again.** When that capability ships, the bucket gets re-evaluated and
> the now-correct cards are re-promoted.
>
> This is **distinct from the irreducible Arbiter tail** — the truly-unique one-offs ("cast a copy chosen
> at random", "separate permanents into two piles") that live on the Arbiter forever and cap the honest
> ~88–92% ceiling. Those are NOT logged here; only *recoverable* retirements are.

## How it works

- **Retiring (Hans / the FIX lane):** when a fix drops cards native → Arbiter, add or expand a row below —
  the mechanic, ~card count, the **unenforced rule** (why it's a FP today), and the **unblocking
  capability**. Pin `MUST_DROP_TO_LOW` so it can't silently flip back in the meantime.
- **Re-evaluating (Hans, when a capability ships):** re-scan the bucket through the *real* classifier; the
  cards that now resolve whole-card correctly → re-promote via a normal coverage PR (coverage goes back
  UP, honestly); the rest stay logged.
- **Clyde (integrator):** when merging a FIX PR that retires FPs, confirm the retired set is captured here
  with its unblocking capability before flipping the board row DONE.

## Ledger — by unblocking capability

### ⛓️ CAP: combat-evasion enforcement (the `canBlock` / attack-legality chokepoint)
**Unblocks when:** EVADE / VERIFY-MENACE ships — one `canBlock` (+ attack-legality) chokepoint that the
engine actually consults. These keywords are **display-only today** (in `COVERED_KEYWORDS` for the body,
but their blocking/attacking *rules* are enforced nowhere), so a creature "native" on one of them mis-plays.

| Mechanic | ~Cards | Unenforced rule (plain) | Retired by | Status |
|---|---:|---|---|---|
| menace | _pending #255_ | must be blocked by 2+ creatures | #255 | retired → awaiting EVADE |
| skulk · intimidate · fear · horsemanship | _pending #255_ | conditional "can only be blocked by …" restrictions | #255 | retired → awaiting EVADE |
| defender | _pending #255_ | can't attack | #255 | retired → awaiting attack-legality |

### 🎯 CAP: targeting-restriction enforcement
**Unblocks when:** target selection honors "can't be targeted by opponents / can't be targeted / pay ward /
protection-from-X". Today targeting legality ignores these, so a "native" body on one of them lets illegal
targets through.

| Mechanic | ~Cards | Unenforced rule (plain) | Retired by | Status |
|---|---:|---|---|---|
| hexproof · shroud | _pending #255_ | can't be targeted by opponents / by anyone | #255 | retired → awaiting targeting-restriction enforcement |
| ward | _pending #255_ | targeting it costs the opponent / gets countered | #255 | retired → awaiting ward-cost enforcement |
| protection | _pending #255_ | can't be targeted/blocked/enchanted/damaged by X | #255 | retired → awaiting protection subsystem |

### ⚡ CAP: prowess via the cast-trigger compiler
**Unblocks when:** the trigger-effect compiler covers prowess (a noncreature-cast trigger → temp +1/+1).

| Mechanic | ~Cards | Unenforced rule (plain) | Retired by | Status |
|---|---:|---|---|---|
| prowess | _pending #255_ | +1/+1 until EOT whenever you cast a noncreature spell | #255 | retired → awaiting trigger compiler (prowess) |

## Not re-evaluatable (correct reclassification, NOT a deferral)
These were fixed because the metric mis-counted them, not because a capability is missing — they stay reclassified.

| Item | ~Cards | Fix | By |
|---|---:|---|---|
| Wrenn and One — `land` tier matched before the planeswalker gate in `classifyCard` | 1 | check planeswalker-before-land | #255 |

---
_Seeded 2026-06-18 (cycle 4). The #255 rows are forecast from Hans's keyword-enforcement audit; **exact
per-mechanic counts get filled in when #255 merges** (it's not green yet). −289 FP total expected._
