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
- `prof_colton-personal-decks` failed the `/^prof_[0-9a-f-]{36}$/` path-guard → the WHOLE profile system silently ignored Colton's 6 personal decks (SimCenter/self-play/decks API). Renamed → `prof_65a43f93-993b-458a-9485-a6b4a2eab910`, registered in profiles.json ('Colton — personal decks'). loadAllProfileDecks now sees **16 decks**. Posted to COMMS (Omnath tools may reference the old folder name).
- Deleted empty stray `prof_b4c8b575-40fa-4a99-93b4-c59245d0ec9a` folder.
- Known runner hazard for pods: an EMPTY deck (Test Deck) seeds pods → guaranteed setup-error games. → P2/P4 fix: runner skips empty/unenrichable decks with a warning.

**Spellbook resume-chain status (during pass):** dispatch 28563655412 restored the prior checkpoint and reached **18,800 cumulative combos** (each run adds ~9.4k then 429s). Continue spaced dispatches through the pass; P4 evaluates a bulk-export switch.

---

## P2 — Engine deep overhaul (waves, each gate-proven)

### Wave 1 — static-parse per-card cache (commit f89cf1c) — PERF, behavior-preserving
parseStaticAbilities / parseAttachedBonus / parseGlobalTapManaAugment / parseAuraGrantedManaAbility
memoized per CARD object (WeakMap, detectTriggers pattern). **Tier-1 pod 3-game batch 7.0s → 2.4s
(2.9×); decisions/s 964 → 1,996.** Gate: 6,377 green · lint clean · tier/program/runtime 0-diff.

### Wave 2 — per-state indexes + manaProduction memo (commit 8535c9c) — PERF, behavior-preserving
findPerm → per-state id→perm Map; permanentHasKeyword/ProtectionColors → per-state layer-6
keyword/protection index (evaluation-order-identical); manaProduction → per-card memo.
**Batch 2.4s → 1.1s (cumulative 6.4×); decisions/s → 2,909 (3.0×).** Gate: 6,377 green · lint clean ·
3 fingerprints 0-diff · **trajectory hash byte-identical** (b3970105…, 3 games / 6,306 decisions —
the new runtime-behavior gate for refactors; probe: scratchpad/trajectory-hash.mjs).

### Wave 3 — phantom-grant FP wave (P0 residuals) — CLASSIFICATION+RUNTIME, documented removals
Four strip classes in the shared quoted-grant guard (stripNonSelfQuotedGrants) + a LEVEL-band gate:
attachment blanket extended to Equipment/Fortification · conditional subjects ("as long as …",
restrictive "with …") · spend-restricted quotes ("can't be spent…"/"spend this mana only…") ·
conjunction-chained matcher widen (has/have + intervening words + quote chains) · LEVEL-banded
oracles routed out of manaProduction.
**Runtime-fingerprint: exactly 11 phantom standing sources removed, each audited by real oracle:**
Summoning Materia · Lotus Ring (Equipment self-credit) · Rishkar, Peema Renegade (with-counter) ·
Honored Hierarch (renown, chained) · Mul Daya Channelers (top-card) · Joraga Treespeaker (LEVEL) ·
Battery Bearer · Clement, the Worrywort · The Charitable Drafter · Inga and Esika (spend
restrictions) · Preston Garvey, Minuteman (token-granted nested quote).
**Tier flip-diff: LOST=5 / GAINED=0** — Summoning Materia, Lotus Ring, Honored Hierarch, Mul Daya
Channelers, Tazri, Stalwart Survivor (all were native-mana while producing PHANTOM mana → metric
accuracy up; corpus native 8,650 → 8,645). Program 0-diff · suite 6,381 green (+4 pins) · lint
clean · trajectory hash unchanged (no pod deck runs the 11).
Also: self-play sweep EMPTY-DECK GUARD (an empty deck seeded pods → guaranteed setup-errors;
now skipped with a warning; 15-deck full sweep = 4 pods, 4/4 decisive).

