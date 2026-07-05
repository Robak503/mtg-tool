# 15 — TEST STRATEGY

> **OMNATH IN POCKET · execution playbook · doc 15 of 17**
> LIVE-acceptance discipline, the test-layer stack, the dogfood plan,
> and the con-day dry run script. Doctrine source:
> `feedback_interactive_ui_and_live_acceptance` — **acceptance is live
> and observable, not a green suite.**

---

## 1. The doctrine

A green unit suite proves the code you imagined still does what you
imagined. It does NOT prove the app works in a hand at a table. Every
phase gate in `12-phases.md` is therefore a **behavior you can watch
happen on the real Pixel** — airplane mode toggled with a thumb, a real
deck edited, a real notification arriving.

**Both layers are mandatory; neither substitutes:**
- Suites catch regression cheaply and instantly (the desktop's
  test baseline — live count in `docs/orchestration/WAKE-REPORT.md`,
  7,757 @ v0.102.0 at authoring — is a load-bearing asset that guards
  the shared core through M0's surgery).
- Live gates catch the truth suites can't see (webview quirks, radio
  states, thumbs, glare, battery, patience).

**One exception in emphasis:** M0's gate is deliberately suite-heavy —
its risk IS regression (byte-identical refactor), so the suite is the
right instrument there. M1+ gates are live-first.

## 2. The test-layer stack

| Layer | What it proves | Runs | Built at |
|---|---|---|---|
| **Existing vitest suite** (`npm test`; live count in WAKE-REPORT — 7,757 @ v0.102.0 at authoring) | the shared core still behaves — engine, retrieval, storage, services | every PR (CI) | exists; guards M0 |
| **Adapter contract suite** | every StorageAdapter impl honors the same semantics (resolution order, atomicity, torn-write behavior) | CI for Node/Memory; on-device debug harness for TauriFs (M1.3) | M0.2 |
| **Browser-context proof suite** | services + engine run with Node builtins fenced (the isomorphism guarantee) | every PR after M0.6 | M0.6 |
| **Two-mount parity checks** | desktop route wrapper ≡ direct service call on same inputs (H16 guard) | targeted suite, per-domain | M0.5 |
| **Sync protocol simulation** | two scripted clients + hub: clean cycles, forks, tombstones, poison ops, resume-mid-cycle, idempotent replays — all as fast local tests against MemoryAdapter | every PR after M2.4 | M2 |
| **On-device manual scripts** | per-feature drills (the acceptance criteria §6/§7/§8 blocks of docs 03–11, written as literal checklists) | at phase gates + after risky changes | each phase |
| **Dogfood** (§3) | reality | continuously from M1 | M1 |
| **Con-day dry run** (§4) | the whole point, end-to-end | M5 gate (+ once at M4 as rehearsal) | M5 |

**Standing rules** (inherited, phone-applied):
- `npm run lint` before push — CI treats warnings as errors
  (`feedback_lint_before_push`); sweep stray scratch files.
- A red gate stops the line (never-skip law). Two failed fixes → stop,
  `/investigate`, don't brute-force a third (`CLAUDE.md §1.5`).
- Real data in drills: real decks (Colton's shelf, Joe's roster), real
  games, real vendor prices. Synthetic fixtures are for suites, not
  gates.

## 3. The dogfood plan (M1 → M5, staged widening)

Colton is the dogfooder; the phone is his daily driver — the plan just
structures what he'd do anyway, with an escalating exposure ladder:

| Stage | When | Exposure | Watch for |
|---|---|---|---|
| **Couch** | M1+ | daily-driver at home: deck edits, rules lookups, vault browsing on wifi | paper cuts, jank, one-hand misses (log EVERY annoyance — M5.3 burns this list down) |
| **Errand** | M1+ | pocket use on LTE/no-signal moments | offline honesty, resume behavior, battery |
| **Game night** | M1.9+ | life-track real pods at the LGS/kitchen table | tracker ergonomics, glance test, endurance (`06 §7`), pod-balance table reads |
| **Two-device life** | M2+ | genuine phone+desktop alternation, deliberately editing while offline | sync trust: chips, silent merges, the rare prompt — any surprise = H1 investigation |
| **Agent era** | M3+ | Karn-from-the-couch as the default deck-building surface | tier badges, hub reach over LTE+tailnet, cost ledger staying $0 |
| **Full field** | M4+ | vault jobs live: morning brief habit, grail watch | notification reliability, stale-honesty when the Mac naps |

**Feedback capture:** the in-app feedback tool (existing pattern —
`feedback_in_app_feedback_tool`) ships on the phone at M1; entries sync
home (`02 §2`). Dogfood pain goes in the app, not in memory.

## 4. The con-day dry run (the M5 graduation exam)

Simulates MagicCon-day reality: **airplane mode (or real con-grade
signal) from leaving the house to returning.** Run it on a real full
day out — an LGS event day is the natural stand-in. Rehearse once at
M4 (subset), run for real at M5.4.

**Script (checklist form — copy into the run log, check live):**

1. **Morning, before leaving:** last sync while on home wifi (chip
   `✓`); note battery 100%; brief read over coffee.
2. **Depart → airplane mode.** No wifi all day. (Real con: degraded
   hall signal — either counts, zero-bars is the harder pass.)
3. **Field drills through the day, interleaved naturally:**
   - deck view + a real edit session (swap 3 cards on the shelf deck
     you're playing) — `03 §6.1` conditions
   - rules lookups during games (≥3 real questions) — citations render
     — `08 §6.1/6.2`
   - pod balance for a real pod — `05 §6.1/6.3`
   - **life-track ≥2 full games** incl. one Planechase — `06 §7.1/7.3`
   - grail check at a "booth" (price-compare 2–3 real listings against
     the watchlist) — `07 §6.1`
   - booth-add: file an acquisition into the collection — `07 §6.2`
   - (if built) scan the acquisition in — `09 §7`
4. **Battery checkpoints:** note % at midday + end-of-day. Day must
   end with usable margin (target: >20% at 10h — tune from M4 data).
5. **Kill-resume:** force-kill mid-game once, resume, keep playing.
6. **Evening, home wifi:** watch the chip: `⚠ N pending → ⟳ → ✓`
   silently. Then audit: every edit/record/acquisition from the day is
   on the desktop; zero lost, zero false conflicts; the one deliberate
   fork you seeded (edit the same deck on desktop at lunch, via
   family/remote hands or pre-staged) prompts exactly once and merges
   clean.
7. **Log the run** (time-stamped notes + screenshots) → pass/fail per
   line → failures become issues; **any H1-class event (lost/mangled
   data) = gate FAILED** regardless of everything else passing.

**Pass = ship.** This script is the acceptance test the whole playbook
funnels into (spec: "life tracker, deck view, rules, grail list all
survive offline; sync catches up on reconnect").

## 5. Regression posture per phase (quick map)

| Phase | Primary instrument | Live components |
|---|---|---|
| M0 | the full suite + parity checks + browser-proof | desktop smoke script (real .exe, real use) |
| M1 | on-device drills | airplane-mode cold-boot gate |
| M2 | sync simulation suite | cross-device round-trip + fork drill on real hardware |
| M3 | tier matrix + citation-audit drills | Karn flagship + offline-Jace gates |
| M4 | job runs + notification end-to-end | Planechase at a real table; battery pass |
| M5 | purity sweep + burn-down | the con-day dry run |

---

*Cross-refs: gates `12-phases.md` · per-feature drills in docs 03–09
§acceptance · hazards-into-checklists `13 §how-to-work` · doctrine
memory `feedback_interactive_ui_and_live_acceptance`.*
