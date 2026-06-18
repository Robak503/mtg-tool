# Rod QA — Findings Report #1 (trigger subsystem false positives)

**QA faculty:** Rod · **Date:** 2026-06-18 · **Baseline:** v0.38.0 (corpus 16.3% native)
**Method:** ran the real classifier (`coverage.js` `classifyCard` — the SAME gate the runtime
uses to decide native-vs-Arbiter) over the whole ~33.5k-card corpus, enumerated the native
(HIGH) set, and adversarially inspected it for the CREED-forbidden class: a card claimed
native that **drops a clause / trigger / cost, targets wrong, or fires at the wrong time.**

## Headline

- **Spell tier (650 native): CLEAN.** 39 structural suspects all proved to be false alarms
  (the "can't be countered" / "can't be regenerated" riders are intentionally-stripped vacuous
  clauses; impulse-dig honors `restTo` graveyard-vs-bottom; the Duress-family `discard-chosen`
  honors `include`/`exclude`/`maxCmc` — Inquisition's "mana value 3 or less" IS enforced; modal
  spells like Crosis's Charm resolve the chosen mode only, end-to-end). **Zero dropped-clause FPs.**
- **Activated tier (580 native): CLEAN** on inspection (every "suspicious" verb maps to a
  genuinely-modeled mechanic — tutor-with-allowlisted-filter, eachOpponent drain, reanimate, etc.).
- **Recent merges #211–#215: atoms are CREED-safe.** #213 keyword tokens correctly route a
  menace token / ability-bearing token / unmodeled-rider token to LOW → Arbiter (verified). The
  false positives below live in the **pre-existing trigger-detection layer** these PRs sit on —
  not introduced by them. (#215 was itself a trigger-FP fix, so this layer is being hardened; these
  findings extend that work.)
- **🔴 Trigger tier (643 native-trigger + native-mixed): 52 FALSE POSITIVES** across three
  root-cause classes. ~8% of the trigger tier is mis-modeled, including marquee aristocrats,
  tribal, and value staples. **This is the report.**

---

## FIX-TRIG-COMPOUND — compound-event triggers drop their second event (15 cards) 🔴

**Mechanism.** `detectTriggers` (triggers.js `classifyCondition`) returns on the FIRST event
keyword it finds in a trigger sentence. A sentence that encodes **two events** —
"When this creature **enters or dies**", "When this artifact **enters or is put into a graveyard**",
"Whenever this creature **enters or attacks**", "When this enters **and whenever you cast** …" — is
detected as the first event only; the rest is silently dropped. `coverage.js`
`allTriggerSentencesModeled` compares *sentence count* to *detected count* (1 == 1 here), so the
guard is fooled — it never notices the single sentence carried two events.

**Live repro (proven, not theory):**
```
node scripts/qa-sweep.mjs triggers      # lists them
# Stitcher's Supplier: ETB mill fires (1 trigger); dies mill fires 0 triggers — the "or dies" half is dropped.
```

**Affected (all native-trigger, all dropping a second event):**
Stitcher's Supplier · Ichor Wellspring · Mephitic Draught · Nimblewright Schematic · Servo Schematic
(the artifact "enters or is put into a graveyard" family) · Thawbringer · Wary Thespian · Wary Watchdog ·
Lys Alana Informant · Crow of Dark Tidings (the "enters or dies" surveil/mill family) · **Grave Titan**
("enters or attacks" → makes zombies on ETB only, never on attack) · **Ashen Rider** ("enters or dies,
exile target permanent" → drops the dies-exile) · Up the Beanstalk ("enters and whenever you cast a spell
MV5+" → the cast-draw engine, its whole purpose, is dropped) · Lae'zel, Wrathful Warrior ("enters or
specializes") · Cryptid Inspector (morph "and whenever … turned face up", also fabricates a self-ETB counter).

**Safe fix (matches the board's default remedy):** in `classifyCondition`, detect a second
event-verb / `or`-joined event / `and whenever` in the condition and return `null` → the card's
trigger-sentence accounting then routes the WHOLE card to the Arbiter. Precedent already exists in
the same function: the `attacks or blocks` guard (line ~154) and `becomes blocked` guard (line ~167)
both return null for exactly this reason. Pin `MUST_DROP_TO_LOW` for Stitcher's Supplier + Grave Titan.
(Modeling both events is the richer follow-up; Arbiter-routing is the correct immediate CREED-safe move.)

---

## FIX-TRIG-CONDITION — `classifyCondition` over-detects restricted/compound-subject triggers (34 cards) 🔴

**Mechanism (two intertwined bugs in one function).**

1. **`selfRef` is too broad** — `selfRef = /\bthis\b/.test(c)` is true whenever the word "this"
   appears ANYWHERE in the condition. So:
   - "Whenever a creature **dealt damage by this creature** this turn dies, …" (Sengir Vampire,
     Sengir Bats, Vampiric Dragon, Blood Cultist; Axelrod Gunnarson via card name) is mis-read as a
     **self**-dies trigger and the "dealt damage by this" restriction is dropped. Result: it fires a
     useless counter when the SOURCE itself dies, and the real ability never works.
   - "Whenever **this creature or another creature you control** dies/enters, …" is mis-read as a
     bare **self** trigger — the entire "**or another … you control**" second subject is dropped.

2. **Scope-inexpressible restrictions are dropped → over-fire** — a condition restriction the
   chosen scope can't represent, and that isn't an `if …,` intervening-if, is silently dropped:
   "a creature you control **with a +1/+1 counter on it** attacks" (Tenured Inkcaster → drains on
   EVERY attack), "this creature attacks **the player with the most life**" (Preacher of the Schism →
   over-fires, esp. 4P), "attacks **while you control a token**" (Seasoned Warrenguard), "dies
   **during combat**" (Mongrel Pack → makes tokens on ANY death).

**Live repro (proven):**
```
# Zulaport Cutthroat: another creature you control dies -> 0 triggers fire (should drain each opp + gain 1).
#   Control case Blood Artist ("whenever a creature dies") correctly fires 1. (qa-sweep harness, this report.)
```

**Highest-impact victims (aristocrats / tribal payoffs reduced to self-death-only):**
**Zulaport Cutthroat**, **Cruel Celebrant**, **Headless Rider**, **Rotlung Reanimator**,
**Vengeful Dead**, Warteye Witch, Undead Augur, Midnight Entourage, Mycoid Shepherd — all drain/recur
on "this **or another** creature/Zombie/Cleric you control dies" but fire only on their own death.
**Wrong-time misfires:** Sengir Vampire, Sengir Bats, Vampiric Dragon, Blood Cultist, Axelrod Gunnarson.
**Rally/ETB tribe (under-fire — self-ETB fires, "another X enters" dropped):** Kazandu Blademaster,
Tuktuk Grunts, Oran-Rief Survivalist, Nimana Sell-Sword, Umara Raptor, Graypelt Hunter, Makindi
Shieldmate, Hada Freeblade, Bogwater Lumaret, Kor Celebrant, Fallaji Vanguard, Pactdoll Terror, Qasali
Slingers, Oath of the Ancient Wood, Arbaaz Mir, Gladewalker Ritualist. **Over-fire (dropped
restriction):** Tenured Inkcaster, Preacher of the Schism, Seasoned Warrenguard, Mongrel Pack.

**Safe fix:** require the self-subject to be the LEADING token ("this <type> <verb>" / "<cardname>
<verb>") with no trailing restriction; reject any condition carrying an "or another …" alternate
subject, or a `with` / `while` / `dealt damage by` / `the player with` / `named` / `during` restriction
→ `null` → Arbiter. Pin `MUST_DROP_TO_LOW` for Zulaport Cutthroat + Sengir Vampire + Tenured Inkcaster.
(The aristocrats "this or another creature you control dies" family is a strong future native target —
model it as a both-subjects dies-watcher; until then, Arbiter is correct.)

---

## FIX-TRIG-LTB — leaves-the-battlefield triggers are detected but NEVER fired (3 cards) 🔴

**Mechanism.** `detectTriggers` returns `event: "ltb"` for "When this … leaves the battlefield, …",
but the engine has **no firing hook** for it — there is `checkEnterTriggers` / `checkDiesTriggers` /
`checkStepTriggers` / `checkAttackTriggers` / `checkCastTriggers`, and **no `checkLeaveTriggers`**
(`grep -rn 'ltb' src/lib/learn` outside triggers.js → nothing). `coverage.js` `triggerRoutesNatively`
counts the descriptor as native because its effect clause parses HIGH — it never checks the event is
actually wired. So the leave-trigger is silently dropped.

**Affected:** **Thragtusk** (the 3/3 Beast token on leave never appears) · Circuit Mender (draw-on-leave
dropped) · Delusions of Mediocrity (the "lose 10 life" downside never fires → strictly better than
printed — a fabricated advantage).

**Safe fix (immediate):** in `coverage.js`, make `triggerRoutesNatively` / `allTriggerSentencesModeled`
treat `event === "ltb"` as NOT routing → the card routes to the Arbiter. **Full fix (follow-up):** add a
`checkLeaveTriggers` hook that fires `ltb` on every battlefield exit — note that dying fires BOTH `dies`
AND `ltb` (CR 700.4 / 603.6c), plus exile/bounce.

---

## Cross-cutting note for the builders

The deepest lever here is `coverage.js` `allTriggerSentencesModeled`: its count-guard
(`detected.length === shaped`) assumes one trigger sentence == one fireable event with no dropped
restriction. All three classes slip past it. A robust guard would (a) reject a sentence whose condition
encodes a second event, (b) reject a `scope:self` whose condition has trailing/alternate-subject text,
and (c) reject an `ltb` descriptor until the firing hook exists. Fixing the guard closes the whole
class at once and the affected cards safely fall to the Arbiter.

**Re-run anytime:** `MTG_REFERENCE_DIR=<main-repo>/app/data node scripts/qa-sweep.mjs {tiers|spells|triggers}`
(the QA scratch harness; not committed). Corpus data is read from the main checkout via the
reference-dir fallback since the worktree's bulk data is gitignored.
