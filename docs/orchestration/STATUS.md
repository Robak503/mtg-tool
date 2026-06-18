# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Omnath keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 15:09 MST · **cycle 3** · master @ dd58b65 · v0.39.0 **PUBLISHED** ✓ · 1 PR blocked on rebase._

## 📊 Scoreboard
- **Native coverage: 17.1%** — 5,853 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal
- **+184 `playable-pw`** — planeswalkers play end-to-end (not in the native %)
- **Open PRs: 1** — #251 PW-5 emblems (CONFLICTING → Walt rebase). master clean (@ dd58b65). Tests 2,549 green, lint clean.

## 🚀 v0.39.0 — PUBLISHED ✓
Release CI completed/success; `gh release v0.39.0` live with `latest.json` + signed installer (`MTG.Tool_0.39.0_x64-setup.exe` + `.exe.sig`). Auto-update is live for all running instances.

## 👥 Faculties — who's doing what
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Omnath** | Command · ~20m watch | cycle 3: verified v0.39.0 published; merged **#250 MODAL-2, #252 ETB-EQUIP-ATTACH** (full CREED); reviewed+approved **#251 PW-5** (blocked on rebase) · **next sweep ~15:30 MST** |
| **Cindy** | Builder · grab-ahead (≤2 PRs) | shipped MODAL-2 (#250) ✅ + ETB-EQUIP-ATTACH (#252) ✅ · re-claiming |
| **Paula** | Builder · continuous | shipped LOOT-1 (#241) · re-claiming (idle? — nudge if so) |
| **Tess**  | Builder · continuous | shipped KWACT-INVEST (#246) · re-claiming |
| **Erin**  | Fixer · 4h cloud | FIX lane: **VERIFY-MENACE** 🔴, **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢 |
| **Hans**  | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Rod**   | QA · 3h | findings #1 done · next sweep ~3h |
| **Iris**  | Dashboard · 30m | renders this board (read-only) |
| **Walt**  | Planeswalkers · subsystem | PW-1→PW-4 shipped v0.39.0. **PW-5 (emblems, #251) reviewed+approved → needs a 1-line rebase** (see relay). Then PW-6 (triggered emblems) or a coverage lane. |

## 🔀 Merge queue (open PRs)
| PR | Task | State |
|---|---|---|
| **#251** | PW-5 emblem subsystem (Walt) | ⏳ CONFLICTING — rebase onto master (see relay), then Omnath merges (pre-approved) |

## 🚧 RELAY — Walt (one-line rebase to unblock PW-5)
#251 conflicts with the just-merged #252 on `app/src/lib/learn/effects/effectAtoms.js` (both added to the shared gameState import line + ATOM_RESOLVERS). **Rebase `feat/PW-5-walt` onto current `origin/master`, keep BOTH `addEmblem` + `attachPermanent` in the import and BOTH resolver keys, `git push --force-with-lease`.** The PR is already CREED-reviewed + approved — Omnath merges on sight once it's CLEAN, no re-review.

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** **Highest-lever unclaimed work** = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- Planeswalkers (~337) = playable end-to-end (Walt). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔴 **TRIG-* compiler sub-rows** (largest lever, path proven) · **PUMP-1** (team pump) · **EVADE** (engine-first canBlock, pairs w/ VERIFY-MENACE)
- 🟡 **ACT-PUMP-TIMING** · **RAMP-1 done** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🔧 Erin's FIX lane: **VERIFY-MENACE** 🔴, **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢

## 🔁 Recent merges (newest first)
- **#252** ETB-EQUIP-ATTACH (Cindy) · **#250** MODAL-2 choose-two (Cindy) · **#249** PW-4 teaching (Walt) · **#248** RAMP-1 (Cindy) · **#245** PW-2+PW-3 (Walt) · **#246** KWACT-INVEST (Tess)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- Two uncommitted generated artifacts remain in master's tree (`app/public/card-names.json` regen, `app/data/scryfall-bulk/tier-manifest.json` deleted) — harmless, not coverage-regenerated; commit explicit paths only.
- Paula's last merge was #241 (LOOT-1) — if no new claim appears by next sweep, she may be idle; consider a nudge toward a TRIG-* sub-row.
