# OVERHAUL EVIDENCE LEDGER — Fable 5 engine-overhaul pass (2026-07-01→)

> The committed evidence base for the one-time ENGINE OVERHAUL pass
> (mission: [FABLE5-OVERHAUL-PROMPT.md](FABLE5-OVERHAUL-PROMPT.md)). Every perf claim,
> fingerprint verdict, and repair in the pass traces to a numbered entry here.
> Method writeup lands in OVERHAUL-PLAYBOOK.md (P5); this file is the raw record.
> Machine: Colton's desktop (Core Ultra 9 / RTX 5080 / 32 GB, Windows 11) — all
> numbers same-machine unless noted.

---

## P0 — Adversarial verification of v0.84.0 (COMPLETE)

**Method.** 8 skeptic agents (model: fable) re-verified all 39 consolidation-pass code
fixes by domain — quote-the-code refutation + targeted test/probe re-runs — plus one
CI-log agent over the release + sync-spellbook run logs. Full structured findings:
session artifact `p0-result.json` (transcribed verdicts below).

**Verdicts: 37 HOLDS · 1 BROKEN · 3 INCOMPLETE** — every non-HOLDS repaired on-branch
(commits `64c9730`, `e6a54dd`, `a30fb20`, `814e57c`), gate re-run green.

| # | Fix | Verdict | Repair |
|---|---|---|---|
| 1 | fccccc2 phantom-mana wave A | **BROKEN** — the generalized `stripNonSelfQuotedGrants` (has/have-anchored) replaced the old Aura blanket strip and missed non-has introducers + conjunction-chained quotes → **5 NEW phantom-mana Auras** (Minimus Containment, Honest Work, Imprisoned in the Moon, Careful Cultivation, Lithoform Blight). Metric flip-diff was blind to it (all 5 classify body-only) — runtime-only FP class. | `64c9730` — Aura blanket strip restored INSIDE the shared guard (runtime + metric mirrored). Runtime-fingerprint diff = exactly the 5 named rows → null; tier 0/0; program 0-diff; 6 test pins (real oracle). |
| 2 | 1bfaa46 4P first-draw | INCOMPLETE — engine fixed but narrator.js still announced the skip in pods, citing CR 103.7a which **no longer exists** in the bundled CR. | `e6a54dd` — narration gated on `turnOrder.length === 2`; cites corrected to 103.8a (narrator + selfPlayRunner comments + stale test pin). |
| 3 | 11e2eeb adventure combined-offer | INCOMPLETE — combined offer correctly killed, but NO command-zone half-projection existed → **adventure commanders (Kellan, the Fae-Blooded — a 13-deck commander — / Beluna Grandsquall) entirely uncastable**. | `a30fb20` — `actionsCastCommander` projects both halves through the shared builder w/ tax; creature half ungated, adventure half CREED-gated; 5 new tests (tax, count bump, exile round-trip, CREED gate). |
| 4 | 6dc2968 timeout bucket | INCOMPLETE — report fixed but SelfPlayPanel's OutcomeSummary never learned `o.timeouts` → timeout-only batch shows NO warning row. | `814e57c` — timeouts added to the non-completions sum + label. |

