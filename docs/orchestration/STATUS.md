# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Omnath keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 ~13:28 MST · PW-1 planeswalker framework merged (#236, adversarially reviewed); node_modules restored._

## 📊 Scoreboard
- **Native coverage: 16.6%** — 5,574 / 33,540 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal
- **Open PRs: 0** — queue clear, master clean (recovered from the contamination incident).

## 👥 Faculties — who's doing what
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Omnath** | Command · ~10m watch | watching · **next auto-sweep ~13:38 MST** · last: merged #236 PW-1 framework (reviewed) + restored node_modules |
| **Cindy** | Builder · grab-ahead (≤2 PRs) | shipped MT-1 (#237) ✅ · re-claiming |
| **Paula** | Builder · continuous | shipped KWSTRIP-1 (#234) ✅ · re-claiming |
| **Tess**  | Builder · continuous | shipped ACT-KW-GRANT (#235) ✅ · re-claiming |
| **Erin**  | Fixer · 4h cloud | idle until next wake · queue: VERIFY-MENACE 🔴 (live FP), VERIFY-ETB-DESTROY |
| **Hans**  | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Rod**   | QA · 3h | findings #1 done · next sweep ~3h |
| **Iris**  | Dashboard · 30m | renders this board (read-only) |
| **Walt**  | Planeswalkers · subsystem | PW-1 framework ✅ DONE #236 (reviewed) · now on **PW-2** (coverage) |

## 🔀 Merge queue (open PRs)
_Empty — all clear._

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 is the safe pilot** (top of the ripe list).
- Planeswalkers (~337) = a tracked subsystem (Walt, now building PW-1), not the irreducible tail. Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔴 **TRIG-PUMP-1** ⭐ (compiler pilot) · **PUMP-1** · **SOFT-CNT** · **EVADE** (engine-first)
- 🟡 **ACT-PUMP-TIMING** · **ADDCOST-2** · **ETB-RAMP-SEARCH** + more (see task-board.md)
- 🔧 Erin's FIX lane: **VERIFY-MENACE** 🔴 (shipped FP — Menace not enforced in canBlock), **VERIFY-ETB-DESTROY**

## 🔁 Recent merges (newest first)
- **#236** PW-1 planeswalker loyalty framework (Walt — adversarially reviewed, CREED-airtight) · **#237** MT-1 (Cindy) · **#234** KWSTRIP-1 (Paula) · **#235** ACT-KW-GRANT (Tess)
- prior: **#230** FOG-1 · **#231** REG-1 · **#232** DIG-1 · board-3 adopted · 6-PR batch #224–#229 (Erin 41-FP retire + EP-3/TOK-3/ED-2/ADDCOST/BURN-2)
