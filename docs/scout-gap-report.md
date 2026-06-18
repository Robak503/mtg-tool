# Scout Gap Report — Hans's corpus analysis ledger

> **Hans (Scout) owns this doc.** It's the reasoning *behind* `docs/orchestration/task-board.md`:
> the strategic climb-map, honest clean-yield tables, the per-atom false-positive landmines a builder
> must dodge, and the methodology. The **board** is the terse pull-queue; this is the why.

**Baseline (live, off `origin/master`):** **16.0 % corpus native — 5,369 / 33,540 real cards.** Gap =
**28,171** (20,956 body-only · 6,878 arbiter-spell · 337 planeswalker). Cycle **board-3 (DEEP SCAN)**, 2026-06-18.

This cycle was a one-off **deep scan**: a real-parser frequency analysis over the full unmodeled set, an
8-cluster 4-way classification (cleanAtom / riderGated / subsystem / irreducible), and an **adversarial
CREED pass over every proposed 🔴/🟡 row** (which corrected most yields downward — that's the gate working).

---

## THE CLIMB — 16 % → the ~90 % ceiling, on one page

Corpus native %, denominator 33,540 real cards. Card bands are honest, CREED-discounted estimates.

| Tier | What lands here | ~Cards | Native % after |
|---|---|---:|---|
| **Now (shipped)** | mana/bodies/keywords + the modeled spell & trigger atom library (P2.x · α/β/γ/δ · tokens · counters · discard · reanimate · scry · the multi-clause composer) | 5,369 | **16.0 %** |
| **Clean-atom residue** | the LAST clean matchers: ACT-KW-GRANT (~46) · KWSTRIP (~44) · TRIG-PUMP pilot (~23) · INVEST (~11) · ramp (~9) · loot/tuck/symburn/self-bounce (~30) + the already-boarded PUMP/REG/DIG/MT/SOFT/FOG (~150) | ~+350-450 | ~17.5-18.5 % |
| **Combat-keyword engine** | EVADE — unblockable / can't-block / landwalk / block-only-flying, once the `canBlock` chokepoint honors them | ~+120 | ~18-19 % |
| **Rider / composition harvest** | thin — composition is ALREADY SOLVED; only CTRL-LIFE / ADDCOST / MODAL / 2nd-minus ratchet | ~+100-200 | ~19-20 % |
| **⭐ Trigger-effect compiler (THE SPINE)** | bridge each recognized trigger's `effectClause` → the modeled atom library for the **~5,267 single-trigger gap cards** whose EVENT fires but `effect:null` (TRIG-SCRY/DRAW/TREASURE/COUNTER/MONARCH/…). Lights up most of the 20,956 body-only permanents. | ~+10,000-16,000 (grows with the atom library) | **~20 % → ~80-85 %** |
| **Remaining subsystems** | additional-costs · modal-executor · regeneration / replacement-shield (+ PREVENT) · equipment auto-attach · ETB/upkeep/dies value-subsystems · energy · monarch · levelers · partial sagas | ~+2,000-4,000 | ~85-90 % |
| **Irreducible-Arbiter tail (the ceiling)** | PW loyalty (337) · random/dice/coin (406) · hidden/secret info (461) · sagas (199) · monarch-class globals (162) · control-exchange (55) · extra-turns (53) · dungeons (41) · stickers/attractions (81) · voting (37) · class/level-up (61) · unique one-offs | ~2,500-4,000 | **stays LOW → ceiling ~88-92 %** |

**Headline: the trigger-effect compiler is the spine of the entire remaining climb.** Most of the 20,956
body-only permanents are gated by a trigger whose EVENT the engine ALREADY recognizes (`detectTriggers`
fires for etb/dies/step/attacks/blocks) but whose EFFECT clause isn't compiled into the (already-rich)
spell-effect atom library — it's left `effect:null`. Bridge that ONE seam and the existing atoms (scry,
draw, tokens, counters, damage, destroy, monarch…) light up across thousands of creatures. The clean-atom
and rider tiers are nearly mined out — worth a few points and good builder fuel, but the climb from ~20 %
to ~85 % is one subsystem: the compiler. **TRIG-PUMP-1 is its safe pilot** (one trigger shape, self-bound,
already low-FP). The irreducible tail caps the honest ceiling at **~88-92 %** — ≈ Colton's ~90 % corpus /
~94 % real-deck convention; that tail stays on the Ollama-only Arbiter forever, by design.

