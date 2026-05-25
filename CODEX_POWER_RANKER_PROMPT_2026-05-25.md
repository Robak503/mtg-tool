# CODEX Power Ranker Resume Prompt - 2026-05-25

Paste this into Claude/Codex if the next session needs to continue the power-ranker work.

---

You are continuing work on MTG Tool at:

`C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`

Start by reading:

1. `CLAUDE.md`
2. `README.md`
3. `ROADMAP.md`
4. `CODEX_POWER_RANKER_HANDOFF_2026-05-25.md`
5. `app/src/lib/server/powerRanker.js`
6. `app/scripts/check-power-ranker.cjs`
7. `app/src/hooks/useChatAgents.js`

Current state:

- Local Commander Spellbook data is fully synced.
- Local Spellbook has 89,362 combo variants and 7,134 indexed card flag records.
- A deterministic local power-ranking engine has been added.
- A resumable local EDHREC salt sync has been added.
- Karn now receives a local power/bracket block in locked-deck conversations.
- Karn's prompt now explicitly understands the `## LOCAL POWER RANKING` block.
- The ranker now includes DeckCheck-style attribute ratings and EDHPowerLevel-style diagnostics:
  - Tipping Point
  - Efficiency
  - Impact
  - Score
  - Impact-curve power
  - Playability
  - Top Impact Cards
- X-spells use an effective mana value layer for diagnostics so decks like Zaxara are not falsely treated as all low-cost cards.
- `/api/power-rank` exists and was smoke-tested.
- `npm.cmd run check:power-ranker` passes.
- `npm.cmd run build` passes.
- Anthropic usage remains 0.

Do not start by replacing the algorithm wholesale. First run:

```powershell
cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run check:power-ranker
npm.cmd run build
```

Then inspect the ranked outputs for the 15 saved decks and decide whether calibration needs tuning.

Optional data continuation:

```powershell
npm.cmd run sync:edhrec-salt
```

This downloads the next 35-page EDHREC salt chunk and resumes from `data/edhrec-salt-meta.local.json`. Do not run the all-at-once variant unless the user wants to wait.

Core algorithm principles to preserve:

- Power level is a deterministic estimate, not objective truth.
- cEDH requires support density, not just compact combos.
- Zaxara should be DeckCheck-calibrated high-power casual: about 6.0-7.0, Bracket 3, with Speed about 7, Resilience about 6, Consistency about 7, Interaction about 6.
- Kinnan, Yuriko, Rograkh/Thrasios should stay Bracket 5 with the current saved lists.
- Meren EDHPowerLevel sample should stay Bracket 3 and roughly 6.3-7.8.
- Land quality uses weighted slow-land math, not simple tapland counting.
- EDHREC salt affects table-friction, not raw power.
- EDHPowerLevel-style impact-curve power is a diagnostic, not the final table-ready `powerLevel`.
- Karn should receive local facts and explain them, not hallucinate power ranks.

Recommended next tasks:

1. Add a Deck Command Center power panel using `/api/power-rank`.
2. Add persisted rank snapshots to deck memory.
3. Expand calibration decks and expected ranges.
4. Improve Karn wording so he cites the deterministic ranker cleanly.
5. Investigate a reliable local EDHREC salt source, but do not add fragile scraping without user approval.

Known gotcha:

- If the dev server is running while `.next` is cleaned, old routes can throw 500s. Stop stale Node/Next servers, restart `npm.cmd run dev`, then retest.

---
