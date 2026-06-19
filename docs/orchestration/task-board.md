# Coverage Task Board — the prioritized backlog the builder faculties pull from

**Model:** builders **pull from this board** rather than owning a fixed mechanic — pick the highest-priority
`OPEN` task you're suited for, develop your own working knowledge, never idle. **Hans (scout) maintains +
re-prioritizes this board** as the modeled set grows; findings get filed here as new tasks. **Clyde
(integrator) merges; only Clyde touches `master`** (Omnath is the strategy brain).

> **Last scout refresh:** cycle **board-4 (Hans — QA+FIX focus)**, 2026-06-18 — live baseline **17.2 % corpus
> native** (5,876/34,160). **Enforce-don't-drop (Colton):** #255 briefly dropped 11 unenforced keywords (−289)
> but **#256 reverted that — the keywords stay CLAIMED as openly-acknowledged INTERIM FALSE POSITIVES** (the
> code labels them so; see `COVERED_KEYWORDS`) while the enforcement is built. The % is honest once the
> **re-coverage rows ship** (EVADE +48, DEFENDER-ENFORCE +37, KW-UNTARGET +41, TRIG-PROWESS +23, PROTECTION +75
> — Cindy's lane); until then those ~289 are interim FPs (live play still mis-resolves them). The board-3 DEEP
> SCAN backlog below (ranked OPEN coverage, ~10 hrs) is still current. Honest yields are **adversarially
> CREED-verified**. **The strategic map + every row's full false-positive landmine live in
> [`docs/scout-gap-report.md`](../scout-gap-report.md) — read your row's landmine before you build.**
>
> **The shape of the climb:** the clean-atom + rider tiers are nearly mined out (~a few hundred cards, good
> builder fuel). The climb from ~20 %→~85 % is ONE subsystem — the **trigger-effect compiler** (bridge each
> recognized trigger's effect clause into the modeled atom library; ~5,267 trigger cards). **TRIG-PUMP-1 is
> its safe pilot.** The irreducible Arbiter tail caps the honest ceiling at **~88-92 %**.

## How to claim a task (collision-safe)

1. Pick the highest-priority **`OPEN`** task that fits you (mix: a fast clean atom, or a subsystem for a longer run).
2. **Claim by pushing your branch — put YOUR FACULTY NAME as the suffix** (so the dashboard attributes it): `git fetch origin && git checkout -B feat/<task-id>-<name> origin/master && git commit --allow-empty -m "claim <task-id> (<name>)" && git push -u origin feat/<task-id>-<name>` (e.g. `feat/REG-1-cindy`).
3. **Check it's free first:** `git ls-remote --heads origin "feat/<task-id>-*"` — branch exists = taken; take the next.
4. Tell Colton "claiming `<task-id>`". Build it (full gate), open the PR. Clyde merges + flips status to DONE.

A task is **disjoint** by design (different atoms/oracle shapes). **`Cplx`** = build size: `low` (a matcher +
reuse), `med` (a resolver branch), `sub` (a real subsystem — longer runway, flag clearly). **`engine-first`**
= the engine must honor it BEFORE coverage flips, or it's a false positive.

---

## 🔧 FIX / VERIFY lane — Hans (these jump the builder queue)

| ID | Pri | Finding | ~Impact | Status |
|---|---|---|---:|---|
| **VERIFY-COVERED-KW** | 🔴 | **LIVE shipped FP CLUSTER (started as VERIFY-MENACE, audit widened it).** `COVERED_KEYWORDS` claimed `native-body` for **11 keywords the runtime NEVER enforces** (a keyword is enforced only if consulted via `permanentHasKeyword`/SBA/attack-legality): menace·skulk·intimidate·fear·horsemanship (block restrictions — `canBlock` honors only flying/reach), **defender** (a Wall can illegally attack — `actionsDeclareAttacker` never excludes it), hexproof·shroud·ward (no targetability check in `enumerateTargets`), protection (DEBT all unenforced), prowess (an unmodeled pump trigger). Each = the body is claimed native but mis-resolves. **Resolution (enforce-don't-drop):** #255 dropped all 11 → Arbiter, but **#256 REVERTED that** — they stay CLAIMED native as openly-labeled INTERIM FPs (see `COVERED_KEYWORDS`) while the enforcement is built. The REAL fix = the re-coverage rows below; only PW-before-land + `qa-sweep.mjs` survived from #255. | **interim FP** | KEPT → enforce (#255→#256) |
| **FIX-TRIG-CONDITION** | 🔴 | `classifyCondition` over-detects restricted/compound-subject triggers (selfRef too broad; scope-inexpressible restriction dropped → over-fires). 34 cards incl. aristocrats staples. Detail: `docs/qa/rod-findings-1.md`. | 34 (−FP) | DONE #226 |
| **VERIFY-ETB-DESTROY** | 🟡 | Ravenous Chupacabra & the ETB-destroy-an-opponent family. | spot-check | **VERIFIED — not a bug #255**: parses `"…an opponent controls"` (`targetsResolvable=true`, the runtime gate); chooser picks an opponent (never own), no-target fizzles via CR 603.3c / `NO_SAFE_TARGET`. Added a restricted-clause + no-target regression pin. |
| **FIX-PW-LAND-ORDER** | 🟢 | Wrenn and One (corpus's only Land Planeswalker) hit the `land` tier before the planeswalker gate → counted native-`land` despite unmodeled loyalty. **Fixed:** PW gate now runs first → `arbiter-pw`. Pure metric, no runtime harm. | 1 (−FP metric) | DONE #255 |

> **🔁 Re-coverage rows (bring the −289 back, CORRECT, as enforcement ships):** **EVADE** (🔴 below — its `canBlock` chokepoint re-adds menace + the 4 block-restriction keywords, ~48). **DEFENDER-ENFORCE** (🟢 below — a one-filter quick win, ~37). **KW-UNTARGET** (🟡 below — hexproof/shroud/ward targetability, ~41). **TRIG-PROWESS** (🟡 below — model the pump, ~23). **PROTECTION/DEBT** (δ backlog, ~75). The drop is honest *now*; the climb resumes correctly.
>
> **Policy — ENFORCE, DON'T DROP (Colton, 2026-06-18):** these re-coverage rows ARE the fix — build the enforcement (local-first), don't leave the keywords dropped. They're **Cindy's lane** (combat/keyword/trigger enforcement); Walt stays on his PW-leverage atoms. Standing policy + the full enforcement backlog: [`retired-fp-ledger.md`](retired-fp-ledger.md). Dropping is the last resort (genuinely-hard mechanics only).

---

## 🟥 Active coverage backlog — pull from the top

> **Claimed subsystem lanes (NOT pull tasks — do not grab):**
> **PW (Planeswalkers) — Walt** (`feat/PW-*-walt`). Multi-PR loyalty subsystem; measured by "can the
> Academy play planeswalker decks," not the corpus %. **PW-1 (framework) — ✅ DONE #236** (adversarial review: CREED-airtight, 0 native-PW false positives, rules enforced engine-first): loyalty
> counters + enters-with-loyalty (CR 306.5b), `+N`/`−N`/`0` abilities (sorcery-speed + once/turn CR
> 606.3, can't pay below 0 CR 118.3), 0-loyalty SBA (CR 704.5i), attack-a-planeswalker + combat
> damage→loyalty (CR 120.3c), `native-planeswalker` tier. **0 cards flip native yet** (every real PW
> has ≥1 unmodeled ability/static — honest CREED baseline; coverage in PW-2+). See
> `docs/planeswalker-subsystem.md`.
>
> **✅ PW-2 + PW-3 LANDED #245 (2026-06-18, aa600c8) — hybrid model + AI piloting.** Walt rebased the
> stack onto master cleanly. **184 walkers now `playable-pw`** (enter/tick/die natively; modeled loyalty
> abilities resolve native, unmodeled ones route to the Arbiter AT ACTIVATION — cost paid, effect
> adjudicated, never fabricated). **0 native flips, 0 false positives** (`playable-pw` ∉ NATIVE_TIERS —
> Omnath source-verified + real-corpus measured). AI activates a beneficial modeled loyalty ability/turn
> + diverts a clean swing to kill an enemy walker.
>
> **✅ PW-4 (teaching layer) LANDED #249 (fd047fb).** Walt rebased cleanly onto master (old #247 closed,
> reopened as #249). Beginner-mode narrator now teaches the common loyalty misconceptions (once-per-turn
> + sorcery speed, summoning-sick walkers CAN activate, can't pay below 0 / CR 118.3, direct attacks +
> combat-damage-as-loyalty / CR 120.3c, enters-with-loyalty) — every CR citation verified real. **The PW
> subsystem (PW-1→PW-4) is COMPLETE; shipped in v0.39.0.**
>
> **✅ PW-6 + PW-7 MERGED #253 (2026-06-18, 6295bf2) — planeswalkers are targetable by removal.** Damage
> now offers a planeswalker target and removes it as loyalty (CR 120.3c), killing it at 0 (CR 704.5i);
> `destroy`/`exile target planeswalker` (Hero's Downfall class) works. New target types `planeswalker` /
> `creatureOrPlaneswalker` / `playerOrPlaneswalker`, all gated out of the first-legal trigger flush (CREED).
> +24 native (17.1→17.2%) — this is how walkers die outside combat.
>
> **✅ PW-5 (emblem subsystem) MERGED #251 (2026-06-18, 8f9bfc4).** Walt rebased cleanly over PW-6/7;
> Clyde spot-verified the conflict resolution (both `addEmblem` + `attachPermanent` imports + resolver
> keys preserved, PW-6/7 target-types intact) → merged. Adds a real command-zone emblem object
> (`addEmblem`) whose static-anthem ability applies via the layer engine (`emblemEffectsOf`, scoped to
> the controller); a `create-emblem` atom (gated by `staticAbilitiesCoverCard` — only fully-modeled
> statics flip, else → Arbiter); triggered emblems → Arbiter. 0 net native flips (anthem-ultimate
> walkers keep other unmodeled abilities → stay `playable-pw`) — a **gameplay** win, not a corpus-% one.
>
> **The PW subsystem (PW-1 → PW-8) is COMPLETE** (#254 triggered emblems merged 2026-06-18). Playable
> end-to-end + static & triggered emblems + killable by removal. **Walt has pivoted to a NEW lane (below).**
>
> **WALT — PW-leverage general mechanisms (`feat/WALT-*-walt`).** RESERVED + DISJOINT from Cindy. Meaty
> general atoms ranked by how many planeswalkers they unblock (they lift the whole corpus by proxy). Full
> manual: `docs/orchestration/agents/walt.md`. **Reserved IDs — do NOT pull these for Cindy:**
> **WALT-TOKEN-ABIL** (ability-carrying tokens · PW 48 / ~1,005) · **WALT-DMG-SCALE** (damage = count · PW 54 /
> ~1,534) · **WALT-FOR-EACH** (count-scaled draw/token/life · PW 33 / ~1,408) · **WALT-GAIN-CTRL** (Threaten ·
> PW 14) · **WALT-ANIMATE** (becomes-a-creature · PW 22) · **WALT-RECUR** (recursion EXT · PW ~20) ·
> **WALT-TUTOR-EXT** (search EXT · PW 22) · **WALT-EMBLEM-ACT** (activated/complex emblems · PW 49) ·
> **WALT-EXILE-COMPLEX** (delayed/conditional exile · PW 12). **Boundary:** scales-with-a-count /
> ability-on-a-token / control-change / animate / recursion-tutor-exile-emblem EXTENSIONS = Walt; fixed-value
> atoms + the trigger compiler + combat keywords + named-artifact tokens = Cindy.

### 🔴 high-lever

| ID | Mechanic / atom (short landmine — full detail in the report) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **ACT-KW-GRANT** | `{cost}: This creature gains <KW> until EOT` — self keyword-grant. Reuses GRANTABLE_COMBAT_KEYWORDS allowlist (the allowlist IS the FP guard). **Self-ref only, all-or-nothing whole card** — reject `target`-grants (different atom) + multi-ability cards. | ~46 | low | DONE #235 | Goblin Balloon Brigade, Narnam Cobra, Unyielding Krumar |
| **KWSTRIP-1** | Strip the vacuous cast-keyword line (foretell/suspend/splice-onto-arcane/recover/harmonize/basic-landcycling), then parse the body. The #200 precedent, zero new resolver. **Exclude rebound/cipher/conspire/learn/proliferate/amass (NOT vacuous).** | ~44 | low | DONE #234 | Doomskar, Rift Bolt, Evermind, Grim Harvest, Crashing Footfalls |
| **SOFT-CNT** | "Counter target spell unless its controller pays {N}." Opponent-decision pending-choice at resolution (an opponent in 4P). Clean core = `pays {fixed}` only. | ~36 | sub | DONE #243 (Cindy) | Force Spike, Mana Tithe, Mana Leak, Censor, Rune Snag |
| **DIG-1** | Impulse-dig: "Look at top N. Put one into your hand, rest on the bottom." HAND-dig only (battlefield-dig is its own atom); drop Descend/Casualty/Domain prefixes. Reuses δ-1b picker. | ~25-30 | med | DONE #232 | Sleight of Hand, Telling Time, Glimpse the Cosmos |
| **TRIG-PUMP-1** | ⭐ **Pilot for the trigger-effect compiler.** "Whenever this attacks/blocks, IT gets +N/+N until EOT" — wire the trigger's effectClause into the temp-pump program. **Fixed-integer anchor** (reject +X/for-each); recipient = "it"/"this", never "other creatures"/"target". | ~23 | low | DONE #238 (compiler pilot ✓) | Brazen Wolves, Charging Paladin, Steadfast Cathar |
| **PUMP-1** | Team pump: "Creatures you control get +X/+Y until EOT." Reject `and gain <keyword>` riders (Triumph of the Hordes → infect). Reuses each-you-control enumerator (#211). | ~22 | low | OPEN | Rally the Peasants, Guardians' Pledge, Coordinated Charge |
| **REG-1** | Regrowth (gy → HAND): "Return target \<type> card from your graveyard to your hand." Accept the card-type union; `your graveyard` ≠ `a graveyard`; drop `up to one/two`. Reuses #207. | ~22 | low | DONE #231 | Argivian Find, Relearn, Nature's Spiral, Call to Mind |
| **MT-1** | Divide-among picker: "deals N damage / distribute N +1/+1 divided among any number of targets." Subsumes CNT-2b's distribute half. | ~20 | med | DONE #237 | Rolling Thunder, Pyrotechnics, Meteor Swarm, Hail of Arrows |
| **EVADE** | ⚠ **engine-first** combat-keyword engine via ONE `canBlock` chokepoint: unblockable + can't-block (~40) · basic landwalk (~61, per-defender = 4P-correct) · can-block-only-flying (~20). **Must ship canBlock enforcement BEFORE flipping COVERED_KEYWORDS** (else unblockable creatures get blocked = FP). Bare-clause only. **Same chokepoint re-adds menace + skulk/intimidate/fear/horsemanship (the block-restriction keywords #255 dropped, ~48 more) — enforce the restriction in `canBlock`/declare-blockers, then return them to COVERED_KEYWORDS.** | ~120 (+48 re-add) | sub | OPEN | Invisible Stalker, Bog Wraith, Jungle Lion, Cloud Elemental |

### 🟡 medium / lower-risk subsystems (runway)

| ID | Mechanic / atom (short landmine) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **ACT-PUMP-TIMING** | Firebreathing blocked only by a pure-timing trailer ("Activate only once each turn / as a sorcery"). **Must ENFORCE** (per-source activation counter + sorcery-speed gate) before flipping — no counter exists today. Keep "Activate only IF…" on Arbiter. | ~31 | med | OPEN | Frilled Oculus, Rootwalla, Darkthicket Wolf |
| **ADDCOST-2** | `As an additional cost to cast, discard N / pay N life / sacrifice an artifact. <EFFECT>` — extends the CLAIMED sac-to-cast seam. **FP is in the EFFECT half:** reject cost-scaled effects + "or pay {N}" alt-costs; whitelist the effect template. | ~15 | med | DONE #240 | Thrill of Possibility, Cathartic Reunion, Deadly Dispute |
| **FOG-1** | "Prevent all combat damage that would be dealt this turn" — a turn-scoped damage-skip latch `combatResolution.js` checks. Whole-turn latch ONLY (not aura/ongoing prevention). | ~14 | sub | DONE #230 | Fog, Darkness, Holy Day, Moment's Peace |
| **ETB-RAMP-SEARCH** | "When ~ enters, search for a basic land → hand \| battlefield-tapped, shuffle." **FP #1 = a SECOND ability** (Solemn Simulacrum dies→draw!). Singular "a basic land", one destination, rest keyword-only. | ~14 | med | OPEN | Sylvan Ranger, Pilgrim's Eye, Farhaven Elf, Civic Wayfinder |
| **KWACT-INVEST** | Alias "Investigate[ N times]." → N create-Clue-token atoms (reuses TOK-2). Free, additive. **Fire only on first-person Investigate** — reject "<subject> investigates" (wrong-owner Clue). | ~11 | low | DONE #246 (Tess) | Foul Play, Jace's Scrutiny, Confirm Suspicions, Deduce |
| **RAMP-1** | Spell ramp: "Search for a basic land, put onto the battlefield [tapped], shuffle" — new battlefield-destination resolver (shipped `tutor` is HAND-only). **High real-deck value (Colton's ramp).** End-anchored `…shuffle.` only; **Cultivate/Kodama's Reach are split-destination traps**; honor tapped/untapped. | ~6-9 (shipped +39 w/ side-benefits) | med | DONE #248 (Cindy) | Rampant Growth, Explosive Vegetation, Into the North |
| **ETB-EQUIP-ATTACH** | "When this Equipment enters, attach it to target creature you control" + plain +N/+N. **Engine must actually attach** (flip without resolver = a lie); the attach line often carries a "gains <KW> UEOT" rider — drop those. | ~9 | med | DONE #252 (Cindy) | Bramble Armor, Scavenged Blade, Mirran Banesplitter |
| **MODAL-2** | Extend the shipped "Choose one —" gate to "Choose two / one or both". **Gate + EXECUTOR must ship in ONE PR** (runtime resolves exactly one mode today → would drop the 2nd = FP). Thin but auto-ratchets. | ~9 | sub | DONE #250 (Cindy) | Kolaghan's Command, Soul Manipulation, Crush Contraband |
| **LOOT-1** | Add a self-discard atom (`you discard N` = controller); `draw N, then discard M` then composes. **Reject "discard at random"** (engine-chosen ≠ player-chosen). | ~9 | low | DONE #241 (Paula) | Careful Study, Faithless Looting, Catalog, Thoughtflare |
| **TOK-NAMED-EXT** | Extend the TOK-2 named-token registry to Blood / Powerstone / Map / Lander / Junk. **Powerstone enters tapped + can't pay nonartifact spells** (model or over-credits ramp); exclude ROLE aura-tokens. | ~8 / ~30-40 corpus | low | OPEN | Powerstone/Blood/Lander/Map ETBs (cross-cluster) |
| **RIDER-CTRL-LIFE** | "Its controller loses N life." on a single **permanent-target** base. **"its controller" = the TARGET's controller, not the caster**; counter-spell targets have no `.controller` → permanent targets only. | ~7 | med | OPEN | Spreading Rot, Despoil, Hideous End, Vapor Snag |
| **KW-UNTARGET** | ⚠ **engine-first re-coverage (#255 drop):** enforce hexproof/shroud/ward in `enumerateTargets` (a targetability check: hexproof = no opponent target, shroud = no target, ward = a tax the targeter must pay). Then return them to COVERED_KEYWORDS. Bare-keyword bodies only. | ~41 (re-add) | sub | OPEN | Invisible Stalker (hexproof), Silhana Ledgewalker, Steel Leaf Champion (ward) |
| **TRIG-PROWESS** | **Re-coverage (#255 drop):** model prowess — "Whenever you cast a noncreature spell, this creature gets +1/+1 UEOT" — as a real trigger (reuses the TRIG-PUMP-1 temp-pump compiler + a cast-trigger event). Then return prowess to COVERED_KEYWORDS. Plain prowess only (reject the "prowess-like" custom riders). | ~23 (re-add) | med | OPEN | Monastery Swiftspear, Soulfire Grand Master, Stormchaser Mage |

### 🟢 small / cleanup

| ID | Mechanic / atom (short landmine) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **CNT-2b** | Remaining counter forms: "on up to N target creatures" + −1/−1 single & multi (reuses MT-1's picker). | ~10 | low | OPEN | Travel Preparations, Incremental Growth |
| **SYMBURN-1** | "Deals N to each creature and each player" (extend the each-creature path to faces). Must hit ALL players incl. caster. | ~8 | low | OPEN | Inferno, Famine, Fire Tempest, Evincar's Justice |
| **ACT-SELF-BOUNCE** | "{cost}: Return this creature to its owner's hand" (bind target=source). Bundle, not a solo PR. | ~6 | low | OPEN | Darting Merfolk, Fleeting Image, Blinking Spirit |
| **TUCK-1** | "Put target creature on top of its owner's library" (new `tuck` op). Anchored whole-card; **top ≠ bottom ≠ hand** (wrong slot loses/dupes the card). | ~5 | low | OPEN | Time Ebb, Griptide, Excommunicate, Repel |
| **RIDER-2ND-MINUS** | Pump target 1 + debuff a DISTINCT 2nd creature. Needs distinct-second-target binding; don't loosen "another" globally. | ~5 | med | OPEN | Leeching Bite, Consume Strength, Schismotivate |
| **DEFENDER-ENFORCE** | **Re-coverage (#255 drop) — clean quick win.** Exclude Defender creatures from `actionsDeclareAttacker` (CR 702.3b: can't attack — read via `permanentHasKeyword` so a granted/removed Defender counts), then return "defender" to COVERED_KEYWORDS. One filter + a re-add + a live "a Wall can't attack" check. | ~37 (re-add) | low | OPEN | Wall of Omens, Fog Bank, Doran the Siege Tower (grants), Axebane Guardian |

---

## ⛔ δ subsystem backlog — strategic (needs Colton/Omnath greenlight; longer builds)

| ID | Subsystem | ~Yield | Why deferred |
|---|---|---:|---|
| **⭐ TRIG-COMPILER** | **The spine of the climb.** Bridge each recognized trigger's `effectClause` → the spell-effect atom library (self/it/this binding + all-or-nothing residue gate). Carves dozens of sub-rows (TRIG-SCRY ~33, TRIG-TREASURE ~45, TRIG-COUNTER ~28, TRIG-DRAW, TRIG-MONARCH ~18…). | ~5,267 (the largest single lever in the corpus) | Greenlight the full bridge **after TRIG-PUMP-1 (the pilot) proves out** — that's why TRIG-PUMP-1 is a 🔴 now. |
| **⭐ PW-FRAMEWORK** | **Planeswalker subsystem — GAMEPLAY-CRITICAL, not a coverage-%-play.** A loyalty system + standard +/−/static abilities (reusing the modeled atoms) so the Academy can actually **play + teach** PW decks; complex game-warping ultimates degrade **per-card** to the Arbiter (CREED-safe). **Not a coverage-builder slice — a dedicated PW agent owns it, framework-first.** Build-time research is mandatory (CREED forbids coding PW behavior from memory); shipped engine stays 100 % local (research informs code, never a runtime call). Source hierarchy: bundled CR `cr_current.json` + `rulings.json` = rules truth → official web (Scryfall/Gatherer) for gaps → Reddit only for edge-cases + what players misunderstand (feeds the TEACHING layer, never the rules). | ~250-300 of 337 native (most playable; not all-perfect) | **Pending Colton go/no-go + timing; Omnath drafting the agent.** Re-categorized OUT of the irreducible tail (see the strategic map) — gameplay value ≫ ~1 % corpus share. |
| **ACT-REGEN-SHIELD** | `{cost}: Regenerate this creature` — a replacement-effect SHIELD (CR 701.15). | ~66 | SAME prerequisite as PREVENT — build the replacement-shield machinery once, unlock both. FORBIDDEN to fake-model. |
| **PREVENT** | Ongoing replacement/prevention (Story Circle, "if … would … instead", prevent-next-N-damage). | big | Replacement-effects subsystem; pairs with ACT-REGEN-SHIELD. (The one-shot Fog latch is carved out as FOG-1.) |
| **PROTECTION** | **Re-coverage (#255 drop): the DEBT subsystem** — protection from [quality] = can't be **D**amaged / **E**nchanted-equipped / **B**locked / **T**argeted by that quality (CR 702.16). Currently enforced NOWHERE → protection-only bodies were dropped to the Arbiter. A real replacement/legality subsystem (pairs conceptually with PREVENT for the damage half). | ~75 (re-add) | Big DEBT subsystem; greenlight with PREVENT. Until then protection-only bodies stay on the Arbiter (safe). |
| **GAIN-CTRL** | Temporary control change (Threaten/Act of Treason: gain control + untap + haste + end-of-turn give-back). | ~25 | Control-swap + end-of-turn give-back subsystem. |
| **EVADE-4** | "Attacks each combat if able" — a must-attack REQUIREMENT engine (attacking is optional today). | ~16 | A new requirement code path, separate from the EVADE canBlock work. Lowest ROI. |
| **ACT-MONSTROSITY** | Monstrosity N / Adapt N. | ~7 | Needs an is-monstrous latch whose own second-ability cards force FPs. Not worth it. |

---

## ✅ Shipped this run (Clyde's merge ledger) · 🔵 in-flight (claimed — don't re-take)

| ID | Mechanic | State |
|---|---|---|
| TOK-2 | Named artifact tokens (Treasure/Clue/Food/Gold) | DONE #218 |
| CNT-2 | Optional single-target counter | DONE #219 |
| EP-2 | Target/each-player discard N | DONE #220 |
| FIX-TRIG-COMPOUND / FIX-TRIG-LTB | trigger −FP fixes | ~DONE #218 |
| ED-2 · EP-3 · TOK-3 · BURN-2 · ADDCOST-sac | edicts · mill · token-counts · burn-riders · sac-to-cast | 🔵 in-flight (`feat/*` branch exists) |

**Hans (Scout):** re-rank + add rows each cycle; file mis-modeled cards as `VERIFY-…`. **Cindy (Builder):**
pulls coverage rows (cap 3 in-flight). **Walt:** the planeswalker subsystem lane. **Clyde (integrator):**
flips status to `DONE` on merge, files review P0s as `FIX-…`, owns master + releases. The lean roster
(2026-06-18) stood down Paula/Tess/Erin/Rod — their **FIX/VERIFY rows are now unowned** and any builder
can pull them (default fix: tighten the matcher → Arbiter + pin `MUST_DROP_TO_LOW`).
