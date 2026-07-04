> ⚠️ **HISTORICAL (bannered 2026-07-04).** Faculty-era pull board — the faculty model was retired 2026-06-26 (Clyde = sole builder). Numbers frozen at 17.9% corpus (2026-06-18). Forward work: [UPGRADE-BACKLOG.md](UPGRADE-BACKLOG.md) + `memory/orders/clyde-grind-relaunch.md`. Kept for history.

# Coverage Task Board — the prioritized backlog the builder faculties pull from

**Model:** builders **pull from this board** rather than owning a fixed mechanic — pick the highest-priority
`OPEN` task you're suited for, develop your own working knowledge, never idle. **Hans (scout) maintains +
re-prioritizes this board** as the modeled set grows; findings get filed here as new tasks. **Clyde
(integrator) merges; only Clyde touches `master`** (Omnath is the strategy brain).

> **Last scout refresh:** cycle **board-10 (Hans — QA the v0.42.0 wave + native-mana over-claim found)**, 2026-06-18 —
> live baseline **17.9 % corpus native** (6,106/34,160 via qa-sweep). **⚠️ Honest ≈ 17.5 %:** the headline carries a
> **~110-126-card phantom from a native-mana metric over-claim** (new 🔴 FIX row below — METRIC-ONLY, no runtime harm).
> **Wave QA result: CLEAN** — the trigger-effect compiler, SYMBURN-1 (symmetric burn hits all players incl. caster),
> and the WALT count-engine (default-floor `?? 1` fix holds) were swept end-to-end; **0 confirmed runtime FPs**, all 8
> trigger compound-collapse suspects verified false alarms (parser captures the full compound, resolvers apply it).
> **🔝 CINDY'S CMD PIPELINE (Colton):** **CMD-CAST ✅ #273 → CMD-RETURN ✅ #276** → **CMD-DMG21** (active — 21-combat-damage
> loss SBA, CR 903.10a, per-commander keying CMD-PARTNER needs) → **CMD-PARTNER** (~143, HUGE in EDH) → **CMD-COMPANION**
> (~12) → CMD-RETURN-ZONES (903.9b fast-follow). **Then Cindy pivots to the general non-keyword trigger compiler.**
> _(Walt: count series ✅ #271/#272 + ANIMATE PR1 ✅ #274; **now owns the entire 702.x KEYWORD BACKLOG** per the LANE
> ASSIGNMENT below — **no longer spins down**, it's his standing lane.)_
> **⭐ [`keyword-coverage-plan.md`](keyword-coverage-plan.md)** maps all **189 CR 702.x keywords** to enforce-first
> waves — a months-long ordered backlog after CMD. **Keyword rows seeded:** EVADE-2 (shadow ~37) · TRIG-ATTACK-PUMP
> (exalted/battle cry/mentor ~180) · KW-CYCLING (~328, the cast-cost pilot) — plus the cycle-7 rows still open:
> **TRIG-LIFEGAIN** (~17) · **TRIG-DRAW2** (~11) · **TRIG-TOKEN-ABIL** (~30). **9 of the 11 keyword FPs now honestly
> enforced** (EVADE #258 · KW-UNTARGET #260 · TRIG-PROWESS #262 — each Hans-verified); only **ward + protection**
> remain interim. **Enforce-don't-drop (Colton):** #255 dropped the 11 (−289), **#256 reverted** — they stay
> CLAIMED as openly-labeled interim FPs while enforcement ships (see `COVERED_KEYWORDS`); the policy is proven
> 3× over (coverage rose CORRECTLY as each enforcement converted interim→honest). The board-3 DEEP SCAN backlog
> below is still current. Honest yields are **adversarially CREED-verified**. **The strategic map + every row's
> full false-positive landmine live in [`docs/scout-gap-report.md`](../scout-gap-report.md) — read it before you build.**
>
> **The shape of the climb:** the clean-atom + rider tiers are nearly mined out (~a few hundred cards, good
> builder fuel). The climb from ~20 %→~85 % is ONE subsystem — the **trigger-effect compiler** (bridge each
> recognized trigger's effect clause into the modeled atom library; ~5,267 trigger cards). **TRIG-PUMP-1 is
> its safe pilot.** The irreducible Arbiter tail caps the honest ceiling at **~88-92 %**.

## 🔀 LANE ASSIGNMENT — Walt = keywords · Cindy = commander + compiler (2026-06-18, Colton; Clyde to confirm overlap)

**The re-carve (Colton's call):** hand the **entire 702.x keyword backlog to Walt**; **Cindy works the disjoint
non-keyword lanes.** Keywords lean on combat / layers / counters / triggers — Walt's wheelhouse (loyalty, the count
engine, animate). This frees Cindy for the two highest-gameplay-value levers. Walt no longer spins down after PW;
the keyword backlog is his standing lane.

| Builder | Owns | Backlog |
|---|---|---|
| **Walt** (`feat/<KW-id>-walt`) | **The keyword backlog — Waves B–G** (`keyword-coverage-plan.md`): triggered KWs · cost/alt-cost KWs · poison/evasion · aura/equip grants · replacement KWs · complex subsystems (morph/crew/mutate). ~4,500+ tractable cards, months of runway. | Family by family, enforce-first. |
| **Cindy** (`feat/<id>-cindy`) | **Everything NOT a 702.x keyword:** (1) finish the **Commander framework** (CMD-PARTNER → CMD-COMPANION) · (2) the **general (non-keyword) trigger-effect compiler** grind (~5,267 trigger cards — the corpus spine) + the remaining clean spell atoms / δ. | CMD first, then compiler. |

**⚠️ Clyde — the 3 shared subsystems to own (assign each ONE owner so the lanes don't collide):**
1. **Trigger compiler** *(tightest)* — Wave B (Walt) + Cindy's general grind both extend it. → **Cindy owns the
   compiler CORE** (event→effectClause→atom bridge); **Walt's Wave B keyword-triggers are ADAPTERS that consume it.**
   Until the core is solid, Walt starts on non-trigger waves (C cost / D combat / E aura-equip) — they don't need it.
2. **Cast path** — Cindy's CMD-CAST/PARTNER (command-zone casting) + Walt's Wave C (alt-cost casting) both touch
   `actionDispatcher` / `legalChoices` / mana payment. → **Cindy lands the command-zone cast flow first;** Walt's
   cost subsystem builds on a stable cast path after.
3. **Replacement-shield** — Walt's Wave F (graft/fading/vanishing) + the deferred PREVENT/regenerate δ are one
   machinery. → keep **both under Walt** (built once); Cindy stays out of replacement effects.

Mechanical file-collisions (`parser.js` / `effectAtoms.js` / `coverage.js` — everyone edits these) stay handled by
the labeled `// ===== MECHANIC =====` block + separate-worktree + rebase-off-`origin/master` + Clyde-serialized-merge
protocol. Not a blocker — only the 3 shared *subsystems* above need single-owner calls.

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
| **FIX-MANA-OVERCLAIM** | 🔴 | **NEW (board-10, Hans-reproduced + scoped).** `coverage.js:361` returns `native-mana` the instant `hasManaAbility(oracle)` is true — **before** the trigger/activated/mixed gates and **without** requiring the rest of the card to be modeled. So any mana source with **unmodeled non-mana text** is counted fully native: a real triggered ability (Mana Crypt's upkeep coin-flip 3 dmg, Spara's Adjudicators' ETB can't-attack, Pygmy Hippo, Old-Growth Troll dies→Aura, Ramos/Urabrask cast-triggers), a leveler/Class (Sorcerer Class, Joraga Treespeaker, Alchemist's Talent), or an unmodeled value-activated ability. **METRIC-ONLY (no runtime harm** — `classifyCard` has zero runtime consumers; the engine routes the unmodeled trigger to the Arbiter independently via `detectTriggers`, so the card still *plays* right). Same class as FIX-PW-LAND-ORDER, ~110× bigger. **Defensible floor: ≥110** (122 native-mana cards w/ a non-routing trigger − ~15 ETB-mana-add that are arguably fine + 4 levelers); the unmodeled-activated subset adds more. **ENFORCE-FIRST fix:** gate `native-mana` so it claims native only when the non-mana residue is fully modeled (reuse the `permanentFullyCovered` residue logic — every trigger routes / every activated modeled / rest static-or-keyword-only); pure dorks (Llanowar Elves, Sol Ring) + modeled-secondary (Meteorite ETB-damage) stay HIGH, the FP cluster drops to body-only/Arbiter. Honest-down ≈ −0.37 % (like #255). Repro + landmines in `scout-gap-report.md`. | ≥110 (−FP metric) | **OPEN — builder pull (Cindy lane)** |
| **VERIFY-COVERED-KW** | 🔴 | **LIVE shipped FP CLUSTER (started as VERIFY-MENACE, audit widened it).** `COVERED_KEYWORDS` claimed `native-body` for **11 keywords the runtime NEVER enforces** (a keyword is enforced only if consulted via `permanentHasKeyword`/SBA/attack-legality): menace·skulk·intimidate·fear·horsemanship (block restrictions — `canBlock` honors only flying/reach), **defender** (a Wall can illegally attack — `actionsDeclareAttacker` never excludes it), hexproof·shroud·ward (no targetability check in `enumerateTargets`), protection (DEBT all unenforced), prowess (an unmodeled pump trigger). Each = the body is claimed native but mis-resolves. **Resolution (enforce-don't-drop):** #255 dropped all 11 → Arbiter, but **#256 REVERTED that** — they stay CLAIMED native as openly-labeled INTERIM FPs (see `COVERED_KEYWORDS`) while the enforcement is built. The REAL fix = the re-coverage rows below. **EVADE #258 + KW-UNTARGET #260 + TRIG-PROWESS #262 now ENFORCE 9 of the 11** (menace/skulk/fear/intimidate/horsemanship/defender + hexproof/shroud + prowess) → honestly native, **each Hans-verified**. **2 remain interim FP:** ward (a targeting tax) + protection (DEBT). | 9/11 enforced | EVADE+KW-UNTARGET+PROWESS; 2 left |
| **FIX-TRIG-CONDITION** | 🔴 | `classifyCondition` over-detects restricted/compound-subject triggers (selfRef too broad; scope-inexpressible restriction dropped → over-fires). 34 cards incl. aristocrats staples. Detail: `docs/qa/rod-findings-1.md`. | 34 (−FP) | DONE #226 |
| **VERIFY-ETB-DESTROY** | 🟡 | Ravenous Chupacabra & the ETB-destroy-an-opponent family. | spot-check | **VERIFIED — not a bug #255**: parses `"…an opponent controls"` (`targetsResolvable=true`, the runtime gate); chooser picks an opponent (never own), no-target fizzles via CR 603.3c / `NO_SAFE_TARGET`. Added a restricted-clause + no-target regression pin. |
| **FIX-PW-LAND-ORDER** | 🟢 | Wrenn and One (corpus's only Land Planeswalker) hit the `land` tier before the planeswalker gate → counted native-`land` despite unmodeled loyalty. **Fixed:** PW gate now runs first → `arbiter-pw`. Pure metric, no runtime harm. | 1 (−FP metric) | DONE #255 |

> **🔁 Re-coverage rows:** ✅ **EVADE #258 (+141)** + ✅ **KW-UNTARGET #260 (hexproof/shroud)** + ✅ **TRIG-PROWESS #262** DONE → **9 of 11 keywords now honestly enforced** (Hans-verified each). **Remaining 2 interim FPs:** **ward** (a TAX, CR 702.21 — its own slice) · **PROTECTION/DEBT** (δ subsystem, ~77). Enforce-don't-drop is proven 3× over — coverage rose CORRECTLY as each enforcement converted interim→honest.
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
> **WALT — the KEYWORD backlog (`feat/<KW-id>-walt`).** RESERVED + DISJOINT from Cindy (see the **LANE ASSIGNMENT**
> section up top + the 3 shared-subsystem watch-points). Walt owns **all of Waves B–G** in
> [`keyword-coverage-plan.md`](keyword-coverage-plan.md), family by family, enforce-first — ~4,500+ tractable cards.
> **Suggested start order** (skip the trigger waves until Cindy's compiler core is solid): **EVADE-2 (shadow)** →
> **KW-CYCLING** (the clean cast-cost pilot) → **TRIG-ATTACK-PUMP** (once the compiler core lands) → **TRIG-ETB-VALUE**
> → **KW-POISON** → **KW-WARD/PROTECTION** (close the last 2 interim-FP keywords) → the Wave-C cast-cost subsystem.
> _(Walt's PW-leverage count lane is DONE (#263/#266/#268/#271/#272); WALT-ANIMATE is mid-flight (#274 PR1) — he
> wraps that, then this keyword backlog is his standing lane. He no longer spins down after PW.)_

### 🔴 high-lever

> **⭐ KEYWORD MASTER PLAN — now WALT's standing backlog** (re-carve above): all 189 CR 702.x keywords mapped to
> waves (frequency · status · the task that covers each), enforce-first: [`keyword-coverage-plan.md`](keyword-coverage-plan.md).
> The top ripe keyword-family rows below (EVADE-2, TRIG-ATTACK-PUMP, KW-CYCLING) are **Walt's** now; the plan holds
> the full months-long ordered backlog.
>
> **⭐⭐ GREENLIT — COMMANDER FRAMEWORK is CINDY'S #1 PRIORITY (Colton, 2026-06-18).**
> The Academy plays Commander but a commander **can't be cast from the command zone** today (no action in
> `actionDispatcher`/`legalChoices`; the multi-commander command-zone ARRAY + damage tracking already exist in
> `gameState`). A "does a real game play" gate, NOT a coverage-% row — ranks like Walt's PW framework.
> **Cindy's live order:** CMD-CAST ✅ #273 → **CMD-RETURN 🔵 #276 (in 4b review)** → **CMD-DMG21 (PR3 — ACTIVE BUILD,
> the 21-loss rule)** → CMD-PARTNER (~143) → CMD-COMPANION (~12) → CMD-RETURN-ZONES (903.9b fast-follow), **THEN the
> general (non-keyword) trigger-effect compiler + clean spell atoms / δ** (**NOT the keyword waves — those are Walt's
> now**). **Concrete build plan (file:function, CR-verified):** [`commander-framework-build-plan.md`](commander-framework-build-plan.md).
> _(Cindy owns the trigger-compiler **core**; Walt's Wave-B keyword-triggers adapt off it — see the watch-points up top.)_

| ID | Mechanic / atom (short landmine — full detail in the report) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **CMD-CAST** | ⭐⭐ Commander framework base: cast a commander from the command zone + {2} tax per prior cast (CR 903.8) + the `isCommander` flag. | gameplay | sub | **DONE #273** | every EDH deck |
| **CMD-RETURN** | Return-to-command-zone on death/exile (CR 903.9) — the dies/exile-replacement so a commander goes back to the zone instead of graveyard/exile. | gameplay | med | **🔵 #276 (in 4b review)** | every EDH deck |
| **CMD-DMG21** | ⭐⭐ **CINDY ACTIVE BUILD (PR3) — the signature rule.** Commander combat damage → the 21-loss SBA (CR 903.10a): wire `combatResolution`→`addCommanderDamage` **keyed per-commander, not per-player** (903.10a = "the same commander" — **CMD-PARTNER depends on this keying**), add the ≥21→player-loses SBA, AI prioritizes casting its commander. **Full-4P live gate** (a real pod where commanders die, return, chip a player to a 21 loss). | gameplay | sub | **OPEN — ACTIVE (Cindy)** | every EDH deck |
| **CMD-PARTNER** | Partner / Partner-with / Backgrounds / Friends-forever (CR 702.124, ~143) — two commanders in the zone. Plumbing (command-zone array + per-commander tax/damage) is done by CMD-CAST + CMD-DMG21, so this is mostly **deck-import pair recognition** (detect the legal pair → seat both at game start) + pairing-legality. HUGE in EDH. | ~143 | med | OPEN (after CMD-DMG21) | partner pairs, Backgrounds |
| **CMD-COMPANION** | Companion (CR 702.139) — companion zone + `{3}`: put it into hand once per game, gated by the deck restriction. Independent of the rest. | ~12 | med | OPEN | Lurrus, Yorion, Jegantha |
| **CMD-RETURN-ZONES** | Small fast-follow to CMD-RETURN: 903.9b — a commander **bounced to hand / tucked to library** may go to the command zone instead (CMD-RETURN/#276 covers the graveyard/exile zones; this is the remaining two). | gameplay | low | OPEN (fast-follow) | every EDH deck |
| **EVADE-2 (shadow)** | _(Walt — ripe keyword START, no compiler dep)_ Evasion: can block / be blocked ONLY by shadow (CR 702.28). **One more `combatEvasion.canBlockAttacker` branch** — the EVADE chokepoint already exists. Ripe, low-risk, engine-first. | ~37 | low | **OPEN (Walt)** | Dauthi Slayer, Soltari Priest, Thalakos Seer |
| **TRIG-ATTACK-PUMP** | _(Walt — Wave B; **wait for Cindy's compiler core**)_ Attack/block-triggered keyword pumps — Exalted (alone), Battle cry, Mentor, Melee, Training, Bushido, Flanking, Dethrone — each "whenever ~ attacks/blocks, pump" → reuse the TRIG-PUMP compiler + a +1/+1-counter atom. One keyword/PR. **Build-time CR-verify each shape.** | ~180 | low-med | **OPEN (Walt)** | Sublime Archangel, Goblin Wardriver, Odric, Master Tactician |
| **KW-CYCLING** | _(Walt)_ ⭐ **Cast-cost subsystem PILOT (cleanest, no compiler dep).** "{cost}, Discard this card: Draw a card" — a from-HAND activated ability (+ typecycling/landcycling search variants). No cast-path surgery needed; proves the cost-keyword pattern before the big Wave-C subsystem. | ~328 | med | **OPEN (Walt)** | Decree of Justice, Krosan Tusker, Eternal Dragon |
| **ACT-KW-GRANT** | `{cost}: This creature gains <KW> until EOT` — self keyword-grant. Reuses GRANTABLE_COMBAT_KEYWORDS allowlist (the allowlist IS the FP guard). **Self-ref only, all-or-nothing whole card** — reject `target`-grants (different atom) + multi-ability cards. | ~46 | low | DONE #235 | Goblin Balloon Brigade, Narnam Cobra, Unyielding Krumar |
| **KWSTRIP-1** | Strip the vacuous cast-keyword line (foretell/suspend/splice-onto-arcane/recover/harmonize/basic-landcycling), then parse the body. The #200 precedent, zero new resolver. **Exclude rebound/cipher/conspire/learn/proliferate/amass (NOT vacuous).** | ~44 | low | DONE #234 | Doomskar, Rift Bolt, Evermind, Grim Harvest, Crashing Footfalls |
| **SOFT-CNT** | "Counter target spell unless its controller pays {N}." Opponent-decision pending-choice at resolution (an opponent in 4P). Clean core = `pays {fixed}` only. | ~36 | sub | DONE #243 (Cindy) | Force Spike, Mana Tithe, Mana Leak, Censor, Rune Snag |
| **DIG-1** | Impulse-dig: "Look at top N. Put one into your hand, rest on the bottom." HAND-dig only (battlefield-dig is its own atom); drop Descend/Casualty/Domain prefixes. Reuses δ-1b picker. | ~25-30 | med | DONE #232 | Sleight of Hand, Telling Time, Glimpse the Cosmos |
| **TRIG-PUMP-1** | ⭐ **Pilot for the trigger-effect compiler.** "Whenever this attacks/blocks, IT gets +N/+N until EOT" — wire the trigger's effectClause into the temp-pump program. **Fixed-integer anchor** (reject +X/for-each); recipient = "it"/"this", never "other creatures"/"target". | ~23 | low | DONE #238 (compiler pilot ✓) | Brazen Wolves, Charging Paladin, Steadfast Cathar |
| **PUMP-1** | Team pump: "Creatures you control get +X/+Y until EOT." Reject `and gain <keyword>` riders (Triumph of the Hordes → infect). Reuses each-you-control enumerator (#211). | ~22 | low | OPEN | Rally the Peasants, Guardians' Pledge, Coordinated Charge |
| **REG-1** | Regrowth (gy → HAND): "Return target \<type> card from your graveyard to your hand." Accept the card-type union; `your graveyard` ≠ `a graveyard`; drop `up to one/two`. Reuses #207. | ~22 | low | DONE #231 | Argivian Find, Relearn, Nature's Spiral, Call to Mind |
| **MT-1** | Divide-among picker: "deals N damage / distribute N +1/+1 divided among any number of targets." Subsumes CNT-2b's distribute half. | ~20 | med | DONE #237 | Rolling Thunder, Pyrotechnics, Meteor Swarm, Hail of Arrows |
| **EVADE** | ⚠ **engine-first** combat-keyword engine via ONE `canBlock` chokepoint: unblockable + can't-block (~40) · basic landwalk (~61, per-defender = 4P-correct) · can-block-only-flying (~20). **Must ship canBlock enforcement BEFORE flipping COVERED_KEYWORDS** (else unblockable creatures get blocked = FP). Bare-clause only. **SHIPPED:** one `combatEvasion.canBlockAttacker` chokepoint (layer-aware, bare-shapes-only) + menace ≥2 at resolution + defender filtered at declare-attackers. menace/skulk/fear/intimidate/horsemanship/landwalk/unblockable/can't-block/can-block-only-flying + defender now ENFORCED → honestly native. | **+141 ✅** | sub | DONE #258 | Invisible Stalker, Bog Wraith, Jungle Lion, Cloud Elemental |

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
| **KW-UNTARGET** | ✅ **DONE #260** — hexproof (no opponent target) + shroud (no target) enforced in `enumerateTargets` + Equip (layer-aware). **ward DEFERRED** (it's a TAX not an exclusion, CR 702.21 → its own slice / TARGET-RESTRICT). | hexproof/shroud ✅ | sub | DONE #260 | Invisible Stalker (hexproof), Silhana Ledgewalker (shroud) |
| **TRIG-PROWESS** | **Re-coverage (#255 drop) — DONE:** prowess modeled as a real cast-trigger self-pump (CR 702.108, `triggers.checkCastTriggers`, reuses TRIG-PUMP). prowess returned to enforced. | ~23 ✅ | med | DONE #262 | Monastery Swiftspear, Soulfire Grand Master, Stormchaser Mage |
| **TRIG-LIFEGAIN** | ⭐ **Fresh trigger-event hook (cycle-7 scan — top ripe lever).** Wire "Whenever you gain life, \<effect\>" as a recognized trigger EVENT (the #264 combat-damage-event precedent) → its effectClause rides the existing compiler. **Hans-VERIFIED RIPE: ~17** single-trigger body-only flip native (clean effect + clean residue). **Landmine:** the gain-life EVENT must fire for ALL lifegain (lifelink/spell/ETB), not just combat; **reject "for the FIRST time each turn"** (a limited variant). | ~17 | med | OPEN | Archangel of Thune, Cliffhaven Vampire, Drogskol Reaver, Hallowed Priest |
| **TRIG-DRAW2** | **Fresh trigger-event hook (cycle-7 scan).** Wire "Whenever you draw your second card each turn, \<effect\>" → compiler. **Hans-VERIFIED RIPE: ~11.** **Landmine:** needs a per-turn draw COUNTER (reset each turn) so it fires on exactly the 2nd draw — model it or stay LOW. | ~11 | med | OPEN | Irencrag Pyromancer, Lat-Nam Adept, Prince Imrahil the Fair |
| **TRIG-TOKEN-ABIL** | **Trigger-compiler FIX (Walt's signal — `project_walt_token_ability_lane`).** The compiler DROPS a created token's quoted `It has "\<cost\>: \<effect\>"` ability (colon-exclusion + internal-period truncation) → ~30 Eldrazi/Spawn makers stuck body-only. Capture the full quoted token ability → they flip native-trigger WITH the token's real mana/sac ability. | ~30 | med | OPEN | Blisterpod, Nest Invader, Dread Drone, Eldrazi Spawn makers |

### 🟢 small / cleanup

| ID | Mechanic / atom (short landmine) | ~Yield | Cplx | Status | Examples |
|---|---|---:|---|---|---|
| **CNT-2b** | Remaining counter forms: "on up to N target creatures" + −1/−1 single & multi (reuses MT-1's picker). | ~10 | low | OPEN | Travel Preparations, Incremental Growth |
| **SYMBURN-1** | "Deals N to each creature and each player" (extend the each-creature path to faces). Must hit ALL players incl. caster. **Hans-verified (board-10): resolver loops every player incl. the caster + every creature; CR-correct.** | ~8 | low | DONE #269 | Inferno, Famine, Fire Tempest, Evincar's Justice |
| **ACT-SELF-BOUNCE** | "{cost}: Return this creature to its owner's hand" (bind target=source). Bundle, not a solo PR. | ~6 | low | OPEN | Darting Merfolk, Fleeting Image, Blinking Spirit |
| **TUCK-1** | "Put target \<perm\> on top/the bottom of its owner's library" (new `tuck` op, top/bottom precise). Anchored whole-card; riders/unions/restrictions + tuck-triggers → Arbiter. | +13 | low | DONE #270 | Time Ebb, Griptide, Excommunicate, Repel |
| **RIDER-2ND-MINUS** | Pump target 1 + debuff a DISTINCT 2nd creature. Needs distinct-second-target binding; don't loosen "another" globally. | ~5 | med | OPEN | Leeching Bite, Consume Strength, Schismotivate |
| **DEFENDER-ENFORCE** | **Re-coverage — FOLDED INTO EVADE #258:** Defender excluded from `actionsDeclareAttacker` (CR 702.3b, layer-aware via `permanentHasKeyword`) → "defender" returned to COVERED_KEYWORDS. | ✅ (in #258) | low | DONE #258 | Wall of Omens, Fog Bank, Doran the Siege Tower (grants), Axebane Guardian |

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