### What the deep scan KILLED (so we don't chase ghosts)
- **The clean SPELL frontier is exhausted.** The real parser already flips every clean verb-atom the loose
  openers suggest — destroy/exile unions, bounce, tap/untap, counter, single+team+mass pump/debuff, draw
  (self/target/each), mill, scry, surveil, tutor-to-hand, discard, edict, reanimate — AND every UNFILTERED
  board-wipe ("destroy all creatures", Pyroclasm), and it strips the vacuous "can't be regenerated"/"can't
  be countered" riders. **Zero bare wipes remain.** Only ~30 clean spell atoms are left (ramp/tuck/loot/symburn).
- **Composition is already banked.** The 929 "rider-gated" headline is a trap: the multi-clause parser
  ALREADY chains two HIGH clauses safely, so every rider that is itself a modeled atom (draw, gain-life,
  scry, mill, Treasure…) already composes. The remaining clean rider seam is **tens, not hundreds** (INVEST,
  CTRL-LIFE).
- **Several "big" levers are traps under the CREED** — see the demotions below.

---

## The 4-way split, by cluster (the data behind the map)

| Cluster | gap | cleanAtom | riderGated | subsystem | irreducible |
|---|---:|---:|---:|---:|---:|
| spells: clean atoms | 6,878 | 30 | 929 | 1,400 | 4,500 |
| spells: rider/composition | (subset) | 65 | 415 | 300 | 300 |
| spells: keyword strips/actions | 351 | 55 | 95 | 71 | 130 |
| spells: subsystems | 1,150 | 23 | 30 | 740 | 357 |
| perms: activated | 5,859 | 105 | 200 | 120 | 5,434 |
| perms: ETB | 4,769 | 169 | 200 | 480 | 3,920 |
| perms: combat keywords | 150 | 0 | 0 | 124 | 26 |
| perms: statics/auras + tail | 5,121 | 29 | 1,153 | 2,046 | 1,893 |

The `subsystem` + `riderGated` columns on the permanent rows are overwhelmingly the **trigger-effect
compiler** opportunity (event recognized, effect uncompiled). `cleanAtom` totals ~480 corpus-wide — the
last clean residue, most of it needing tight all-or-nothing matchers.

---

## Verified backlog — honest yields + landmines (adversarially CREED-checked)

Every yield below is the **adversarial-pass corrected** number (the analyst's first estimate in parens
where it was demoted). "FP" = the false-positive trap. Board rows carry the short form; full detail here.

### 🔴 high-lever, low-FP, verified
- **ACT-KW-GRANT (~46, was 76)** — `{cost}: This creature gains <KW> until EOT`. Reuses `parseGrantedKeywords`
  + the GRANTABLE_COMBAT_KEYWORDS allowlist (the allowlist IS the FP guard — menace/infect/indestructible
  auto-route to Arbiter). **FP:** the 76 double-counted ~16 *target*-other grants (a different atom) +
  multi-ability cards; ship **self-ref only, all-or-nothing on the whole card**. "vigilance and lifelink"
  is a VALID multi-grant (both grantable), not a reject.
- **KWSTRIP-1 (~44, reproduced exactly)** — strip the vacuous cast-keyword line (foretell / suspend / splice-
  onto-arcane / recover / harmonize / basic-landcycling), then parse the body. The #200 precedent, zero new
  resolver. **FP:** REBOUND/CIPHER/CONSPIRE/LEARN/PROLIFERATE/AMASS are NOT vacuous — exclude. The same
  keyword's "If this was foretold/cast from exile, <extra>" conditional bodies (8 cards) must stay LOW
  (the all-or-nothing gate already catches them). Anchor each strip to the keyword+cost token only.
