# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 22:25 MST · **cycle 4** · master @ 292330d · **v0.41.0 PUBLISHED ✓** · **PW-1→PW-8 COMPLETE** · **🆕 COMMANDERS ARE CASTABLE (CMD-CAST #273)** · ANIMATE framework PR1 (#274) · **POLICY: enforce FPs, don't drop**._

## 📊 Scoreboard
- **Native coverage: 17.9%** — 6,106 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%) · count-scaling now covers controller + subtype + opponent-hand scopes. NEXT: **Cindy → COMMANDER FRAMEWORK** (CMD-CAST first), then the 189-keyword waves (`keyword-coverage-plan.md`).
- `[####······················]`  ~19% of the way to goal
- ✅ **9 of the 11 interim-FP keywords now ENFORCED → honestly native:** EVADE #258 (menace/skulk/fear/intimidate/horsemanship/defender, +141) · KW-UNTARGET #260 (hexproof/shroud) · **TRIG-PROWESS #262** (prowess). **Only 2 remain interim FPs — the genuinely-hard ones, legitimately deferred per the policy:** **ward** (a TAX, CR 702.21) + **protection** (the DEBT subsystem). Enforce-don't-drop **essentially complete** for tractable keywords.
- **184 `playable-pw`** — planeswalkers play end-to-end, run **static + triggered emblem ultimates** (#251 + #254), and are **killable by removal** (#253).
- **Open PRs: 0.** master @ 292330d. Tests **2,684 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — signed installer + `latest.json` live; auto-update active.
- **v0.40.0 — PUBLISHED ✓** (2026-06-19). `gh release v0.40.0` live — `latest.json` + signed `MTG.Tool_0.40.0_x64-setup.exe` (+`.sig`); auto-update active for all instances. Contents: full PW subsystem (PW-5/6/7/8) + **EVADE #258** + **KW-UNTARGET #260** + **token-abil #259** + the enforce-don't-drop honesty pass (#255/#256). _(Post-tag work for v0.41.0: DMG-SCALE #263, prowess #262, TRIG-TREASURE #264.)_ Recommend a live combat dogfood of EVADE on the published build.
- **v0.41.0 — PUBLISHED ✓** (2026-06-19). Live, auto-updating — the trigger-compiler + count-scaling coverage wave (#262/#263/#264/#265/#266/#267/#268), 17.5→17.7%.
- **v0.42.0 — READY, gated on a live smoke-play.** Banked: TUCK-1 #270 + SYMBURN-1 #269 + COUNT-SUBTYPE #271 + COUNT-OPP #272 + **CMD-CAST #273 (flagship — commanders castable)** + ANIMATE framework #274. **Pre-tag gate: a LIVE commander-cast smoke-play** (npm run dev → start a Commander game → cast the commander from the command zone → confirm the {2} tax escalates on recast) — then tag v0.42.0 (v0.41.0 is the convention reference).

## 👥 Faculties — who's doing what (lean roster)
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Clyde** | Command / integrator · ~20m | **cycle 4:** merged #253 PW-6/7, #251 PW-5, #254 PW-8, **#255 (FP-honesty −289)**; adopted Hans's **board-4**; did the Omnath→Clyde split + wrote the 6 faculty manuals; flipped the FP policy to **enforce-don't-drop**. Post-merge 2,585 green, lint clean, coverage 16.3%. |
| **Hans** | Scout+QA+Fix (she/her) · 3h | **board-4 shipped** — VERIFY-COVERED-KW (the 11-keyword cluster → #255, −289), re-coverage rows, cleared VERIFY-ETB-DESTROY, PW-before-land fix, + committed the `qa-sweep.mjs` audit tool. Manual: `agents/hans.md`. |
| **Cindy** | Builder · cap 3 | shipped MODAL-2 (#250) + ETB-EQUIP-ATTACH (#252). Pulls the board MINUS Walt's lane; **top priority = the re-coverage enforcement rows** (EVADE first). Manual: `agents/cindy.md`. |
| **Walt** | Builder · PW-leverage lane | **PW-1 → PW-8 COMPLETE.** Pivoted to the reserved general-mechanism lane (`feat/WALT-*-walt`) — ability-tokens, scaling/`for-each`, gain-control, animate, recursion/tutor EXT. Disjoint from Cindy. Manual: `agents/walt.md`. |
| **Iris** | Dashboard (read-only) · hourly | renders this board. Cloud schedule `iris-academy-dashboard` (cron `0 * * * *`) + dash/status/refresh. Manual: `agents/iris.md`. |
| **Omnath** | Brain · strategy | sets *what/why*; not in the build/merge loop. Boot via the `/omnath` skill. |

## 🔀 Merge queue (open PRs)
| PR | Task | State |
|---|---|---|
| **#262** | TRIG-PROWESS — prowess fires as a real cast-trigger self-pump (Cindy) | ⏳ **DIRTY** on `coverage.js` (her own KW-UNTARGET #260 + DMG-SCALE #263 landed first). **Cindy: rebase onto origin/master (6210d87), keep all enforced-keyword changes + your prowess changes, `--force-with-lease`** → Clyde merges. Prowess is the last of the 3 remaining interim-FP keywords' enforcement (with ward + protection). |

_**`scout/board-5` (Hans) is STALE** (branched at 88b1d4b, pre-EVADE) — relayed for rebase before adopt._

## 🧭 The climb (Hans board thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** Highest-lever unclaimed = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- The −289 re-coverage rows return ~244 of those cards as the enforcement ships. Planeswalkers (~337) = playable + emblems + killable (Walt, COMPLETE). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔝 **ENFORCE-DON'T-DROP (Colton priority, Cindy's lane):** **EVADE** (canBlock/attack-legality — re-adds menace + skulk/intimidate/fear/horsemanship, ~48+evasion set) · **DEFENDER-ENFORCE** (🟢 one-filter quick win, ~37) · **KW-UNTARGET** (hexproof/shroud/ward, ~41) · **TRIG-PROWESS** (~23) · **PROTECTION/DEBT** (δ, ~75). These re-coverage rows return the −289. Backlog: `retired-fp-ledger.md`.
- 🔴 **TRIG-* compiler sub-rows** (largest lever) · **PUMP-1** (team pump)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🟦 **Walt's PW-leverage lane** (`feat/WALT-*-walt`): WALT-TOKEN-ABIL (start), WALT-DMG-SCALE, WALT-FOR-EACH… (see `agents/walt.md`)

## 🔁 Recent merges (newest first)
- **#273** 🆕 CMD-CAST — cast commander from command zone + {2} tax (Cindy) · **#274** WALT-ANIMATE PR1 — layer-aware creature framework (Walt) · **#272** WALT-COUNT-OPP (Walt) · **#271** WALT-COUNT-SUBTYPE, +14 (Walt) · **#269** SYMBURN-1, +16 (Cindy) · **#270** TUCK-1, +13 (Cindy)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster (2026-06-18):** Command split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Rod/Erin stood down (Hans absorbed QA+fix). **Two builders, disjoint lanes:** Walt (reserved PW-leverage atoms) + Cindy (rest of board incl. the enforcement rows). All 6 faculty manuals are committed under `docs/orchestration/agents/`.
- **FP policy = enforce, don't drop:** build the enforcement so the card plays right (local-first); dropping is last-resort. Backlog: `retired-fp-ledger.md`.
- Clyde push mechanic: `git push origin HEAD:master` (plain push refused — branch ≠ master); always a fast-forward, never force.
