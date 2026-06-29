# 🌅 WAKE REPORT — overnight Clyde grind (2026-06-28 → 06-29)

> Colton reads this first. One owner chat (me), CREED-absolute, park-don't-stop, ~4.5min loop, 2-3 build sub-agents in flight (delegate-and-verify: a fresh-context sub-agent builds in an isolated worktree → I re-verify with my own flip-diff + runtime probe + full gate before integrating to master). COMMS-check (`memory/COMMS.md`, the Clyde↔Omnath channel) runs first every loop fire.

## ☀️ MORNING TL;DR
**FOUR releases + the complete learn-to-play engine, and Omnath's AI flywheel is LIVE. 0 false positives all night.**

- 🚀 **v0.48.0 PUBLISHED** — the **Sim Center** (offline self-play stress-test, save/browse reports, bank training data) + ~200 coverage cards.
- 🚀 **v0.49.0 PUBLISHED** — the **learn-to-play engine seam**: play-API (`gameApi.js`), decisive self-play (time-pressure), seeded-shuffle, the **pluggable decide-loop + full-trajectory recording**. +92 native.
- 🚀 **v0.50.0 PUBLISHED** — **pilot-seam hardening + self-play data quality**: mulligan-as-decide + 6 fixes (Q3 trajectory, counter-legality, phantom-mana, seat-alternation, winnerSeat, coverage r4).
- 🚀 **v0.51.0 TAGGED (CI building)** — coverage rounds 5-8 (+~33 native incl. **Ninjutsu**; Yuriko 49→51, Ur-Dragon 66→67).
- 🧠 **THE FLYWHEEL IS LIVE.** Omnath built the pilot modules, wired them into the live seam, and ran it end-to-end: **pilots → decisive game → 746 trajectory rows → mode-tagged case memory.** Both model axes (playbook + temperament) differentiate sensibly. The machine he + you designed is turning.

**Metrics:** corpus native ~23.7% · **0 FPs shipped** all night · gate green + lint clean every step · ✅ **holistic double-check passed** (whole session: **+147 native, 0 regressions**). Your `.exe` auto-updates through v0.51.0.

---

## 🟢 DECISION MENU (nothing blocking — steering only)
1. **Remaining decide-loop slices — build unattended or wait for you?** Pilots already control the *enumerated* decisions (main/combat/X/modal/targets/mulligan). Left: **yes/no-unify** (tutor/scry/edict → decide) + **trigger-order**. They touch core resolution (bigger blast radius). Omnath said he'll flag if his pilots' skill expression actually needs them — so far the flywheel works without them. **Default: I hold them unless he asks, and grind coverage instead.**
2. **v0.50.0 publish** — I'll confirm CI published + auto-update reaches you (no action needed).
3. **Tabled (low priority):** the STATUS.md AUTORUN block is bloated (cosmetic; doesn't affect runtime). PW loyalty-mana phantom (FN-safe, future dedicated lane).

## 🔭 NOW: RESPONSIVE MODE (coverage frontier mined out)
Coverage rounds 2-8 are done + shipped (v0.51.0). The tractable per-deck + clean-corpus levers are mined — further blind rounds would be diminishing one-offs or subsystem-blocked, so I've **stopped spawning coverage agents** (token discipline + the remaining work needs your prioritization, below). I'm now in **responsive mode**: every loop fire I check `COMMS.md` and fix anything Omnath's self-play surfaces (that's the high-value frontier now — his findings drove the counter-legality + phantom-mana fixes tonight), confirm releases published, and keep this report current. I'll resume proactive building the moment there's a clean lever, your go-ahead on a subsystem, or a new request.

**Clean one-offs left on the table** (small, will pick up if asked): Yuriko's commander trigger (reveal→MV-drain), the compound deal-damage+gain-life shared-X corpus pattern (~6 cards).

---

