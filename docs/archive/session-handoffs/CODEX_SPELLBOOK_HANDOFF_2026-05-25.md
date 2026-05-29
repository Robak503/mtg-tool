# Codex Spellbook + Power Evaluation Handoff - 2026-05-25

Project root: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`

Branch: `feat/phase2-arbiter-retrieval`

This handoff covers the local Commander Spellbook integration and the Karn power-evaluation work started after Phase 2.

---

## Current Status

The app now has a local Commander Spellbook data path:

- `app/scripts/sync-spellbook.cjs`
  - Slow, resumable, checkpointed sync.
  - Pulls Commander Spellbook combo variants and card flags.
  - Writes generated local data under `app/data/`.
- `app/src/lib/server/spellbook.js`
  - Server-only lookup module.
  - Loads local combo/card data from disk.
  - Finds complete combos and 1-card-away combo upgrades for a deck.
  - Estimates bracket pressure from local game-changer / MLD / extra-turn flags.
- `app/src/app/api/spellbook/route.js`
  - Server route for client hooks.
  - `GET` returns local readiness/meta.
  - `POST` accepts `{ cardNames, commanderNames, type }` and returns combo/bracket context.
- `app/src/hooks/useChatAgents.js`
  - Karn now calls `/api/spellbook` when a deck is locked and injects:
    `## COMMANDER SPELLBOOK DATA (local - zero network calls)`
  - This is skipped for pure cut requests so cut mode stays tight.
- `app/src/lib/agents.js`
  - Karn now knows a deeper power framework:
    static inventory, Spellbook combo context, CRISPI-style pressure, and land/ramp math.

Local Spellbook data is fully synced as of this handoff:

```text
Combos / variants: 89,362
Card flag records: 7,639
Duplicate combo IDs: 0
Source: https://backend.commanderspellbook.com
```

Generated local files are ignored by `app/.gitignore` via `data/*.local.json`, which is correct. Commit the sync script and lookup code, not the generated data.

---

## Validation Already Run

From `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app`:

```powershell
npm.cmd run sync:spellbook-cards
npm.cmd run sync:spellbook -- --combos-only --delay-ms 2000 --retries 20 --request-timeout-ms 15000
npm.cmd run build
```

Build passed and `/api/spellbook` appears in the route table.

Manual Node route test passed:

- `GET /api/spellbook` returned `ready: true`.
- Meren-style test deck returned:
  - `COMBOS IN DECK: none`
  - 1-card-away combos including `Sol Ring + Hullbreaker Horror`
  - bracket estimate `Upgraded (Bracket 3)`
  - game changers `Crop Rotation`, `Demonic Tutor`

---

## External Power Sources Reviewed

### EDHPowerLevel

Claude inspected EDHPowerLevel with Colton's Meren deck.

Observed Meren output:

- Power Level: `7.51 / 10`
- Efficiency: `7.19 / 10`
- Impact: `680.20`
- Score: `662 / 1000`
- Average Playability: `69.7%`
- Commander Bracket: `3 (Upgraded)`
- Deck Value: `$444.76`
- Game Changers: `Crop Rotation`, `Demonic Tutor`
- Land health: `32.4% screw risk / 24.6% flood risk / 43% sweet spot`

Do not build runtime scraping around EDHPowerLevel unless Colton explicitly asks. Treat it as calibration and design inspiration.

### DeckCheck

DeckCheck exposed useful analysis concepts:

- CRISPI-style axes: Consistency, Resilience, Interaction, Speed / pressure.
- Primer shape: core strategy, mulligan priorities, key tips, weaknesses.
- Salt / friction as a separate table-feel signal.

Important: DeckCheck's API docs say the API is for read-only integrations and explicitly disallow scraping, bulk downloading, mirroring, redistributing, or training/model datasets without permission. Do not bulk scrape DeckCheck.

Use DeckCheck as a framework reference, not a local data source unless Colton obtains API permission.

### EDHREC / Salt

EDHREC salt scores are useful for table-feel, not raw power.

Research notes:

- EDHREC describes salt scores as annual community survey averages from 0-4.
- EDHREC explicitly says salt score is not connected to Commander Brackets or the Game Changers list.
- Mightstone documents reverse-engineered access to `json.edhrec.com/pages` and `edhrec.com/_next/data`, including top cards by salt.

Recommendation:

- Do not treat EDHREC salt as a blocker for Karn.
- Future option: add a local `salt` dataset only after a separate API/terms review.
- Until then, Karn's "Pressure/Salt" axis can be heuristic: mass land denial, stax, extra-turn chains, hard locks, repeat discard, long deterministic loops.

### EDHPowerLevel Land Math Article

The practical takeaway for Karn:

- Land count must be connected to curve, ramp density, draw, and archetype.
- 34-35 lands only works with low curve plus strong cheap ramp/draw.
- 38-40 lands can be correct for landfall, high average mana value, expensive commanders, or decks needing repeated land drops.
- Cheap ramp matters more than expensive ramp.
- MDFC lands should be counted as partial lands unless they are nearly always played as lands.

Karn's prompt has been updated with these ideas under `LAND AND RAMP MATH`.

---

## Known Gotchas

1. `app/src/lib/server/spellbook.js` is ESM syntax inside a package without `"type": "module"`.
   - Next builds it fine.
   - Direct `node --input-type=module` tests show a harmless `MODULE_TYPELESS_PACKAGE_JSON` warning.
   - Do not add `"type": "module"` casually; it could affect existing CommonJS scripts.

2. Commander Spellbook sync is intentionally slow.
   - The API rate-limits bursts.
   - Use:
     ```powershell
     npm.cmd run sync:spellbook -- --combos-only --delay-ms 2000 --retries 20 --request-timeout-ms 15000
     npm.cmd run sync:spellbook-cards
     ```

3. Generated Spellbook data is large and ignored.
   - `spellbook-combos.local.json` is about 30MB+.
   - Do not force-add it unless Colton explicitly wants local data committed.

4. EDHPowerLevel and DeckCheck should not be live-scraped during normal app use.
   - Local-first means local Spellbook + Scryfall + rules codex first.

---

## Recommended Next Work

1. Commit the Spellbook integration in one focused commit:
   ```powershell
   git add .gitignore app/package.json app/scripts/sync-spellbook.cjs app/src/app/api/spellbook/route.js app/src/lib/server/spellbook.js app/src/hooks/useChatAgents.js app/src/lib/agents.js CODEX_SPELLBOOK_HANDOFF_2026-05-25.md CODEX_SPELLBOOK_PROMPT_2026-05-25.md
   git commit -m "feat: add local Commander Spellbook combo grounding"
   ```

2. Run browser smoke:
   - Start app.
   - Load a deck.
   - Lock Karn to it.
   - Ask:
     - `Give me a full power level and bracket analysis.`
     - `What combos are in this deck or one card away?`
   - Expect Karn to mention the local Spellbook data.

3. Add UI visibility for Spellbook status:
   - `/api/spellbook` `GET` already exposes meta.
   - Add a small Knowledge/Status panel line:
     `Spellbook: 89,362 combos / 7,639 cards`

4. Later cleanup pass:
   - Archive old planning docs into `docs/archive/`.
   - Keep new active handoffs CODEX-prefixed.
   - Do not reorganize runtime files until after smoke tests.

