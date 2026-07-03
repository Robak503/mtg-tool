# PLAY-HARNESS OVERHAUL — running work log

> The wave-by-wave evidence log of the play-harness + headless-system + AI-players overhaul
> (Colton, 2026-07-03: "full rehaul… full notes and work logs so future non-Fable agents can
> replicate this style of work"). Method spine: OVERHAUL-PLAYBOOK.md (§2 recipes, §3 proof
> levels). Session context: runs in the Omnath session under a one-owner lock (COMMS
> "Omnath 4") — it holds the R11 pilot diagnosis this pass consumes. Companion docs land at
> P5 (PLAY-HARNESS-OVERHAUL-PLAYBOOK.md). Every number here is re-runnable from §2 commands.

## P0 — master verified + baselines (2026-07-03, main tree @ b59c3b7e)

| Baseline | Value | Command |
|---|---|---|
| Suite anchor | **7,503 passed / 512 files / 28.9s** | `npx vitest run` (app/, NO MTG_APP_ROOT) |
| Tier-1 pod batch (games-per=3) | **1.56s wall**, 3/3 complete, avg 51.3 turns | §2 self-play.mjs standard pod (MTG_APP_ROOT=AppData — see note) |
| Trajectory hash | **`0c75d0de2d1b32996e4a702bb3fbdd85fef01b9347c0a4334fc978010ef9ad50`** — byte-identical ×2; 3 games / 8,014 rows / ai-wins×3 | §2 spec probe (scratchpad script, recreate per PLAYBOOK) |
| Breakage census (pod) | 15 entries: Aberrant ×9 `trigger-removed-no-target`, Ember Island Production ×2 + Reality Shift + Teferi's Protection `spell-unresolved`, Garruk's Uprising ×2 | same pod run report |
| Play-quality A/B (new vs `policy:"v1"`) | **NEW 58.3% / OLD 41.7%** (60 mirror games, all decisive); dead turns 0.02 vs 0.37; X-sizing 4.74 vs 1.00; **flags: NEW blocks ≈ never (0.12 vs 4.35/game) · Rograkh/Thrasios mirror ~315s vs ~2s others (perf pathology)** | `play-quality-probe.mjs` (default config) |
| Pilot-side reference | R11 diagnosis (pilots lose 17–33% on interaction to the default AI; 5 mechanisms) | `omnath-tools/pilots/R11-DIAGNOSIS.md`, rerun `node pilots/r11-diagnose.mjs 6` |

**Baseline deviation note:** the §2 recipes assume dev-tree profile registrations
(`--ids=colton-…`). The dev tree's profile store is POLLUTED (~90 test "Bob" profiles;
`prof_65a43f93` decks.local.json is 0 bytes as of 07-03 03:37) — all P0 runs used
`MTG_APP_ROOT=%APPDATA%/com.colton.mtg-tool` (read-only) instead. Root-causing the polluter +
repairing the dev registration is a P2 wave (P1 scan estate `runner-data` owns the design).

**Incidents (P0):**
- The session's original git worktree had been swept to an EMPTY directory; a branch checkout
  from inside it fell through to the MAIN repo and moved its branch pointer (same commit — zero
  file changes; restored to `master` immediately). **Rule: `git rev-parse --show-toplevel`
  before any branch op; never trust a worktree dir you haven't just listed.**
- Work now lives in a dedicated worktree: `.claude/worktrees/play-harness`
  (branch `claude/play-harness-overhaul`, node_modules junctioned to main — junction-delete
  before any worktree removal, per the standing hazard).

## Scope locks (from the /goal args + unlocked parked items)

1. Harness rehaul: act()/nextDecision instrumentation threading · session-layer policy A/B
   exposure · PENDING_CHOICE_KINDS contract truth (runtime ~19-20 vs doc 13) · seed/seat/pilot
   rotation + attribution · dev-tree profile repair + test-write guard · trajectory export
   enrichment.
2. Engine AI: the ON-HOLD-until-Omnath-pass W6-equip/W7b-e/W8 opponentAI slices (now unlocked)
   + the alt-cost OFFER subsystem (alt-cost-design.md) + tutor mandatory-search decline + scan
   finds. **Every AI change ships with play-quality-probe A/B evidence** (§3: trajectory hash
   re-anchors, documented).
3. Pilot base layer (omnath-tools/pilots): H1–H8 from R11, each re-gated by the r11-diagnose
   rerun + vs-default re-measure.
4. Contracts: PLAY-API-CONTRACT v1.1 (kinds truth, instrumentation opts, §2 table additions
   Q4) — COMMS-posted before shipping.
5. No coverage growth: tier flip-diff LOST=0 GAINED=0 all pass (any tier movement = a bug).

## P1 — scan complete (31 agents; 62 findings kept, 0 refuted; full ledger in session artifacts)

**Wave plan (locked 2026-07-03):**
| Wave | Scope (finding ids) | Gate |
|---|---|---|
| A1 test-isolation | HB-1 env scrub + tripwire + dev-tree repair · HB-2 atomic migration | suite+lint, all fp 0-diff, deliberate-leak repro |
| A2 instrumentation threading | SD-1/PS-2/ENG-FLAG-1 (~45 apply* sites + act()) · SD-2 turn-boundary · PS-3 pilots opt | trajectory hash BYTE-IDENTICAL on default paths + new threaded-path tests |
| A3 session correctness | SD-3 off-turn ask wedge · SD-4 wire strip · SD-5/PS-4 policy exposure · SD-6 stale-submit guard | suite + new pins; hash identical (defaults untouched) |
| A4 runner data quality | HB-3 pod label bug · HB-4 seed discipline · HB-5 deck/seat/pilot rotation · HB-6 pairing coverage (+HB-7 measurement) | hash RE-ANCHORS (documented old→new); label-correctness tests |
| B1 AI correctness | AI-F1 kicked-target bypass · AI-F2 low-confidence waste · AI-F11 probe key drift · AI-F12 X-group routing | A/B probe + suite |
| B2 AI parked slices | AI-F3 equip/activated · AI-F4 wipes · AI-F5 fog · AI-F6 auras · AI-F7 pump · AI-F9 mulligan-on · AI-F10 tutor decline | A/B probe per slice (win-rate + dead-turn evidence) |
| B3 alt-cost OFFER | ALT-1..8 (corrected design: twin post-pass, altCost marker, 16 HIGH carriers, 15 MUST-NOT-OFFER canaries, conservative AI filter, pol.altCost key) | tier fp 0-diff (play-quality only) + A/B counter-usage evidence |
| C pilots base layer | PILOT-W0 duel.mjs prerequisite → H1..H8 | r11-diagnose re-gate per fix; final vs-default + pod re-measure |
| D perf | pathology (hunter in flight) · GC/alloc lane · targeting.js pick · HB-9 export streaming · HB-11 stats scan · SD-8 split (maybe) | §3 pure-perf: hash byte-identical + before/after numbers |
| E contract v1.1 | PS-1 kinds=20 truth · PS-5 Q4 table · PS-6 vocabulary · PS-7 versioning discipline | doc + canaries both sides + COMMS post |

Serialization: lane A waves share learnSession/gameApi (serial); lane B owns opponentAI (serial); lane C is a different repo (parallel); D after the pathology report; E after A2/B features settle. Concurrency cap ≤2 builder lanes live at once (standing hazard).
