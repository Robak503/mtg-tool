# 🌅 WAKE REPORT — overnight Clyde grind (2026-06-28 → 06-29)

> Colton reads this first. Single source of "what happened overnight." One owner chat (me), CREED-absolute, park-don't-stop, ~4.5min loop cadence, 2-3 build sub-agents always in flight (delegate-and-verify: a fresh-context sub-agent builds in an isolated worktree → I re-verify with my own flip-diff + runtime probe + full gate before integrating to master).

## ☀️ MORNING TL;DR
**Two releases + the entire learn-to-play engine seam, shipped overnight. 0 false positives.**

- 🚀 **v0.48.0 PUBLISHED** — the **Sim Center** (full top-level section: cross-profile deck setup, run self-play offline, save/browse breakage reports, bank training data) + the self-play stress-test + ~200 coverage cards. Your `.exe` auto-updates to it.
- 🚀 **v0.49.0 TAGGED (CI building → will publish)** — the **learn-to-play engine seam is COMPLETE**: the play-API (`gameApi.js`), decisive self-play (opt-in time-pressure), seeded-shuffle for varied repeats, and the **pluggable decide-loop + full-trajectory recording** — the seam Omnath's pilots plug into. Plus **+92 native cards** (cost-strip seam unblocked ~59 already-modeled spells, filtered mass-counter, subtype-scoped triggers, Putrefy/Blasphemous Act…).
- 🧠 **The learn-to-play division of labor is locked + executing.** You + Omnath own the pilots; I own the engine. Omnath already built the pilot module (`omnath-tools/pilots/decide.mjs`, 18 self-tests green) and I built + shipped all 3 engine-side seam items. **He can wire his pilots into the live seam right now** (instructions posted in `memory/COMMS.md`).

**Metrics:** corpus native ~23.5% · 13-deck realism climbing · gate ~5080 green + lint clean at every step · **0 FPs shipped** (every wave flip-diffed both directions for 0 regressions). Releases: v0.48.0 live, v0.49.0 building.

---

## 🟢 DECISION MENU (nothing is blocking — I keep going either way; your input just steers)
1. **The riskier core-path learn-to-play slices — build unattended, or wait for you?** Item #3 (decide-loop) v1 routes the *enumerated* decisions (main/combat/X/modal/targets) — pilots can already pilot the core game. The remaining decision-type gaps are **mulligan** (building now — clean, self-contained), then **yes/no unify** (tutor/scry/edict → decide) and **trigger-order**. Those last two touch core resolution paths (bigger blast radius). I'll keep them CREED-tight + independently verified (same pattern that's shipped 0 FPs all night), but tell me if you'd rather I hold them for when you're around. **Default: I proceed carefully.**
2. **v0.49.0 publish** — I'll confirm the CI published + auto-update reaches you (no action needed).
3. **Omnath may reply in `COMMS.md`** to my seam/adapter notes; I check it first thing every loop fire and act on it.

## 🔭 WHAT'S IN FLIGHT (→ v0.50.0)
- **Coverage round 4** (safe frontier, effects layer) — more native cards toward 100%.
- **Mulligan slice** — surface the London mulligan keep/ship as a `decide` call (opt-in, default byte-identical).
- Then: the other decision-type slices + coverage → 100% (item #4).

---

## ✅ SHIPPED OVERNIGHT (all on master, verified, 0 FPs)
**Release v0.48.0 (published):** Sim Center section · self-play stress-test (offline headless deck-vs-deck → per-card breakage `.txt`) · ~200 coverage cards across ~22 mechanic levers (cost-reduction, Sliver tribal, fight, Treasure, dynamic-count, plot, modal/reflexive triggers, X-spells…) · trajectory-recorder groundwork.

**Release v0.49.0 (tagged, building):**
- **Seeded-shuffle** — repeat self-play games of the same matchup now genuinely vary (real data volume).
- **Breakage round 2 (+70)** — sim-driven; a cost-reduction-*sentence* parser fix unblocked ~59 already-modeled counterspells/board-wipes/burn + Putrefy/Blasphemous Act/Smell Fear.
- **gameApi.js** (learn-to-play item #1) — the stable play-API: `legalActions`/`applyAction`(security-gated)/`gameStatus`/`observe`.
- **Stalemate/time-pressure** (item #2) — stalled self-play resolves to a *real* win/loss (escalating clock past a generous turn-60 soft cap, above the 49-turn natural max); a true timeout is honestly tagged + excluded from training (**never a fabricated winner**). Opt-in, default byte-identical.
- **Coverage round 3 (+22)** — filtered mass-counter + subtype-scoped ETB/dies triggers (aristocrats/tribal: Cordial Vampire, Indulgent Aristocrat…).
- **Decide-loop + full-trajectory recording** (item #3 KEYSTONE) — pluggable `decide({state,legalActions,seat,pilot})→action` at every enumerated decision + per-decision trajectory tagged by pilot. **Default byte-identical** (proven 3 ways). The runner exposes a `pilots` map adapter — where Omnath's `decide.mjs` injects.

## 🤝 LEARN-TO-PLAY — the split (locked) + status
- **You + Omnath own:** pilot design (vectors, 6 playbooks, temperaments, Player 13), the decision-logic module on the engine seam, offline validation. **Omnath's module is BUILT** (`omnath-tools/pilots/`, 18 self-tests green).
- **I own (engine-side):** ✅ gameApi · ✅ decisive self-play · ✅ decide-loop+recording · ⏳ coverage→100%. Plus the follow-on decision-type slices (mulligan in flight).
- **Seam contract LOCKED** (`decide({state,legalActions,seat,pilot})→action`; pilot = `{playbook, temperament}`; 6 playbooks; full trajectory). I audited & answered Omnath's key question — **combat/targeting are already pilotable today** (his recon was off on that), so item #3 was a refactor, not a rebuild.
- **`memory/COMMS.md`** is our live async channel (I check it first every loop fire); the adapter wiring instructions for his pilots are posted there.

## 🅿️ PARKED (correctly Arbiter-domain / need attended design)
- Self-play stalemate: only the safety-net for genuine stalls; the real decks already close decisively on their own at Expert (don't drag to draws) — the clock just compresses the tail.
- Coverage parks: batch-dies "one or more creatures die" (CR 603.3a once-per-batch — high blast radius, needs attended care), hard counters / tutors / free-cast-from-commander / phase-out / storm / extra-turns (correct Arbiter domain).
- The riskier decide-loop slices (yes/no-unify, trigger-order) — see Decision Menu #1.

## 🚧 BLOCKERS
- **None.** Direct push to master works; releases cut cleanly via tag → CI. (The old PR #381 push-permission blocker from the earlier coverage phase is long resolved.)
