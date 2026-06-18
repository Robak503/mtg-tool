# Coverage Task Board — the prioritized backlog the builder faculties pull from

**Model:** builders **pull from this board** rather than owning a fixed mechanic — pick the highest-priority
`OPEN` task you're suited for, develop your own working knowledge, never idle. **Hans (scout) maintains +
re-prioritizes this board** as the modeled set grows; **Rod (QA) and Omnath file findings here as new
tasks.** Omnath (Command) merges; only Omnath touches `master`.

## How to claim a task (collision-safe, no inter-chat chat needed)

1. Pick the highest-priority **`OPEN`** task that fits you.
2. **Claim it by pushing your branch immediately:** `git fetch origin && git checkout -B feat/<task-id>-<short> origin/master && git commit --allow-empty -m "claim <task-id>" && git push -u origin feat/<task-id>-<short>`. The branch's existence on the remote = your claim.
3. **Before pushing the claim, check it's free:** `git ls-remote --heads origin "feat/<task-id>-*"` — if a branch already exists, someone has it; take the next task.
4. Tell Colton "claiming `<task-id>`" so he can deconflict if two of you race.
5. Build it (full gate), open the PR. When merged, mark it `DONE` is Omnath's job — you just grab the next `OPEN`.

A task is **disjoint** from the others by design (different atoms / oracle shapes), so two builders on two
different tasks won't collide; the worktree isolation + Omnath's serialized merges handle the rest.

## Board (priority: 🔴 high-lever · 🟡 medium · 🟢 small/cleanup · ⛔ hard/δ — defer)

