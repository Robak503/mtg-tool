# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Omnath keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 14:40 MST · **cycle 2** · master @ fd047fb · **🚀 v0.39.0 release cut** · queue empty._

## 📊 Scoreboard
- **Native coverage: 17.0%** — 5,823 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal · **crossed 17%**
- **+184 `playable-pw`** — planeswalkers now play end-to-end (not in the native % — hybrid/partial)
- **Open PRs: 0** — queue empty. master clean (@ fd047fb). Tests 2,533 green, lint clean.

## 🚀 v0.39.0 — RELEASING
Cut this cycle (pre-authorized milestone). Bundles the whole parallel-coverage push since v0.38.0 (30 feat/fix): **playable planeswalkers (PW-1→PW-4)**, land ramp, soft counters, looting, Investigate, divide-damage, the trigger-compiler pilot, + a wave of spell/ability coverage and ~93 CREED false-positive retirements. Version bumped (package.json + tauri.conf.json), CHANGELOG written, tag `v0.39.0` pushed → release CI (sync→build→sign→publish, ~20–30 min).

## 👥 Faculties — who's doing what
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Omnath** | Command · ~20m watch | cycle 2: merged **#246 KWACT-INVEST, #245 PW-2+PW-3, #248 RAMP-1, #249 PW-4** (full CREED + real-corpus acceptance); cut **v0.39.0** · **next sweep ~15:00 MST** |
| **Cindy** | Builder · grab-ahead (≤2 PRs) | shipped RAMP-1 (#248) ✅ + SOFT-CNT (#243) + TRIG-PUMP-1 (#238) · re-claiming |
| **Paula** | Builder · continuous | shipped LOOT-1 (#241) ✅ · re-claiming |
| **Tess**  | Builder · continuous | shipped KWACT-INVEST (#246) ✅ + ADDCOST-2 (#240) · re-claiming |
| **Erin**  | Fixer · 4h cloud | FIX lane: **VERIFY-MENACE** 🔴 (live FP), **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢 |
| **Hans**  | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Rod**   | QA · 3h | findings #1 done · next sweep ~3h |
| **Iris**  | Dashboard · 30m | renders this board (read-only) |
| **Walt**  | Planeswalkers · subsystem | ✅ **PW-1→PW-4 COMPLETE + shipped v0.39.0** — 184 walkers playable, AI pilots them, teaching layer live. Optional follow-ups only (static-residue ~3, AI walker-protection, emblems). Free for a new lane or PW polish. |

## 🔀 Merge queue (open PRs)
_Empty. Next builder PRs land here when CI goes green._

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** Next sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18) — the highest-lever unclaimed work.
- Planeswalkers (~337) = a tracked subsystem (Walt) — now playable end-to-end. Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔴 **TRIG-* compiler sub-rows** (path proven, largest lever) · **PUMP-1** (team pump) · **EVADE** (engine-first canBlock, pairs w/ VERIFY-MENACE)
- 🟡 **ACT-PUMP-TIMING** · **ETB-RAMP-SEARCH** (now partly subsumed by RAMP-1) · **MODAL-2** · **TOK-NAMED-EXT** + more (see task-board.md)
- 🔧 Erin's FIX lane: **VERIFY-MENACE** 🔴, **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢

## 🔁 Recent merges (newest first)
- **#249** PW-4 teaching layer (Walt) · **#248** RAMP-1 land ramp (Cindy) · **#245** PW-2+PW-3 playable+AI (Walt) · **#246** KWACT-INVEST (Tess)
- **#243** SOFT-CNT (Cindy) · **#241** LOOT-1 (Paula) · **#240** ADDCOST-2 (Tess) · **#238** TRIG-PUMP-1 (Cindy) · **#237** MT-1 · **#236** PW-1 (Walt)

## 🗒️ Notes
- Two uncommitted generated artifacts remain in master's tree from the prior epoch's oracle re-sync (`app/public/card-names.json` regenerated, `app/data/scryfall-bulk/tier-manifest.json` deleted) — harmless, not coverage-regenerated; commit explicit paths only. NOT included in the release commit (release uses CI's fresh data sync).
