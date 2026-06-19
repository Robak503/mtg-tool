# CMD-CAST build plan — casting your commander (the command-zone framework)

> **Hans scoped this** (Colton: hard-code partner/companion; it surfaced that you can't cast a commander at all).
> Gameplay-critical, like Walt's PW framework — measured by "does a real Commander game play," not corpus %.
> **Owner: CINDY — GREENLIT (Colton, 2026-06-18) as her #1 priority, BEFORE the keyword waves.** Live acceptance mandatory.
> CR refs verified against bundled `cr_current.json`: **903.3** (commander = a legendary creature designated as
> commander), **903.8** (cast from the command zone; +{2} for each previous cast from there this game = the tax),
> **903.9** (a commander may return to the command zone), **903.10a** (21 combat damage from one commander → that
> player loses; an SBA, CR 704). Build-time: re-read 903.3a–903.9b in `cr_current.json` before coding.

## Current state (what's there vs missing — verified in-engine)

| Piece | Status | Where |
|---|---|---|
| `command` zone (multi-commander **array**) | ✅ exists | `gameState.createPlayerState` → `command: [...commanderCards]`; `"command"` is a valid zone (gameState ZONES) |
| `commanderDamageFrom` tracker + `addCommanderDamage()` | ✅ exists (but **not wired to combat**) | `gameState.js:994` (display only: boardContext/tableSnapshot) |
| 40 life · 4P FFA · per-opponent commander arrays | ✅ exists | `buildCommanderSeats` |
| **Cast a commander FROM the command zone** | ❌ MISSING | no action in `legalChoices`/`actionDispatcher` |
| **Commander tax ({2}/prior cast)** | ❌ MISSING | no cast-count anywhere |
| **`isCommander` identity flag** (persists across zones) | ❌ MISSING | needed for tax + return-to-zone + damage |
| **Return-to-command-zone (903.9)** | ❌ MISSING | death/exile path doesn't check commander |
| **Commander combat damage → 21-loss SBA (903.10a)** | ❌ MISSING | `combatResolution` never calls `addCommanderDamage`; no SBA |

## The cast pipeline to mirror (so CMD-CAST reuses, doesn't reinvent)

- **`legalChoices.actionsCastSpell` (legalChoices.js:301)** iterates `player.hand` → emits `{kind:"cast-spell", playerId, cardId, name, cost, cmc, effect, program, ...}` after a land/timing/affordability gate. Wired in at `legalActionsForPlayer` (~L861).
- **The dispatcher's `cast-spell` handler (actionDispatcher.js ~L281/357)** auto-taps to pay, **splices the card out of `player.hand`** (L281-282), pushes a `stackObject` onto `state.stack` (L357), resets priority. Zone moves go through `moveCardToZone({playerId, fromZone, toZone, cardId})`.

CMD-CAST = the SAME pipeline with `fromZone:"command"`, a tax-adjusted cost, and a cast-count bump.

---

## Slice it into 3 PRs (each gated + live-verified)

### PR1 — CMD-CAST core: cast a commander from the zone + the {2} tax
1. **Identity + tax state** (`gameState.js`): at setup (`createPlayerState`/`buildCommanderSeats`), tag every
   `commanderCards` entry `isCommander:true` (a stable designation, CR 903.3 — NOT a characteristic, so it rides
   the card identity across zones). Add `commanderCastCount: {}` (keyed by commander cardId) to player state.
2. **Legal action** (`legalChoices.js`): new `actionsCastCommander(state, playerId)` — mirror `actionsCastSpell`
   but iterate `player.command`; **effective cost = parseManaCost(card) + {2}×commanderCastCount[card.id]**;
   sorcery-speed timing (own main, empty stack — most commanders are creatures); affordability over that taxed
   cost. Emit a normal `cast-spell` action **+ `fromZone:"command"`**. Wire into `legalActionsForPlayer` next to
   the `actionsCastSpell` push (~L861). Gate on the command zone being non-empty (Standard untouched).
3. **Dispatch** (`actionDispatcher.js`): the `cast-spell` handler honors `action.fromZone` (default `"hand"`):
   for `"command"`, splice from `player.command` (not hand) and **`commanderCastCount[cardId]++`**. The card keeps
   `isCommander` onto the battlefield permanent. Everything else (mana auto-tap, stackObject, resolve) is unchanged.
4. **Pins + live:** cast a commander (timing/affordability incl. tax); recast → cost +2 each time; Standard mode
   has no such action. **Live:** `npm run dev` → a Commander game, cast your commander, recast after it dies.
   *(Return-to-zone is PR2; until then a dead commander goes to the graveyard — fine for PR1's cast/tax test.)*

### PR2 — Return to the command zone (CR 903.9)
1. **The replacement** (the SBA death path in `gameState.destroyLethalCreatures` + the destroy/exile/bounce
   atoms in `spellEffects.js`): when a permanent with `isCommander` would leave the battlefield **to graveyard or
   exile** (903.9a also hand/library), its **owner MAY** move it to the command zone instead. **AI auto-returns**
   (so it can recast — the right default); **human gets a pending-choice** (reuse the pending-choice subsystem).
   The commander keeps its `commanderCastCount` (tax persists — 903.8 counts casts, not deaths).
2. **Pins + live:** a commander dies → returns to the zone; recast costs the higher tax; declining returns it to
   the graveyard. **Live:** kill a commander in a real game, see the choice + the taxed recast.

### PR3 — Commander combat damage + the 21-loss SBA (903.10a) + AI
1. **Wire combat** (`combatResolution.js`): in the `spillToDefender`/player-damage path, when the attacker has
   `isCommander`, also `addCommanderDamage({fromPlayer: the commander's owner, toPlayer: defender, amount})`.
   **Key the tracker per-COMMANDER, not per-player** (903.10a is "the same commander" — and CMD-PARTNER needs it).
2. **The SBA** (`gameState` state-based checks): any player with commander damage ≥21 from one commander **loses**
   (903.10a / CR 704). Reuse the existing elimination/loss path.
3. **AI** (`opponentAI.js`): prioritize casting the commander early (a key threat/engine piece).
4. **Live acceptance (the real gate):** a full 4P Commander game — each seat casts its commander, tax escalates on
   recast, commander combat damage accrues + 21 = a loss, a commander returns to the zone on death. Drive it with
   `npm run dev` + preview; a green unit suite is NOT enough for a gameplay subsystem.

---

## Landmines (the FP / correctness traps)
- **Tax is per-commander-per-player-per-game, casts FROM the command zone only** (903.8) — a commander cast from
  hand (after bouncing there) is NOT taxed. Count on the command-zone cast path only.
- **Return is the OWNER's choice** (903.9) — never auto-return for the human; offer it. Auto-return for the AI.
- **`isCommander` is a designation, not a characteristic** (903.3) — it must survive zone changes (tie it to the
  card/permanent identity, not a transient flag a clone/copy would inherit — a token copy of a commander is NOT a
  commander).
- **Per-commander damage** — keying the 21-rule by player instead of by commander breaks both 903.10a and partner.
- **Don't touch Standard.** Every new path gates on `mode==="commander"` / a non-empty command zone.

## Gate (every PR) + the honest read
`npm test` (confirm "Tests N passed") + `npm run lint` from `app/`, **plus live acceptance** (mandatory — this is a
"does a real game play" subsystem). **CMD-CAST barely moves corpus % (it's not a card-text atom)** — that's
expected and correct; its value is gameplay realism, the same yardstick as PW. Ships 100% local.

## Follow-ons (build on PR1)
- **CMD-PARTNER (702.124, ~143):** the command array + per-commander tax/damage from CMD-CAST already handle two
  commanders mechanically. CMD-PARTNER = **deck-import recognition** of partner / Partner-with / Backgrounds /
  Friends-forever → put BOTH legal commanders in the zone at game start + the pairing legality. Small after CMD-CAST.
- **CMD-COMPANION (702.139, ~12):** a companion zone + the `{3}: put it into your hand` once-per-game action
  (903-adjacent; CR 702.139f), gated by the deck-construction restriction. Independent of CMD-CAST.
