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
| Play-quality A/B (new vs `policy:"v1"`) | *pending — probe running at P0 close; recorded in the P1 entry* | `play-quality-probe.mjs` |
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
