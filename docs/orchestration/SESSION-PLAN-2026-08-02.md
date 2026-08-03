# SESSION PLAN — 2026-08-02 — 24 hours OR +100 cards, whichever lands first

> **Colton's order (2026-08-02):** full sweep of the shelf and current state, then a fresh plan for a
> 24-hour session run or 100 cards, whichever comes first. This file is that plan. It supersedes
> nothing — NEXT-QUEUE.md remains the queue; this sequences it (plus the fresh census evidence) into
> one bounded run with explicit stop conditions.

## STOP CONDITIONS (check at every slice boundary)

- **24 elapsed hours** from the first slice's start, OR
- **+100 cards gained this session** (flip-diff verified, per-slice audited), whichever is FIRST.
- **The tag fires mid-session, not at the end:** the batch counter stands at **42 since v0.150.0**.
  At **+58 session cards** the batch crosses ~100 → cut ONE release (v0.151.0), then keep working.
  A second tag this session only if the batch crosses ~100 again (would need +158 total — unlikely).
- Early-tag exceptions unchanged: user-facing bug fix, release-pipeline fix, or Colton asks.

## THE SWEEP THIS PLAN IS BUILT ON (all measured 2026-08-02, this worktree, box AppData profiles)

- **Baseline:** suite **1070 files / 13,535 tests green** · `eslint . --max-warnings 0` clean ·
  tree clean, worktree current with origin/master (`564292c9`).
- **Shelf:** **21 decks · aggregate 82% native (1710/2097 slots) · 7 decks at the ≥90% bar · 226
  cards to clear.** By owner: colton 93% (556/599; only Veyran Cantrips 85% below bar) · joe 79%
  (865/1098; nine below bar: Jurassic Ramp 81 · Dragons 80 · Believe it! 78 · Wolverine 77 · Hulk
  Smash 77 · Kinnan 76 · Kellan 74 · Cap America 73 · Halfshell 68) · test decks 72% (289/400; all
  four below: Rashmi 79 · Teval 76 · Otharri 70 · Shalai and Hallar 64).
- **Shelf gap by mechanism (unmodeled deck slots):** Spell effect (other) 132 · ETB trigger 80 ·
  Attacks/blocks trigger 40 · Upkeep/phase trigger 35 · Activated ability 28 · Cast/spell trigger 21
  · Other 19 · Static aura/equip 10 · Dies/LTB 9 · Anthem/buff 8 · Enters-as/replacement 5.
- **Census (fresh, 141s, 34,245 scanned):** 21,066 non-native · **11,403 sole-blocker cards** ·
  **largest cluster = 6 sole-blockers.** The subsystem vein is DRY — third consecutive confirmation.
  The live ore is (a) BUG SIGNATURES (shapes blocking some cards while native on others), (b) the
  TWO-FLIP composition failures (29 cards), (c) the shelf's own mechanism table above.
