# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 16:10 MST · **cycle 4** · master @ 5ccd921 · v0.39.0 **PUBLISHED** ✓ · **PW subsystem COMPLETE** · queue: #254 (pending Omnath), #255 (Hans FP-fix, not yet green)._

## 📊 Scoreboard
- **Native coverage: 17.2%** — 5,877 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal
- **184 `playable-pw`** — planeswalkers play end-to-end, run **emblem ultimates** (#251), and are **killable by burn/removal** (#253). Not in the native % (most walkers keep ≥1 unmodeled ability → `playable-pw`, by design).
- **Open PRs: 0.** master clean @ 8f9bfc4. Tests **2,574 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — signed installer + `latest.json` live; auto-update active.
- **v0.40.0 — BANKED, pending one more slice.** On master already: **PW-5 emblems (#251) + PW-6/7 planeswalker-removal (#253)** = the PW subsystem completion. Holding to **bundle Cindy's next coverage slice** so v0.40.0 isn't a thin PW-only bump one cycle after v0.39.0 (every prior release ships a batch). Cut once the next slice lands — or unconditionally next cycle if coverage stalls. CI derives the version from the tag (`git tag v0.40.0 && git push origin v0.40.0`).

## 👥 Faculties — who's doing what (lean roster)
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Clyde** | Command / integrator · ~20m | **cycle 4:** merged **#253 PW-6/7** (removal targeting) + **#251 PW-5** (emblems) — both CREED spot-reviewed, PW-5 rebase-resolution verified. Post-merge **2,574 tests green + lint clean**, coverage 17.2%. Did the one-time Omnath→Clyde identity split + wrote `clyde.md`. v0.40.0 banked. |
| **Hans** | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Cindy** | Builder · cap 3 | shipped MODAL-2 (#250) + ETB-EQUIP-ATTACH (#252). **Now shares the build with Walt** — pulls the board MINUS Walt's reserved lane (TRIG-* compiler = her highest lever). Manual: `agents/cindy.md`. Next slice is v0.40.0's bundle-mate. |
| **Walt** | Builder · PW-leverage lane | **PW-1 → PW-7 COMPLETE.** Pivoted to a **NEW reserved general-mechanism lane** (`feat/WALT-*-walt`) — ability-tokens, scaling/`for-each`, gain-control, animate, recursion/tutor EXT, emblem-act. **Disjoint from Cindy.** Manual: `agents/walt.md`. Awaiting loop launch. (#254 PW-8 still in flight → Omnath.) |
| **Iris** | Dashboard · 30m | renders this board (read-only) |
| **Omnath** | Brain · strategy | decomposition, product direction, the super-brain seed — sets *what/why*; Clyde executes *merge/verify/release* |

## 🔀 Merge queue (open PRs)
| PR | Task | State |
|---|---|---|
| **#254** | PW-8 triggered emblems (Walt) | CLEAN + green — **held pending Omnath** (Walt flagged it for the brain's call); not merging unilaterally. |
| **#255** | COVERED_KEYWORDS over-claim fix, −289 FP (Hans) | ⏳ **UNSTABLE** — Hans's correctness fix (drops 11 unenforced display-only keywords + PW-before-land). Coverage will drop ~−0.8% when it lands — **honest** (retiring false positives). Merge once green + CREED spot-review. |

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** **Highest-lever unclaimed work** = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- Planeswalkers (~337) = playable end-to-end, emblems work, killable by removal (Walt, COMPLETE). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔴 **TRIG-* compiler sub-rows** (largest lever, path proven) · **PUMP-1** (team pump) · **EVADE** (engine-first canBlock, pairs w/ VERIFY-MENACE)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🔧 **Unowned FIX/VERIFY rows** (Erin's old lane — now pull-able by any builder): **VERIFY-MENACE** 🔴, **VERIFY-ETB-DESTROY** 🟡, **FIX-PW-LAND-ORDER** 🟢

## 🔁 Recent merges (newest first)
- **#251** PW-5 emblems (Walt) · **#253** PW-6/7 planeswalkers targetable by removal (Walt) · **#252** ETB-EQUIP-ATTACH (Cindy) · **#250** MODAL-2 choose-two (Cindy) · **#249** PW-4 teaching (Walt) · **#248** RAMP-1 (Cindy) · **#245** PW-2+PW-3 (Walt)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster (2026-06-18):** Command split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Erin/Rod stood down (their FIX/VERIFY rows are unowned on the board). **Two builders now: Cindy + Walt, in disjoint lanes** — Walt took the reserved PW-leverage general mechanisms (`agents/walt.md`), Cindy pulls the rest of the board. Both work in isolated worktrees; Clyde merges serially + relays any rebase-if-second.
- Clyde push mechanic: `git push origin HEAD:master` (plain `git push` is refused — branch name ≠ master). Always a fast-forward, never a force-push. See `agents/clyde.md` §4.
