# 🌅 RESUME HANDOFF — 2026-07-01 (Fable 5 consolidation pass COMPLETE)

> master → **v0.84.0** (consolidation pass), CI building. Tree clean + pushed · **Fable 5 is now GONE** —
> the two scaffold docs below are its durable output. Full gate green (**6,371 vitest tests**), flip-diff
> clean (23 phantom-mana FP removals / 0 gained). 34 findings repaired across engine · runtime · server ·
> UI · pipeline · docs. The 13-deck / corpus grind resumes next under the MODEL SPLIT.

## ➡️ NEXT SESSION — read these FIRST (no Fable 5 anymore)
1. **docs/orchestration/PROJECT-SCAFFOLD.md** — the whole system (runtime, build, routes, docs/memory, orchestration).
2. **docs/orchestration/ENGINE-SCAFFOLD.md** — the rules engine deep-dive + **"HOW TO SAFELY ADD A NEW MECHANIC"**.
3. This file (parked judgment calls below) + `git log origin/master` + CHANGELOG.md.
4. Then resume the grind: `memory/orders/clyde-13deck-grind.md` (MODEL SPLIT: orchestrator Opus 4.8 @ xhigh,
   workers `model: "sonnet"`).

## 🤖 MODEL SPLIT (unchanged, decided 2026-07-01)
Orchestrator = Opus 4.8 @ xhigh (judgment). Background build/verify `Agent()` workers = `model: "sonnet"`
(the flip-diff + gate verify every worker regardless of tier). Always pass `model` — omitting it inherits
the orchestrator tier. Fable 5 was the one-time exception for this pass; it's gone now.

## ✅ WHAT THE CONSOLIDATION PASS SHIPPED (v0.84.0, all flip-diffed / gate-green)
- **Engine classification (5 phantom-mana FP classes):** quoted group-grant mana no longer credited as the
  granter's own (Cryptolith Rite / Chromatic Lantern / Goldspan / Paradise Mantle / Eldrazi-Scion makers);
  Mana Vault untap-restriction; dead "permanents you control have <kw>" selector (Privileged Position now
  grants correctly); irregular plural subtypes; invariant basic-land intervening-ifs. Corpus 8673→8650
  native (−23 FPs = accuracy up).
- **Engine runtime (9 bugs):** regenerated-in-combat creature = phantom combatant forever; 4P first-draw
  skip (CR 103.8c); resolveChoice wrong-action dispatch; pendingFreeCast livelock → fake W/L; AI can't cast
  from exile; trample-over-protection; adventure double-offer; breakage timeout bucket; localeCompare
  determinism. (+ 2 beyond-audit catches: a 3rd livelock arm in the anti-loop latch; a missing
  creature-half-from-hand generator.)
- **Server/.exe (10):** module-scope path capture (in-app sync no-op'd in .exe); non-atomic profiles
  registry (could orphan ALL user data — now atomic + folder-rebuild recovery); Origin/CSRF guard;
  hardcoded dev path; export-all section status; tibalt error surfacing; Ollama absolute-path pull; deleted
  dead /api/spellbook + symbolic-engine trio + chats v1 shim + buildSeedDeck.
- **Client (15):** Arbiter auto-retry destroying chat messages (stale closure); stale deckData on switch;
  dead "Load from Project"; color-tag destruction on profile switch; primer latency; SSE abort/timeout;
  UpdatesModal background result; cross-session busy bleed; stacked-tile targeting; search race; compare
  default; message id; dead-code removals.
- **Pipeline (P0):** ~68 releases shipped ZERO Spellbook combos — restored a bounded resumable combo sync +
  a strict bundle guard; bundled cardkingdom sync; caches → restore-only (stopped ~840 MB/release churn);
  atomic sync writes; build-rules-index crash-path + RELEASE.md rollback fixes.
- **Docs:** the two scaffolds; CLAUDE.md stale paths/numbers/pointer; archived 2 build-status docs that were
  served as rules content; bannered superseded handoffs; deleted a 0-byte stray.

## ⚠️ PARKED — Colton judgment calls (surfaced by the audit, NOT acted on)
1. **land tier is unconditional** (coverage.js) — any "Land" type line counts native regardless of unmodeled
   activated abilities (Mystifying Maze etc.). A `land-partial` tier would tighten the metric. Metric-only.
2. **Strict bundle guard is fail-CLOSED on Spellbook combos** — if Spellbook is down AND the cache is empty,
   a release now HARD-FAILS rather than shipping empty combos. Correct default (never ship gutted), but it
   couples release availability to Spellbook uptime. Loosen (drop combos from the REQUIRED set in
   prepare-tauri-resources.cjs) if an outage ever blocks a release you need.
3. **U-F4 color tags = stopgap** — per-profile tag definitions are namespaced in localStorage now; the
   durable fix is server-side per-profile tag storage (deferred).
4. **gameApi.js pilot seam** is documented-but-unsafe (can't settle pendingChoice/pendingArbiter) and unused
   except gameStatus — either make it real (surface pending-choice actions) or keep it doc-only. Coordinate
   with Omnath (COMMS) since the pilots target this seam.
5. **Resolved instants/sorceries never reach a graveyard** (resolvers.js) — under-counts GY thresholds
   (safe direction). An eventual engine-design fix, not a quick patch.
6. **Cargo.toml version = 0.3.0** (drift from tauri.conf 0.84.0) — cosmetic (tauri.conf drives the bundle);
   bump or comment if it ever confuses.
7. **6 stale DIRTY worktrees** (master-rev, wave2a-rev, WAVE4-dex, qa-report-1, wave5b, wave5d) still await
   your force-remove approval (they hold uncommitted prior-session work; branches retain the commits).
8. **~230 local / ~130 remote branches** — most are squash-merged faculty/wave branches, safe to prune with
   a squash-aware check, but deferred per your earlier "avoid work loss" call.

## 🔁 IN FLIGHT
None. 0 agent worktrees (the 3 fix-agent worktrees were integrated + removed). Clean stop.

## ▶️ HOW TO RESUME
State clean + pushed (master v0.84.0). Read the two scaffolds, then `/loop` with
`memory/orders/clyde-13deck-grind.md`. Integration pattern: worktree agents → cherry-pick onto branch →
flip-diff both directions (awk `$2=="land"||$2~/^native-/` | sort -u; main tree = baseline; expect LOST=0)
+ gate WITHOUT MTG_APP_ROOT → push branch + FF master → remove worktree. Cut releases via Bash edits (the
Edit/Write env-bug can misroute to the main tree — verify `git -C <main> status` clean after every tool
edit). Check `memory/COMMS.md` top. INTERACTION remains the productive coverage frontier
(Stifle/ability-counter, "can't be countered", bounce, more removal).
