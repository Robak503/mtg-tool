# OVERHAUL PLAYBOOK — how to change this engine deeply and prove you broke nothing

> The METHOD deliverable of the one-time Fable 5 overhaul pass (2026-07-01). This is the
> distilled process — wave anatomy, the verification recipes as copy-paste commands, the
> proof-level table, and the orchestration patterns — written so a non-Fable session can run
> the same kind of pass without rediscovering any of it. Raw evidence for every claim:
> [overhaul-evidence.md](overhaul-evidence.md). The maps: [ENGINE-SCAFFOLD.md](ENGINE-SCAFFOLD.md) /
> [PROJECT-SCAFFOLD.md](PROJECT-SCAFFOLD.md). The law: CLAUDE.md + THE CREED. Post-Fable
> model seats + orchestration policy: [MASTER-GUIDE.md](MASTER-GUIDE.md) §2.

---

## 0. The one-paragraph method

Never change the engine on vibes. **Measure first** (P1: profile + baselines committed as
evidence), **verify what you inherit** (P0: adversarial re-verification of the last pass —
this pass found a live CREED regression in day-old "verified" work), then ship **small waves,
each proven behavior-safe at the right proof level** (§3) before the next begins. Fan out
*reads* aggressively (recon agents, finders); keep *writes* serialized or strictly
file-disjoint. Every number in a commit message comes from a command in §2 that anyone can
re-run.

---

## 1. Wave anatomy (evidence → design → build → prove → integrate)

1. **Evidence.** A wave exists because a measurement or a verified finding says so — a CPU
   profile rank, a probe-confirmed bug, a recon report with file:line quotes. No evidence,
   no wave.
2. **Design.** For non-trivial waves, a read-only recon agent produces an
   implementation-ready design (exact functions, state-shape changes, guards, test plan,
   risk). The 8-agent P2 recon of this pass is the template: every design was quoted-code
   grounded and most were buildable as written. Trust but re-read: one recon assumption
   ("fixtures carry no instance id") was wrong and surfaced only at build time.
3. **Build.** Smallest coherent change; colocated tests pinning the new behavior AND the
   CREED near-miss (the thing that must NOT flip). Real oracle text only — pull fixtures
   from the bundled index, never from memory.
4. **Prove.** Run the proof level §3 demands for the change class. Audit EVERY changed
   fingerprint row by name. A row you can't explain is a regression — stop.
5. **Integrate.** Conventional commit whose message carries the evidence (before/after
   numbers, fingerprint verdicts, named FP removals). ff-only; never force-push.

---

## 2. The verification recipes (copy-paste)

All from `app/` of your worktree. `MAIN=C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`.

```bash
# THE GATE (every wave, no exceptions). NO MTG_APP_ROOT on vitest (it redirects paths.js
# and fabricates ~176 filesystem failures). Expect "Tests N passed" ≥ the current anchor.
npx vitest run
npm run lint                       # eslint --max-warnings 0 — CI's real gate

# FINGERPRINT DUMPS (baseline BEFORE the change, candidate AFTER; diff must be explained):
MTG_APP_ROOT="$MAIN/app" node scripts/tier-fingerprint.mjs    > tier.tsv     # ~10s, 34k rows
MTG_APP_ROOT="$MAIN/app" node scripts/program-fingerprint.mjs > program.tsv  # ~7s
MTG_APP_ROOT="$MAIN/app" node scripts/runtime-fingerprint.mjs > runtime.tsv  # ~1s

# The flip-diff (CREED gate) — LOST must be 0 or every line a NAMED, audited FP removal;
# GAINED must be 0 in a no-coverage-growth pass:
awk -F'\t' '$2=="land"||$2~/^native-/{print $1}' tier-before.tsv | sort -u > base.txt
awk -F'\t' '$2=="land"||$2~/^native-/{print $1}' tier-after.tsv  | sort -u > cand.txt
comm -23 base.txt cand.txt   # LOST
comm -13 base.txt cand.txt   # GAINED

# TRAJECTORY HASH (the overhaul's new runtime-behavior fingerprint): 3 seeded real pod games,
# every decision hashed. Byte-identical across a refactor == the engine made the SAME decisions
# on real games. Probe script (copy-paste) = PLAY-HARNESS-OVERHAUL-PLAYBOOK.md §2.1. The spec: load the
# Tier-1 pod decks via loadAllProfileDecks (MTG_APP_ROOT=$MAIN/app), runSelfPlayBatch
# {mode:"commander", gamesPer:3, timePressure:true, recordDecisions:true}, sha256 over
# JSON({result,turns,winnerSeat}) + every trajectory row. RUN IT TWICE (must be reproducible)
# both BEFORE and AFTER. A behavior-CHANGING wave re-anchors the hash — record old/new + why.

# PERF (evidence-first, same machine, uncontended):
MTG_APP_ROOT="$MAIN/app" node scripts/self-play.mjs \
  --ids=colton-sliver-hivelord,colton-koma-cosmos-serpent,colton-zaxara-the-exemplary,joe-the-ur-dragon \
  --games-per=3 --out=/tmp/pod.txt          # the standard Tier-1 pod batch; time it
node --cpu-prof --cpu-prof-dir=prof scripts/self-play.mjs --ids=... --games-per=3 ...
# then aggregate self-time by function from the .cpuprofile (samples×timeDeltas per node).

# PLAY QUALITY (AI-policy changes — trajectory hash is the WRONG gate there):
MTG_APP_ROOT="$MAIN/app" node scripts/play-quality-probe.mjs --help   # seeded A/B, old vs new policy

# DETERMINISM: two fresh-process tier-fingerprint runs must be byte-identical (sha256).
```