| ID | Pri | Mechanic / atom shape | ~Clean yield | Status | Examples |
|---|---|---|---:|---|---|
| **FIX-TRIG-COMPOUND** | 🔴 | **Rod QA #1 — compound-event triggers drop their 2nd event.** `detectTriggers` keeps only the first event in a sentence encoding two ("enters or dies", "enters or is put into a graveyard", "enters or attacks", "enters and whenever you cast …"); `allTriggerSentencesModeled`'s count-guard (1 sent == 1 detected) is fooled → claimed native, 2nd trigger silently dropped. **15 cards.** Safe fix: in `classifyCondition` return null on a 2nd event (precedent: the `attacks or blocks` / `becomes blocked` guards) → Arbiter; pin MUST_DROP_TO_LOW. Detail + repro: `docs/qa/rod-findings-1.md`. | 15 (−FP) | OPEN | Stitcher's Supplier, Grave Titan, Ichor Wellspring, Ashen Rider, Up the Beanstalk |
| **FIX-TRIG-CONDITION** | 🔴 | **Rod QA #1 — `classifyCondition` over-detects restricted/compound-subject triggers.** (a) `selfRef=/\bthis\b/` is too broad → "a creature **dealt damage by this** … dies" + "this **or another** creature you control dies/enters" mis-read as bare self, dropping the restriction / 2nd subject; (b) a scope-inexpressible restriction ("with a +1/+1 counter on it attacks", "attacks the player with most life", "dies during combat") is dropped → over-fires. **34 cards** incl. aristocrats staples (Zulaport, Cruel Celebrant, Rotlung Reanimator, Headless Rider) reduced to self-death only. Safe fix: tighten self-subject to the leading token + reject alternate-subject/restriction conds → Arbiter; pin MUST_DROP_TO_LOW. Detail: `docs/qa/rod-findings-1.md`. | 34 (−FP) | OPEN | Zulaport Cutthroat, Sengir Vampire, Tenured Inkcaster, Rotlung Reanimator |
| **FIX-TRIG-LTB** | 🔴 | **Rod QA #1 — leaves-the-battlefield triggers detected but NEVER fired.** `detectTriggers` emits `event:"ltb"` but there's no `checkLeaveTriggers` hook (only etb/dies/step/attack/cast); `triggerRoutesNatively` counts it native without checking the event is wired → silently dropped. **3 cards.** Safe fix (now): treat `event==="ltb"` as non-routing in `coverage.js` → Arbiter. Full fix: add `checkLeaveTriggers` (death fires BOTH dies + ltb, CR 700.4). Detail: `docs/qa/rod-findings-1.md`. | 3 (−FP) | OPEN | Thragtusk, Circuit Mender, Delusions of Mediocrity |
| **TOK-2** | 🔴 | **Named artifact tokens with built-in abilities** — Treasure / Clue / Food / Blood / Map / Powerstone / Gold. A canonical token table (name → type/oracle/P-T); each enters as a real permanent with its working ability (Treasure: `{T},Sac:Add 1 mana of any color`). Reuse the activated-ability machinery. | ~150-300 | OPEN | Deadly Dispute, Unexpected Windfall, Trail of Crumbs, Academy Manufactor |
| **CNT-2** | 🔴 | **Counter forms beyond on-each** — "Put N +1/+1 on target creature" (N>1), "on up to N target creatures", "distribute N +1/+1 among any number of target creatures", −1/−1 single+multi. (Single +1/+1 + team "on each you control" already done.) | ~120-200 | OPEN | Hardened Scales-ish, Travel Preparations, Cytoplast, Incremental Growth |
| **EP-2** | 🟡 | **Each/target-player discard** — "target player discards N" (Mind Rot; victim chooses — reuse the pending-choice picker), "each player discards N". (Each/target draw already done.) | ~80-130 | OPEN | Mind Rot, Wit's End, Painful Truths-adjacent |
| **EP-3** | 🟡 | **Each-player life / mill** — "each player loses N life", "each player mills N". | ~60-100 | OPEN | Syphon Soul, Mind Sculpt-adjacent |
| **ED-2** | 🟡 | **Edict variants** — "each player sacrifices a creature", "you sacrifice a/another <type>" as an effect, "sacrifice a creature: <effect>" (effect-side, not cost). (Target/opponent edict done #214.) | ~60-100 | OPEN | Smallpox-adjacent, Spawning Pit-adjacent |
| **TOK-3** | 🟡 | **Token counts** — "Create X 1/1 …" (X-spells), "Create N …" beyond five. (Typed + keyword tokens done #213.) | ~40-70 | OPEN | Secure the Wastes, Empty the Warrens, March of the Multitudes |
| **BURN-2** | 🟢 | **Burn riders** — "deals N damage to any target. <modeled rider>" pairs the existing damage atom can compose with (gain-life / scry / draw riders). Re-scan which rider combos are now both-modeled. | ~40-80 | OPEN | Char-class (the "and N to you" stays Arbiter), Skewer the Critics-ish |
| **GAIN-CTRL** | ⛔ | **Temporary control change** — Threaten / Act of Treason (gain control + untap + haste + give-back at end of turn). Needs a control-swap + end-of-turn give-back subsystem. **Hard δ — defer until the clean clusters are mined.** | ~25 | DEFER | Act of Treason, Threaten |
| **PREVENT** | ⛔ | **Replacement / prevention** — "prevent all combat damage…", "if … would … instead". A replacement-effects subsystem. **Hard δ — defer.** | ~big | DEFER | Fog-class, Story Circle |

**Hans:** re-rank + add rows here each scout cycle (the best next atom shifts as the set grows; estimate
the **honest clean-template count**, not the loose bucket headline); file any mis-modeled card you spot as a
`VERIFY-…` row. **Rod:** file any false-positive / interaction bug as a 🔴 `FIX-…` task. **Erin (Fixer):**
owns the `FIX-…` / `VERIFY-…` lane — verifies each is a real false positive, then fixes it (default fix:
tighten the matcher so the offender drops to LOW → Arbiter + pin `MUST_DROP_TO_LOW`); claims via `fix/<area>-*`
branches. Coverage rows (TOK/CNT/EP/ED/BURN/…) stay with **Cindy & Paula**. **Omnath:** flips status to
`DONE` on merge, files review P0s as `FIX-…` tasks.
