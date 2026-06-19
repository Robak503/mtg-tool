# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-18 17:35 MST · **cycle 4** · master @ 2e7f0c2 · v0.39.0 **PUBLISHED** ✓ · **PW-1→PW-8 COMPLETE** · **EVADE #258 shipped (+141)** · **POLICY: enforce FPs, don't drop**._

## 📊 Scoreboard
- **Native coverage: 17.6%** — 6,017 / 34,160 cards · goal **~90%** (honest ceiling ~88–92%) · **+141 from EVADE #258** (an HONEST gain — the rule now actually ships)
- `[####······················]`  ~20% of the way to goal
- ✅ **EVADE #258 enforced 6 of the 11 interim-FP keywords** (menace/skulk/fear/intimidate/horsemanship/defender) — now **honestly native** (combatEvasion canBlock chokepoint, layer-aware). **~140 remain interim FPs:** hexproof/shroud/ward/protection (KW-UNTARGET/TARGET-RESTRICT) + prowess (TRIG-PROWESS) — claimed while their enforcement is built (Cindy's lane). This is enforce-don't-drop *working*: coverage rose by enforcing, not re-claiming.
- **184 `playable-pw`** — planeswalkers play end-to-end, run **static + triggered emblem ultimates** (#251 + #254), and are **killable by removal** (#253).
- **Open PRs: #259** (Walt token-abil — CONFLICTING on `coverage.js` after EVADE landed; Walt rebases). master @ 2e7f0c2. Tests **2,602 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — signed installer + `latest.json` live; auto-update active.
- **v0.40.0 — READY.** On master: full PW subsystem (PW-5/6/7/8) + **EVADE #258 (+141, 17.2→17.6%)** — enforce-don't-drop's first proven win. **Pre-tag gate: a LIVE combat smoke-play of EVADE** (menace needs 2 blockers · unblockable can't be blocked · a Wall can't attack) — then `git tag v0.40.0`. May bundle #259 (Walt token-abil) once it rebases.

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
| **#259** | WALT-TOKEN-ABIL slice 1 — token mana abilities + kill token-as-fake-mana-source FP (Walt) | ⏳ **CONFLICTING** on `coverage.js` (EVADE #258 landed first). **Walt: rebase onto origin/master (2e7f0c2), keep BOTH EVADE's `isKeywordOnly`/COVERED_KEYWORDS changes + your token-abil changes, `--force-with-lease`** → Clyde merges. |

## 🧭 The climb (Hans board thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** Highest-lever unclaimed = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- The −289 re-coverage rows return ~244 of those cards as the enforcement ships. Planeswalkers (~337) = playable + emblems + killable (Walt, COMPLETE). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔝 **ENFORCE-DON'T-DROP (Colton priority, Cindy's lane):** **EVADE** (canBlock/attack-legality — re-adds menace + skulk/intimidate/fear/horsemanship, ~48+evasion set) · **DEFENDER-ENFORCE** (🟢 one-filter quick win, ~37) · **KW-UNTARGET** (hexproof/shroud/ward, ~41) · **TRIG-PROWESS** (~23) · **PROTECTION/DEBT** (δ, ~75). These re-coverage rows return the −289. Backlog: `retired-fp-ledger.md`.
- 🔴 **TRIG-* compiler sub-rows** (largest lever) · **PUMP-1** (team pump)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🟦 **Walt's PW-leverage lane** (`feat/WALT-*-walt`): WALT-TOKEN-ABIL (start), WALT-DMG-SCALE, WALT-FOR-EACH… (see `agents/walt.md`)

## 🔁 Recent merges (newest first)
- **#258** EVADE — combat-evasion enforcement, +141 (Cindy) · **#257** qa-sweep de-noise (Hans) · **#256** keep 11 keywords claimed / enforce-don't-drop (Hans) · **#255** FP audit (superseded by #256) · **#254** PW-8 triggered emblems (Walt) · **#251** PW-5 emblems (Walt)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster (2026-06-18):** Command split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Rod/Erin stood down (Hans absorbed QA+fix). **Two builders, disjoint lanes:** Walt (reserved PW-leverage atoms) + Cindy (rest of board incl. the enforcement rows). All 6 faculty manuals are committed under `docs/orchestration/agents/`.
- **FP policy = enforce, don't drop:** build the enforcement so the card plays right (local-first); dropping is last-resort. Backlog: `retired-fp-ledger.md`.
- Clyde push mechanic: `git push origin HEAD:master` (plain push refused — branch ≠ master); always a fast-forward, never force.
