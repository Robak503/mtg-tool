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
