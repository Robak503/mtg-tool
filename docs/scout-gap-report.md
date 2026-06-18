# Scout Gap Report — Hans's corpus analysis ledger

> **Hans (Scout) owns this doc.** It's the reasoning *behind* `docs/orchestration/task-board.md`:
> honest clean-yield tables, the false-positive landmines a builder must dodge per atom, the
> retired/de-prioritized log, and the methodology (so the next Scout — or Omnath — can re-run and
> trust the numbers). The **board** is the terse pull-queue; this is the why. Both refresh together
> in one PR each scout cycle.

**Baseline this cycle (live, off `origin/master`):** **16.0 % corpus native — 5,369 / 33,540 real cards.**
Gap = **28,171** cards (20,956 body-only · 6,878 arbiter-spell · 337 planeswalker/out-of-scope).
Measured 2026-06-18, cycle **board-2** (rebased onto the TOK-2/EP-2/CNT-2 + trigger-FIX merges).

> **Why the headline dipped 16.3 → 16.0 % after coverage merged:** the trigger FIX work (#218,
> FIX-TRIG-COMPOUND + FIX-TRIG-LTB) and #221 **de-claimed ~52 trigger cards** that were wrongly native
> (false positives — *forbidden* under the CREED). De-claiming a false positive is a **win** even though
> the number drops; it outweighed the TOK-2/EP-2/CNT-2 additions this batch. The number is honest, not
> regressed. My four fresh 🔴 atoms (PUMP/REG/DIG/MT) re-verified identical against the refreshed gap.

---

## Methodology (how these numbers are produced — and their honest biases)

Throwaway scripts at `app/` root (gitignored): `_sweep_scout.mjs` dumps the non-native corpus through
the **real runtime classifier** (`classifyCard` from `coverage.js`) to `_sweep_low_corpus.json`;
`_query_scout.mjs` queries that cache two ways:

- `sigs spell|perm [N]` — abstracts each card's first N sentences into a **template signature** (card
  name → `~`, mana → `{M}`, numbers/number-words → `N`) and frequency-ranks them. This finds the
  high-frequency templates, not the coarse keyword buckets `npm run coverage` prints.
- `match '<regex>' [flags]` — counts gap cards matching a candidate template, splits arbiter-spell vs
  body-only, and reports a **CLEAN single-sentence spell** count: spells whose whole oracle is one
  sentence matching the template (trailing castability keywords — Cycling/Flashback/Kicker/… — tolerated).

**The clean count is a PROXY, not ground truth. Its three known biases (read before trusting a number):**

1. **Verb-only atoms** (discard / mill / sacrifice / regrowth / destroy-X): single-sentence count ≈
   honest clean. Within-sentence riders are rare. *Trust it.*
2. **Pump / burn atoms**: single-sentence count is an **UPPER bound**. A single sentence can still hide
   an unmodeled rider joined by "and" — e.g. *Triumph of the Hordes* "Creatures you control get +1/+1
   **and gain trample and infect**" reads as one clean sentence but grants `infect` (unmodeled) → it
   would stay LOW. Discount pump/burn single-sentence counts ~25–40 %.
3. **Look / reveal atoms** (impulse-dig, "reveal top N then…"): single-sentence count **UNDER**counts —
   the atom is inherently two sentences ("Look at top N. Put one into your hand, rest on bottom"). Use
   the two-sentence sub-template match, not the single-sentence count.

Every yield below is the **honest clean estimate** after applying the right correction — not the raw
single-sentence number.

---

## Honest clean-yield table (this cycle)

Spell counts are the clean-spell floor; the **composition upside** column flags atoms whose real value
is multiplied by rider cards that go native once this atom + their other (already-modeled) clauses
compose. Build cost folds in false-positive surface (CREED-weighted).

