# Coverage Task Board — the prioritized backlog the builder faculties pull from

**Model:** builders **pull from this board** rather than owning a fixed mechanic — pick the highest-priority
`OPEN` task you're suited for, develop your own working knowledge, never idle. **Hans (scout) maintains +
re-prioritizes this board** as the modeled set grows; **Rod (QA) and Omnath file findings here as new
tasks.** Omnath (Command) merges; only Omnath touches `master`.

> **Last scout refresh:** cycle **board-2**, 2026-06-18 — live baseline **16.0 % corpus native**
> (5,369/33,540). The 16.3→16.0 dip is **correct**: the trigger FIX work (#218) + #221 de-claimed ~52
> false positives (forbidden under the CREED) — that outweighs the TOK-2/EP-2/CNT-2 additions this batch.
> Honest yields + per-atom false-positive landmines live in
> [`docs/scout-gap-report.md`](../scout-gap-report.md). **Read the landmine note for your task before you build.**

## How to claim a task (collision-safe, no inter-chat chat needed)

1. Pick the highest-priority **`OPEN`** task that fits you.
2. **Claim it by pushing your branch immediately:** `git fetch origin && git checkout -B feat/<task-id>-<short> origin/master && git commit --allow-empty -m "claim <task-id>" && git push -u origin feat/<task-id>-<short>`. The branch's existence on the remote = your claim.
3. **Before pushing the claim, check it's free:** `git ls-remote --heads origin "feat/<task-id>-*"` — if a branch already exists, someone has it; take the next task.
4. Tell Colton "claiming `<task-id>`" so he can deconflict if two of you race.
5. Build it (full gate), open the PR. Marking it `DONE` on merge is Omnath's job — you just grab the next `OPEN`.

A task is **disjoint** from the others by design (different atoms / oracle shapes), so two builders on two
different tasks won't collide; the worktree isolation + Omnath's serialized merges handle the rest.

## Board (priority: 🔴 high-lever · 🟡 medium · 🟢 small/cleanup · ⛔ hard/δ — defer)

Yields are the **honest clean-template count** (not the loose bucket headline). "Reuses" = infra already
shipped, so the build is mostly a new matcher + resolver, not a new subsystem.

### Active — pull from here (top = highest priority)

| ID | Pri | Mechanic / atom shape | ~Clean yield | Status | Examples |
|---|---|---|---:|---|---|
| **FIX-TRIG-CONDITION** | 🔴 | **Rod QA #1 — `classifyCondition` over-detects restricted/compound-subject triggers.** (a) `selfRef=/\bthis\b/` is too broad → "a creature **dealt damage by this** … dies" + "this **or another** creature you control dies/enters" mis-read as bare self, dropping the restriction / 2nd subject; (b) a scope-inexpressible restriction ("with a +1/+1 counter on it attacks", "attacks the player with most life", "dies during combat") is dropped → over-fires. **34 cards** incl. aristocrats staples (Zulaport, Cruel Celebrant, Rotlung Reanimator, Headless Rider) reduced to self-death only. Safe fix: tighten self-subject to the leading token + reject alternate-subject/restriction conds → Arbiter; pin MUST_DROP_TO_LOW. Detail: `docs/qa/rod-findings-1.md`. | 34 (−FP) | DONE #226 (Erin batch — 41 FPs) | Zulaport Cutthroat, Sengir Vampire, Tenured Inkcaster, Rotlung Reanimator |
| **PUMP-1** | 🔴 | **Team pump** — "Creatures you control get +X/+Y until end of turn." Apply the existing pump to every creature you control. **Reject the `and gain <keyword>` riders** (Triumph of the Hordes → infect) unless that grant is modeled — pure +X/+Y only; watch "Green creatures you control" (color-restricted subset). Reuses the each-you-control enumerator (#211) + pump resolver. | ~22 | OPEN | Rally the Peasants, Guardians' Pledge, Marshaling Cry, Coordinated Charge, Heroic Charge |
| **REG-1** | 🔴 | **Regrowth (graveyard → HAND)** — "Return target \<type> card from your graveyard to your hand." The gy→hand sibling of β-3b reanimation (gy→battlefield); simpler (no ETB/summoning-sick). Accept the card-type union (creature / artifact-or-enchantment / instant-or-sorcery / permanent / land / any). **`your graveyard` ≠ `a graveyard`** (scope); drop `up to one/two target` (optional/multi). Reuses #207 gy-targeting. | ~22 | OPEN | Regrowth, Argivian Find, Relearn, Call to Mind, Nature's Spiral, Déjà Vu |
| **DIG-1** | 🔴 | **Impulse-dig (look → keep one → bury rest)** — "Look at the top N cards of your library. Put one into your hand, the rest on the bottom." Inherently two sentences = one atom. **Scope to HAND-dig only** (battlefield-dig / Collected Company is its own atom); drop Descend/Casualty/Domain/Bargain-prefixed variants. Reuses the δ-1b pending-choice picker (#209). | ~25-30 | OPEN | Sleight of Hand, Telling Time, Glimpse the Cosmos, Experimental Augury, Discerning Taste |
| **MT-1** | 🔴 | **Divide-among picker** — "deals N damage divided as you choose among any number of target creatures/players" + "distribute N +1/+1 counters among any number of target creatures." A number-distribution decision (assign N among chosen targets) — distinct from "up to N targets." Un-gates the whole divide-among family at once. **Subsumes the `distribute` half of CNT-2b.** | ~20 | OPEN | Rolling Thunder, Pyrotechnics, Meteor Swarm, Hail of Arrows, Blessings of Nature |
| **TOK-3** | 🟡 | **Create X / N>5 tokens** — "Create X 1/1 …" (X from the cost) and "Create N …" beyond five. Reuses the typed/keyword token machinery (#213) + X-spell infra. Drop the `where X is <board count>` variable-source riders. | ~15 | DONE #225 | Secure the Wastes, March of the Multitudes, Empty the Pits, Deploy to the Front, Storm Herd |
| **EP-3** | 🟡 | **Target / each-player MILL** — "Target player mills N cards", "Each player mills N." Deterministic (top N → graveyard), **no picker** — simplest player-effect atom. **The life-half is RETIRED** (only 3 clean — "each player loses N life" is rider-dominated, e.g. Smallpox/Death Cloud). Drop "mills X" (X-spell) + graveyard-count riders. | ~16 | DONE #224 | Tome Scour, Glimpse the Unthinkable, Traumatize, Cut Your Losses, Memory Sluice |
| **ED-2** | 🟡 | **Edict variants** — "each player sacrifices a \<type> of their choice" (~12 clean; extends target/opponent edict #214 to all players, each picks own), plus the effect-side "you sacrifice a/another \<type>" and "sacrifice a creature: \<effect>" outlets. Reuse the edict victim-picker. | ~12+ | DONE #227 | Innocent Blood, Barter in Blood, Tremble, Crack the Earth, Renounce the Guilds |
| **SOFT-CNT** | 🟡 | **Soft counter** — "Counter target spell unless its controller pays {N}." **Opponent-decision subsystem:** the spell's controller (an opponent in 4P) chooses to pay at resolution — needs an opponent-payment pending-choice, not a caster choice. Clean core = `pays {fixed}` only (drop `pays {X}` + non-mana variants + the draw/discard/suspect tails). | ~36 | OPEN | Force Spike, Mana Tithe, Mana Leak, Miscalculation, Censor, Rune Snag |
| **FOG-1** | 🟡 | **Fog latch** — "Prevent all combat damage that would be dealt this turn." A turn-scoped one-shot damage-skip flag `combatResolution.js` checks. **Scope to the whole-turn latch ONLY** — NOT aura/permanent ongoing prevention (that's the deferred PREVENT subsystem). | ~14 | OPEN | Fog, Darkness, Holy Day, Moment's Peace, Constant Mists |
| **CNT-2b** | 🟢 | **Remaining counter forms** — "Put N +1/+1 on up to N target creatures" (multi-select, reuse MT-1's picker once built) + "−1/−1 single & multi". The `distribute … among any number` half is covered by **MT-1**; the single-target N>1 was the cheap part of CNT-2 (#219). | ~10 | OPEN | Travel Preparations, Cytoplast Root-Kin-ish, Incremental Growth, Wretched Confluence |
| **BURN-2** | 🟢 | **Burn riders** — "deals N damage to any target. \<modeled rider>" the existing damage atom can compose with (gain-life / scry / draw riders). Re-scan which rider combos are now both-modeled. Composition, not a clean standalone bucket. | composition | DONE #229 | Char-class (the "and N to you" stays Arbiter), Skewer the Critics-ish |
| **GAIN-CTRL** | ⛔ | **Temporary control change** — Threaten / Act of Treason (gain control + untap + haste + give-back at end of turn). Needs a control-swap + end-of-turn give-back subsystem. Hard δ — defer until the clean clusters are mined. | ~25 | DEFER | Act of Treason, Threaten |
| **PREVENT** | ⛔ | **Ongoing replacement / prevention** — aura/permanent prevention ("…dealt to and dealt by enchanted creature"), "if … would … instead", Story Circle. A replacement-effects subsystem. Hard δ — defer. (The one-shot Fog latch is carved out as FOG-1.) | ~big | DEFER | Story Circle, Sandskin-class |

**Ripe OPEN for builders (skip the FIX row — that's Erin's lane):** PUMP-1 · REG-1 · DIG-1 · MT-1 are all 🔴,
clean, and reuse shipped infra. None overlap each other or the in-flight set.

### Shipped this run (DONE — Omnath's merge ledger)

| ID | Mechanic | PR |
|---|---|---|
| **TOK-2** | Named artifact tokens (Treasure/Clue/Food/Gold) | DONE #218 |
| **CNT-2** | Optional single-target counter ("up to one target creature") | DONE #219 |
| **EP-2** | Target/each-player discard N (victim chooses, CR 701.8) | DONE #220 |
| **FIX-TRIG-COMPOUND** | Compound-event triggers drop their 2nd event (15 cards −FP) | ~DONE #218 — Erin verify+pin |
| **FIX-TRIG-LTB** | leaves-the-battlefield triggers detected but never fired (3 cards −FP) | ~DONE #218 — Erin verify+pin |

**Hans (Scout):** re-rank + add rows each cycle (the best next atom shifts as the set grows; estimate the
**honest clean-template count**, not the loose bucket headline); file any mis-modeled card you spot as a
`VERIFY-…` row. **Rod (QA):** file any false-positive / interaction bug as a 🔴 `FIX-…` task. **Erin (Fixer):**
owns the `FIX-…` / `VERIFY-…` lane — verifies each is a real false positive, then fixes it (default fix:
tighten the matcher so the offender drops to LOW → Arbiter + pin `MUST_DROP_TO_LOW`); claims via `fix/<area>-*`
branches. Coverage rows (PUMP/REG/DIG/MT/TOK/EP/ED/…) stay with **Cindy, Paula & Tess**. **Omnath:** flips
status to `DONE` on merge, files review P0s as `FIX-…` tasks.
