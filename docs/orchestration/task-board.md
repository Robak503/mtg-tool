# Coverage Task Board — the prioritized backlog the builder faculties pull from

**Model:** builders **pull from this board** rather than owning a fixed mechanic — pick the highest-priority
`OPEN` task you're suited for, develop your own working knowledge, never idle. **Hans (scout) maintains +
re-prioritizes this board** as the modeled set grows; **Rod (QA) and Omnath file findings here as new
tasks.** Omnath (Command) merges; only Omnath touches `master`.

> **Last scout refresh:** cycle **board-3 (DEEP SCAN)**, 2026-06-18 — live baseline **16.0 % corpus native**
> (5,369/33,540). A one-off deep scan mapped the WHOLE climb 16 %→~90 % and pre-stocked a ranked backlog
> (10+ hrs for 3 builders). Honest yields below are **adversarially CREED-verified** (most first-pass numbers
> were corrected DOWN — that's the gate working). **The strategic map + every row's full false-positive
> landmine live in [`docs/scout-gap-report.md`](../scout-gap-report.md) — read your row's landmine before you build.**
>
> **The shape of the climb:** the clean-atom + rider tiers are nearly mined out (~a few hundred cards, good
> builder fuel). The climb from ~20 %→~85 % is ONE subsystem — the **trigger-effect compiler** (bridge each
> recognized trigger's effect clause into the modeled atom library; ~5,267 trigger cards). **TRIG-PUMP-1 is
> its safe pilot.** The irreducible Arbiter tail caps the honest ceiling at **~88-92 %**.

## How to claim a task (collision-safe)

1. Pick the highest-priority **`OPEN`** task that fits you (mix: a fast clean atom, or a subsystem for a longer run).
2. **Claim by pushing your branch — put YOUR FACULTY NAME as the suffix** (so the dashboard attributes it): `git fetch origin && git checkout -B feat/<task-id>-<name> origin/master && git commit --allow-empty -m "claim <task-id> (<name>)" && git push -u origin feat/<task-id>-<name>` (e.g. `feat/REG-1-cindy`).
3. **Check it's free first:** `git ls-remote --heads origin "feat/<task-id>-*"` — branch exists = taken; take the next.
4. Tell Colton "claiming `<task-id>`". Build it (full gate), open the PR. Omnath merges + flips status to DONE.

A task is **disjoint** by design (different atoms/oracle shapes). **`Cplx`** = build size: `low` (a matcher +
reuse), `med` (a resolver branch), `sub` (a real subsystem — longer runway, flag clearly). **`engine-first`**
= the engine must honor it BEFORE coverage flips, or it's a false positive.

---

## 🔧 FIX / VERIFY lane — Erin (these jump the builder queue)

| ID | Pri | Finding | ~Impact | Status |
|---|---|---|---:|---|
| **VERIFY-MENACE** | 🔴 | **LIVE shipped false positive.** Menace is in COVERED_KEYWORDS so a Menace-only creature is native-body — but the 2-blocker rule (CR 702.110) is enforced NOWHERE (`canBlock` admits a single blocker; `combatResolution.js:17` defers Menace). The engine lets ONE creature block a Menace attacker. **Fix:** enforce 2-blocker in canBlock/declare-blockers, OR remove Menace from COVERED_KEYWORDS (safe default → Arbiter). Same gap that blocks EVADE — fix together. | −FP | OPEN |
| **FIX-TRIG-CONDITION** | 🔴 | `classifyCondition` over-detects restricted/compound-subject triggers (selfRef too broad; scope-inexpressible restriction dropped → over-fires). 34 cards incl. aristocrats staples. Detail: `docs/qa/rod-findings-1.md`. | 34 (−FP) | DONE #226 (Erin batch) |
| **VERIFY-ETB-DESTROY** | 🟡 | Spot-check (lower confidence): Ravenous Chupacabra & the ETB-destroy-an-opponent's-creature family classify native-trigger — owed a LIVE 4P end-to-end check that the flush enemy-chooser targets an opponent, never own / never crashes on no-legal-target. | spot-check | OPEN |

---

## 🟥 Active coverage backlog — pull from the top

> **Claimed subsystem lanes (NOT pull tasks — do not grab):**
> **PW (Planeswalkers) — Walt** (`feat/PW-*-walt`). Multi-PR loyalty subsystem; measured by "can the
> Academy play planeswalker decks," not the corpus %. **PW-1 (framework) — PR in review:** loyalty
> counters + enters-with-loyalty (CR 306.5b), `+N`/`−N`/`0` abilities (sorcery-speed + once/turn CR
> 606.3, can't pay below 0 CR 118.3), 0-loyalty SBA (CR 704.5i), attack-a-planeswalker + combat
> damage→loyalty (CR 120.3c), `native-planeswalker` tier. **0 cards flip native yet** (every real PW
> has ≥1 unmodeled ability/static — honest CREED baseline; coverage in PW-2+). See
> `docs/planeswalker-subsystem.md`.

### 🔴 high-lever

| ID | Mechanic / atom (short landmine — full detail in the report) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **ACT-KW-GRANT** | `{cost}: This creature gains <KW> until EOT` — self keyword-grant. Reuses GRANTABLE_COMBAT_KEYWORDS allowlist (the allowlist IS the FP guard). **Self-ref only, all-or-nothing whole card** — reject `target`-grants (different atom) + multi-ability cards. | ~46 | low | DONE #235 | Goblin Balloon Brigade, Narnam Cobra, Unyielding Krumar |
| **KWSTRIP-1** | Strip the vacuous cast-keyword line (foretell/suspend/splice-onto-arcane/recover/harmonize/basic-landcycling), then parse the body. The #200 precedent, zero new resolver. **Exclude rebound/cipher/conspire/learn/proliferate/amass (NOT vacuous).** | ~44 | low | DONE #234 | Doomskar, Rift Bolt, Evermind, Grim Harvest, Crashing Footfalls |
| **SOFT-CNT** | "Counter target spell unless its controller pays {N}." Opponent-decision pending-choice at resolution (an opponent in 4P). Clean core = `pays {fixed}` only. | ~36 | sub | OPEN | Force Spike, Mana Tithe, Mana Leak, Censor, Rune Snag |
| **DIG-1** | Impulse-dig: "Look at top N. Put one into your hand, rest on the bottom." HAND-dig only (battlefield-dig is its own atom); drop Descend/Casualty/Domain prefixes. Reuses δ-1b picker. | ~25-30 | med | DONE #232 | Sleight of Hand, Telling Time, Glimpse the Cosmos |
| **TRIG-PUMP-1** | ⭐ **Pilot for the trigger-effect compiler.** "Whenever this attacks/blocks, IT gets +N/+N until EOT" — wire the trigger's effectClause into the temp-pump program. **Fixed-integer anchor** (reject +X/for-each); recipient = "it"/"this", never "other creatures"/"target". | ~23 | low | OPEN | Brazen Wolves, Charging Paladin, Steadfast Cathar |
| **PUMP-1** | Team pump: "Creatures you control get +X/+Y until EOT." Reject `and gain <keyword>` riders (Triumph of the Hordes → infect). Reuses each-you-control enumerator (#211). | ~22 | low | OPEN | Rally the Peasants, Guardians' Pledge, Coordinated Charge |
| **REG-1** | Regrowth (gy → HAND): "Return target \<type> card from your graveyard to your hand." Accept the card-type union; `your graveyard` ≠ `a graveyard`; drop `up to one/two`. Reuses #207. | ~22 | low | DONE #231 | Argivian Find, Relearn, Nature's Spiral, Call to Mind |
| **MT-1** | Divide-among picker: "deals N damage / distribute N +1/+1 divided among any number of targets." Subsumes CNT-2b's distribute half. | ~20 | med | DONE #237 | Rolling Thunder, Pyrotechnics, Meteor Swarm, Hail of Arrows |
| **EVADE** | ⚠ **engine-first** combat-keyword engine via ONE `canBlock` chokepoint: unblockable + can't-block (~40) · basic landwalk (~61, per-defender = 4P-correct) · can-block-only-flying (~20). **Must ship canBlock enforcement BEFORE flipping COVERED_KEYWORDS** (else unblockable creatures get blocked = FP). Bare-clause only. Pairs with VERIFY-MENACE. | ~120 | sub | OPEN | Invisible Stalker, Bog Wraith, Jungle Lion, Cloud Elemental |

### 🟡 medium / lower-risk subsystems (runway)

| ID | Mechanic / atom (short landmine) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **ACT-PUMP-TIMING** | Firebreathing blocked only by a pure-timing trailer ("Activate only once each turn / as a sorcery"). **Must ENFORCE** (per-source activation counter + sorcery-speed gate) before flipping — no counter exists today. Keep "Activate only IF…" on Arbiter. | ~31 | med | OPEN | Frilled Oculus, Rootwalla, Darkthicket Wolf |
| **ADDCOST-2** | `As an additional cost to cast, discard N / pay N life / sacrifice an artifact. <EFFECT>` — extends the CLAIMED sac-to-cast seam. **FP is in the EFFECT half:** reject cost-scaled effects + "or pay {N}" alt-costs; whitelist the effect template. | ~15 | med | OPEN | Thrill of Possibility, Cathartic Reunion, Deadly Dispute |
| **FOG-1** | "Prevent all combat damage that would be dealt this turn" — a turn-scoped damage-skip latch `combatResolution.js` checks. Whole-turn latch ONLY (not aura/ongoing prevention). | ~14 | sub | DONE #230 | Fog, Darkness, Holy Day, Moment's Peace |
| **ETB-RAMP-SEARCH** | "When ~ enters, search for a basic land → hand \| battlefield-tapped, shuffle." **FP #1 = a SECOND ability** (Solemn Simulacrum dies→draw!). Singular "a basic land", one destination, rest keyword-only. | ~14 | med | OPEN | Sylvan Ranger, Pilgrim's Eye, Farhaven Elf, Civic Wayfinder |
| **KWACT-INVEST** | Alias "Investigate[ N times]." → N create-Clue-token atoms (reuses TOK-2). Free, additive. **Fire only on first-person Investigate** — reject "<subject> investigates" (wrong-owner Clue). | ~11 | low | OPEN | Foul Play, Jace's Scrutiny, Confirm Suspicions, Deduce |
| **RAMP-1** | Spell ramp: "Search for a basic land, put onto the battlefield [tapped], shuffle" — new battlefield-destination resolver (shipped `tutor` is HAND-only). **High real-deck value (Colton's ramp).** End-anchored `…shuffle.` only; **Cultivate/Kodama's Reach are split-destination traps**; honor tapped/untapped. | ~6-9 | med | OPEN | Rampant Growth, Explosive Vegetation, Into the North |
| **ETB-EQUIP-ATTACH** | "When this Equipment enters, attach it to target creature you control" + plain +N/+N. **Engine must actually attach** (flip without resolver = a lie); the attach line often carries a "gains <KW> UEOT" rider — drop those. | ~9 | med | OPEN | Bramble Armor, Scavenged Blade, Mirran Banesplitter |
| **MODAL-2** | Extend the shipped "Choose one —" gate to "Choose two / one or both". **Gate + EXECUTOR must ship in ONE PR** (runtime resolves exactly one mode today → would drop the 2nd = FP). Thin but auto-ratchets. | ~9 | sub | OPEN | Kolaghan's Command, Soul Manipulation, Crush Contraband |
| **LOOT-1** | Add a self-discard atom (`you discard N` = controller); `draw N, then discard M` then composes. **Reject "discard at random"** (engine-chosen ≠ player-chosen). | ~9 | low | OPEN | Careful Study, Faithless Looting, Catalog, Thoughtflare |
| **TOK-NAMED-EXT** | Extend the TOK-2 named-token registry to Blood / Powerstone / Map / Lander / Junk. **Powerstone enters tapped + can't pay nonartifact spells** (model or over-credits ramp); exclude ROLE aura-tokens. | ~8 / ~30-40 corpus | low | OPEN | Powerstone/Blood/Lander/Map ETBs (cross-cluster) |
| **RIDER-CTRL-LIFE** | "Its controller loses N life." on a single **permanent-target** base. **"its controller" = the TARGET's controller, not the caster**; counter-spell targets have no `.controller` → permanent targets only. | ~7 | med | OPEN | Spreading Rot, Despoil, Hideous End, Vapor Snag |

### 🟢 small / cleanup

| ID | Mechanic / atom (short landmine) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **CNT-2b** | Remaining counter forms: "on up to N target creatures" + −1/−1 single & multi (reuses MT-1's picker). | ~10 | low | OPEN | Travel Preparations, Incremental Growth |
| **SYMBURN-1** | "Deals N to each creature and each player" (extend the each-creature path to faces). Must hit ALL players incl. caster. | ~8 | low | OPEN | Inferno, Famine, Fire Tempest, Evincar's Justice |
| **ACT-SELF-BOUNCE** | "{cost}: Return this creature to its owner's hand" (bind target=source). Bundle, not a solo PR. | ~6 | low | OPEN | Darting Merfolk, Fleeting Image, Blinking Spirit |
| **TUCK-1** | "Put target creature on top of its owner's library" (new `tuck` op). Anchored whole-card; **top ≠ bottom ≠ hand** (wrong slot loses/dupes the card). | ~5 | low | OPEN | Time Ebb, Griptide, Excommunicate, Repel |
| **RIDER-2ND-MINUS** | Pump target 1 + debuff a DISTINCT 2nd creature. Needs distinct-second-target binding; don't loosen "another" globally. | ~5 | med | OPEN | Leeching Bite, Consume Strength, Schismotivate |

---

## ⛔ δ subsystem backlog — strategic (needs Colton/Omnath greenlight; longer builds)

| ID | Subsystem | ~Yield | Why deferred |
|---|---|---:|---|
| **⭐ TRIG-COMPILER** | **The spine of the climb.** Bridge each recognized trigger's `effectClause` → the spell-effect atom library (self/it/this binding + all-or-nothing residue gate). Carves dozens of sub-rows (TRIG-SCRY ~33, TRIG-TREASURE ~45, TRIG-COUNTER ~28, TRIG-DRAW, TRIG-MONARCH ~18…). | ~5,267 (the largest single lever in the corpus) | Greenlight the full bridge **after TRIG-PUMP-1 (the pilot) proves out** — that's why TRIG-PUMP-1 is a 🔴 now. |
| **⭐ PW-FRAMEWORK** | **Planeswalker subsystem — GAMEPLAY-CRITICAL, not a coverage-%-play.** A loyalty system + standard +/−/static abilities (reusing the modeled atoms) so the Academy can actually **play + teach** PW decks; complex game-warping ultimates degrade **per-card** to the Arbiter (CREED-safe). **Not a coverage-builder slice — a dedicated PW agent owns it, framework-first.** Build-time research is mandatory (CREED forbids coding PW behavior from memory); shipped engine stays 100 % local (research informs code, never a runtime call). Source hierarchy: bundled CR `cr_current.json` + `rulings.json` = rules truth → official web (Scryfall/Gatherer) for gaps → Reddit only for edge-cases + what players misunderstand (feeds the TEACHING layer, never the rules). | ~250-300 of 337 native (most playable; not all-perfect) | **Pending Colton go/no-go + timing; Omnath drafting the agent.** Re-categorized OUT of the irreducible tail (see the strategic map) — gameplay value ≫ ~1 % corpus share. |
| **ACT-REGEN-SHIELD** | `{cost}: Regenerate this creature` — a replacement-effect SHIELD (CR 701.15). | ~66 | SAME prerequisite as PREVENT — build the replacement-shield machinery once, unlock both. FORBIDDEN to fake-model. |
| **PREVENT** | Ongoing replacement/prevention (Story Circle, "if … would … instead", prevent-next-N-damage). | big | Replacement-effects subsystem; pairs with ACT-REGEN-SHIELD. (The one-shot Fog latch is carved out as FOG-1.) |
| **GAIN-CTRL** | Temporary control change (Threaten/Act of Treason: gain control + untap + haste + end-of-turn give-back). | ~25 | Control-swap + end-of-turn give-back subsystem. |
| **EVADE-4** | "Attacks each combat if able" — a must-attack REQUIREMENT engine (attacking is optional today). | ~16 | A new requirement code path, separate from the EVADE canBlock work. Lowest ROI. |
| **ACT-MONSTROSITY** | Monstrosity N / Adapt N. | ~7 | Needs an is-monstrous latch whose own second-ability cards force FPs. Not worth it. |

---

## ✅ Shipped this run (Omnath's merge ledger) · 🔵 in-flight (claimed — don't re-take)

| ID | Mechanic | State |
|---|---|---|
| TOK-2 | Named artifact tokens (Treasure/Clue/Food/Gold) | DONE #218 |
| CNT-2 | Optional single-target counter | DONE #219 |
| EP-2 | Target/each-player discard N | DONE #220 |
| FIX-TRIG-COMPOUND / FIX-TRIG-LTB | trigger −FP fixes | ~DONE #218 |
| ED-2 · EP-3 · TOK-3 · BURN-2 · ADDCOST-sac | edicts · mill · token-counts · burn-riders · sac-to-cast | 🔵 in-flight (`feat/*` branch exists) |

**Hans (Scout):** re-rank + add rows each cycle; file mis-modeled cards as `VERIFY-…`. **Rod (QA):** file
false-positives as 🔴 `FIX-…`. **Erin (Fixer):** owns the FIX/VERIFY lane (default fix: tighten the matcher →
Arbiter + pin `MUST_DROP_TO_LOW`); claims `fix/<area>-*`. Coverage rows stay with **Cindy, Paula & Tess**.
**Omnath:** flips status to `DONE` on merge, files review P0s as `FIX-…`.