- **TRIG-PUMP-1 (~23, was 29)** — `Whenever this attacks/blocks, IT gets +N/+N until EOT`. detectTriggers
  already fires the event; wire its `effectClause` into the existing temp-pump program. **The safe pilot for
  the trigger-effect compiler.** **FP:** fixed-integer anchor only (reject `+X/for each` ~40 cards); reject
  "while saddled" conditional triggers; recipient must be "it"/"this", NEVER "other creatures" (team-anthem,
  6 cards) or "target" (picker); residue after the trigger must be keyword-only.
- **EVADE (combat-keyword engine, ~120 across 3 slices)** — one `canBlock` chokepoint
  (`legalChoices.js:658`, today enforces ONLY flying). EVADE-1 unblockable + can't-block (~40), EVADE-2 basic
  landwalk (~61, resolved per-defender = 4P-correct), EVADE-3 "can block only flying" (~20, blocker-side
  mirror). **FP — ENGINE-FIRST:** these are NOT in COVERED_KEYWORDS today and the engine does NOT honor them;
  adding to the keyword list before the canBlock work = a guaranteed false positive (unblockable creature
  gets blocked). Ship the engine enforcement, THEN flip coverage. Bare-clause only (reject every conditional/
  "except by"/"this turn"). EVADE-4 (attacks-each-combat, ~16) is a separate **requirement** engine — defer.

### 🟡 medium / lower-risk subsystems (runway)
- **ACT-PUMP-TIMING (~31, was 23 — but needs enforcement)** — firebreathing blocked only by a pure-timing
  trailer ("Activate only once each turn / as a sorcery"). **FP:** the trailer must be ENFORCED, not just
  stripped — the runtime has NO per-ability activation counter or sorcery-speed gate today; stripping alone
  flips it native and the engine then allows unlimited/instant-speed firing. Ship a per-source
  activations-this-turn counter + sorcery-speed gate, THEN flip. Keep "Activate only IF…" conditionals on
  the Arbiter. (Complexity is med, not low.)
- **ADDCOST-2 (~15, was 21)** — `As an additional cost to cast, discard N / pay N life / sacrifice an artifact.
  <EFFECT>`. Extends the CLAIMED sac-to-cast seam. **FP lives in the EFFECT half:** reject effects that scale
  off the paid cost ("equal to the sacrificed permanent's mana value"), the cost-regex matching CREATURES
  with the phrase in an activated ability, and "or pay {N}" *alternative* costs (a choice, not the fixed
  cost). Whitelist the effect template explicitly.
- **ETB-RAMP-SEARCH (~14, was 20)** — `When ~ enters, search for a basic land → hand | battlefield-tapped,
  shuffle`. **FP #1 = a SECOND ability** (Solemn Simulacrum's dies→draw is the headline card; ~half the
  cluster). Reject any second When/Whenever, activated `{}:`, or compound "enters OR attacks" event. Singular
  "a basic land", one destination, rest keyword-only.
- **RAMP-1 (~6-9)** — the SPELL sibling: `Search for a basic land, put onto the battlefield [tapped], shuffle`
  — a new battlefield-destination resolver (the shipped `tutor` op is HAND-only). High **real-deck value**
  (Colton's lands/ramp archetype) despite modest count. **FP:** end-anchored `…then shuffle.` only — the bucket
  is dense with trailing riders; **Cultivate AND Kodama's Reach are split-destination traps** (one to
  battlefield, one to hand) — model the split exactly or DROP them. Honor tapped-vs-untapped per card.
- **KWACT-INVEST (~11)** — alias "Investigate[ N times]." → N create-Clue-token atoms (reuses shipped TOK-2).
  Free, additive on already-native bases. **FP:** fire ONLY on first-person "Investigate" — reject
  third-party "<subject> investigates" (Fateful Absence "its controller investigates" → wrong-owner Clue);
  "N times" → N Clues. (This supersedes the duplicate RIDER-INVEST proposal.)
