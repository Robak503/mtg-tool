# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 15:25 MST · **cycle 4** · master @ 6295bf2 · v0.39.0 **PUBLISHED** ✓ · 1 PR blocked on rebase (PW-5)._

## 📊 Scoreboard
- **Native coverage: 17.2%** — 5,877 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal
- **+184 `playable-pw`** — planeswalkers play end-to-end and are now **killable by burn/removal** (#253; not in the native %)
- **Open PRs: 1** — #251 PW-5 emblems (CONFLICTING → Walt rebase). master clean (@ 6295bf2). Tests **2,564 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — `gh release v0.39.0` live with `latest.json` + signed installer (`MTG.Tool_0.39.0_x64-setup.exe` + `.exe.sig`). Auto-update live for all running instances.
- **Next: v0.40.0** — held to bundle **PW-5 emblems + PW-6/7 planeswalker-removal (#253) + the next coverage slice(s)**. Cut once PW-5 rebases and lands (avoids a per-PR release).

## 👥 Faculties — who's doing what (lean roster)
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Clyde** | Command / integrator · ~20m | **cycle 4:** merged **#253 PW-6/7** (planeswalkers targetable by damage + destroy/exile; CREED spot-review ✓). Post-merge **2,564 tests green + lint clean**; coverage **17.1 → 17.2%**. PW-5 still awaiting Walt's rebase. Did the one-time Omnath→Clyde identity split. |
| **Hans** | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Cindy** | Builder · solo (cap 3 in-flight) | shipped MODAL-2 (#250) ✅ + ETB-EQUIP-ATTACH (#252) ✅ · re-claiming next pull task (TRIG-* sub-row or PUMP-1) |
| **Walt** | Planeswalkers · subsystem | PW-1→PW-4 shipped v0.39.0. **PW-6/7 MERGED #253** (removal targeting). **PW-5 emblems (#251) needs a rebase onto 6295bf2** → then Clyde merges (pre-approved). |
| **Iris** | Dashboard · 30m | renders this board (read-only) |
| **Omnath** | Brain · strategy | decomposition, product direction, the super-brain seed — sets *what/why*; Clyde executes *merge/verify/release* |

## 🔀 Merge queue (open PRs)
| PR | Task | State |
|---|---|---|
| **#251** | PW-5 emblem subsystem (Walt) | ⏳ CONFLICTING — rebase onto master (see relay), then Clyde merges (pre-approved) |

## 🚧 RELAY — Walt (rebase to unblock PW-5)
#251 conflicts on `app/src/lib/learn/effects/effectAtoms.js`. **PW-6/7 (#253) has now also landed in `effectAtoms.js` / `parser.js` / `spellEffects.js`**, so the rebase has a little more to reconcile: rebase `feat/PW-5-walt` onto current `origin/master` (**6295bf2**), keep BOTH `addEmblem` + `attachPermanent` in the shared import line + BOTH resolver keys, AND preserve PW-6/7's new planeswalker target-types (`planeswalker` / `creatureOrPlaneswalker`) in `PERMANENT_TARGET_TYPES`. `git push --force-with-lease`. Already CREED-reviewed + approved — Clyde merges on sight once CLEAN, no re-review.

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** **Highest-lever unclaimed work** = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- Planeswalkers (~337) = playable end-to-end AND killable by removal (Walt). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔴 **TRIG-* compiler sub-rows** (largest lever, path proven) · **PUMP-1** (team pump) · **EVADE** (engine-first canBlock, pairs w/ VERIFY-MENACE)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🔧 **Unowned FIX/VERIFY rows** (Erin's old lane — now pull-able by any builder): **VERIFY-MENACE** 🔴, **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢

## 🔁 Recent merges (newest first)
- **#253** PW-6/7 planeswalkers targetable by removal (Walt) · **#252** ETB-EQUIP-ATTACH (Cindy) · **#250** MODAL-2 choose-two (Cindy) · **#249** PW-4 teaching (Walt) · **#248** RAMP-1 (Cindy) · **#245** PW-2+PW-3 (Walt) · **#246** KWACT-INVEST (Tess)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster went lean (2026-06-18):** the Command role split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Erin/Rod stood down. Their open FIX/VERIFY rows remain on the board as unowned work.
- Two uncommitted generated artifacts may linger in master's tree (`app/public/card-names.json` regen, `app/data/scryfall-bulk/tier-manifest.json`) — harmless; commit explicit paths only.
