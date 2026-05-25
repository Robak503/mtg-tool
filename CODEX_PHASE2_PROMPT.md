# Codex Phase 2 Start Prompt

Paste the block below directly into Codex to start the Phase 2 session.

---

```
Read CODEX_PHASE2_HANDOFF.md in the project root before doing anything else.
Then read the files listed in the "Read This First" section of that document.

You are implementing Phase 2 of the MTG Tool — making Arbiter a real
retrieval+reasoning service backed by the local Comprehensive Rules corpus
(mtg-judge/data/cr/cr_current.json, 3138 rules).

Phase 1 is complete. The post-token-fix browser smoke test passed:
Karn cut mode, Jace stack primer with Arbiter trace, Tibalt full roast, reload
persistence, and `anthropic.total = 0`.
The design doc is at:
C:\Users\colto\.gstack\projects\MTG-TOOL\colto-master-design-phase2-20260524-172023.md

Build in this order:
1. Step 0  — verify cr_current.json and oracle file paths (15 min)
2. Step 2  — build:rules-index script + rules-index.json
3. Step 3  — Scryfall in-memory lookup singleton (cardIndex.js)
4. Step 4  — Rules retrieval function (rulesRetrieval.js) with card-name seeding
5. Step 5  — Citation injector (citationInjector.js) with full rule text
6. Step 6  — Arbiter route rebuild (remove HTTP loopback, fix 900-token cap, wire retrieval)
7. Step 7  — Validator update, validate:arbiter --limit 2 must pass 2/2
8. Step 1  — UI tier toggle (independent, ship at any point)

Commit after each step. Branch: feat/phase2-arbiter-retrieval

The handoff document has all file paths, data shapes, known gotchas, and
verification commands. Follow it precisely. Do not start Phase 3 work.
The definition of done is in the "Phase 2 Success Definition" section.
```
