# 🌅 RESUME HANDOFF — 2026-07-02 (Fable 5 ENGINE-OVERHAUL pass COMPLETE)

> master → **v0.85.0** (the overhaul pass, 49 commits), tag pushed → CI (run verified below by the
> completion loop). Full gate **6,587 vitest green**, lint clean, corpus **8,645 native** (8,650 − 5
> documented FP removals — accuracy up, zero coverage claims added). **Fable 5 is GONE after this
> pass** — its durable outputs: [OVERHAUL-PLAYBOOK.md](OVERHAUL-PLAYBOOK.md) (the method),
> [OVERHAUL-SESSION-NARRATIVE.md](OVERHAUL-SESSION-NARRATIVE.md) (the mimicry guide, Colton-ordered),
> [overhaul-evidence.md](overhaul-evidence.md) (every number), [PLAY-API-CONTRACT.md](PLAY-API-CONTRACT.md)
> (the locked Omnath seams), + both scaffolds refreshed to post-overhaul reality.

## 📚 Read these FIRST (any session)
1. **PROJECT-SCAFFOLD.md** + **ENGINE-SCAFFOLD.md** — the maps (current as of v0.85.0).
2. **OVERHAUL-PLAYBOOK.md §2–3** — the verification recipes + proof-level table. NEVER skip the
   battery: suite (no MTG_APP_ROOT!) · lint · tier/program/runtime fingerprints · trajectory hash
   (refactors) · play-quality A/B probe (AI changes).
3. This file · `git log origin/master` · CHANGELOG.md (v0.85.0 = authoritative shipped state).
4. memory/COMMS.md top (the Omnath channel — contracts live at "Clyde 9"/"Clyde 10").

## ✅ WHAT THE OVERHAUL SHIPPED (v0.85.0 — all gate+fingerprint-proven; details in the evidence ledger)
- **Perf:** ~6× self-play throughput on byte-identical decisions (static-parse/per-state/mana memos);
  pod batch 7.0s → ~1.1s; no engine function >2% CPU afterward.
- **Correctness:** mirror commander-damage instance keying (false deaths were poisoning self-play
  labels) · GY zone accounting (CR 608.2m/608.3b/715.4, storm-copy guard) · adventure commanders
  castable (Kellan!) · one-shot sac-victim payment guard · cost-time leave drains (603.3b) ·
  mandatory clones enforced (707.9) · 11 phantom mana sources + 5 metric FPs removed (named) ·
  Academy soft-lock fixed + engine-stuck failsafe.
- **Play quality:** AI policy overhaul — new-vs-old 59.2%/40.8% over 120 seeded games, dead turns
  0.68→0.03; pod-aware narration + named combat choices; old policy reachable as `policy:"v1"`.
- **Structure:** parseExtendedAtom deleted (registry = the whole dispatch); single mana-commit
  (`commitPaymentPlan`); TRIGGER_EFFECT/SPELL_EFFECT/ACTIVATED_EFFECT lanes retired.
- **Pipeline:** **Spellbook bulk-first sync — the FULL 95,001-combo dataset in ~9s** (was ~10% via
  429-capped paging); strict guard now requires combos+index+cards; release step syncs cards too.
- **Omnath seams (P3, contracts on COMMS):** play-API v1 session layer (drives complete games incl.
  all 13 pendingChoice kinds) · the supported-import table + in-gate canary (omnathSeam.test.js) ·
  `self-play.mjs --export-trajectories` → trust-gated omnath-trajectory-v1 JSONL.

## ⚠️ PARKED — judgment calls / designed-not-built (carry forward)
1. **Colton's standing items (unchanged from v0.84.0):** land-tier unconditional (metric-only) ·
   fail-CLOSED Spellbook guard trade-off (much less likely to bite now — bulk sync) · U-F4 color-tag
   stopgap · ~230 local/~130 remote squash-merged branches. (The 6 dirty worktrees: Colton approved
   2026-07-02 → all removed junction-safe, main tree verified intact; their branches keep the commits.)
   (v0.84.0 parked #4 gameApi + #5 GY-accounting are RESOLVED this pass; #6 Cargo.toml bumped.)
2. **Designed, parked with analysis (see p2-recon/p4-findings JSON + the evidence ledger):**
   W6 permanent-entry unification (high-risk two-step) · opponentAI W6-equip/W7b-e/W8 slices —
   **ON HOLD per Colton (2026-07-02): do not pick up until he has run Omnath through its Fable pass** · N3 narrated game-log feed (needs source-name payload enrichment first) ·
   parser-seam S3/S4 anti-regrowth registries + S5 · the unquoted spend-restricted LANDS mana class
   (Ancient Ziggurat/Cavern — needs restricted-mana modeling in planPayment, touches real decks) ·
   tutor mandatory-search decline soft spot · remaining P4 P3s (LearnBoard raw-seat-id spots,
   wardCostLabel casing, board-mode 6-button cap, pendingChoice resume leak on the wire,
   wait_for_port foreign-listener, SmartScreen).
3. **Data note:** Colton's personal decks live under profile `prof_65a43f93-993b-458a-9485-a6b4a2eab910`
   ("Colton — personal decks") — renamed from the invalid `prof_colton-personal-decks` (Omnath notified).

## 🔁 IN FLIGHT
None at handoff. The v0.85.0 CI run's verification (strict guard, 95k Spellbook, 5 assets) is the
completion loop's final act — its verdict is appended to memory/CONTINUITY.md + COMMS.

## ▶️ HOW TO RESUME (the grind, under the MODEL SPLIT)
Orchestrator Opus 4.8 @ xhigh; workers `model:"sonnet"`; the battery verifies everyone. Read the
PLAYBOOK, then `memory/orders/clyde-13deck-grind.md`. INTERACTION remains the productive coverage
frontier. Integration pattern unchanged (worktree agents → cherry-pick → battery → ff-only), now
with the NARRATIVE's agent-contract shapes as the template. The overhaul branch worktree
(`silly-jackson-5a1822`) is merged == master; remove it junction-safe when its session closes.
