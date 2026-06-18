# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 16:30 MST · **cycle 4** · master @ a9aa446 · v0.39.0 **PUBLISHED** ✓ · **PW subsystem COMPLETE (PW-8 merged)** · **NEW POLICY: enforce FPs, don't drop**._

## 📊 Scoreboard
- **Native coverage: 17.2%** — 5,877 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%)
- `[####······················]`  ~19% of the way to goal
- **184 `playable-pw`** — planeswalkers play end-to-end, run **static + triggered emblem ultimates** (#251 + #254), and are **killable by burn/removal** (#253). Not in the native % (most walkers keep ≥1 unmodeled ability → `playable-pw`, by design).
- **Open PRs: #255** (Hans's keyword-drop — **SUPERSEDED**, rework to enforce). master @ a9aa446. Tests **2,580 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — signed installer + `latest.json` live; auto-update active.
- **v0.40.0 — BANKED, pending one more slice.** On master already: **PW-5/8 emblems (#251, #254) + PW-6/7 planeswalker-removal (#253)** = the full PW subsystem completion (static + triggered emblems + removal). Holding to **bundle a Cindy/Walt coverage or enforcement slice** so v0.40.0 isn't PW-only one cycle after v0.39.0. Cut once the next slice lands — or unconditionally next cycle if it stalls. CI derives the version from the tag (`git tag v0.40.0 && git push origin v0.40.0`).

## 👥 Faculties — who's doing what (lean roster)
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Clyde** | Command / integrator · ~20m | **cycle 4:** merged **#253 PW-6/7** (removal targeting) + **#251 PW-5** (emblems) — both CREED spot-reviewed, PW-5 rebase-resolution verified. Post-merge **2,574 tests green + lint clean**, coverage 17.2%. Did the one-time Omnath→Clyde identity split + wrote `clyde.md`. v0.40.0 banked. |
| **Hans** | Scout · 3h | board-3 deep-scan shipped ✅ · next refresh ~3h |
| **Cindy** | Builder · cap 3 | shipped MODAL-2 (#250) + ETB-EQUIP-ATTACH (#252). **Now shares the build with Walt** — pulls the board MINUS Walt's reserved lane (TRIG-* compiler = her highest lever). Manual: `agents/cindy.md`. Next slice is v0.40.0's bundle-mate. |
| **Walt** | Builder · PW-leverage lane | **PW-1 → PW-8 COMPLETE** (#254 triggered emblems MERGED by Clyde — Omnath moved on). Pivoted to a **NEW reserved general-mechanism lane** (`feat/WALT-*-walt`) — ability-tokens, scaling/`for-each`, gain-control, animate, recursion/tutor EXT. **Disjoint from Cindy.** Manual: `agents/walt.md`. Awaiting his new-lane loop launch. |
| **Iris** | Dashboard · 30m | renders this board (read-only) |
| **Omnath** | Brain · strategy | decomposition, product direction, the super-brain seed — sets *what/why*; Clyde executes *merge/verify/release* |

## 🔀 Merge queue (open PRs)
| PR | Task | State |
|---|---|---|
| **#255** | COVERED_KEYWORDS keyword-drop (Hans) | 🛑 **SUPERSEDED — do not merge.** Policy flipped to **enforce, don't drop**: the 11 keywords become enforcement tasks (🔝 EVADE / TARGET-RESTRICT / PROWESS), not a blanket drop. **Hans: rework to keep only the PW-before-land reclassification, or close.** |

_#254 (PW-8 triggered emblems) MERGED this cycle. Queue otherwise empty — awaiting the first enforcement / coverage PRs from Cindy & Walt._

## 🧭 The climb (Hans board-3 thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** **Highest-lever unclaimed work** = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- Planeswalkers (~337) = playable end-to-end, emblems work, killable by removal (Walt, COMPLETE). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔝 **ENFORCE-DON'T-DROP (Colton priority, Cindy's lane):** **EVADE** (canBlock/attack-legality — menace 2-blocker, skulk/intimidate/fear/horsemanship, defender; folds in VERIFY-MENACE) · **TARGET-RESTRICT** (hexproof/shroud/ward/protection) · **PROWESS** (cast-trigger). These are LIVE FPs → build the enforcement, don't drop. Backlog: `retired-fp-ledger.md`.
- 🔴 **TRIG-* compiler sub-rows** (largest lever, path proven) · **PUMP-1** (team pump)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🟦 **Walt's PW-leverage lane** (`feat/WALT-*-walt`): WALT-TOKEN-ABIL (start), WALT-DMG-SCALE, WALT-FOR-EACH… (see `agents/walt.md`)

## 🔁 Recent merges (newest first)
- **#254** PW-8 triggered emblems (Walt) · **#251** PW-5 emblems (Walt) · **#253** PW-6/7 planeswalkers targetable by removal (Walt) · **#252** ETB-EQUIP-ATTACH (Cindy) · **#250** MODAL-2 choose-two (Cindy) · **#249** PW-4 teaching (Walt) · **#248** RAMP-1 (Cindy)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster (2026-06-18):** Command split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Erin/Rod stood down (their FIX/VERIFY rows are unowned on the board). **Two builders now: Cindy + Walt, in disjoint lanes** — Walt took the reserved PW-leverage general mechanisms (`agents/walt.md`), Cindy pulls the rest of the board. Both work in isolated worktrees; Clyde merges serially + relays any rebase-if-second.
- Clyde push mechanic: `git push origin HEAD:master` (plain `git push` is refused — branch name ≠ master). Always a fast-forward, never a force-push. See `agents/clyde.md` §4.
