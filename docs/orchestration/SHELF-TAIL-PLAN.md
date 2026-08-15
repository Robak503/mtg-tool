# SHELF-TAIL PLAN — the next three decks to 90

> **The self-contained grind plan for Wolverine → Kellan → Otharri.** A fresh session boots off THIS
> file + the standing discipline, without replaying the prior window. Written 2026-08-15 late, after
> Teval hit 90 (the 14th deck at the bar). Update the ✅/status lines in place as slices land.

## The order (Colton's steer, 2026-08-15 — do not reorder)

**① Wolverine 79 → ② Kellan 74 → ③ Otharri 74**, then Cap America 73 → Halfshell 67 → Shalai 67,
and the cEDH pair (**Believe it! 79, Kinnan 77) LAST** — "hardest to push past 90… focus those last."
Call the ceiling explicitly per deck when the residue is genuinely unbuildable-class.

## The per-slice discipline (unchanged — the compact checklist)

probe (print the FULL oracle + which line blocks) → build the smallest honest arm → flip-diff by tier
snapshot (`MTG_APP_ROOT="C:\Users\colto\AppData\Roaming\com.colton.mtg-tool" node scripts/tier-snapshot.mjs
--out/--diff`; the latest baseline is named below) → whole-card audit EVERY rider → witnesses with
seen-to-fail controls → per-process mutations (throw-on-no-op; disable arms, never null) → ONE
sequential lint+full-suite by UNPIPED exit codes → RUN-LEDGER + CHANGELOG → push → `gh run list`
green before the NEXT push. Per-deck gate: `node scripts/measure-coverage.mjs "<deck>"` (same
MTG_APP_ROOT). Old pins that flip are GRADUATED with the date + a surviving guard-class control.
The traps with names: the hollow credit (a modeled line the runtime never exercises — the Raul no-op
law), the pin set-and-graduated same day is fine, the LOST line is the whole point of the flip-diff.

**Latest tier baseline:** `scratchpad/tiers-afterJudgment.json` (in the session scratchpad — take a
fresh `--out` first thing if the scratchpad is gone; the diff pair only needs two fresh snapshots
around a slice).

## ① WOLVERINE, CLAWS OUT! — 79, needs 11

Counter-themed (X-Men). 21 residue; the probed queue:

1. ✅ **Forgotten Ancient** — SHIPPED 2026-08-15 (Wolverine 79→80). The move = the distribute pause +
   `moveFromId` (settle removes the spent total from the source) + `anyNumber` (zero legal = the "you
   may"; the atom is in the α2 UN-optional family). The AI really moves (whole pile → strongest own
   other; [] on enemy-only). The move machinery is now REUSABLE — #2's combat-start move-all rides it.
2. **The Ozolith** — leaves-with-counters accumulator (the dies/leave look-back ALREADY snapshots
   `counters` — see gameState markDead) + the combat-start move-all (an intervening-if "has counters
   on it" + the move machinery from #1).
3. **Kodama of the West Tree** — 0 triggers detect. Needs the MODIFIED predicate (equipped OR
   enchanted-by-own-aura OR any counter — all computable board reads) for: the combat-damage watcher
   (modified creature you control → fetch a basic land ONTO the battlefield — the tutor-to-bf lane
   exists) + the "modified creatures you control have trample" group static (the dynamic-selector
   grant machinery; add a requiresModified selector arm beside requiresAnyCounter/Cathedral-Acolyte).
4. **Warden of the Grove** — end-step self-counter (routes) + "it endures X" (the endure keyword:
   the recipient's controller chooses counters OR a token — a new choice mechanic; medium-heavy).
5. The upkeep bucket: **Neyith of the Dire Hunt** (upkeep fight offer), **Berserk**-class,
   **Canopy Gargantuan**. The anthems: **Inscription of Abundance** (modal), **Beastie Beatdown**,
   **The Last Agni Kai**. Statics: **Well Rested**, **Brotherhood Regalia** (granted
   shroud/can't-be-targeted class). **Cori-Steel Cutter** (cast trigger + token), **The Ozolith**
   pairs with #2, **Nibelheim Aflame** / **Legolas's Quick Reflexes** / **HULK SMASH!** (spells),
   the two Wolverine cards themselves (attacks + ETB), **Quilled Greatwurm**, **Meltstrider's
   Resolve**, **Raph & Mikey** (unclassified — probe fresh).

## ② KELLAN OF THE WEST — 74, needs 16 (the widest gap)

Spell-heavy Temur. The buckets: **12 unmodeled spells** (Recurring Insight, Unexpected Results,
Teferi's Protection ⚠️ likely CEILING-class (phase-out + protection-from-everything), One with the
Multiverse, Ellie and Alan, Mystic Forge…), **4 cast triggers** (Jace Reawakened, Rashmi Eternities
Crafter — the cast-MV-reveal lane, The Legend of Yangchen, Mind's Dilation), **4 ETBs** (Bonny Pall,
Savvy Trader, Transcendent Dragon, Aang//…), Sakashima's Protege / Fblthp / Eladamri (unclassified —
probe), The Reality Chip, The Key to the Vault, Monk Gyatso. Strategy: the cast-trigger bucket first
(Rashmi's reveal-cast rides the Velomachus-class reveal lane if built once), then the cheap ETBs;
expect 2-3 ceiling flags here — call them.

## ③ OTHARRI TEST — 74, needs 16

RW tokens/equipment. The buckets: **11 spells** (Tithe — tutor-land-conditional, Blacksmith's Skill,
Hour of Reckoning, Neyali, Galadriel's Dismissal, Anim Pakal…), **4 activated** (Everflowing Chalice
— the charge-counter X rock, **Giver of Runes + Mother of Runes** — the protection-choice pair, ONE
arm serves both, Kirol), **3 ETBs** (Solitude — the evoke pitch class, Rosie Cotton, Staff of the
Storyteller), **2 attack triggers** (Otharri herself — experience counters + a hasty Phoenix token;
Aurelia the Law Above), Ocelot Pride / Windcrag Siege (upkeep), Zack Fair / Patrolling Peacemaker
(enters-as/replacement), Glimmer Lens, Crumb and Get It. Strategy: Mother/Giver's shared protection
arm + Everflowing Chalice first (cheap, cross-deck staples), then Otharri herself (the commander =
the win per the Joe-deck law).

## Standing state (2026-08-15 close)

Shelf: **14 at the bar** · below: Wolverine 79 · Believe it! 79 (cEDH-last) · Kinnan 77 (cEDH-last) ·
Kellan 74 · Otharri 74 · Cap 73 · Halfshell 67 · Shalai 67. Batch **+51** post-v0.159.0 (tag at
~100). Suite anchor: 1263 files / 14,701 tests. Six ceiling candidates flagged so far: Six (retrace),
Teferi's Protection (phasing), Tasigur (delve), Sakashima's Protege (probe), Overlord of the
Balemurk (impending), Breach the Multiverse — confirm or break each when reached.
