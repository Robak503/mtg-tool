# 13 Training Decks → LITERAL 100% Native — Build Brief

> **Author:** Hans (Scout+QA). **Source:** ultracode workflow over all 537 distinct unmodeled non-land cards
> across the 13 training decks (decompose → synthesize → critic). **For:** Dex (builder, runs the waves) +
> Clyde (integrator, owns master + the gate). **Status:** plan ready; awaiting Colton green-light to build.

---

## 0. THE MANDATE (Colton, hard directive 2026-06-21)

**The 13 training decks must be LITERAL 100% native. ZERO cards deferred to the Arbiter.**

This is a CARVE-OUT from the corpus goal (which keeps a ~6–10% Arbiter tail forever). The 13 decks are the
self-play **data engine** — one Arbiter card and that deck can't play end-to-end deterministically, which
contaminates the training data. So inside the 13: **every card gets a native build path.** Genuinely-exotic
one-offs get a **TARGETED HOOK** (a card-specific parser-predicate + runtime applier — the proven #353
Ur-Dragon / #356 Mothman pattern), **never** a deferral.

The trigger that surfaced this: Wolverine's *"Double all damage Wolverine would deal"* (a damage-replacement,
Furnace-of-Rath family) was sitting on the Arbiter. It's tractable — it gets built.

---

## 1. THE PLAN AT A GLANCE

**537 distinct unmodeled cards → 25 deduped general slices (clear ~480 cards) + 17 targeted hooks for the
one-offs → ZERO cards on the Arbiter.** Organized into **7 build waves**.

Current realism gate (non-land native %): Sliver 56 · Koma 47 · Vihaan 34 · Omnath 31 · Zaxara 29 · Rograkh 23
· Pantlaza 23 · Toph 21 · Ur-Dragon 21 · Kellan 19 · **Cap America 17 · Mothman 14 · Wolverine 6**.
The 3 laggards are gated on: Wolverine → damage-replacement + counters lanes; Mothman → rad subsystem;
Cap America → equipment lane.

---

## 2. ROLE SPLIT + CADENCE (Colton's decision)

| Who | Job |
|---|---|
| **Dex** (ultracode, the build chat) | Owns the 13-decks-to-100% build. Runs **each wave as a separate ultracode part** — fan out a builder-agent per slice in isolated git worktrees, each implements + writes tests + runs the full gate (`npm test` + `npm run lint`), then serial-integrate the wave. |
| **Hans** (QA, this chat) | **Sweep every wave's flip-set for FPs before Dex green-lights the next wave.** The non-negotiable gate. Mass-parallel building has a huge FP blast radius; "100% native" is worthless if the natives are false positives. |
| **Walt + Cindy** | Back to GENERAL corpus coverage. |
| **Clyde** (integrator) | Owns master + the serialized merge of each wave. Confirms the gate + Hans-sweep before each wave lands. |

**THE CADENCE (load-bearing):**
```
Dex builds wave N  →  Hans sweeps wave N's flip-set  →  fix any FP  →  Clyde merges  →  green-light wave N+1
```
Do NOT race ahead. Catching an over-broad matcher in wave 1 before wave 5 composes on it is the difference
between a clean 100% and a debugging swamp.

---

## 3. THE 7 BUILD WAVES (the ultracode parts for Dex)

Waves are ordered by DEPENDENCY; within a wave, slices touch **different engine files** so they fan out in
parallel with zero conflict. Each wave = one ultracode part.

### WAVE 1 — Shared engine prerequisites (downstream slices no-op without these)
`PHASE-TRIGGER-FRAMEWORK` (triggerScheduler.js — upkeep/end-step/combat-begin/opponent-step emitters) ·
`TREASURE-MAKER` (tokenFactory.js) · `RAD-COUNTER-SUBSYSTEM` (radCounters.js) · `FOOD-TOKEN-SUBSYSTEM`
(foodTokens.js) · `MANIFEST-DREAD-AND-MANIFEST` (manifest.js) · `AMASS-ARMY-SUBSYSTEM` (amass.js) ·
`REGENERATE-SHIELD-REPLACEMENT` (regenerateShield.js).
*Each gets its own NEW module → all fan out in parallel. MUST merge before any consumer wave.*

### WAVE 2 — High-impact CLEAN bulk lane (clears the most decks, lowest risk)
`ETB-SELF-PAYOFF` · `RAMP-FETCH-BASICS + TUTOR` · `COUNTER-TARGET-SPELL + CANT-BE-COUNTERED` ·
`DRAW-EQUAL-TO-METRIC + DRAW-X + bounce` · `STATIC-COST-REDUCTION-BY-TYPE` · `STATIC-ANTHEM-FLAT` ·
`CDMG-PLAYER-PAYOFF` · `MANA-VARIABLE/UNTAP/LAND-DROPS`.
*Split by FILE: effectAtoms.js ETB-section vs spell-section (different builders by named-section ownership),
staticAbilityParser.js, combatTriggers.js, manaEngine.js.*

