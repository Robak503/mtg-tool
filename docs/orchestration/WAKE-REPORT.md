# 🔄 COVERAGE GRIND — 2026-07-02 (post-v0.85.0 relaunch, Clyde)

> Live grind session on top of v0.85.0. Integrating via **PR [#383](https://github.com/Robak503/mtg-tool/pull/383)** (rolling branch `claude/clever-liskov-6e04be`) — direct ff-push to master is blocked by the auto-mode classifier (as the CREED discipline documents: master push is PR-only), so waves stack as individually-verified commits on the PR. **Merge #383 when ready, or add a Bash permission rule to authorize direct-to-master pushes for the faster ff-grind.**

## Census (realism gate, main-tree oracle) — after the alt-cost + Inspiring Call waves
Corpus **25.4% native** (8670/34160, **+18 this session**). Per-deck (▲ = moved this session):
Wolverine 57▲ · Kellan 56▲ · Cap 57▲ · **Rog/Thras 58▲(+4)** · Mothman 59▲ · **Yuriko 61▲(+8)** · **Kinnan 63▲(+3)** · Pantlaza 68 · Toph 72▲ · Ur-Dragon 72 · Omnath 77▲ · Zaxara 80▲ · Koma 82 · Vihaan 83 · Sliver 92. **Aggregate 68→69%** (1014→~1037/1500). The three worst laggards (Yuriko/Rog-Thras/Kinnan) got the biggest boosts — the alt-cost lever landed exactly where intended; Inspiring Call added the +1/+1-counter decks (Zaxara/Toph/Mothman/Wolverine).

## ★ META-FINDINGS
1. **(5-agent recon)** post-overhaul the clean mechanic-levers are mostly ALREADY MODELED (token-on-trigger incl. Treasure/Food, enters-with-X counters, most +1/+1-counter infra). Remaining deck gap = alt-cost (now DONE) + a scatter of small 1-2-card slices + the genuine Arbiter tail (tutors/wheels/storm/redirect).
2. **★ ALT-COST = a PARSER-STRIP, not an offer subsystem.** A printed alternative casting cost ("… rather than pay this spell's mana cost" / "you may cast without paying its mana cost") is stripped EXACTLY like the flashback/jump-start/overload `CAST_KEYWORD_LINE` strips (Cyclonic Rift / Firebolt are native today by this logic): remove the alt-cast sentence, the effect body parses, the card is native because its effect is modeled + it's castable at its PRINTED mana cost. The alt-cost is recorded as `program.altCost` metadata but NOT yet OFFERED — a safe FN on an optional discount (the card never plays wrong). **This is COVERAGE work; OFFERING the alt-cost (AI pays life/exiles/sacs) is the deferred play-quality follow-up** (the full offer subsystem in [alt-cost-design.md](alt-cost-design.md) — that doc describes the OFFER; only the strip shipped).

## SHIPPED (on PR #383, all battery-verified: vitest green no-MTG_APP_ROOT · lint · tier flip-diff LOST=0 · program-fp audited · runtime-consistent via parseEffectProgram)
- **Wave 1 — COUNTER-QUALIFIED count-source** (+1: Armorcraft Judge). `parseCountSource`+`countForSpec` gain a `+1/+1`-counter-qualified creature count. Prereq for Inspiring Call.
- **Wave 3a — ALT-COST free-if-commander strip** (+3: Fierce Guardianship [×5 decks], Deadly Rollick, Flawless Maneuver).
- **Wave 3b/3c — ALT-COST all shapes** (+13: the 7 targets [Force of Will/Negation, Flare of Denial/Cultivation, Gush, Snuff Out, Submerge] + 6 corpus [Cave-In, Pyrokinesis, Rouse, Snapback, Thwart, Unmask]). Matcher list: free / pay-life+exile pitch / exile-color / sac-creature / pay-life / return-lands. Each GAINED audited (body fully parsed, modeled atom, castable at printed cost); FP canaries stay arbiter (Foil/Misdirection/Commandeer/Disrupting Shoal/Deflecting Swat).
- **Inspiring Call** (+1, x4 decks: Zaxara/Toph/Mothman/Wolverine → each +1) — the cross-clause "Draw a card for each creature with a +1/+1 counter. Those creatures gain indestructible." as a collapsed 2-sentence template: [draw(requiresCounter), grant-keywords-group(requiresCounter)]. New `requiresCounter` filter on the grant resolver (grants only to countered creatures). Builds on Wave 1. flip-diff LOST=0 GAINED=1; program-fp = Armorcraft Judge + Inspiring Call; runtime test pins the counter-filtered grant.
- **DISTRIBUTE-COUNTERS** (+4: The Earth Crystal [Toph+Wolverine], Armament Corps, Armament Dragon, Defend the Celestus) — a new pendingChoice mechanic mirroring divide-damage exactly (new leaf atom `distributeCounters.js` + setPendingDistributeChoice + auto-pick + resolve + learnSession driver/settle/apply). Placement routes through add-counter so the +1/+1 doubler composes (CR 616 — Earth Crystal's own doubler doubles what it distributes, runtime-tested). flip-diff LOST=0 GAINED=4 (each whole-card-modeled). FP guards: +1/+1 only, "target creatures you control" only, bounded "one or two"/"one, two, or three" only, amount≤maxTargets, whole-clause anchor.

## ▶️ NEXT (for the next /loop fire) — a RICH pipeline: 1 counter-cluster slice READY + 4 CORPUS LEVERS (~100 cards) scouted
The decks are near their Arbiter ceilings, so the volume is now in CORPUS levers. Two tiers, all DISJOINT-file, all with build-ready designs (agents ran this fire):

### A. THE OZOLITH counter-migration (BUILD-READY design; ~30 corpus cards, Toph+Wolverine x2) — do this first
Sole blockers found (agent af06bef): (1) no generic "a creature you control leaves the battlefield" trigger scope — add `creatureYouControlLeaves` (mirror `tokenYouControlLeaves` @ triggers.js:1763); (2) the leaving creature's counters aren't snapshotted — add `counters:{...perm.counters}` to `markDead` (gameState.js:1187) + `recordLeaveEvent` (gameState.js:845), 1 line each; (3) a `move-counters` resolver (mirror `fight-pair` two-target atom, parser.js:307) placing via addCounter (doubler composes); (4) **probe-found extra: interveningIf "<self> has counters on it"** isn't in interveningIf.js vocab → add 1 branch + thread the source id (gameEngine.js:685 has `sourceId`). **BONUS: the move-counters resolver alone flips 3 PURE SPELLS free — Fate Transfer, Bioshift, Nexus Mentality** (both targets live at resolution, no trigger/look-back needed) + the LTB-capture family (Iron Apprentice, Star Pupil, Essence Channeler… ~15). S/M, FP-low.

### B. CORPUS LEVERS (agent a2189f — ~100 cards across 4 small atom-template adds, each mirrors already-shipped `matchOptionalManaPayment`/`matchOptionalSacBySubtype`):
1. **UPKEEP-SAC-UNLESS-PAY** ("echo without the keyword") — **31 cards**, S, very-low FP. "At the beginning of your upkeep, sacrifice this ~ unless you pay {cost}." New matchUpkeepSacUnlessPay + resolver + pendingChoice + AI pay-if-affordable. (Justice, Phantasmal Forces, Stasis, Peacekeeper…). ★ recommended FIRST corpus lever.
2. **OPTIONAL-DISCARD-PAYMENT** ("you may discard a card. If you do, <effect>") — **33 cards**, S, low FP. Third sibling of the same optional-payment family (cost="discard a card", reuse hand.js discard atom). (Keldon Raider, Viashino Racketeer…). Pairs with #3 in one PR.
3. **DRAW-THEN-DISCARD REFLEXIVE** ("you may draw a card. If you do, discard a card") — **15 cards**, S. The mandatory "draw, then discard" already composes (parser.js:574 ",then" splitter); only the optional wrapper is missing. (Skeleton Key, Murder of Crows…).
4. **INTERVENING-IF "you attacked this turn"** — **26 cards**, S. New per-player `attackedThisTurn` flag (mirror `creaturesDiedThisTurn`: stamp at attack-declaration, reset at untap) + 1 evaluateInterveningIf branch. (Nightsquad Commando, Alesha…).
- Ruled OUT (bigger subsystems, park): Energy (needs a cost-payment resource; 13 clean but 72 spend {E}), Monarch (needs the draw/steal payoff or it's a dropped-clause FP).
- `scratchpad/current-levers.mjs` regenerates the deck-lever view; the full agent designs (Ozolith af06bef, corpus a2189f) have exact code + file:lines.
- **Deferred play-quality (ON HOLD per Colton — Omnath pass):** the alt-cost OFFER subsystem (legalChoices dual-offer + actionDispatcher alt-payment + AI) so the AI actually USES the alt-costs. Full design in alt-cost-design.md.

## PARKED (recon-determined — need judgment / bigger design; NOT clean levers)
- **Tax-on-opponent-cast** ("unless they pay {N}"): only ~2 clean cards (Rhystic Study, Esper Sentinel); needs an opponent-pay pendingChoice subsystem (clonable from soft-counter) for poor ROI. Rhystic Study family otherwise blocked by cumulative upkeep / an unmodeled **opponent-draws** trigger event.
- **Alt-cost SECOND-tier cards** (need separate redirect/exile-any-number/edict work, NOT alt-cost): Deflecting Swat, Mindbreak Trap, Misdirection, Commandeer, Flare of Duplication/Malice, Contagion, Force of Despair. Even a full alt-cost build leaves Yuriko ~8 short → **Rog/Thras, Kinnan, Yuriko cannot reach 100% native this session** (documented ceiling).
- **Enters-with-X hydras**: lever already wired (20/90 corpus native); the 5 named hydras are 5 unrelated 1-card builds (counter-redirect replacement, dmg-amount referent, Aura-self-counter static, budget-capped destroy, opponent-searches trigger).
- **Hungering Hydra** (2-blocker): besides the dmg→counter referent, "can't be blocked by more than one creature" is a deliberately UNMODELED evasion restriction (combatEvasion.js:42). Needs the evasion subsystem too — not a clean slice.
- **Tale of Katara "becomes tapped" trigger** (IMPORT CYCLE): the event is the sole detection gap, but gameState.js (tapPermanent) can't import triggers.js (cycle) → the single-chokepoint design is invalid; tap sites fan out (actionDispatcher/manaModel/combat + regeneratePermanent-in-gameState) and CREED needs EVERY site to fire (under-fire = FP). Needs a deferred tap-event queue in state (tapPermanent records → gameEngine drains → triggersForEvent) = a subsystem. Corpus tail if built: 40 self-bare "becomes tapped" cards. Full design in agent a21fcb.
- Chain of Vapor stays a named Arbiter carve-out (untouched).

---

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
