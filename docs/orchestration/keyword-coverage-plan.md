# Keyword Coverage Master Plan — all 189 CR 702.x keyword abilities

> **Hans (scout) owns this.** Originally "a plan to cover them all so the builder is always busy." This maps
> **every** CR 702.x keyword ability to its corpus frequency, current engine status, mechanic family, and the
> task that covers it — ordered into **waves** so the builder lane never runs dry. Companion to
> [`task-board.md`](task-board.md) (the live pull-queue) and [`scout-gap-report.md`](../scout-gap-report.md).
>
> **⚠️ OWNERSHIP (2026-06-18 re-carve, Colton):** this whole backlog is **WALT's lane now** (Waves B–G), not
> Cindy's. **Cindy** keeps the disjoint non-keyword work — the Commander framework + the **general** trigger-effect
> compiler + clean spell atoms. **Cindy owns the trigger-compiler CORE; Walt's Wave-B keyword-triggers adapt off
> it.** Full carve + the 3 shared-subsystem watch-points: the **LANE ASSIGNMENT** section of `task-board.md`.
>
> **Data:** corpus frequency from the bundled Scryfall `keywords` field over 33,540 real cards (Hans cycle-8
> scan). `gap` = cards carrying the keyword that are **not yet native** (the opportunity). Note a high gap on an
> **already-enforced** keyword (Flying 2667, Trample 878) is NOT keyword work — it's the *other* text on those
> cards (the trigger-compiler grind). Keyword opportunity = the gap on **unmodeled** keywords.

## The three rules of this plan

1. **ENFORCE, DON'T DROP (Colton's standing policy).** A keyword counts native ONLY when the runtime actually
   enforces its rule (CR-cited). A matcher with no working resolution is a false positive — see how the cycle-1
   blanket-drop got reverted into the EVADE/KW-UNTARGET/PROWESS *enforcement* run. Every row below is engine-first.
2. **Build-time CR verification is MANDATORY** (the Walt precedent). The mechanic sketches here are the standard
   rules, but Cindy verifies each against bundled `knowledge/mtg-judge/data/cr/cr_current.json` 702.x + `rulings.json`
   before coding — never from memory. Shipped engine stays 100% local.
3. **Honest ceiling.** Not all 189 become native. ~30 are genuinely irreducible (deckbuilding-only, hidden-info,
   un-set, random) and stay on the Arbiter forever — Wave H. We cover the **tractable** ~140, family by family.

## Status snapshot (cycle-8)
- **✅ ENFORCED (the body plays correctly):** deathtouch · double strike · first strike · flying · reach · trample ·
  vigilance · lifelink · indestructible · haste · defender · flash · menace · skulk · fear · intimidate ·
  horsemanship · landwalk · unblockable/can't-block (EVADE) · hexproof · shroud (KW-UNTARGET) · prowess
  (TRIG-PROWESS) · changeling · devoid. **(9 of the original 11 keyword-FPs enforced; ward + protection left.)**
- **⏳ INTERIM-FP (claimed, enforcement pending):** ward (195 gap) · protection (124 gap).
- **The rest:** unmodeled → the waves below.

---

## WAVE B — Triggered-keyword family (Walt's adapters on Cindy's compiler core) — **wait for the core**

Each is a keyword whose whole behavior is **one triggered ability** whose effect is an already-modeled atom. Reuse
the trigger compiler (TRIG-PUMP #238 → TRIG-TREASURE #264 → IT-COUNTER/FOR-EACH precedent): recognize the event,
bind self/it, compile the effectClause. **Highest tractability, lowest risk, large total.** One keyword = one PR.
**⚠️ Ownership:** these are **Walt's** keyword-trigger ADAPTERS, but the compiler **core** is **Cindy's** — Walt
starts the non-trigger waves (C/D/E) first and picks up Wave B once Cindy's core is solid (avoids two builders
editing the compiler seam at once). The keyword-trigger work is mechanical adapter wiring on a stable core.

