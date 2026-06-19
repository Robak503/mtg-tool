# 🎛️ Academy Coverage — Live Status

> **The one-glance board.** Clyde (integrator) keeps this file fresh every integration cycle (the data source); **Iris** renders it as a visual in her own chat. Owner attribution comes from the `feat/<task>-<name>` claim-branch suffix.
> _Updated 2026-06-19 (overnight · **cycle 14**) · master @ 91d2225 · **v0.45.0 PUBLISHED ✓** (auto-update live) · **🏆 COMMANDER FORMAT COMPLETE** · **trigger compiler — 5 hooks** + **aristocrats wired** (Treasure-crack fires sac triggers) · **Shadow + Cycling enforced** · **coverage HONEST: 17.5%** (5,961) · **POLICY: enforce FPs, don't drop**._

## 📊 Scoreboard
- **Native coverage: 17.4%** (5,944 / 34,160) — a **single HONEST number** (FIX-MANA-OVERCLAIM ✅ #280; native-mana is all-or-nothing like every other tier). goal **~90%** (ceiling ~88–92%). **🏆 Commander framework COMPLETE** + **the general trigger compiler is GROWING** (5 event hooks: lifegain #286 + draw #287 + 2nd-draw #288 + 2nd-spell #289 + sacrifice #290 — of the ~5,267-card spine, the big lever to ~85%). NEXT: **Cindy → the TRUNK PLAN** (`cindy-trunk-plan.md`) — high-frequency permanent-ability families (this-creature statics, Auras, common activated/ETB); **11,179 cards are 1 line from native**, target 150–600/slice not 10. **Walt → more 702.x keyword waves** (Shadow + Cycling done).
- `[####······················]`  ~19% of the way to goal
- ✅ **9 of the 11 interim-FP keywords now ENFORCED → honestly native:** EVADE #258 (menace/skulk/fear/intimidate/horsemanship/defender, +141) · KW-UNTARGET #260 (hexproof/shroud) · **TRIG-PROWESS #262** (prowess). **Only 2 remain interim FPs — the genuinely-hard ones, legitimately deferred per the policy:** **ward** (a TAX, CR 702.21) + **protection** (the DEBT subsystem). Enforce-don't-drop **essentially complete** for tractable keywords.
- **184 `playable-pw`** — planeswalkers play end-to-end, run **static + triggered emblem ultimates** (#251 + #254), and are **killable by removal** (#253).
- **Open PRs: 0.** master @ 91d2225. Tests **2,793 green**, lint clean.

## 🚀 Releases
- **v0.39.0 — PUBLISHED ✓** — signed installer + `latest.json` live; auto-update active.
- **v0.40.0 — PUBLISHED ✓** (2026-06-19). `gh release v0.40.0` live — `latest.json` + signed `MTG.Tool_0.40.0_x64-setup.exe` (+`.sig`); auto-update active for all instances. Contents: full PW subsystem (PW-5/6/7/8) + **EVADE #258** + **KW-UNTARGET #260** + **token-abil #259** + the enforce-don't-drop honesty pass (#255/#256). _(Post-tag work for v0.41.0: DMG-SCALE #263, prowess #262, TRIG-TREASURE #264.)_ Recommend a live combat dogfood of EVADE on the published build.
- **v0.41.0 — PUBLISHED ✓** (2026-06-19). Live, auto-updating — the trigger-compiler + count-scaling coverage wave (#262/#263/#264/#265/#266/#267/#268), 17.5→17.7%.
- **v0.42.0 — PUBLISHED ✓** (2026-06-19, live + auto-updating) — **COMMANDERS CASTABLE (CMD-CAST #273)** + count-scaling (#271/#272) + MASS-NC #275 + SYMBURN #269 + TUCK-1 #270 + ANIMATE framework #274. CMD-CAST is **unit-verified** (cmdCast.test.js) → **a live commander-game dogfood is recommended.**
- **v0.43.0 — PUBLISHED ✓** (2026-06-19 08:07 UTC, live + auto-updating; signed installer + `latest.json` + `.sig` all present). **Commander rules complete** (CMD-RETURN #276 + CMD-DAMAGE/21-rule #278 + polish #279) + **man-lands swing** (ANIMATE PR2 #277 + PR3 #281, 22 creature-lands) + the **honest-coverage fix** (FIX-MANA #280). Unit-verified; a live commander-game dogfood is still recommended.
- **v0.44.0 — PUBLISHED ✓** (2026-06-19 09:48 UTC, live + auto-updating). 🏆 **The entire Commander format plays natively** (companions #284 + partners #283 on top of cast/return/21-dmg) + the **general trigger compiler opens** (TRIG-LIFEGAIN #286) + **Shadow #282 + Cycling #285** enforced.
- **v0.45.0 — PUBLISHED ✓** (2026-06-19 11:19 UTC, live + auto-updating). **Trigger-compiler coverage wave** — 4 new event hooks: draw #287, 2nd-draw #288, 2nd-spell #289, sacrifice #290 (draw-matters / spellslinger / aristocrats payoffs).
- **v0.46.0 — banking:** SAC-TREASURE #291 (Treasure-crack fires sac triggers — aristocrats faithfulness) + the next TRIG-* slices + keyword waves. Cut at the next natural milestone.

## 👥 Faculties — who's doing what (lean roster)
| Faculty | Role · cadence | Working on |
|---|---|---|
| **Clyde** | Command / integrator · ~20m | **cycle 4:** merged #253 PW-6/7, #251 PW-5, #254 PW-8, **#255 (FP-honesty −289)**; adopted Hans's **board-4**; did the Omnath→Clyde split + wrote the 6 faculty manuals; flipped the FP policy to **enforce-don't-drop**. Post-merge 2,585 green, lint clean, coverage 16.3%. |
| **Hans** | Scout+QA+Fix (she/her) · 3h | **board-4 shipped** — VERIFY-COVERED-KW (the 11-keyword cluster → #255, −289), re-coverage rows, cleared VERIFY-ETB-DESTROY, PW-before-land fix, + committed the `qa-sweep.mjs` audit tool. **FIX-MANA-OVERCLAIM ✅ #280** (native-mana residue gate → honest 17.1%). Manual: `agents/hans.md`. |
| **Cindy** | Builder · commander + non-keyword | **CMD pipeline:** CMD-CAST ✅ → CMD-RETURN ✅ → CMD-DAMAGE/21-rule ✅ #278 → 4b polish ✅ #279 → CMD-PARTNER ✅ #283 → CMD-COMPANION ✅ #284 (companion zone + {3}-to-hand, CR 702.139). **🏆 Commander framework DONE.** Now driving **the general (non-keyword) trigger compiler** — TRIG-LIFEGAIN ✅ #286 + TRIG-DRAW ✅ #287 + TRIG-DRAW2 ✅ #288 + TRIG-CAST2 ✅ #289 + TRIG-SACRIFICE ✅ #290 + SAC-TREASURE ✅ #291. **RE-AIMED (Colton, 2026-06-19) → the TRUNK PLAN (`cindy-trunk-plan.md`):** stop modeling the rare-condition tail (10 cards/slice); attack the high-frequency permanent-ability trunk — 11,179 cards are ONE line from native (`this creature gets/has…` ~1,035, Auras ~328, common activated/ETB). Target 150–600 cards/slice. Owns the compiler CORE + cast path. Manual: `agents/cindy.md`. |
| **Walt** | Builder · 702.x keyword backlog | **PW + count series + ANIMATE PR1/2/3 ✅ + EVADE-2 Shadow ✅ #282 + KW-CYCLING ✅ #285 (+46 spells).** Re-carved (Colton) to **own the entire 702.x keyword backlog** (Waves B–G, `keyword-coverage-plan.md`, ~4,500+ cards) — **no longer spins down**. Start: non-trigger waves (EVADE-2/KW-CYCLING) until Cindy's compiler core lands; replacement-shield is his. Manual: `agents/walt.md`. |
| **Iris** | Dashboard (read-only) · hourly | renders this board. Cloud schedule `iris-academy-dashboard` (cron `0 * * * *`) + dash/status/refresh. Manual: `agents/iris.md`. |
| **Omnath** | Brain · strategy | sets *what/why*; not in the build/merge loop. Boot via the `/omnath` skill. |

## 🔀 Merge queue (open PRs)
**Empty** — queue drained at d5658fa (cycle 6 merged #282 + #283). Next expected: Cindy's CMD-COMPANION, Walt's next 702.x keyword wave, and any Hans QA fixes.

## 🧭 The climb (Hans board thesis)
- **~20%→~85% is essentially ONE subsystem — the trigger-effect compiler** (~5,267 trigger cards). **TRIG-PUMP-1 (#238) proved the pilot.** Highest-lever unclaimed = the TRIG-* sub-rows: TRIG-SCRY (~33), TRIG-TREASURE (~45), TRIG-COUNTER (~28), TRIG-DRAW, TRIG-MONARCH (~18).
- The −289 re-coverage rows return ~244 of those cards as the enforcement ships. Planeswalkers (~337) = playable + emblems + killable (Walt, COMPLETE). Honest ceiling **~88–92%**.

## 📋 Ripe & unclaimed — next picks
- 🔝 **ENFORCE-DON'T-DROP (Colton priority, Cindy's lane):** **EVADE** (canBlock/attack-legality — re-adds menace + skulk/intimidate/fear/horsemanship, ~48+evasion set) · **DEFENDER-ENFORCE** (🟢 one-filter quick win, ~37) · **KW-UNTARGET** (hexproof/shroud/ward, ~41) · **TRIG-PROWESS** (~23) · **PROTECTION/DEBT** (δ, ~75). These re-coverage rows return the −289. Backlog: `retired-fp-ledger.md`.
- 🔴 **TRIG-* compiler sub-rows** (largest lever) · **PUMP-1** (team pump)
- 🟡 **ACT-PUMP-TIMING** · **TOK-NAMED-EXT** · **CNT-2b** · **SYMBURN-1** + more (see task-board.md)
- 🟦 **Walt's PW-leverage lane** (`feat/WALT-*-walt`): WALT-TOKEN-ABIL (start), WALT-DMG-SCALE, WALT-FOR-EACH… (see `agents/walt.md`)

## 🔁 Recent merges (newest first)
- **#291** SAC-TREASURE — Treasure-crack fires sac triggers (Korvold/Mayhem Devil), CR 701.21, aristocrats faithfulness (Cindy) · **#290** TRIG-SACRIFICE — "whenever you sacrifice a permanent/creature/artifact" triggers, CR 701.21 (Cindy) · **#289** TRIG-CAST2 — "cast your second spell each turn" triggers, CR 601 (Cindy) · **#288** TRIG-DRAW2 — "draw your second card each turn" triggers, CR 121 (Cindy) · **#287** TRIG-DRAW — "whenever you draw a card" triggers, CR 121.1/121.2 (Cindy) · **#286** TRIG-LIFEGAIN — "whenever you gain life" triggers, CR 119.3, first trigger-compiler slice (Cindy) · **#285** KW-CYCLING — cycle from hand, +46 spells, CR 702.29 (Walt) · **#284** CMD-COMPANION — companion zone + {3}-to-hand, CR 702.139 (Cindy) · **#283** CMD-PARTNER — two-commander/Background pods verified (Cindy) · **#282** EVADE-2 — Shadow evasion, CR 702.28b, +10 (Walt) · **#281** WALT-ANIMATE PR3 — man-lands self-animate + attack, 22 creature-lands (Walt) · **#280** FIX-MANA-OVERCLAIM — native-mana residue gate, honest 17.1% (Hans) · **#279** CMD-DAMAGE 4b polish — display name + CR fix (Cindy) · **#278** CMD-DAMAGE 21-rule, CR 903.10a (Cindy) · **#277** WALT-ANIMATE PR2, +5 (Walt) · **#276** CMD-RETURN, CR 903.9 (Cindy) · **#273** CMD-CAST (Cindy)
- shipped in v0.39.0: #243 SOFT-CNT · #241 LOOT-1 · #240 ADDCOST-2 · #238 TRIG-PUMP-1 · #237 MT-1 · #236 PW-1 · …

## 🗒️ Notes
- **Roster (2026-06-18):** Command split into **Omnath (brain)** + **Clyde (integrator)**; Paula/Tess/Rod/Erin stood down (Hans absorbed QA+fix). **Two builders, disjoint lanes:** Walt (reserved PW-leverage atoms) + Cindy (rest of board incl. the enforcement rows). All 6 faculty manuals are committed under `docs/orchestration/agents/`.
- **FP policy = enforce, don't drop:** build the enforcement so the card plays right (local-first); dropping is last-resort. Backlog: `retired-fp-ledger.md`.
- Clyde push mechanic: `git push origin HEAD:master` (plain push refused — branch ≠ master); always a fast-forward, never force.
