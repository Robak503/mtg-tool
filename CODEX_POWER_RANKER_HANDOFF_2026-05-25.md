# CODEX Power Ranker Handoff - 2026-05-25

## Status

Power ranking is now a real local subsystem, not a prompt-only instruction.

Current branch:

- `feat/phase2-arbiter-retrieval`

Current app server after this pass:

- `http://localhost:3001`
- Port 3000 had a stale Next dev server after `.next` was rebuilt; it was stopped.

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
| Zaxara, the Exemplary | Bracket 4, 7.8-8.8 power; not fake cEDH 10 |
| Sliver Hivelord | 4.5-6.3 power; Bracket 2-3 |
| The Ur-Dragon | Bracket 3, 6.8-8.2 power |
| Meren EDHPowerLevel sample | Bracket 3, 7.0-8.3 power |

Latest pass:

```text
Power-ranker calibration passed (6 decks).
Kinnan: 10 / Bracket 5
Yuriko: 10 / Bracket 5
Zaxara: 8.3 / Bracket 4
Sliver Hivelord: 5.0 / Bracket 2
The Ur-Dragon: 7.8 / Bracket 3
Meren sample: 7.9 / Bracket 3
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

- Zaxara has compact early combo lines, but only 1 game changer, no free interaction, and low tutor density.
- It is now Bracket 4 / 8.3 instead of a false Bracket 5 / 10.

### EDHREC salt

EDHREC salt is now treated as table-friction data, not raw power.

Files:

- `app/scripts/sync-edhrec-salt.cjs`
- `app/src/lib/server/edhrecSalt.js`

Scripts:

- `npm.cmd run sync:edhrec-salt` downloads the next 35-page chunk.
- `npm.cmd run sync:edhrec-salt-all` attempts the full run.

Current local salt snapshot:

- 3,500 entries synced
- `complete: false`
- next path: `top/salt--35.json`

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
POST http://localhost:3001/api/power-rank
```

Zaxara result:

```text
ready: true
powerLevel: 8.3
bracket: 4
bracketLabel: Optimized
confidence: high
```

Cost check:

```text
anthropic.total: 0
ollama.total: 56
```

## Known Remaining Work

1. Add a visible Power/Bracket panel to the Deck Command Center.
2. Let Karn reference the power block explicitly in answers:
   - "The deterministic ranker has this at 8.3 / Bracket 4; I agree/disagree because..."
3. Add more calibration decks:
   - stock precon
   - upgraded precon
   - known casual battlecruiser
   - known high-power non-cEDH
   - known cEDH list
4. Add persisted rank snapshots to deck memory.
5. Add EDHREC salt data if a reliable local source can be found.
6. Consider a local "power explanation" UI that shows why each axis scored what it scored.

## Files Changed In This Pass

- `app/package.json`
- `app/scripts/check-power-ranker.cjs`
- `app/scripts/sync-edhrec-salt.cjs`
- `app/src/app/api/power-rank/route.js`
- `app/src/hooks/useChatAgents.js`
- `app/src/lib/server/edhrecSalt.js`
- `app/src/lib/server/powerRanker.js`
- `app/src/lib/server/spellbook.js`

## Important Note

Commander power is subjective. This ranker should be treated as a deterministic local estimate with receipts, not a final truth source. The most important behavior is that Karn can now explain the estimate from local facts instead of hallucinating a power level.