**Parked (needs its own designed wave):** unquoted spend-restriction LANDS (Ancient Ziggurat /
Cavern-class "Spend this mana only to cast …" is dropped → general-purpose credit). The fix is
restricted-mana modeling in planPayment (or a color-identity downgrade), touching many real tribal
decks — do not strip blindly.

### Wave 4 — commander instance keying (commit a0b6f29) — CORRECTNESS (flywheel-poisoning)
Mirror commanders shared ONE 21-rule tracker key (both deck builders mint card ids from deck id +
name; self-play PADS PODS BY WRAPPING, so mirrors are routine) → an 11+10 split was a FALSE DEATH,
and eliminating one twin erased the live twin's damage. Per-seat `commanderInstanceId`
("<seat>::<cardId>") stamped at seat build; damage/strip/tax keyed instance-with-fallback (old
saves + fixtures byte-identical); tableSnapshot disambiguates mirror display. Docs corrected: the
TAX never collapsed. Gate: 6,387 green (+6 mirror pins) · 3×0-diff · trajectory unchanged.

### Wave 5 — one-shot sac-victim payment guard (commit 20e7d54) — CORRECTNESS
The chosen sacrifice victim (cast addCost + γ1b) was not excluded from mana sources — planPayment
could crack a Treasure victim, then the dispatcher's re-find threw PERM_NOT_FOUND on an OFFERED
action. Shared sourcesExcludingOneShotVictim at all 4 legality/payment sites (two-sites invariant);
repeatable victims still tap-then-sac. Gate: 6,392 green (+5 pins) · 3×0-diff · trajectory unchanged.

### Wave 6 — small-seams hardening (commit a72f3c4) — CORRECTNESS/structure
Cost-time leave-event drains at 4 chokepoints (CR 603.3b ordering; closed the stale-scan FP
window) · modal combat-referent flatten via shared programCombatReferentAtoms (zero corpus impact,
future-proofing) · dice/reveal sequence gates hoisted into programConfidence (closes the
collapsed()-bypass class; a lone roll-d20 is now correctly LOW). Gate: 6,398 green · 3×0-diff ·
trajectory unchanged.

### Wave 7 — GY zone accounting (commit 464c106) — CORRECTNESS (CR 608.2m / 608.3b / 715.4)
Resolved instants/sorceries now reach their owner's graveyard via a payload disposition applied at
the two program-completion points (after ALL atoms — no self-count; threads through every
pendingChoice suspension). Storm copies DELETE the param at clone (no duplicate card objects,
CR 707.10a); Arbiter-routed spells keep vanishing (documented FN); AURA_ETB fizzle bins the card;
countered adventure casts bin the FULL card. 13 vanish-encoding pins audited + updated, 3 new.
Gate: 6,398 green · 3×0-diff · **trajectory re-anchor b3970105 → 639058** (same games, same 6,306
decisions; features now see real GY contents), deterministic ×2.

### Wave 8 — agent-branch integration: pending-choice client + narrator (commits 267ae85…ec384cc)
Two parallel worktree agents, cherry-picked + conflict-resolved (kept instance keying + the
2-player draw-skip gate through the narrator rework):
- **Academy soft-lock fixed** (WI-1): optional-mana-payment / optional-sac-payment had NO UI —
  panels + hook methods wired; exhaustive-kind failsafe (WI-4) reports engine-stuck honestly for
  any future unhandled kind; /api/learn/choose kind-echo validation (WI-5); settler consistency
  (WI-6).
- **Narrator wave** (N1/N2/N4/N5/N6): grammar + pod-awareness (no more "You draws" / every AI seat
  as "The opponent"); combat options name the defender/attacker (no more blind pod combat); logs
  for non-combat deaths + commander-damage accrual w/ lethal-21 warning; narrateAction for 6 more
  kinds (+ 2 more stale-cite fixes verified vs the bundled CR: plot 702.170, cascade 702.85a);
  noise-cut decisionLogTail + clickable beginner narration. N3 (narrated log feed) DEFERRED —
  needs source-name payload enrichment first (parked, documented).
Integration gate: **6,539 green** · lint clean · 3×0-diff · trajectory re-anchor 639058 → 684fb0a3
(additive defenderName on attack actions), deterministic ×2. Agent worktrees junction-safe removed.