| Task | Keywords (CR) | gap | Mechanic (verify CR at build) | Cplx |
|---|---|---:|---|---|
| **TRIG-ATTACK-PUMP** | Exalted 33 · Battle cry 15 · Mentor 21 · Melee 11 · Training 11 · Dethrone 8 · Bushido 38 · Flanking 30 · Rampage 15 · Frenzy 1 | ~180 | "Whenever ~ attacks/blocks/is attacked, pump (a creature)" → temp-pump / +1/+1 counter atom (reuse TRIG-PUMP). Each keyword = its own attack/block trigger shape. | low-med |
| **TRIG-ETB-VALUE** | Bloodthirst 23 · Evolve 21 · Fabricate 16 · Riot 13 · Tribute 11 · Devour 23 · Annihilator 13 · Backup 26 · Unleash 14 · Soulbond 25 | ~180 | "When ~ enters, [counters / token / sacrifice-for-counters / choice]" → existing ETB atoms + (for choice keywords) the modal/pending-choice gate. | med |
| **TRIG-CAST-VALUE** | Extort 17 · Cascade 37 · Storm 39 · Gravestorm 3 · Replicate 20 (also Wave C) | ~110 | "Whenever you cast ~ / a spell, [drain / copy / free-cast]". Extort+drain is ripe; cascade/storm are stack-recursion (flag harder). | med-sub |
| **TRIG-DIES-RETURN** | Persist 25 · Undying 24 · Modular 23 | ~70 | "When ~ dies, return it with a −1/−1 (persist) / +1/+1 (undying) counter" / move counters (modular). A dies-trigger + a counter-aware re-enter (a small replacement). | med |
| **TRIG-COMBAT-DMG** | Renown 19 · Afflict 10 · Exalted-combat · Poisonous→Toxic | ~40 | "Whenever ~ deals combat damage, [counter+renowned flag / defender loses life]". Reuses the #264 combat-damage-to-player event. | low-med |
| **TRIG-LIFEGAIN / DRAW2** | (already boarded cycle-7) | ~28 | the "whenever you gain life" / "draw your 2nd card" event hooks. | med |

**Wave-B landmine:** the keyword often rides ON a card with OTHER text — count only the cards where the keyword's
trigger is the SOLE unmodeled piece (the verify-ripeness pass from cycle-7). Choice keywords (fabricate/riot/tribute)
need the pending-choice gate — don't silently pick a mode.

## WAVE C — Cost / alternative-cost keywords (the CAST-PATH subsystem) — **the biggest single lever (~1,500)**