- Bug signatures worth slices: `start your engines!` (8 native / 6 sole) · suspend (15/3) +
  impending (3 sole) · `you control enchanted creature` (7/4 — this is B1b's credit half) ·
  `enchanted creature doesn't untap` (25/2) · dies-return-artifact (3/3, Junk Diver class).

## SEQUENCE (NEXT-QUEUE law: risky/novel EARLY, mechanical LATE, refusals stated)

### Block 1 — hours 0–3: the user-facing bug, while sharp
1. **A0 — Moxfield 403 in the packaged .exe.** First step is ONE measurement, not a fix: locate
   `resources/node/node.exe` in the install and run the same `node:https` request through it — that
   confirms or kills the bundled-Node TLS hypothesis. Fix what the measurement says. Independently,
   fix the error-message defect (it asserts "Check the link is public" without evidence). Size
   unknown until the measurement lands — timebox 2h on the cause; the error-message fix ships
   regardless. If the cause needs a release-pipeline change, that qualifies for an early tag.

### Block 2 — hours 3–6: the two spec-ready engine slices
2. **A0b — "that player" referent binding** (~3 cards: Recoil, Ozai's Cruelty, Frightful Delusion).
   Bind to the PRECEDING ATOM'S SUBJECT — never thread a spell-side `damagedPlayer`. Compelling
   Deterrence stays parked (dropped intervening condition).
3. **B1b — credit the control Auras** (+7 measured; census agrees at 7 native / 4 sole). Re-run
   `controlAura.test.js` first; tier-diff and NAME-AUDIT every gained row (riders park). Then unify
   the duplicated control move (`controlAura.js` vs `effects/atoms/control.js`) with both test files
   as the net.

### Block 3 — hours 6–9: queue features (the queue outranks grinding)
4. **A1 — Tibalt gremlin mode** (~1h): cap + profile gate BEFORE copy; default OFF, Colton ON.
5. **A3 — Forge ownership into bench context** (~1h): locked deck's cards now, stated assumption.
6. **A2 safe subset only** — extract the three banners (~260 lines) as pure components with direct
   fingerprints. The full decomp stays REFUSED solo (no render net), as does C1.

### Block 4 — hours 9–20: the card grind (mechanical, safe when tired)
Work these as sized slices, census-verified at slice start (ask the code, not this plan):
7. **Bug-signature slices, cheapest first:** dies-return-artifact (+3) · `start your engines!`
   (+~6, mechanism partially exists — find why 8 carriers pass and 6 park) · doesn't-untap residue
   (+~2) · suspend/impending shells (+~6–10 — suspend is a real subsystem; size honestly before
   committing, park if it balloons).
8. **Shelf mechanism grind, fattest vein first:** ETB triggers (80 unmodeled shelf slots — e.g.
   Rosie Cotton, Skyclave Apparition, Staff of the Storyteller) · then Attacks/blocks (40) ·
   Upkeep/phase (35). Target Veyran Cantrips' 7 first (puts colton's profile fully at bar), then
   Shalai and Hallar (64%, worst on shelf), then Joe's tail. Every flip audited both directions;
   whole-card law absolute; parks named.
9. **Two-flip composition failures** (29 cards, e.g. Witch's Mark, Verdant Haven): each is a tier
   COMPOSITION bug, not a missing mechanic — usually cheap, occasionally structural. Take after the
   named signatures.

### Block 5 — hours 20–24: integrity work (zero-card, low-risk, still valuable exhausted)
10. **D6 — bound phases-per-turn** (~1h): per-turn counter + its own wedge class; report counts,
    don't just cap.
11. **D3 — playability sweep 200 games** (runs in background from Block 4 onward; mine wedges).
    Do NOT run concurrently with a full-suite gate (contention gives spurious timeouts).
12. **D2 — dead-card audit re-run** if any land-side change shipped this session.

### EXPLICITLY OUT OF THIS SESSION
- **Arbiter verdict source** — ⏸ blocked on Colton's yes (WAKE-REPORT). Background only.
- **Full MTGAssistant decomp / C1 Foundry re-home** — needs Colton awake + live QA.
- **Anything touching secrets, keys, repo visibility** — standing rule.

## HONEST ARITHMETIC ON THE 100

Spec-ready + named-signature yield sums to roughly +20–30. The rest of the 100 must come from the
shelf mechanism grind at recent observed rates (+3 to +14 per slice, slowing as veins thin). 100 in
24 hours requires the ETB/attack/upkeep veins to cluster better on the shelf than the corpus census
suggests they do corpus-wide — possible, not promised. **24 hours probably fires first.** That is
fine; the order is "whichever is first," and the stop condition is the boundary, not a failure.

## STANDING DISCIPLINE (unchanged, restated so the plan is self-contained)

Full suite + lint 0 before every push · mutation-check load-bearing changes (`Mutation-checked:`
line) · flip-diff GAINED=intended / LOST=0, per-flip audit >~10 cards · runtime evidence for any
resolver/enumerator slice (law 6 — a green fingerprint proves nothing there) · two failed fixes =
stop and investigate · RUN-LEDGER rewritten at every slice boundary · tokens-per-slice logged (grind
token diet) · COMMS swept at boundaries (post ABOVE the first `### ` header) · WAKE-REPORT updated
at the release and at session end · CONTINUITY + COMMS handoff at wind-down.
