# CODEX Power Ranker Handoff - 2026-05-25

## Status

Power ranking is now a real local subsystem, not a prompt-only instruction.

Current branch:

- `feat/phase2-arbiter-retrieval`

Current app server after this pass:

- `http://localhost:3000`
- `.next` was rebuilt, stale 3000/3001 listeners were stopped, and the dev server was restarted cleanly.

No Anthropic usage was introduced:

- `/api/model-calls` reported `anthropic.total: 0`

## What Was Built

### Local power ranking engine

File:

- `app/src/lib/server/powerRanker.js`

Inputs:

- Saved deck cards or raw deck text
- Commander names
- Local Scryfall Oracle data
- Local Scryfall `game_changer` and `edhrec_rank` fields
- Local Commander Spellbook combo data
- Local Commander Spellbook card flags
- Local EDHREC salt data when synced

Outputs:

- `powerLevel` from 1-10
- Commander bracket 1-5
- CRISPI-style axes:
  - Consistency
  - Resilience
  - Interaction
  - Speed
  - Mana quality
- Archetype detection
- Inventory counts
- Virtual land count
- Slow-land weight
- Color source counts
- Game changer list
- Complete combos
- One-card-away combo upgrade paths
- cEDH marker list
- EDHREC salt/friction summary
- DeckCheck-style attribute ratings:
  - Speed
  - Consistency
  - Resilience
  - Interaction
  - Mana
- EDHPowerLevel-style diagnostics:
  - Tipping Point
  - Efficiency
  - Impact
  - Score
  - Impact-curve power
  - Playability
  - Top Impact Cards
- Power cap reasons
- Human-readable formatted block for Karn

### New API route

File:

- `app/src/app/api/power-rank/route.js`

Endpoints:

- `GET /api/power-rank`
- `POST /api/power-rank`

Example POST body:

```json
{
  "cards": [{ "qty": 1, "name": "Sol Ring", "section": "Mainboard" }],
  "commanderNames": ["Zaxara, the Exemplary"],
  "maxAlmost": 5
}
```

### Karn integration

File:

- `app/src/hooks/useChatAgents.js`

Karn now injects `## LOCAL POWER RANKING (deterministic - no API cost)` into locked-deck conversations. This replaces the previous raw Spellbook-only context block. It still uses Spellbook internally through the ranker.

Cut-only requests intentionally skip the power ranker so Karn can answer quickly with exact cut targets only.

### Calibration test

File:

- `app/scripts/check-power-ranker.cjs`

Script:

- `npm.cmd run check:power-ranker`

Calibration anchors:

| Deck | Expected Behavior |
|---|---|
| Kinnan, Bonder Prodigy | Bracket 5, 9.2-10 power |
| Yuriko, the Tiger's Shadow | Bracket 5, 9.2-10 power |
| Zaxara, the Exemplary | Bracket 3, 6.0-7.0 power; DeckCheck-calibrated high-power casual, not fake cEDH |
| Sliver Hivelord | 4.5-6.3 power; Bracket 2-3 |
| The Ur-Dragon | Bracket 3, 6.0-7.4 power |
| Meren EDHPowerLevel sample | Bracket 3, 6.3-7.8 power |

Latest pass:

```text
Power-ranker calibration passed (6 decks).
Kinnan: 10 / Bracket 5
Yuriko: 10 / Bracket 5
Zaxara: 7.0 / Bracket 3
Sliver Hivelord: 5.5 / Bracket 2
The Ur-Dragon: 6.2 / Bracket 3
Meren sample: 6.6 / Bracket 3
```

## Algorithm Notes

The ranker intentionally avoids claiming objectivity. It gives a deterministic, explainable estimate.

### Main scoring idea

The final number is built from:

- CRISPI axes
- Game changer density
- Spellbook combo pressure
- Fast mana
- Free interaction
- Commander inherent power profile
- Archetype focus
- Land/ramp/draw consistency
- Practical caps when support is missing

### cEDH gate

This was the most important correction.

Compact combos alone do not make a deck Bracket 5. True cEDH requires enough support:

- Heavy game changer density
- Fast mana
- Free interaction
- Tutor density
- Low curve
- Compact early combos
- Inherently cEDH commander pressure

Example:

- Zaxara has compact aura-based early combo lines, but they are commander/creature/enchantment reliant, vulnerable to removal, and lack the free-interaction/tutor shell that turns fragile combo into cEDH pressure.
- It is now Bracket 3 / 7.0 instead of a false Bracket 4-5 score.

### DeckCheck calibration

The user provided a DeckCheck analysis for Zaxara, the Exemplary:

- Speed: 7/10
- Resilience: 6/10
- Consistency: 7/10
- Interaction: 6/10
- Power level: 6.0-7.0
- Reason: focused optimized casual deck, turn 6-8 pressure, compact infinite-mana lines, but fragile commander/aura combo and not enough free interaction for true cEDH.

