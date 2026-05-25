# Codex/Claude Phase 2 Resume Prompt

Paste this into the next assistant session.

---

```text
You are continuing MTG Tool Phase 2.

Project root:
C:\Users\colto\Documents\Claude\Projects\MTG-TOOL

Start by reading these files in order:
1. CLAUDE.md
2. CODEX_PHASE2_PROGRESS_2026-05-24.md
3. PHASE2_PLAN.md
4. CODEX_PHASE2_HANDOFF.md
5. app/README.md
6. app/src/app/api/arbiter/route.js
7. app/src/hooks/useChatAgents.js
8. app/src/components/mtg/AppHeader.jsx
9. app/src/components/mtg/ChatPanel.jsx

Current branch:
feat/phase2-arbiter-retrieval

Current latest commit:
da67fc7 refactor: persist compact Arbiter sources

What is already done:
- Phase 1 is complete.
- Arbiter is now grounded in local retrieval modules.
- Rules index, local card index, citation injector, RulesGuru precedent retrieval, and deterministic validation are built.
- Validation reports show:
  - core: 76/76
  - expanded: 424/424
  - rulesguru: 500/500
- Build passes after stopping any dev server and allowing clean:next to delete .next.
- UI has Fast / Deep / API model tier selector.
- TrustStrip records provider, tier, model, deck lock, cards, rulings, engine context, and Arbiter trace.
- TrustStrip also records Arbiter CR rule/card/RulesGuru grounding counts.
- `View Arbiter Sources` shows compact source lists without storing full retrieved rule text in chat history.
- Deck locks snapshot local Scryfall/rules version strings from /api/knowledge-status.
- Retrieval misses/unresolved Arbiter answers are visibly marked.
- RulesGuru has an additional paraphrase-lite `--mutate` validation mode passing 500/500.
- Anthropic should remain at 0 calls unless API is deliberately selected.

First task:
Run a careful resume audit, then do the manual UI smoke test for the new model tier selector:
1. Start dev server from app/
2. Open http://localhost:3000
3. Confirm header shows Fast, Deep, API
4. In Fast, send a short local question and confirm TrustStrip shows tier Fast and local model
5. In Deep, send a short local question and confirm TrustStrip shows tier Deep and local model
6. Ask a Jace rules question and confirm `View Arbiter Sources` appears with rule/card/source counts
7. Confirm /api/model-calls still shows anthropic.total = 0 unless API was explicitly clicked

After the smoke test, continue with the recommended next engineering slice from CODEX_PHASE2_PROGRESS_2026-05-24.md:
1. Decide whether Phase 2 is ready for user testing
2. Consider a harder true-paraphrase validation mode later
3. Start the next Phase 2 polish item only if the smoke test exposes a real issue

Do not start Forge, Garfield learn-to-play, embeddings, or automatic Anthropic fallback.
Do not spend Anthropic credits unless the user explicitly tells you to use API mode.
Use local Scryfall/rules data first.
Commit after each coherent change.
```