These modify HOW a card is cast (alt cost, additional cost, cost reduction, or cast-from-graveyard). The cast path
doesn't parse these yet (γ did *activated*-ability costs; ADDCOST did *spell additional* costs partially). This is a
real subsystem — build the cast-cost parser ONCE, then each keyword is a thin adapter. **engine-first** (the
alt-cost must actually be payable + the effect resolve, or it's an FP).

| Task | Keywords (CR) | gap | Mechanic | Cplx |
|---|---|---:|---|---|
| **KW-CYCLING** | Cycling 328 (+ typecycling) | 328 | "{cost}, Discard this card: Draw a card" — an activated ability **from hand** (+ landcycling/typecycling search variants). Huge, mostly self-contained. | med |
| **KW-KICKER** | Kicker 236 · Multikicker | 236 | optional additional cost on cast → an extra clause. Needs the "was it kicked?" flag threaded to resolution. | sub |
| **KW-FLASHBACK** | Flashback 208 · Jump-start 13 · Retrace 18 · Aftermath 27 · Disturb 32 · Embalm 15 · Eternalize 11 · Encore 26 · Escape 32 · Unearth 57 · Scavenge 14 · Recover (done-ish) | ~450 | cast/activate **from the graveyard** for an alt cost (then exile). One graveyard-recast engine → all these adapt. | sub |
| **KW-CONVOKE** | Convoke 96 · Improvise 22 · Delve 30 · Affinity 76 · Assist 17 | ~240 | cost **reduction / alt-payment** (tap creatures / exile gy / pay per artifact). A cost-modifier layer. | sub |
| **KW-MADNESS** | Madness 62 · Foretell 44 · Plot 39 · Suspend 60 · Impending 6 | ~210 | cast at an **alternative time** for an alt cost (on discard / from exile with counters). Needs the exile-with-state + the cast-window hook. | sub |
| **KW-ALT-MISC** | Buyback 37 · Evoke 37 · Dash 22 · Surge 11 · Prowl 10 · Entwine 33 · Splice 22 · Fuse 22 · Spree 21 · Overload 28 · Bargain 21 · Gift 26 · Freerunning 12 · Craft 20 · Offering 6 · Demonstrate 7 · Blitz 19 · Ninjutsu 44 · Transmute 13 | ~430 | the long tail of alt/additional-cost casts — each a thin adapter once the cast-cost subsystem exists. | med each |

**Wave-C landmine:** an alt-cost card is a **false positive** if the engine flips it native but can't actually pay the
alt cost or apply the kicked/overloaded effect. Build the cost subsystem + ONE keyword end-to-end first
(KW-CYCLING is the cleanest pilot — from-hand activated, no cast-path surgery), prove it, then fan out.

## WAVE D — Static / poison / evasion keywords

| Task | Keywords | gap | Mechanic | Cplx |
|---|---|---:|---|---|
| **EVADE-2 (shadow)** | Shadow 37 | 37 | evasion — can block/be blocked ONLY by shadow. One more `combatEvasion.canBlockAttacker` branch (the EVADE chokepoint already exists). **Ripe.** | low |
| **KW-POISON** | Infect 45 · Wither 27 · Toxic 44 | ~115 | combat/effect damage dealt as −1/−1 counters (infect/wither) + poison counters (infect/toxic). A damage-replacement + a poison-counter track + the 10-poison loss SBA (CR 704.5c). engine-first. | sub |
| **KW-WARD / PROTECTION** | Ward 195 · Protection 124 | 319 | the last 2 interim-FP keyword-FPs. Ward = a targeting TAX (counter unless pay); protection = DEBT (the damage/block halves still unenforced). See `retired-fp-ledger.md`. | med / sub |

## WAVE E — Aura / Equipment extensions (subsystems partly built)

| Task | Keywords | gap | Mechanic | Cplx |
|---|---|---:|---|---|
| **AURA-GRIND** | Enchant 1217 · Bestow 43 · Aura Swap 1 · Totem armor/Umbra (0 by name) | ~1260 | extend the existing aura engine (`isNativeAura`) to the unmodeled enchanted-permanent grants. Most of the 1217 gap is the *granted ability*, not "enchant" itself — overlaps the trigger/static atoms. | sub |
| **EQUIP-GRIND** | Equip 526 · Reconfigure 20 · Living weapon 19 · Fortify 2 · For Mirrodin! 15 | ~580 | extend the equipment engine (ETB-EQUIP-ATTACH #252) to the unmodeled equipped-creature grants + the variant attach rules. | sub |

## WAVE F — Replacement-effect / counter subsystems (pairs with PREVENT/regenerate)

Graft 12 · Sunburst 15 · Amplify 9 · Fading 18 · Vanishing 20 · (Modular/Persist/Undying → Wave B). Build the
replacement-shield machinery once (also unlocks regenerate + PREVENT from the δ backlog). Cplx: **sub**.

## WAVE G — Complex / newer subsystems (deferred — longer builds, real gameplay value)

Morph 150 · Disguise 47 (face-down casting) · Crew 174 (Vehicles) · Mutate 34 · Level Up 24 · Daybound/Nightbound
35/34 · Cumulative upkeep 79 · Echo 52 · Phasing 12 · Station 35 · Warp 37 · Max speed/Start your engines! 41/51
(speed) · Exhaust 39 · Mayhem 12 · Living metal 13 · More Than Meets the Eye 15 · Web-slinging 9 · Firebending 26 ·
Prototype 21 · Outlast 13 · Boast 18. Each is its own subsystem; greenlight by gameplay value (Crew/Morph high —
they actually play in real decks; the un-set/speed mechanics lower).

## WAVE C-MD — Commander framework (GAMEPLAY-CRITICAL, hard-coded — NOT the tail) ⭐

> **Re-categorized OUT of the irreducible tail (Colton, 2026-06-18):** the Academy *plays Commander* — so the
> command-zone framework is gameplay-critical, exactly like the planeswalker subsystem. **Partner is huge in EDH**
> (two-commander decks are everywhere). These are **hard-coded engine work**, not Arbiter-tail. Coverage-% is the
> wrong yardstick (same as PW); the yardstick is "can the Academy play a real Commander game."
>
> **What exists:** the command zone is already a multi-commander **array** (`gameState.createPlayerState` →
> `command: [...commanderCards]`), `commanderDamageFrom` per-player, 40 life, 4P FFA. **What's missing (the finding):**
> casting a commander FROM the command zone + the {2}-per-prior-cast tax + return-to-zone on death is **unmodeled**
> (no such action in `actionDispatcher`/`legalChoices`) — so today a Commander game can't actually cast its commander.

| Task | Keywords / scope | gap | Mechanic (CR-verify at build) | Cplx |
|---|---|---:|---|---|
| **CMD-CAST** ⭐ | (commander framework base — not a 702.x keyword) | all EDH | Cast a commander from the command zone; {2} tax per prior cast (CR 903.8); it returns to the command zone instead of graveyard/exile if its owner chooses (903.9). The gameplay-critical base every Commander game needs. | sub |
| **CMD-PARTNER** | Partner 702.124 (+ Partner with, Friends forever, Backgrounds, Doctor's companion) | 143 | recognize partner → put BOTH commanders in the zone at game start; each castable with its OWN tax; commander damage tracked per-commander. Builds on CMD-CAST. | sub |
| **CMD-COMPANION** | Companion 702.139 | 12 | the companion zone + the {3}: put it into hand once per game (CR 702.139f), gated by the deck-restriction. | med |

## WAVE H — Irreducible / low-value (Arbiter forever or skip — DON'T chase)

- **Deckbuilding-only (no single-card runtime effect):** Undaunted 5 (cost reduction by opponent count — minor) ·
  the deck-legality halves of partner/companion are handled by CMD-* above; only the pure rules-shell stays here.
- **Hidden-info / voting / un-set:** Hidden agenda 0 · Conspire 11 · Hideaway 9 (partial) · Demonstrate 7 ·
  Space sculptor 0 · Visit 0 · Absorb 0.
- **Random / stack-exotic / one-offs:** Epic 5 · Ripple 5 · Tiered 7 · Compleated 7 · Solved 15 · Ravenous 12 ·
  Job select 19 · Banding 26 (CR-nightmare, near-zero modern play) · Champion 12 · Soulshift 26 · Haunt 10 ·
  Forecast 12 · Miracle 19 (timing/hidden) · Spectacle 11 · Ascend 28 · Cleave 12 · Cipher 15 · Awaken 15 ·
  Emerge 15 · Escalate 9 · Myriad 23 · Provoke 9 · Dredge 14 · Read ahead 10 · Harmonize 12 (partial) ·
  Mobilize 16 · Enlist 15 · Squad 15 · Saddle 33.
  *(Several of these are tractable later as trigger-compiler tails; listed here as LOW priority, not permanent
  write-offs unless truly hidden/random.)*

---

## ⭐ GAMEPLAY track FIRST — the commander framework (GREENLIT, Cindy's #1)

**CMD-CAST is a "does a real game play" gate, not a coverage-% row** — the Academy plays Commander, yet a
commander can't be cast from the command zone today. **GREENLIT (Colton, 2026-06-18): CMD-CAST ✅ DONE #273.
Cindy continues — CMD-PARTNER → CMD-COMPANION — then the GENERAL (non-keyword) trigger-effect compiler + clean
atoms** (the keyword waves below are **Walt's** now, not Cindy's). Concrete 3-PR spec:
[`commander-framework-build-plan.md`](commander-framework-build-plan.md). Partner is huge in EDH; gameplay-quality,
hard-coded, measured by "can the Academy play a partner deck," not corpus %.

## The order WALT pulls (the keyword waves) — coverage-%, enforce-first

> Walt starts on the no-compiler-dependency waves; the trigger waves (B) wait until **Cindy's compiler core** is
> solid (the one shared-subsystem handoff — see `task-board.md` LANE ASSIGNMENT watch-points).

1. **EVADE-2 (shadow)** — low, ripe, the chokepoint exists, no compiler dep. ~37.
2. **KW-CYCLING** — the clean cast-cost pilot (from-hand activated, no cast-path surgery), no compiler dep. 328.
3. **TRIG-ATTACK-PUMP** — exalted/battle cry/mentor/melee/training (Wave B; **after Cindy's compiler core**). ~180.
4. **TRIG-ETB-VALUE** — bloodthirst/evolve/fabricate/devour (existing ETB atoms + choice gate). ~180.
5. **TRIG-DIES-RETURN** — persist/undying/modular. ~70.
6. **KW-POISON** — infect/wither/toxic (engine-first poison track). ~115.
7. **KW-WARD + PROTECTION** — close the last 2 interim-FP keywords. ~319.
8. **KW-KICKER → the cast-path subsystem** — the biggest lever; build the cost engine, then fan out Wave C. ~1,500
   (coordinate the cast-path seam with Cindy's command-zone cast work — watch-point #2).

This is **months** of ordered, enforce-first work — Walt never idles. Hans re-verifies ripeness + reconciles DONE
each cycle; the board carries the live top rows.