---

## 3. Proof levels by change class

| Change class | Suite+lint | tier flip-diff | program-fp | runtime-fp | trajectory hash | extra |
|---|---|---|---|---|---|---|
| Pure refactor / perf (no behavior) | ✓ | 0-diff | 0-diff | 0-diff | **byte-identical** | before/after perf numbers |
| parser.js / atoms seam lift | ✓ | 0-diff | **0-diff (the gate)** | 0-diff | identical | seam-migration-map discipline |
| Mana-model change | ✓ | LOST=named FPs, GAINED=0 | 0-diff | **every changed row audited by name** | usually identical | real-oracle pins |
| Classifier change | ✓ | **audited both directions** | audit | audit | identical | determinism double-run |
| Runtime bug fix (CR-backed) | ✓ | 0-diff | 0-diff | 0-diff | **re-anchors — document old→new** | CR cite verified vs bundled JSON |
| AI-policy change (intentional) | ✓ | 0-diff | 0-diff | 0-diff | re-anchors | **A/B probe evidence (win-rate, dead turns)** |
| UI/client | ✓ | — | — | — | — | component/route pins |

The tier flip-diff is **necessary but not sufficient**: this pass's P0 found 5 phantom-mana
Auras that were invisible to it (all body-only) — runtime-only FP classes need the
runtime fingerprint; same-tier op rebinds need the program fingerprint; decision drift needs
the trajectory hash. Use the whole battery.

---

## 4. Orchestration patterns (what actually worked)

- **Adversarial P0 first.** 8 skeptics re-verified the previous pass's 41 fixes with
  quote-the-code refutation: 37 held, 1 was a live regression, 3 incomplete. "Verified
  yesterday" is a claim, not a fact.
- **Recon workflow → inline correctness → file-disjoint build agents.** Reads fan out wide
  (read-only agents can share your worktree safely). Writes: the orchestrator keeps the
  intricate CREED-heavy engine files; parallel build agents get **isolated git worktrees**
  with explicit FILE-OWNERSHIP lists that must not overlap each other or the orchestrator.
- **Agent worktree discipline:** agent rebases onto the live branch head FIRST
  (`git fetch <orchestrator-worktree> <branch> && git reset --hard FETCH_HEAD`), creates a
  `node_modules` junction to the MAIN tree, gates per commit, **removes the junction itself**
  before finishing (`cmd //c rmdir ...\node_modules` — a recursive delete follows junctions
  and WIPES the main tree's node_modules). Orchestrator cherry-picks, resolves conflicts
  (preserving BOTH sides' semantics — e.g. instance keying + log fields), re-runs the full
  battery, then removes the worktree.
- **Windows tooling hazards (cost real time — do not rediscover):** the Bash tool eats one
  level of backslashes even inside quoted heredocs — backslash-bearing patch anchors silently
  MISS. The robust pattern: **Write the patch script to a file with the Write tool, then
  `node script.cjs`** (no shell mangling). Escaped-unicode source (`“`) vs literal smart
  quotes is the same trap. After ANY edit: verify it landed in YOUR tree and
  `git -C $MAIN status` is clean (the Edit-misroute env bug).
- **Park, don't force.** Anything needing Colton's judgment or a bigger design (the
  spend-restricted-LANDS mana class, resolver-entry unification W6, the narrated log feed N3)
  goes to WAKE-REPORT with a written analysis, never a half-fix.

## 5. What a non-Fable session must never skip

1. The FULL gate battery at the §3 proof level — especially the second-order fingerprints
   (runtime/program/trajectory). The suite alone missed every FP class this pass fixed.
2. Auditing every LOST/GAINED/changed row **by name with real oracle text**.
3. Baselines BEFORE optimizing; A/B probes for AI changes. No blind optimization, ever.
4. Re-verifying inherited work before building on it (P0-style skeptics for anything big).
5. The junction rule + the main-tree-clean check after every edit.
6. Real oracle from the bundled index for every fixture; CR cites verified against
   `knowledge/mtg-judge/data/cr/cr_current.json` (two stale cites shipped in narration; the
   pass found three more).
7. Posting seam-contract changes to memory/COMMS.md BEFORE they ship (the Omnath session
   builds against them).

---

*Fable 5 overhaul pass, 2026-07-01. Headline results: self-play throughput 0.43 → ~1.8
games/s on the Tier-1 pod (wave-level 6.4× on identical behavior, further gains from shorter
smarter games); AI new-policy win rate +18.3pt over legacy with dead turns 0.68→0.03; 11
phantom-mana runtime FPs + 5 metric FPs removed (all named); mirror commander-damage collapse,
GY zone accounting (CR 608.2m), Academy soft-lock, and the play-API wedge all fixed; corpus
8,650→8,645 (accuracy up, zero coverage claims added).*
