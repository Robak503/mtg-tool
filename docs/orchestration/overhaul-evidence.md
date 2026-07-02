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

*(self-play games/sec, breakage census, decisions/sec, CPU profile — recorded below as they run)*