- **ETB-EQUIP-ATTACH (~9, was 18)** — `When this Equipment enters, attach it to target creature you control`
  + a plain +N/+N. **FP:** the attach line often carries a trailing "That creature gains <KW> UEOT" rider
  (7 cards) that a loose match drops; the +N/+N must be a PLAIN static (no "instead"/"if"/"has"); AND the
  engine must ACTUALLY attach (classifier flip without a resolver = a lie).
- **RIDER-CTRL-LIFE (~7, was 10)** — `Its controller loses N life.` on a single permanent-target base.
  **FP:** "its controller" = the TARGET's controller, not the caster (a naive who:'controller' makes the
  CASTER lose life). AND counter-spell targets carry NO `.controller` field → gate to **permanent targets
  only** (creature/artifact/land/pw), not merely "single target".
- **MODAL-2 (~9)** — extend the shipped "Choose one —" gate to "Choose two / one or both". **FP:** the runtime
  resolves EXACTLY ONE mode today; flipping the gate without rebuilding the EXECUTOR (chosenMode→chosenModes[],
  per-mode target namespacing, sequential resolve) silently drops the 2nd mode. **Gate + executor MUST ship
  in the same PR.** Thin (9) — board 🟡 only because it auto-ratchets as heavier modes land.
- **LOOT-1 (~9)** — add a self-discard atom (`you discard N` = controller), and `draw N, then discard M`
  composes. **FP:** reject "discard N at random" (engine-chosen, not player-chosen — 7 cards); don't fire on
  additional-cost discard.
- **TOK-NAMED-EXT (~8 ETB / ~30-40 corpus)** — extend the TOK-2 named-token registry to Blood / Powerstone /
  Map / Lander / Junk. **FP:** Powerstone enters TAPPED and can't pay for nonartifact spells (model the
  restriction or it over-credits ramp); ROLE tokens are auras → exclude (different subsystem).

### 🟢 small / cleanup
- **TUCK-1 (~5)** — `Put target creature on top of its owner's library` (new `tuck` op). Anchored whole-card
  only; **top ≠ bottom ≠ hand** (wrong slot loses/dupes the card).
- **SYMBURN-1 (~8)** — `deals N to each creature and each player` (extend the each-creature path to faces).
  Must hit ALL players incl. the caster.
