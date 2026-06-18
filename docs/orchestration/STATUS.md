# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Omnath keeps this file fresh every integration cycle (the data source); **Iris** (the Dashboard faculty) renders it as a visual in her own chat — glance there, or type "status"/"refresh" in Iris's chat to re-render. Rendering lives in Iris's chat so it never bloats Omnath's context.
> _Omnath updates this every integration cycle · 2026-06-18._

## 📊 Scoreboard
- **Native coverage: 16.0%** — 5,369 / 33,540 cards · goal **~90%** (honest ceiling; the Arbiter handles the rest)
- `[####······················]`  ~18% of the way to goal
- **Coverage going *down* when false positives are retired is correct** — an honest 16% beats a dishonest 16.3%.

## 👥 Faculties — who's doing what
| Faculty | Role · cadence | Current |
|---|---|---|
| **Cindy** | Builder · continuous · **grab-ahead trial** | building (see In-flight) |
| **Paula** | Builder · continuous | building (see In-flight) |
| **Tess**  | Builder · continuous | building (see In-flight) |
| **Erin**  | Fixer · 4h cloud | FIX-TRIG-CONDITION (34 FPs) — pending her next wake |
| **Hans**  | Scout · 3h | board-2 shipped ✅ · next refresh ~3h |
| **Rod**   | QA · 3h | findings #1 filed (52 FPs) ✅ · next sweep ~3h |

## 🛠️ In flight (claimed / building)
| Task | What | State |
|---|---|---|
| **EP-3** | each-player mill | PR #224 · CI ✅ → **ready to merge** |
| **ADDCOST** | spell additional costs | claimed · building _(off-board — Hans re-ranked it; still valid coverage, will ledger on merge)_ |
| **ED-2** | edict variants | claimed · building |
| **TOK-3** | create X / N>5 tokens | claimed · building |

_Per-builder attribution: cross-ref your chat titles for now. Add the faculty name to claim branches (`feat/<task>-<name>`) to make this column exact._

## 📋 Ripe & unclaimed — next picks
- 🔴 **PUMP-1** team pump · **REG-1** regrowth→hand · **DIG-1** impulse-dig · **MT-1** divide-among picker
- 🟡 **SOFT-CNT** soft counter · **FOG-1** fog latch
- 🟢 **CNT-2b** remaining counters · **BURN-2** burn riders
- 🔴 **FIX-TRIG-CONDITION** — Erin's lane (not for builders)

> Read your task's **landmine note** in [`scout-gap-report.md`](scout-gap-report.md) before you build.

## 🔁 Recent merges (newest first)
- Hans **board-2** refresh — integrated (#216)
- **#223** Erin → 4h cloud cadence · **#222** manaModel phantom-source FP fix
- **#220** EP-2 discard · **#219** CNT-2 counter · **#218** TOK-2 named tokens
- **#217** Rod findings #1 (52 trigger FPs → 3 FIX tasks) · **#221** mana reminder-text FP fix