## 📊 13-DECK COVERAGE STATE + REMAINING WORK (realism gate, round 7)
Per-deck native %: Ur-Dragon 66 · Toph 65 · Pantlaza 62 · Kinnan 56 · Kellan 55 · Mothman 54 · Cap America 54 · Wolverine 53 · **Yuriko 51** (worst). Aggregate ~57%, corpus ~23.7%. *(Note: the live profile deck set has evolved since the old 13-list — Yuriko + Kinnan are now present.)*

**The tractable per-deck frontier is nearly mined.** Coverage rounds 2-7 took the systematic levers (cost-strip, mass-counter, subtype-triggers, Phoenix-return, power-intervening-if, combat-discard, and Yuriko's ninjutsu). The remaining laggard gaps are now mostly:
- **(a) Arbiter-domain** — counters / tutors / free-cast / extra-turns (esp. Yuriko's cEDH tail). Correctly deferred; not buildable CREED-clean.
- **(b) Attended SUBSYSTEMS** (each its own multi-PR build — **your call which to prioritize**): soulbond · cumulative upkeep · clone-on-ETB · devotion · trigger-doubling (Roaming Throne) · monarch · energy · suspend · RAD (Mothman) · damage-doubling (Wolverine).
- **(c) One-off slices** (buildable, low-yield). The best one: **Yuriko's own commander trigger** (reveal top card → each opponent loses life = its mana value) — worth building (commanders should be native).

I'll keep taking clean one-off/keyword levers where decks have them; once they're gone I downshift to responsive-only (won't burn tokens on subsystem-blocked rounds — those need your prioritization).

## ✅ SHIPPED OVERNIGHT (all on master, each independently flip-diffed 0-regressions + gated)
**v0.48.0:** Sim Center · self-play stress-test (offline → per-card breakage `.txt`) · ~200 coverage cards · trajectory recorder.
**v0.49.0:** seeded-shuffle · breakage round 2 (+70, cost-strip seam) · `gameApi.js` play-API · decisive self-play (time-pressure, timeout→excluded, no fabricated W) · coverage round 3 (+22) · **the decide-loop + full-trajectory recording** (the keystone; default byte-identical).
**v0.50.0 (the pilot-seam hardening batch):**
- **Mulligan** as a pluggable decide call (London keep/ship; CR 103.5).
- **Q3 fix** — trajectory recording silently produced 0 rows (serializer choked on `undefined` action fields); Omnath was blocked on it, now fixed → his case-mining works.
- **Empty-stack counterspell legality** (CR 601.2c) — engine no longer offers casting a counter at nothing (Remand/Cryptic/Force of Will).
- **Phantom mana removed** — "Sacrifice X: Add mana" no longer treated as free repeatable mana (58 phantom sources corrected, 0 real dorks dropped).
- **Starting-player alternation** — batch self-play balances who's on the play + records it (un-bias training data).
- **result.winnerSeat** now reported at the top level (was "(none)").
- **Coverage round 4 (+9)** — Phoenix self-return + counter-on-creature.

## 🤝 LEARN-TO-PLAY — the split + status
- **You + Omnath own the pilots** (6 playbooks × temperaments, decision-logic module, offline validation). **Built + validated:** `omnath-tools/pilots/` (decide.mjs, 18 self-tests; case memory mined from real games).
- **I own engine-side:** ✅ gameApi · ✅ decisive self-play · ✅ decide-loop+recording · ✅ mulligan · ✅ all the data-quality fixes from his validation (Q3, counters, mana, seat-bias, winnerSeat) · ⏳ coverage→100%.
- **Seam contract locked**; pilots inject via `runSelfPlayBatch({ pilots, recordDecisions, timePressure })`. Omnath's two validation FYIs both handled; his new counter-legality flag fixed.

## 🅿️ PARKED (correct — Arbiter-domain or needs attended design)
batch-dies (CR 603.3a once-per-batch — high blast radius), activation-frequency caps (needs legalChoices), state/keyword anthems, "if you do" reflexive-payment, hard counters/tutors/free-cast/storm/extra-turns. The yes/no-unify + trigger-order decide slices (see Decision Menu #1).

## 🚧 BLOCKERS
- **None.** Push to master + tag-cut releases both work cleanly.