- **ACT-SELF-BOUNCE (~6)** — `{cost}: Return this creature to its owner's hand` (bind target=source).
- **RIDER-2ND-MINUS (~5)** — pump target 1 + debuff a DISTINCT second creature; needs distinct-second-target
  binding (don't loosen "another" globally).
- **ETB-ABILITYWORD (~3-4, was 11-20 — demoted hard)** — strip the ability-word prefix ("Keen Senses —") so
  detectTriggers fires. **FP:** a 422-card minefield ~95 % landmine — most ability-word ETBs are intervening-if
  (Revolt/Metalcraft, CR 603.4) or board-scaling (Constellation/Rally fire on OTHER permanents). Erin/FIX-lane.
- **ETB-MONARCH (~8 ETB / ~25 corpus)** — monarch is THREE coupled rules (set flag + end-step draw +
  steal-on-combat-damage); model all three or route to Arbiter. Subsystem.

### ⛔ DEFER — subsystems / strategic greenlight
- **⭐ TRIG-COMPILER (the spine, ~5,267 trigger cards)** — bridge each recognized trigger's `effectClause`
  into the spell-effect parser with the self/it/this binding + the all-or-nothing residue gate. Carves
  dozens of sub-rows (TRIG-SCRY ~33, TRIG-COUNTER ~28, TRIG-TREASURE ~45, TRIG-DRAW, TRIG-MONARCH ~18…).
  **The single largest native lever in the corpus.** TRIG-PUMP-1 is the pilot — greenlight the full bridge
  after it proves out.
- **ACT-REGEN-SHIELD (~66)** — `{cost}: Regenerate this creature`. A replacement-effect SHIELD (CR 701.15) —
  the SAME prerequisite as the deferred PREVENT subsystem; build them together. FORBIDDEN to fake-model
  (a creature that should survive dies = corrupted state).
- **EVADE-4 (~16)** — "attacks each combat if able" — a must-attack REQUIREMENT engine (the engine models
  attacking as optional today). Separate from EVADE; lowest ROI.
- **ACT-MONSTROSITY (~7)** — needs an is-monstrous latch whose own second-ability cards would force FPs. Not worth it.
- **copy-spell, extra-turns, prevent-next-N** — irreducible / fold into PREVENT → Arbiter.

---

## VERIFY findings (false positives for Erin — these jump the queue)

- **VERIFY-MENACE 🔴 — a LIVE shipped false positive.** Menace is in COVERED_KEYWORDS (`coverage.js:39`) +
  COMBAT_KEYWORDS, so a Menace-only creature classifies **native-body** — but the 2-blocker requirement
  (CR 702.110) is enforced NOWHERE: `legalChoices.canBlock` admits a SINGLE blocker vs a Menace attacker
  and `combatResolution.js:17` explicitly defers Menace. So the engine lets one creature block a Menace
  attacker — a confident wrong combat resolution. (The design already makes Menace NON_GRANTABLE for exactly
  this reason; the inconsistency is that PRINTED Menace is still "covered".) **Fix:** enforce the 2-blocker
  rule in canBlock/declare-blockers, OR remove Menace from COVERED_KEYWORDS so Menace bodies drop to the
  Arbiter (the safe default). This is the same gap that blocks EVADE — fix it alongside the combat-keyword work.
- **VERIFY-ETB-DESTROY 🟡 (lower confidence)** — Ravenous Chupacabra & the ETB-destroy-an-opponent's-creature
  family classify native-trigger (targeted ETB removal). The flush-time enemy-target chooser SHOULD pick an
  opponent's creature; owed a LIVE end-to-end spot-check in a real 4P session that it never targets own / never
  crashes on no-legal-target. Not asserted as a bug — a spot-check request.
- *(Confirmed NOT bugs: the ETB "draw N, then discard M" compound correctly stays LOW; the self-pump activated
  path is provably $-anchored-tight; equipment/aura all-or-nothing gates hold with zero drift.)*

---

## Methodology + the deep-scan tools (for the next cycle)

Throwaway scripts at `app/` root (gitignored): `_sweep_scout.mjs` dumps the non-native corpus through the
REAL `classifyCard` → `_sweep_low_corpus.json`; `_query_scout.mjs` does `sigs`/`match`; **`_deepscan.mjs`**
(this cycle) runs the real `parseEffectClause` on each gap spell's FIRST sentence to detect **rider-gated**
cards (base parses HIGH, a rider is the gate) and writes `_ds_*.md` signature tables. Re-run all three each
cycle (`MTG_APP_ROOT=<main app> node …`).

**Clean-count proxy biases (correct before stating a yield):** ACCURATE for verb-only atoms
(discard/mill/sac/regrowth); UPPER bound for pump/burn ("and gain <kw>" within-sentence riders → discount
25-40 %); LOWER bound for look/reveal (inherently 2-sentence). **The deep-scan lesson: trust the real parser
over the proxy — the adversarial pass cut most first-pass yields 1.3-4× (ACT-KW-GRANT 76→46, FETCH-RAMP 23→6,
ETB-ABILITYWORD 20→4).** A "clean single-sentence" count is an OPENING bid, not the answer.

**Standing discipline:** re-dump first (the gap shifts as atoms land); `git ls-remote --heads origin "feat/*"
"fix/*"` to skip claimed work; never board a row that would force a false positive; the irreducible tail
STAYS on the Arbiter — don't drag it native.