The local ranker is intentionally calibrated to match that shape:

```text
Zaxara final: 7/10, Bracket 3
Attribute Ratings: Speed 7 | Consistency 7.3 | Resilience 6 | Interaction 6.5 | Mana 7.7
```

### EDHPowerLevel-style diagnostics

The ranker now includes diagnostic metrics inspired by the user's EDHPowerLevel notes:

- Tipping Point: effective mana needed to access 65% of modeled nonland impact.
- Efficiency: curve/tipping-point efficiency with ramp support.
- Impact: total modeled nonland card impact.
- Score: impact multiplied by efficiency on a 0-100 scale.
- Impact-curve power: the curve-derived power estimate before shell, fragility, commander, and support adjustments.
- Playability: rough probability proxy for casting nonland cards on curve with the current mana base.

Important: the final `powerLevel` is the table-ready answer. `impact-curve power` is only a diagnostic. Example:

```text
Zaxara final power: 7/10
Zaxara tipping point: 5
Zaxara impact-curve power: 7.1/10
```

X-spells are handled with an effective mana value layer because Oracle mana value counts X as 0. Without this correction, X-spell decks looked falsely hyper-efficient.

### EDHREC salt

EDHREC salt is now treated as table-friction data, not raw power.

Files:

- `app/scripts/sync-edhrec-salt.cjs`
- `app/src/lib/server/edhrecSalt.js`

Scripts:

- `npm.cmd run sync:edhrec-salt` downloads the next 35-page chunk.
- `npm.cmd run sync:edhrec-salt-all` attempts the full run.

Current local salt snapshot:

- 14,000 entries synced
- `complete: false`
- next path: `top/salt--140.json`

This is intentionally resumable because the EDHREC feed is much larger than the first "Top 100" page.

### Land math

The old heuristic punished too many good lands as taplands.

The new model uses weighted slow-land math:

- Shocklands with optional life payment: 0 slow weight
- Battlebond lands in Commander: 0 slow weight
- Check lands: low penalty
- Reveal lands: low penalty
- Triomes/surveil typed lands: moderate penalty
- True enters-tapped lands: high penalty

It also computes rough color source counts against commander color identity.

### Archetype focus

The ranker now detects:

- Combo
- Optimized value / cEDH shell
- Tribal
- Voltron / Equipment
- Aristocrats / Graveyard
- Tokens
- Counters
- Spellslinger / Control
- Goodstuff / Fair Midrange

Generic creature types like Human, Wizard, Soldier, Warrior, Rogue, etc. are ignored for tribal detection to prevent false positives.

## Verification Done

Commands run from `app/`:

```powershell
npm.cmd run check:power-ranker
npm.cmd run build
```

Both passed.

Direct API smoke against the restarted dev server:

```powershell
POST http://localhost:3000/api/power-rank
```

Zaxara result:

```text
ready: true
powerLevel: 7
bracket: 3
bracketLabel: Upgraded
confidence: high
Speed: 7
Consistency: 7.3
Resilience: 6
Interaction: 6.5
Tipping Point: 5
Impact-curve power: 7.1
```

Cost check:

```text
No Anthropic call was required for this work.
```

## Known Remaining Work

1. Add a visible Power/Bracket panel to the Deck Command Center.
2. Let Karn reference the power block explicitly in answers:
   - "The deterministic ranker has this at 7.0 / Bracket 3; I agree/disagree because..."
3. Add more calibration decks:
   - stock precon
   - upgraded precon
   - known casual battlecruiser
   - known high-power non-cEDH
   - known cEDH list
4. Add persisted rank snapshots to deck memory.
5. Continue the resumable EDHREC salt sync over time:
   - `npm.cmd run sync:edhrec-salt`
   - current snapshot is 14,000 entries, incomplete, and intentionally safe to resume from `top/salt--140.json`.
6. Consider a local "power explanation" UI that shows why each axis scored what it scored.

## Files Changed In This Pass

- `app/package.json`
- `app/scripts/check-power-ranker.cjs`
- `app/scripts/sync-edhrec-salt.cjs`
- `app/src/app/api/power-rank/route.js`
- `app/src/hooks/useChatAgents.js`
- `app/src/lib/agents.js`
- `app/src/lib/server/edhrecSalt.js`
- `app/src/lib/server/powerRanker.js`
- `app/src/lib/server/spellbook.js`
- `CODEX_POWER_RANKER_HANDOFF_2026-05-25.md`
- `CODEX_POWER_RANKER_PROMPT_2026-05-25.md`

## Important Note

Commander power is subjective. This ranker should be treated as a deterministic local estimate with receipts, not a final truth source. The most important behavior is that Karn can now explain the estimate from local facts instead of hallucinating a power level.