**CI evidence (release run 28555047569, sync run 28556088945):**
- v0.84.0 shipped strict-guard-green, all 5 artifacts published, **9,900 Spellbook combos**
  in the bundle (the sync 429'd at offset 9,900 — checkpoint bundled, meta never written).
- The windows-2025 weekly sync works (runner + cache save `refdata-spellbook-…` confirmed) but
  each run caps at ~9-10k variants before HTTP 429 exhausts retries; its saved cache is now the
  newest `refdata-` prefix match, so the NEXT run resumes at its checkpoint. Reaching ~89k needs
  ~9 spaced successful runs → **P4 candidate: switch to Spellbook's bulk export if one exists,
  or slow the page rate to live under the limit.** Dispatched one more sync during P0
  (run 28563655412).

**Residual same-class items surfaced by skeptics (pre-existing, NOT regressions) → P2 work list:**
- Equipment with keyword-conjoined quoted grants self-credit standing mana (Summoning Materia, Lotus Ring).
- Conditional self-grants credited unconditionally (Rishkar Peema Renegade, Mul Daya Channelers, Honored Hierarch, Joraga Treespeaker).
- Quoted spend-restrictions dropped for legit self-includers (Battery Bearer).
- `KNOWN_ROCKS` is consulted BEFORE the untap-restriction gate (ordering hazard for future entries).
- Adventure halves not offered on cascade/discover free-casts (decline/to-hand only — FN-safe).

---

## P1 — Baselines (pre-overhaul anchors)

**Gate + tooling timings (worktree `silly-jackson-5a1822`, post-P0 code):**

| Metric | Value | Source |
|---|---|---|
| Full vitest suite | **6,377 passed / 434 files, ~28-30s wall** (27.57s pre-P0 / 29.96s post-P0) | `npx vitest run` |
| Lint | clean, ~9s | `npm run lint` |
| Corpus classify sweep (tier-fingerprint) | **~10s**, 34,125 names | `tier-fingerprint.mjs` |
| Program fingerprint dump | **~7s**, 34,160 rows | `program-fingerprint.mjs` |
| Runtime (mana) fingerprint dump | **~1s**, 34,160 rows | `runtime-fingerprint.mjs` |
| Corpus native count | **8,650** (= v0.84.0 handoff; P0 repairs moved 0) | tier fingerprint |
| classifyCard determinism | 2 fresh-process runs **byte-identical** (sha256 `2f27db7d…`) | double-run probe |

**Fingerprint anchors** (scratchpad, sha256 in `baseline-checksums.txt`):
`baseline-{tier,program,runtime}.tsv` = master @ c7ce3eb (pre-P0) · `current-*.tsv` = post-P0
rolling reference (differs from baseline ONLY by the 5 documented Aura FP removals in runtime).

**Structure note for the seam workstream:** `effects/parser.js` is **2,762 lines** — the
seam-map census (post-batch-28) recorded 1,673; the v0.78–0.83 coverage waves regrew the
monolith by ~1,100 lines of new inline matchers. Fresh census required before P2 seam batches.

**Self-play / play-quality baselines (post-P0 code, same machine, uncontended):**

| Metric | Value |
|---|---|
| Tier-1 pod batch (Slivers·Koma·Zaxara·Ur-Dragon, 4P commander, games-per=3) | 3 games / 7.0s = **0.43 games/s** (~2.3s per game), 3/3 decisive |
| Training 8-deck batch (2 pods, games-per=2) | 4 games / 5.5s = **0.73 games/s**, 4/4 decisive |
| Decisions probe (Tier-1 pod, 2 games, recordDecisions) | 3,817 decisions / ~4s = **~964 decisions/s** · **91.6% forced pass-priority** · avg 35 turns |
| Dead-end/livelock census | 0 timeouts / 0 draws / 0 engine-stuck across all baseline games (time pressure ON) |
| Breakage reports | p1-tier1pod-baseline.txt / p1-training8-baseline.txt (scratchpad; spell-unresolved = expected Arbiter-tier tails) |

**CPU profile (3-game Tier-1 pod batch, 7.8s sampled — the P2 wave ranking):**

| Rank | Cost | What |
|---|---|---|
| 1 | **~30% self-time** | RUNTIME STATIC-ABILITY RE-PARSING — parseClause 10.8% + parseGlobalTapManaAugment 5.9% + selfNormalizeOracle 4.7% + abilityClauses 3.3% + parseStaticAbilities 3.1% + uncounterable/selector parses ~2%. Layers memoizes per STATE object; every action creates a new state → re-derives → re-parses every battlefield permanent's oracle. detectTriggers already has the per-CARD WeakMap cache pattern; staticAbilityParser has none. |
| 2 | **8.6%** | globalTapManaAugment (manaModel.js:542) — rescans the battlefield + calls the static parser on every manaSources call. |
| 3 | **~12%** | layers derivation machinery (effectAffects 3.9%, layers.js:809 anon 2.7%, collectContinuousEffects 2.1%, staticEffectsOf 1.9%, matchesSelector 1.9%). Partly collapses once parse results are cached. |
| 4 | ~7% | card-index startup (readJson/readFileUtf8/buildCardIndex) — one-time, amortizes in batches; matters for CLI cold-start only. |

→ **Wave 1 (perf): per-card WeakMap caching for the static-ability parse family** (parseStaticAbilities + parseGlobalTapManaAugment + friends), then re-profile before touching layers proper.

**Data repairs made during P1 (dev data root, not code):**
-  failed the  path-guard → the WHOLE profile system silently ignored Colton's 6 personal decks (SimCenter/self-play/decks API). Renamed → , registered in profiles.json ('Colton — personal decks'). loadAllProfileDecks now sees **16 decks**. Posted to COMMS (Omnath tools may reference the old folder name).
- Deleted empty stray  folder.
- Known runner hazard for pods: an EMPTY deck (Test Deck) seeds pods → guaranteed setup-error games. → P2/P4 fix: runner skips empty/unenrichable decks with a warning.

**Spellbook resume-chain status (during pass):** dispatch 28563655412 restored the prior checkpoint and reached **18,800 cumulative combos** (each run adds ~9.4k then 429s). Continue spaced dispatches through the pass; P4 evaluates a bulk-export switch.
