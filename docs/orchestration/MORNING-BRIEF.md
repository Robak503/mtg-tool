# ☕ MORNING BRIEF — 2026-07-02

**While you slept, the completion loop finished the overhaul and shipped `v0.85.0`.**

## The one-paragraph version
The engine got its deep overhaul and every claim is measured: self-play runs ~6× faster with
provably identical decisions, the practice AI is genuinely better (**59.2% vs 40.8%** against its
old self over 120 seeded games — dead turns basically gone), mirror-commander games no longer
hand out false 21-damage deaths, resolved spells finally reach the graveyard (Regrowth can see
them now), Kellan casts from the command zone again, the Academy can't soft-lock, and the app now
ships the **complete 95,001-combo Spellbook dataset** (found their official bulk export — the sync
that used to die rate-limited at ~10% now finishes in nine seconds). Omnath's three engine seams
are built and contract-locked (COMMS "Clyde 9"), and the whole method is written down so
non-Fable sessions can repeat it: **OVERHAUL-PLAYBOOK.md** (mechanics) +
**OVERHAUL-SESSION-NARRATIVE.md** (the mimicry guide you asked for).

## Numbers that matter
| | before | after |
|---|---|---|
| Tier-1 pod, 3 games | 7.0s | ~1.1s (identical decisions, hash-proven) |
| AI vs its old policy | — | +18.3pt win rate, dead turns 0.68→0.03 |
| Spellbook combos shipped | 9,900 (~10%) | **95,001 (100%), ~9s sync** |
| Corpus native | 8,650 | 8,645 (−5 named false positives = more honest) |
| Test suite | 6,371 | **6,587 green** |

## Your decisions, when you feel like it (nothing blocks)
1. The **6 old dirty worktrees** still await your force-remove OK (they hold pre-overhaul
   uncommitted work; branches keep the commits).
2. The parked designed-not-built list (WAKE-REPORT §⚠️2) — the AI's equip/activated-ability
   slice (W6/W7) is the biggest remaining play-quality lever.
3. v0.85.0's CI verdict + release link: appended to CONTINUITY by the loop's final check.

*Everything else — evidence, contracts, parked analyses — is one hop from
[WAKE-REPORT.md](WAKE-REPORT.md).*