### WAVE 3 — Counter/token replacement + dies/delayed/cast layers
`COUNTER-AND-TOKEN-DOUBLER-REPLACEMENT` (replacementEffects.js — **MUST land before** enters-with-X-counters
& counter-on-attack, the #1 FP) · `COUNTERS-ON-ATTACK/DAMAGE/UPKEEP-SELF-OR-TARGET` (counters.js) ·
`ETB-XCOUNTERS-FROM-X` · `DIES-TRIGGER-RESOURCE-PAYOFFS` (diesTriggers.js) · `DELAYED-TRIGGER + UPKEEP-WIN`
· `CAST-TRIGGER-PAYOFF` (castTriggers.js).

### WAVE 4 — Equipment / aura attachment + keyword PR2 (Captain America lives here)
`EQUIP-STATIC-PT-KEYWORD + DYNAMIC-PT` · `EQUIP-ATTACH-TRIGGER-RIDER + ETB-EQUIPMENT-AUTO-ATTACH` ·
`AURA-LAND-MANA-BOOST + AURA-GRANTS-TRIGGERED-ABILITY` · `SELF-LTB-RETURN-TO-HAND` ·
`KW-WARD-PR2 / KW-PROTECTION-PR2` (walt lane) · `GROUP-EVASION/KEYWORD-GRANT` · `OPPONENTS-CANT-ACT`.
*Files: attachments.js, equipment.js, keywords.js. Runs parallel to wave 3 (file-isolated).*

### WAVE 5 — HARD subsystem lane (Wolverine 6% laggard gated here)
`EARTHBEND-AND-ANIMATE-SUBSYSTEM` (typeChanging.js, layer 4) · `CLONE-ENTER-AS-COPY` (copyEngine.js, layer 1)
· `COPY-A-SPELL` · `ENDURING-DIES-RECUR-AS-ENCHANTMENT` · `LTB-COUNTER-RELOCATION` ·
`DAMAGE-MULTIPLIER + DAMAGE-PREVENTION/LIFE-LOCK` (damageReplacement.js — **Wolverine double-damage**) ·
`FIGHT-AND-DEAL-DAMAGE-EQUAL-TO-POWER` · `EXTRA-TRIGGER-EVENT-DOUBLER + MILL-ON-EVENT`.
*Each is a layer-changing/replacement engine in its own module → file-isolated but multi-PR each.*

### WAVE 6 — Alternate-play-zone + cast-substitution + commander framework
`PLAY-FROM-TOP / IMPULSE / FREE-CAST` · `CAST-FROM-NONHAND-ZONE` (plot/mayhem/adventure/flashback) ·
`COMMANDER-FRAMEWORK` (Partner/Eminence/command-zone-cheat/monarch) · `MANIFEST/AIRBEND/CIPHER` ·
`MASS-DESTROY + destroy-then-compensate` · `CASCADE-AND-STORM`.
*All hook castEngine.js / alternativeCosts.js / commanderZone.js — SEQUENCED relative to each other, split
across builders by zone (top vs exile vs yard vs command-zone). Clears the bulk of the former arbiterTail.*

### WAVE 7 — Targeted hooks (every remaining one-off, fully parallel)
One tiny `hooks/<cardname>.js` per card (predicate matches ~1 card + applier). **All fan out in parallel,
zero conflict** (the #353/#356 pattern). Last because some compose on wave 1–6 subsystems. See §5.

---

## 4. THE 25 GENERAL SLICES (ranked by impact; FP landmines are the QA gate)

> Each row: **cards · decks · lane · tractability**. The **FP landmines** are what Hans checks on the sweep —
> builders, model these or the card stays non-native (CREED all-or-nothing).

| # | Slice | Cards·Decks | Lane / Tract. | Key FP landmines |
|---|---|---|---|---|
| 1 | **TREASURE-MAKER** (unified) | 30·9 | cindy / clean | Goldvein enters TAPPED · count reads dynamic source at resolution · sac-for-mana ability must register |
| 2 | **PHASE-TRIGGER-FRAMEWORK** | 43·12 | cindy / mod | each-opponent must NOT fire controller · "each upkeep" (Koma) every player · all 4 step kinds emit · once per step |
| 3 | **STATIC-ANTHEM-FLAT** (+kw-grant) | 11·4 | cindy / clean | "Other" self-exclusion load-bearing · two-color stack · lieutenant live-eval not ETB snapshot · don't pump opponents |
| 4 | **STATIC-COST-REDUCTION-BY-TYPE** | 13·7 | cindy / mod | generic only, no colored<0 · predicate = spell being cast · additive · not opponents' |
| 5 | **CLONE-ENTER-AS-COPY** (unified) | 18·6 | cindy / hard | copy PRINTED not live counters (CR707.2) · token-copy non-recurse guard · copy-mods layer after · can copy PW |
| 6 | **COUNTER+TOKEN-DOUBLER-REPL** | 18·5 | walt / mod | doublers multiplicative (x4) player-ordered · intercept at REPLACEMENT layer not post-trigger · scope "you" |
| 7 | **COUNTERS-ON-ATTACK/DMG/UPKEEP** | 24·8 | walt / mod | route through doubler-aware pipeline · read CURRENT P/T at resolution · "other" exclusion · Wolverine per-turn flag |
| 8 | **PLAY-FROM-TOP / IMPULSE / FREE-CAST** | 20·8 | cindy / hard | temp permission must REVOKE EOT (leak FP) · impulse returns to exile · "without paying" still pays additional |
| 9 | **CDMG-PLAYER-PAYOFF** (draw/D20/rad/dig) | 21·7 | cindy / mod | fire on PLAYER not creature · rad-proliferate needs wave1 · dig-cast needs impulse slice · respect chosen defender |
| 10 | **CDMG-CREATURE + ATTACK removal/buff** | 13·6 | cindy / clean | until-EOT pumps wear off · attack-trig (declare) vs combat-dmg (dmg step) distinct · attack-mana uses pool |
| 11 | **ETB-SELF-PAYOFF** (token/draw/tutor/fight/destroy) | 38·8 | cindy / clean | fight needs fight subsystem · destroy targeting legality · rad-pulse needs wave1 · choose-type persists |
| 12 | **ETB-WATCHER** (creature/dragon/landfall enters) | 29·7 | cindy / hard | register at ETB, de-reg at LTB · "another" exclusion (self-ETB ≠ fire) · typed subtype-aware (changelings) · landfall per token |
| 13 | **COUNTER-TARGET-SPELL + soft-counter** | 15·5 | cindy / mod | "can't be countered" reverse-hook at counter-resolve · soft-counter = ward family (reuse) · Mana Drain delayed pool |
| 14 | **FIGHT-AND-DEAL-DAMAGE-EQUAL-TO-POWER** | 16·4 | walt / mod | read power at resolution · fight = both-deal, one-way = only yours · trample/excess → hook · SBA death |
| 15 | **RAMP-FETCH + TUTOR** (unified search) | 31·9 | cindy / mod | destination (bf-tapped/hand/top) + shuffle correct · conditional tutors intervening-if · "up to N" allows fewer |
| 16 | **DRAW-EQUAL-TO-METRIC + DRAW-X + bounce/drain** | 25·10 | cindy / clean | metric read at resolution · modal shares filter · bounce to OWNER's hand · drain symmetric vs each-opp |
| 17 | **GROUP-EVASION / KEYWORD-GRANT / restriction** | 14·6 | walt / hard | granted quoted ability must itself be fully modeled (CREED) · self in/exclude varies · triggers per affected creature |
| 18 | **OPPONENTS-CANT-ACT / cast-tax / hatebears** | 8·3 | cindy / mod | "during your turn" window · tax adds cost not prevents · enter-tapped = replacement on opp permanents · not your own |
| 19 | **MANA-VARIABLE / UNTAP / EXTRA-LAND-DROPS** | 14·6 | cindy / mod | bonus mana ADDITIONAL into pool (CR500.4 empty) · tapped-for-mana reflexive ≠ tapped · stored color persists |
| 20 | **DESTROY/EXILE + MASS-DESTROY + compensate** | 13·6 | cindy / mod | indestructible survives destroy not exile · wipe respects filters · compensation to right controller · exile≠destroy |
| 21 | **DELAYED-TRIGGER + UPKEEP-WIN / threshold** | 16·6 | cindy / mod | delayed fires once then expires · intervening-if checked trigger AND resolution (CR603.4) · win checks twice (premature-win FP) |
| 22 | **CAST-TRIGGER-PAYOFF** (typed/X/Nth/noncreature) | 15·7 | cindy / hard | Nth-per-turn needs per-turn counter (off-by-one over-fire) · typed subtype-aware · "may" = optional not auto |
| 23 | **ACTIVATED-ABILITY bulk** (pump/tap/cost-reduce) | 10·5 | cindy / mod | cost payment gated · sorcery-speed where stated · cost-reducer right abilities only · temp pump EOT |
| 24 | **EXTRA-TRIGGER-EVENT-DOUBLER + MILL-ON-EVENT** | 6·3 | cindy / hard | doubler intercepts at trigger creation, matches event predicate EXACTLY · not own trigger · no infinite loop w/ other doublers |
| 25 | **DAMAGE-MULTIPLIER + PREVENTION/LIFE-LOCK** | 6·6 | walt / mod | once per damage event, controller-ordered · **Wolverine source-scoped not global** · prevention respects "can't be prevented" |

---

## 5. THE 17 TARGETED HOOKS (the hard one-offs — each ~1 card, fully parallel)

> The former "Arbiter tail." Under the 100% mandate every one of these gets a `hooks/<card>.js` module.

| Card | Mechanic | Build approach | Diff |
|---|---|---|---|
| **Wolverine, Best There Is** ⭐ | double-all-damage + regenerate + end-step counter | DAMAGE-MULTIPLIER slice with **source-scoped predicate** + regenerate-shield (wave1) + per-turn dealt-damage flag. **Keystone of the 6% laggard.** | hard |
| **The Wise Mothman** | dual-event rad + milled-cards counter-distribution | hook on RAD subsystem (wave1). Precedent #356 already shipped — finish the mill-distribution half | hard |
| **Syr Konrad** | 3-pronged multi-zone death ping | hook: 3 listeners (dies / enters-yard / leaves-yard) → shared "deal 1 each opp" | hard |
| **Kozilek, Butcher** | from-anywhere→yard shuffle + Annihilator + cast-draw-4 | from-anywhere-to-graveyard listener + Annihilator kw (walt) + cast-draw atom | mod |
| **Smaug** | attack: dmg = Treasures you control, any target | count-to-any-target atom (dynamic magnitude, free target) — also covers Generous Plunderer | mod |
| **Generous Plunderer** | attack dmg = opp artifacts + upkeep treasures + menace | reuse Smaug atom (opp-count variant) + TREASURE-MAKER + menace | mod |
| **Ravenous Tyrannosaurus** | attack dmg=power w/ EXCESS redirect + Devour 3 | excess-damage-to-controller as damage-assignment modifier (reusable for trample-over-lethal) + Devour | hard |
| **Sword of Feast and Famine** | cdmg→discard + untap all your lands + pro-B/G | combat-dmg listener → 2-payload applier; protection via KW-PROTECTION | mod |
| **Sword of Hearth and Home** | cdmg→blink own creature + fetch basic + pro-G/W | blink-own (exile→return-EOT) + RAMP-FETCH atom; protection via slice | mod |
| **Reyav, Master Smith** | enchanted/equipped creature attacks → double strike | attack predicate inspecting attachment registry → grant DS EOT | mod |
| **The Ur-Dragon** | eminence (command-zone) + mass-attack draw + cheat | #353 attack trigger SHIPPED; finish eminence + put-permanent halves on commander-framework | hard |
| **Doubling Cube** | double each type of unspent mana | hook reading floating-mana pool, double in place. Tiny | mod |
| **Sliver Overlord** | gain control of target Sliver indefinitely + tutor | indefinite control-change applier (reassign controller, no duration) + ACT-TUTOR | hard |
| **Asceticism / Crypt Sliver** | regeneration shields | shared REGENERATE-SHIELD subsystem (wave1) — reused by all regenerate granters | hard |
| **Seedborn Muse** | untap-all on each OTHER player's untap step | hook on untap-step emitter → bulk untap applier | mod |
| **Omnath, Locus of Mana** | green doesn't empty + power = unspent green | reuse "mana-doesn't-empty" flag (Kruphix/Horizon Stone precedent in cardEffects.js) scoped green + CDA power | mod |
| **alt-cast cluster (~18)** | airbend/plot/mayhem/cipher/adventure/spree/manifest/phasing/split-second/political | shared mini-subsystems ONCE on cast-substitution module (wave6); per-card hooks then thin | very-hard |

---

## 6. PER-DECK PATH TO 100%

| Deck | Effort | Gated on (general slices + hooks) |
|---|---|---|
| **Zaxara** | medium | ETB-XCOUNTERS · COUNTER-DOUBLER · X-cost · STATIC-PT-X · DRAW-X · Doubling Cube hook |
| **Rograkh/Thrasios** | medium | COUNTER-SPELL · COST-REDUCTION · MANA-ENGINE · COPY-SPELL · CREATURE-TUTOR · Partner framework |
| **Koma** | medium | UPKEEP-TOKENS · each-upkeep framework · CLONE · TOKEN-DOUBLER · DELAYED · Korvold/Hellkite hooks |
| **Vihaan** | medium | TREASURE-MAKER · Treasures-become-creatures · aristocrat-drain · Nth-cast · Torment hook |
| **Captain America** | high | the EQUIPMENT lane (wave4) — statics/dynamic-PT/attach-rider/auto-attach + KW-PROTECTION + the Sword hooks |
| **Omnath** | high | AURA-LAND-MANA · MANA-ENGINE · RAMP-TUTOR · lieutenant-anthem · landfall-watcher · Omnath/Seedborn hooks |
| **Sliver** | high | tribal-lord-pump+shared-ability · typed-evasion · scaling-counters · amass · choose-type · Overlord/regen hooks |
| **Toph** | high | EARTHBEND/ANIMATE subsystem (wave5) · LTB-counter-relocation · group-grant · play-from-top |
| **Pantlaza** | high | ETB-WATCHER · ETB-token · dig-cast-reveal · riot/uncounterable · dragon-free-cast · attack-cast-dig hook |
| **Kellan** | high | ETB-counters · plot/mayhem cast-from-exile · play-from-top · Nth-cast · cascade · plot hooks |
| **Mothman** | very-high | RAD subsystem + framework + rad-proliferate + watcher + Mothman/Struggle/airbend hooks |
| **Wolverine** | very-high | DAMAGE-MULTIPLIER + LTB-counter-relocation + counters-on-attack + keyword-grant + equip + Wolverine hook |

---

## 7. HOW DEX RUNS IT

1. **One ultracode part per wave**, in order (waves 1→7). Wave 1 is the prerequisite — it MUST merge first.
2. Inside a wave: **fan out a builder-agent per slice in an isolated git worktree** (`isolation: 'worktree'`)
   — each implements the matcher + resolver/layer + a test file, runs the **full gate** (`npm test` "Tests N
   passed" + `npm run lint`), returns its branch.
3. **Serial-integrate** the wave (merge one branch → gate → next, resolving conflicts), then **hand to Hans**.
4. **Hans sweeps the wave's flip-set** (the cards it flipped native) for FPs — over-broad matchers, dropped
   riders, the landmines in §4. Any FP → fix before the next wave.
5. **Clyde merges the swept wave to master**, green-lights wave N+1.
6. **Re-measure the realism gate** after each wave (`_hans_realism_gate` / `measure-coverage`) — the 13 decks
   climb toward 100%. **Done = every deck at 100% non-land native, zero Arbiter.**

**Guardrails (CREED):** model the WHOLE card or it stays non-native — no partial flips. A flipped card that
mis-resolves or drops a clause is a forbidden false positive. The targeted-hook predicates must match ~1 card
(verify corpus scope, like #353/#356 matched exactly 1). Replacement-layer slices (doublers, damage-mult)
intercept at the replacement layer, never as post-event triggers.

---

## 8. ⚠️ CRITIC FINDINGS — MUST-FIX BEFORE THE BUILD IS EXECUTABLE

The adversarial critic (high confidence) flagged four things that materially change execution. **Read these
before spinning up Dex.**

### 8.1 — "Parallel waves = zero file overlap" is FALSE (the biggest flaw)
Runtime *appliers* isolate into new modules, but **classification + parsing are central chokepoints every
effect slice touches**:
- `effects/parser.js` — every new clause SHAPE must be taught here.
- `coverage.js` (`classifyCard`, the native-gate) — aggregates parser/triggers/abilities/staticAbilityParser.
- `triggers.js` (`detectTriggers`, ~1140 lines) — the dispatch root every trigger slice must register in.
- `effectAtoms.js` (~1490 lines) — wave 2's "section ownership" split between two builders is a
  **merge-conflict generator, not isolation** (the documented shared-tree hazard).

**FIX — add a WAVE 0 (refactor, serial, before any parallel build):**
1. **Physically split `effectAtoms.js`** into per-family modules (ETB / spell / combat / mana) so wave-2
   builders own *different files*, not sections.
2. **Establish a registration pattern** for the parser/classifier/trigger-dispatch: each slice *registers*
   its handler (a table entry) instead of editing the central dispatch body — so adding a slice doesn't
   collide on `parser.js` / `triggers.js` / `coverage.js`.
3. Until that exists, treat `parser.js` / `coverage.js` / `triggers.js` as a **serialized chokepoint** —
   only ONE builder edits each per wave; the rest register through the new table. The serial integration
   already merges one branch at a time, but **budget for conflict resolution at these four files every wave.**

Also: per project memory (mass-targetType drift trap), a new mass/target shape must be added to 4–5 duplicated
exclusion lists across cast/AI/trigger flow — budget that fan-out; it silently touches "isolated" files.

### 8.2 — 5 ORPHAN cards have NO path yet (zero-Arbiter violation until hooked)
The headline "zero Arbiter" is **aspirational until these get named hooks**:
- **Chain of Vapor** — recursive sac-land→copy-and-retarget ping-pong. Needs a copy-loop hook **+ a defined
  AI loop-termination/resolution policy** (a free-choice ping-pong is NOT deterministic for self-play without it).
- **Invasion of Tarkir // Defiant Thundermaw** — the **Battle/Siege subsystem** (defender assignment, defeat,
  transform) is in zero waves. This is multi-PR framework work, not a one-off — add it as a subsystem.
- **Raul, Trouble Shooter** — "cast from among cards milled THIS TURN" needs milled-this-turn provenance
  tracking + cast-from-graveyard permission. Name it on the wave-6 play-permission registry.
- **Season of the Bold** — repeatable {P}-priced modal granting a nested delayed cast-trigger. The spree
  cluster doesn't cover Phyrexian-mana repeatable modes — its own hook.
- **Jace Reawakened** — a planeswalker (−6 spell-copy + plot). The **PW loyalty framework is Walt's separate
  lane**, in none of these waves. **Cross-reference it to Walt explicitly — do not silently drop it.**

### 8.3 — Every "route to Arbiter" landmine remedy is now a HARD DEPENDENCY, not a deferral
Several FP-landmine lists say "route the rider to the Arbiter" (Bloatfly rad-replacement, Feral Ghoul,
Reyav, Morophon cost-reduction, CLONE PW-copy). Under the zero-tail directive **that's forbidden** — rewrite
each as **"block the slice until the rider's subsystem lands."** The landmine correctly identifies the trap;
the prescribed remedy (defer) is the very thing the directive bans.

### 8.4 — CLONE / PW-copy is the highest false-native risk (forbidden FP)
`CLONE-ENTER-AS-COPY` (rank 5) folds in copying a **planeswalker** (Spark Double). The critic warns this is
the slice most likely to ship a shallow name/PT shim that **falsely marks cards native** — the worst CREED
failure. **Confirm a real CR-707 copy path (incl. PW-as-copy-target) exists before this slice claims any card
native.** Hans will scrutinize this slice's flip-set hardest.

### 8.5 — Wolverine is 3 interlocking subsystems, not one hook
Source-scoped DAMAGE-MULTIPLIER replacement **+** regenerate shield **+** the end-step counter reading a
per-turn dealt-damage flag. Sound and deterministic, but **do not let a builder mark Wolverine native off the
replacement alone** (CREED all-or-nothing). Same for Sliver Overlord (indefinite control = a real
control-change primitive, not a thin applier) and The Ur-Dragon eminence (command-zone-aware static, touches
the fragile commander framework).

> **Net (critic verdict, high confidence):** unusually FP-literate decomposition, ~55/65 hard cards pathed,
> doubler-before-consumers correctly sequenced — but **not yet literally zero-Arbiter**. Before treating this
> as executable: name the 5 orphan hooks, rewrite every "route to Arbiter" rider as a hard dependency, confirm
> the CR-707 PW-copy path, and add **WAVE 0** (split effectAtoms.js + a parser/classifier registration/
> serialization rule). With those, it's a green build.

---

*Generated by Hans via ultracode workflow (decompose → synthesize → critic), 2026-06-21. 537 cards · 25 general
slices · 17 targeted hooks · 7 waves + a wave-0 refactor. Synthesis + per-bucket decompositions + full critic
archived in the workflow transcript.*


---

## Appendix - Clyde integration review (cycle 53)

**Verdict: YELLOW — start Dex AFTER the must-fixes below.** The diagnosis in §8 is accurate and well-grounded (chokepoints, orphans, CR-707 copy-path, Wolverine all-or-nothing all check out), but two structural gaps block a clean WAVE-0 start: WAVE-0 is not actually built, and the slice/hook set under-scopes ~36 cards of whole mechanics so the 537 headline does not partition into a provable literal-100%-native path.

### Verified-clean (grounding confirmed real)
- All four 8.1 chokepoint files exist at the implied roles/sizes: `coverage.js` 473, `triggers.js` 1141 (≈"~1140"), `effects/parser.js` 2035, `effectAtoms.js` 1494 (≈"~1490"); the filename `effects/parser.js` is literally correct. The "parallel = zero conflict" premise IS false — by git churn `parser.js`(87)/`effectAtoms.js`(69)/`triggers.js`(39)/`coverage.js`(34) are the hottest shared files, and the effectAtoms single frozen `ATOM_RESOLVERS` object literal is a genuine merge-conflict generator. A category-split is technically sound (importers consume the aggregate `ATOM_RESOLVERS`/`KNOWN_ATOM_OPS = Object.keys(...)`; leaf-only imports, no circular dep).
- All 14 spotlight cards AND all 5 §8.2 orphans are REAL and present in the live engine-loaded lists (`app/data/profiles/*/decks.local.json`). Mechanic descriptions match verbatim oracle for Smaug, Sliver Overlord, Chain of Vapor, Seedborn Muse, Season of the Bold, Omnath, Crypt Sliver, Goldvein Hydra.
- CR `707.2` (copy = printed values, names loyalty → PW-copy is a real CR-707 path) and `603.4` (intervening-if) are correctly grounded.
- Worktree-per-slice isolation + per-worktree `app/node_modules` is correctly implemented (no shared-tree cross-contamination).

### Grounding fixes (confirmed errors → correction)
- **CR 614.1f / 614.1g are FABRICATED.** `cr_current.json` 614.1 series tops at **614.1e** (verified by enumerating keys). Correct citation: **614.1c** ("enters with…"/"enters tapped" replacement effect) + **603.6d** (classifies both as a static ability) + **122.6a** (counter placement). The doc itself is clean (0 hits); the fabrication lives in ~9 codebase files (CHANGELOG.md, docs/orchestration/STATUS.md, fp-watch.md, `app/src/lib/learn/{actionDispatcher,coverage,resolvers,staticAbilityParser}.js` + 2 tests, 12 occurrences). **Hans: sweep + correct to 614.1c.**
- **CR 500.4 mis-applied** (slice-19, mana-pool "empty"). Both 500.4 and 500.5 exist; emptying is **500.5** ("any unspent mana left in a player's mana pool empties") / 703.4q / 106.4. 500.4 is the step-BEGINS expiry rule. → cite 500.5.
- **Arithmetic does not close.** 25 slice rows sum to 467 (not "~480"); 17 hook rows represent >17 cards (alt-cast cluster ~18); 467 + ~34 ≈ 501 leaves ~36 cards unaccounted vs 537, plus 5 admitted orphans with no path. The shortfall is exactly the missed mechanics below.
- **Missed whole mechanics (0 doc hits each):** `choose a creature type` (gates 9+ Sliver cards — the deck rated HIGHEST native cannot reach 100% without it), `convoke`/`affinity`/`improvise`, `bestow`/`eternalize`/`embalm`/`warp`/`adapt`/`ravenous`-kw/`myriad`/`afflict`, one-shot `double the number of +1/+1 counters` (Kalonian/Primordial/Mossborn/Voracious — distinct from slice-6 replacement doublers).
- **Slice-12 "de-reg at LTB" is un-buildable** — engine has no leaves-the-battlefield event (triggers.js:301-307 deliberately refuses one; a half LTB hook = FP). Use the seam-plan MUST-FIX 1 synthesize-on-read battlefield scan instead.
- Minor: §6 Doubling Cube is in the **Omnath** deck, not Zaxara; slice-1 "Goldvein enters TAPPED" is wrong (Hydra has haste; its death-trigger Treasures enter tapped); §5 Omnath pointer is stale (CDA +1/+1-per-green moved to `layers.js` STATIC_REGISTRY layer-7c; `cardEffects.js` now owns only mana-emptying) and it's a +1/+1-per-green buff, not a power-setting CDA.

### Must-fix before Dex starts
1. **Land a REAL WAVE-0 as a standalone serial PR.** `feat/WAVE0-effectatoms-split-dex` has an EMPTY diff vs origin/master and no per-family modules exist under `effects/`. Deliver BOTH the physical effectAtoms split (partial tables merged into one `ATOM_RESOLVERS`, preserving `KNOWN_ATOM_OPS`) AND a registration table for the dispatch BODIES in `parser.parseExtendedAtom`/`parseClauseToAtom`, `triggers.classifyCondition`, `coverage.classifyCard`. Do not green-light wave 1 off the current branch.
2. **Extend the WAVE-0 chokepoint set** to include `actionDispatcher.js` (40 commits) + `legalChoices.js` (37) + `staticAbilityParser.js` (wave-2 → wave-0), and a registration seam for new targetTypes (collapses the 4-5 exclusion-list drift fan-out to one set-membership edit).
3. **Fix CR citations** (Hans): 614.1f/g → 614.1c (+603.6d, 122.6a) across the ~9 files; slice-19 500.4 → 500.5.
4. **Re-decompose the ~36 unassigned cards + 5 orphans** into named slices/hooks/subsystems (choose-type, cost-by-count, alt-cast/keyword cluster, one-shot counter-double) so the headline sums to 537.
5. **Reconcile the damage slice** (see seam-plan outcome below).
6. **Rewrite slice-12** to synthesize-on-read (drop "de-reg at LTB").

### Seam-plan reconciliation outcome
`damage-replacement-seam-plan.md` is **AUTHORITATIVE for the damage slice** (carries the 4 MUST-FIX corrections + 10 FP guards + CR backing + test plan). The two docs are mechanically aligned (both place a CONSULT at the replacement layer BEFORE loseLife/markCombatDamage/adjustLoyalty; neither hooks loseLife; both enforce Wolverine 3-clause all-or-nothing). Fixes: (a) **naming drift** — brief line 88 says `damageReplacement.js` (singular); seam-plan says `damageReplacements.js` (plural, with full path/API/test) → adopt the plural; neither file exists yet. (b) Brief has **no cross-reference** to the seam-plan → add an explicit "damage slice = see damage-replacement-seam-plan.md (authoritative sub-spec)" pointer. (c) **CREED landmine** — brief's "source-scoped not global" (lines 136/146) is the source-only filter MUST-FIX 2 forbids as a slice-wide rule; the reusable layer must support BOTH source-side and target-side/affected-player predicates, with Wolverine's scope registered from verified bundled-Scryfall oracle, not memory. (d) PR-scope: brief bundles DAMAGE-PREVENTION/LIFE-LOCK into the slice; seam-plan stages prevention as future work through the same 616-ordered helper — reconcile PR1 scope.

### Integration-flow confirmation
The cadence (Dex ultracode waves → Hans per-wave QA-sweep → fix FP → Clyde ff-only **per-slice** serial-merge → green-light next) works: per-WAVE QA is the right gate; the merge sub-step stays per-slice-serial; worktree isolation is sound. **WAVE-0 is correctly a HARD GATE and must land before any parallel wave-1 agent is spawned.** Biggest residual risk: Walt/Cindy general-corpus slices edit the IDENTICAL chokepoint files with no lane-ownership rule — define a merge-window policy (freeze general-corpus merges while a Dex wave is open, or rebase them only at wave boundaries) and serialize all master-advancing merges through Clyde's one ff-only queue. Op note: local master ref is 31 commits stale (c11e39a vs origin/master 7537a21) — always compute ff against origin/master.
---

## Appendix B — Re-decomposition: closing the gap to 537-native (cycle 56)

Closes must-fix #4 from the cycle-53 Clyde review: the 25 slices (~467 cards) + 17 hooks left ~36 cards of whole mechanics + 5 orphans with no named path, so the 537 headline didn't provably partition. Each missed mechanic + orphan below is grounded against the actual 13-deck oracle text (`memory/deck_*.md`), with a named slice/hook, builder lane, CR ref verified against `cr_current.json`, count, and the FP landmines the QA sweep must check (CREED all-or-nothing). **Partial deck files:** Omnath (~42/100 walked) + Joe's 7 are partial hand-snapshots — counts are FLOORS; re-fetch live before final scoping.

### Cluster 1 — CHOOSE-A-CREATURE-TYPE (`CHOOSE-TYPE-PERSIST`)
In-deck: Banner of Kinship (Sliver+Ur-Dragon), Door of Destinies (Sliver+Pantlaza), Patchwork Banner, Kindred Discovery, Secluded Courtyard/Unclaimed Territory (Sliver+Pantlaza), For the Ancestors / Harmonized Crescendo / Distant Melody (spell-level), Morophon (Ur-Dragon). **~10 cards.**
Subsystem: a "choose a subtype" action whose result is **stored as durable state on the permanent** + read by later "of the chosen type" static/trigger/mana clauses. **Lane:** Cindy general state-primitive → composes with WAVE-2 anthem/cost-reduction; **must land in WAVE-2** (prerequisite for the highest-native Sliver deck). **CR:** 205.3e (choose-subtype) · 614.1c+603.6d (Banner enters-with) · 122.6a. **FP landmines:** chosen type must PERSIST (not re-prompt each read) + serialize; changeling counts as the chosen type (subtype-aware test); Banner's ETB count vs dynamic +1/+1 are two reads; Door's charge counter is a cast-trigger (distinct); self-scope only.

### Cluster 2 — COST-BY-COUNT (`COST-REDUCE-BY-COUNT`: convoke/affinity/improvise)
In-deck: convoke — Harmonized Crescendo (Sliver), Chord of Calling (Rograkh); affinity — Thrumming Hivepool "for Slivers" (Sliver), Junk Winder "for tokens" (Koma); improvise — none in the 13 (general-corpus, build in same file). **~4 in-deck.**
**Lane:** Cindy general, cast/cost-payment path. **CR:** 702.51a (convoke) · 702.41a (affinity) · 702.126a (improvise). **FP landmines:** convoke pays colored by tapping a creature of that color, generic by any; tapping is a cost (taps sick creatures); affinity reduces GENERIC only (never below colored floor), counts tokens + self; improvise taps artifacts for generic; computed at announce-cost, not a static (don't double-apply with X).

### Cluster 3 — ALT-CAST / KEYWORD CLUSTER
In-deck: bestow — Nyxborn Hydra (Zaxara), Springheart Nantuko (Rograkh); eternalize — Fanatic of Rhonas (Zaxara); adapt — Incubation Druid (Zaxara); myriad — Auton Soldier (Koma); afflict — Lazotep Sliver, Cyberman Patrol (Vihaan); ravenous — Aberrant Tervigon (Zaxara); warp — Exalted Sunborn (Vihaan), Starwinder (Koma); embalm — none in 13 (general). **~11 in-deck.**
Named slices (grouped so WAVE-0 registration absorbs them): **`KW-ALT-CAST`** (bestow/eternalize/embalm/warp → WAVE-6 cast-substitution; CR 702.103a/702.129a/702.128a; **warp has NO CR keyword — model from bundled oracle reminder text, never a fabricated 702.x**); **`KW-COMBAT-RIDER`** (afflict/myriad → combatTriggers.js; CR 702.130a/702.116a); **`KW-ADAPT`+`KW-RAVENOUS`** (→ Walt counters lane; CR 701.46a/702.156a). **FP landmines:** bestow is an Aura spell that becomes a creature (modeling only the creature half = partial-flip FP); adapt does nothing if a +1/+1 counter already present; myriad tokens are tapped+attacking+exiled-EOT, one per OTHER opponent (cleanup-leak FP); ravenous is enters-with-X + X≥5 draw (route counters through the WAVE-3 doubler pipeline); afflict fires on becoming-blocked not damage; warp must exile at next end step + grant later cast (half-build = FP).

### Cluster 4 — ONE-SHOT COUNTER-DOUBLE (`COUNTER-DOUBLE-ONESHOT`)
In-deck (all Zaxara; Mossborn shared w/ Toph): Kalonian Hydra (attack, each creature you control), Primordial Hydra (upkeep, self), Mossborn Hydra (landfall, self), Voracious Hydra (ETB modal, self OR fight). **4 cards.**
Distinct from WAVE-3's `COUNTER-AND-TOKEN-DOUBLER-REPLACEMENT` (continuous replacement). **Lane:** Walt counters.js resolver (NOT the replacement layer); **must land AFTER WAVE-3** (the added counters pass through Doubling-Season → ×4 net). **CR:** 122.1/122.1a (counter math) · 614.1 (Doubling-Season interaction). **FP landmines:** read count at resolution + actually place counters (a "×2 P/T" shim is a false-native — breaks remove-counter + the doubler interaction); Kalonian is MASS (each creature you control), the other 3 are SELF — wiring mass-as-self is the mass-targetType drift trap; Voracious is modal (both modes native or non-native).

### Cluster 5 — THE 5 ORPHANS (per-card disposition)
1. **Chain of Vapor** (Rograkh) — bounce + recursive sac-land→copy-and-retarget. **→ RESIDUAL / NEEDS-COLTON:** the bounce is buildable (`hooks/chain-of-vapor.js` on the WAVE-5 copy-a-spell engine, CR 707.10), but the recursive copy ping-pong is **non-deterministic** for self-play without an explicit AI loop-termination policy. The ONE card in the 13 whose native path is gated on a product decision, not engineering. Flag for sign-off; do NOT ship a bounce-only partial flip.
2. **Invasion of Tarkir // Defiant Thundermaw** (Ur-Dragon) + **Invasion of Ikoria // Zilortha** (Rograkh) — **reclassified orphan → `BATTLE-SIEGE-SUBSYSTEM` (WAVE-1 framework, multi-PR).** Gates 2 decks, so framework-sized not hook-sized. CR 310.1/310.4/310.5/310.6/310.11/310.11b. New battle zone + defender assignment + defeat→transform-and-cast; FP: defending-opponent assignment, defeat fires once, transformed-cast permission.
3. **Raul, Trouble Shooter** (Mothman) — "cast from among cards milled this turn" → `hooks/raul.js` + a `milledThisTurn` provenance flag + cast-from-GY permission (WAVE-6 registry). FP: provenance resets each turn, permission revokes EOT.
4. **Season of the Bold** (Vihaan) — repeatable {P}-priced modal w/ a nested delayed cast-trigger → `hooks/season-of-the-bold.js` (the spree cluster doesn't cover Phyrexian-mana repeatable modes). CR 700.2. FP: the {P}{P}{P} delayed cast-damage rider must expire (end of next turn); Treasures enter tapped.
5. **Jace Reawakened** (Kellan) — planeswalker (−6 spell-copy + plot). **Hard cross-lane dependency on Walt's PW loyalty framework** (in NONE of Dex's 7 waves; CR 606 series) + plot (WAVE-6 cast-substitution). Do NOT silently drop — Kellan can't hit 100% until both land.

### Residual / needs-Colton
- **Chain of Vapor** — needs an explicit AI loop-termination rule (only card blocked on a product decision). The single card gating literal-100% until signed off.
- **Warp** — no CR keyword; model from bundled reminder text (grounding note, not a blocker).
- **Battle/Siege** — re-budget as a WAVE-1 framework subsystem (gates Ur-Dragon + Rograkh), not a hook.

**Partition check:** ~10 (choose-type) + ~4 (cost-by-count) + ~11 (alt-cast) + 4 (counter-double) ≈ 29, + the 5 orphans (Battle = 2 cards) ≈ ~35 → absorbs the cycle-53 "~36 unaccounted" shortfall. The 537 now partitions into named slices/hooks/subsystems, with **one** card (Chain of Vapor) escalated to Colton.

_Drafted cycle 56 (Clyde, via a grounded foreground analysis agent). Counts are floors (partial deck files). CR refs verified by text in `cr_current.json` (incl. re-confirming 614.1 tops at 614.1e)._
