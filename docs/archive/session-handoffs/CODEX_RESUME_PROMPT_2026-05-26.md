# MTG Tool — Resume Prompt (2026-05-26)

## Current Branch

`feat/phase2-arbiter-retrieval` — 37 commits ahead of master

**Status: /review complete. Ready to merge or continue Phase 3 work.**

---

## What Was Built (Phase 2)

All of these shipped in this branch:

| Feature | File | Status |
|---|---|---|
| Local rules retrieval | `app/src/lib/server/rulesRetrieval.js` | ✅ reviewed |
| Centralized card index | `app/src/lib/server/cardIndex.js` | ✅ reviewed |
| Citation injector | `app/src/lib/server/citationInjector.js` | ✅ reviewed |
| RulesGuru precedent retrieval | `app/src/lib/server/rulesGuruRetrieval.js` | ✅ reviewed |
| Commander Spellbook | `app/src/lib/server/spellbook.js` | ✅ fixed + reviewed |
| EDHREC salt grounding | `app/src/lib/server/edhrecSalt.js` | ✅ reviewed |
| Deck power ranker | `app/src/lib/server/powerRanker.js` | ✅ reviewed |
| Arbiter route (local-only) | `app/src/app/api/arbiter/route.js` | ✅ fixed + reviewed |
| Model tier selector | `app/src/components/` | ✅ reviewed |
| Ollama health check | integrated in app load | ✅ reviewed |
| Karn archetype blueprints | `app/src/lib/agents.js` | ✅ reviewed |

---

## Review Fixes Applied (7 total)

**Main pass (commit 75dda6a):**
1. Added `app/reports/` to `.gitignore` and removed 53K lines of validation artifacts from git
2. Added `MAX_BODY_CARD_NAMES = 50` cap in Arbiter `normalizeBodyCardNames`
3. Added `console.warn` in `rulesGuruRetrieval.js` when RulesGuru file not found
4. Added cross-sync warning comment for duplicated constants in `chat-stream/route.js`

**Adversarial pass (commit d802f0d):**
5. **CRITICAL:** Pinned `provider: "ollama"` in Arbiter payload — was leaking `body.provider` through, causing Anthropic calls when user had "API" tier selected
6. Restructured `_loadAttempted` flag in `spellbook.js` so missing files don't permanently block combo data loading after `npm run sync:spellbook`
7. Moved `setSending(false)` into `finally` block in `useChatAgents.js` to prevent permanent UI freeze if catch block throws

---

## Known Remaining Issues (not blocking, tracked in TODOS.md)

| Finding | File | Priority |
|---|---|---|
| `lookupCard` O(n) substring scan fallback | `cardIndex.js` | P3 — perf, not correctness |
| Synchronous `fs.readFileSync` blocking on first request | server modules | P3 — acceptable for local tool |
| `streamingIdx` race condition | `useChatAgents.js` | P3 — unlikely in single-user tool |
| DFC power scoring bug (MDFC lands miss role flags) | `powerRanker.js` | P3 — affects a few MDFCs |
| localStorage write on every streaming token | `useChatAgents.js` | P3 — debounce recommended |

---

## Next Steps

**Option A — Merge Phase 2 and start Phase 3:**
```
git checkout master
git merge feat/phase2-arbiter-retrieval
git push origin master
```
Then start Phase 3 work: chat session manager, Jace → Arbiter silent wiring, TODOS.md P3 cleanups.

**Option B — Continue working on feat/phase2-arbiter-retrieval:**
Pick up the P3 items from TODOS.md while the branch is fresh.

---

## Quick Verification

```bash
cd app && npm run build     # should pass clean
npm run dev                 # should start on port 3000 (or 3001 if 3000 occupied)
```

After dev server starts:
- Load a deck, send a Karn message → should show power ranking and bracket
- Ask Jace a rules question → should show Arbiter grounding metadata
- Check header: "Local N | API N" badge should show 0 API calls for local questions

---

## Project Context

- Owner: Colton — vibe-coder, Commander/EDH player, delegates fully
- Hardware: Windows 11, RTX 5080 (16GB VRAM), 32GB DDR5
- Models: qwen2.5:32b (deep), qwen2.5:14b (mid/Arbiter/Karn/Tibalt), qwen2.5:7b (fast)
- Stack: Next.js 15, Ollama, gstack, Anthropic (fallback only)
- Repo: `C:\Users\colto\Documents\Claude\Projects\MTG-TOOL`
- CLAUDE.md is the source of truth for all architectural decisions

**The core mandate:** Local-first. Anthropic must stay at 0 API calls in normal operation.