| Atom | Honest clean (spells) | Composition upside | Build cost | Reuses | Board ID |
|---|---:|---|---|---|---|
| **Team pump** — "creatures you control get +X/+Y until EOT" | ~22 (31 ss, −infect/keyword riders) | high (anthem riders) | low | each-you-control enumerator (#211) + pump resolver | **PUMP-1** 🔴 |
| **Regrowth** — "return target \<type> card from your graveyard to your **hand**" | ~22 | med | low–med | β-3b gy-targeting (#207) | **REG-1** 🔴 |
| **Impulse-dig** — "look at top N, put one/two in hand, rest on bottom/gy" | ~25–30 | med | med | δ-1b pending-choice picker (#209) | **DIG-1** 🔴 |
| **Divide-among** — "deals N damage / distribute N +1/+1 **divided as you choose among any number of targets**" | ~20 (23 ss) | med | med (divide picker) | damage + counter resolvers; new picker | **MT-1** 🔴 |
| **Target/each-player discard** | ~30 (target) + ~7 (each) | med | low–med | pending-choice picker (victim chooses) | **EP-2 ✅ DONE #220** |
| **Named artifact tokens** — Treasure/Clue/Food/Blood/Map/… | ~9 pure | **very high** (372 rider cards: Bake into a Pie, Deadly Dispute…) | med | activated-ability machinery | **TOK-2 ✅ DONE #218** |
| **Create X / N>5 tokens** | ~15 (19 ss) | med | low | typed/keyword tokens (#213) + X-spell infra | **TOK-3** 🟡 |
| **Target/each-player mill** | ~16 | low | low (no picker — deterministic) | mill resolver | **MILL-1** 🟡 |
| **Each-player edict** — "each player sacrifices a \<type>" | ~12 | low | low | target/opponent edict (#214) | **ED-2** 🟡 |
| **Soft counter** — "counter target spell unless its controller pays {N}" | ~36 | med | **med (opponent-decision subsystem)** | counter atom + new opponent-payment choice | **SOFT-CNT** 🟡 |
| **Fog latch** — "prevent all combat damage that would be dealt this turn" | ~14 | low | med (turn-scoped damage-skip latch) | combatResolution.js | **FOG-1** 🟡 |
| **Remaining counter forms** — "on up to N target creatures", −1/−1 single & multi | ~10 | low | low (reuses MT-1 picker) | counter resolver | **CNT-2b** 🟢 *(single-target ✅ #219; distribute → MT-1)* |
| **Burn riders** — damage + modeled rider (gain-life/scry/draw) | composition only | — | per-rider | damage atom | **BURN-2** 🟢 |

---

## Per-atom landmines (what would make a builder ship a false positive)

- **PUMP-1:** reject the `and gain <keyword>` / `and gain lifelink` riders unless that keyword grant is
  modeled (Triumph of the Hordes → infect; Stir the Pride → lifelink). Pure `+X/+Y until end of turn`
  only. Watch "Green creatures you control" (color-restricted subset) vs "Creatures you control" (all).
- **REG-1:** the card-type filter varies — `creature` / `artifact or enchantment` / `instant or sorcery`
  / `permanent` / `land` / `card` (any). Accept the union but confirm the resolver moves zones type-
  agnostically. **`from a graveyard` (any, incl. opponents') ≠ `from your graveyard`** — different
  target scope. Drop `up to one/two target … card` (multi/optional) to a later slice.
- **DIG-1:** the second sentence is the atom, not a rider — but "put **any number of** permanent cards"
  (Genesis Ultimatum) and "put one **onto the battlefield**" (Collected Company) are different effects
  from "put one **into your hand**." Scope DIG-1 to **hand**-dig first; battlefield-dig (CoCo) is its
  own atom. Drop `Descend`/`Casualty`/`Domain`/`Bargain`-prefixed variants (extra cost/condition).
- **MT-1:** "divided as you choose among any number of targets" is a **number-distribution** decision
  (assign N among chosen targets), distinct from "up to N targets" (PUMP/tap). Don't conflate. Verify
  damage-division routes lethal/redirect correctly per target. `Fire Covenant` etc. add `pay X life` —
  additional-cost rider, drop.
- **SOFT-CNT:** the payment is the **spell's controller's** decision (an OPPONENT in 4P) at resolution —
  needs an opponent-payment pending-choice, not a caster choice. `pays {X}` (X-cost) and the non-mana
  variants ("exiles all cards from their graveyard", "reveals a Dragon") are out of the clean core
  ("pays {fixed}"). The `Draw a card` / `Suspect`/`discard` tails are riders.
- **FOG-1:** scope to **`prevent all combat damage that would be dealt this turn`** (the whole-turn
  latch) ONLY — NOT the permanent/aura variants ("…dealt to and dealt by enchanted creature", Story
  Circle-style ongoing prevention). That's the general PREVENT subsystem (deferred ⛔). The latch is a
  one-shot flag combatResolution.js checks; ongoing prevention is not.
- **MILL-1:** deterministic (top N → graveyard), no picker — simplest of the player-effect atoms. But
  "mills X" (X-spell) and "from a graveyard" interactions (Psychic Spiral) are riders/variable.

---

## Retired / de-prioritized this cycle

- **EP-3 "each player loses N life"** — only **3 clean** (Death Cloud, Smallpox, Stronghold Discipline),
  and all three are compound (Smallpox = sac+discard+life+land). Rider-dominated; the original ~60–100
  estimate was the loose bucket, not clean templates. **Split out the mill half (→ MILL-1); retire the
  life half.**
- **Destroy target land** — **9 clean** (Lay Waste, Stream of Acid, Flowstone Flood…) and most LD carries
  riders or low real-deck relevance in Commander. Parked 🟢/skip; revisit only if a deck-realism gap shows.
- **CNT-2a (put N>1 +1/+1 on single target)** — ~5 clean; folded to a trivial 🟢 (existing atom just
  accepts N>1). The real counter lever is the **multi-target divide-among picker (MT-1)**.

---

## Methodology notes for the next Scout cycle

- **Re-dump first.** `MTG_APP_ROOT=<main app> node _sweep_scout.mjs` — the gap set shrinks as atoms
  land; a template "clean count" today is stale next cycle.
- **The clean frontier is rider-gated, not verb-gated.** Pure pump/burn/counter/destroy/bounce/mill/
  scry/tap are already native; the gap is RIDERS and TARGET vocabulary. The highest-ROI unclaimed work
  this cycle is the handful of genuinely-unmodeled **clean** atoms (team pump, regrowth, impulse-dig,
  divide-among) plus atoms that **compose** with a big rider population (named tokens).
- **Watch within-sentence riders** (bias #2) before promoting any pump/burn row — re-eyeball the clean
  sample, don't trust the raw count.
- **Cross-check claims** every cycle: `git ls-remote --heads origin "feat/*"`. EP-2 and TOK-2 are in
  flight this cycle — don't rank claimed atoms as ripe OPEN.
