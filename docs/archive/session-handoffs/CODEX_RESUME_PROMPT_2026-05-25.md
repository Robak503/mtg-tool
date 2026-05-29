# MTG Tool — Resume Prompt (2026-05-25)

Copy/paste the block below into the next Claude Code session.

---

```text
You are continuing work on the MTG Tool project.

Project root: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL
App root: C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app
Branch: feat/phase2-arbiter-retrieval
Latest commit: 0b5a4e6

Before changing any code, read these files in order:
1. CLAUDE.md
2. CODEX_PHASE2_PROGRESS_2026-05-24.md  ← current state + what's done
3. PHASE2_PLAN.md                        ← architecture rationale
4. app/README.md

Key file naming rule: any new handoff or review file you create for Claude must
start with CODEX_ so it's easy to find (e.g., CODEX_RESUME_PROMPT_2026-05-25.md).

---

WHAT IS BUILT AND VERIFIED

Phase 2 backend (Arbiter retrieval):
- Local rules index (cr_current.json → rules-index.json, 3138 rules)
- In-memory Scryfall card index (oracle_cards.json, 37466 cards, O(1) lookup)
- rulesRetrieval.js: exact rule number → card-name ruling seed → keyword overlap
- rulesGuruRetrieval.js: 500 RulesGuru precedents as retrieval seed
- citationInjector.js: injects full rule text + card Oracle text into Arbiter prompt
- Arbiter route rebuilt: no HTTP loopback, max_tokens 2500, retrievalMetadata shape locked
- validate:arbiter --limit 2 passes 2/2 (A1 ✓, A2 ✓)
- validate:arbiter --all passes 76/76 core, 424/424 expanded, 500/500 RulesGuru
- anthropic.total = 0 in /api/model-calls

UI features:
- Fast / Deep / API model tier selector in AppHeader
- TrustStrip shows tier, provider, model, deck lock, cards, rules, Arbiter grounding counts
- View Arbiter Sources in chat shows rule numbers, cards, RulesGuru IDs, citation warnings
- Knowledge version snapshots in deck locks

Deck lock + Oracle context (committed May 23, commit 42bba63):
- buildCardContextForNames() in scryfall.js: full ## CARDS REFERENCED block for any deck
- Deck locks apply to all agents (Jace, Karn, Tibalt, Arbiter)
- Full Oracle text for all non-token, non-sideboard deck cards injected every message
- Local Scryfall rulings (max 2 per card) included in lock context
- Unlock Deck button: removes agent's lock, keeps chat history
- Unload Deck button: clears sidebar active deck
- Sidebar deck switch does NOT silently change a locked conversation

---

CURRENT PORT

App is running at http://localhost:3000 (or http://localhost:3001 if 3000 is taken).

cd "C:\Users\colto\Documents\Claude\Projects\MTG-TOOL\app"
npm.cmd run dev

---

IMMEDIATE TASK

The Chrome browser extension was disconnected at the last session checkpoint. The first
task is a manual UI browser smoke test to confirm Phase 2 is clean before moving forward.

Open http://localhost:3000 (or :3001) and run:

1. Load the Sliver Hivelord deck from the sidebar.
2. Switch to Karn → clear chat → ask: "Suggest 10 cards to cut."
   - Expect: 10 complete cut bullets, all from the deck, NO Additions section.
   - Expect: deck lock banner visible, model shows Fast/local.

3. Switch to Jace → clear chat → ask: "How does the stack work?"
   - Expect: stack primer fires, Arbiter trace attached (View Arbiter Sources visible),
     TrustStrip shows local provider, anthropic.total still 0.

4. Switch to Tibalt → clear chat → ask: "Roast my active deck."
   - Expect: full roast reaches Final Verdict, no mid-section truncation.

5. Ask a card-interaction question in Jace:
   "If Rest in Peace is in play, does [[Viscera Seer]] see [[Yawgmoth, Thran Physician]] die?"
   - Expect: Arbiter trace fires, View Arbiter Sources shows 614.6 and 700.4.
   - Expect: Verdict says no dies trigger.

6. Test Unlock Deck → confirm lock banner disappears.
7. Test Unload → confirm loaded deck disappears.
8. Reload the page → confirm chat history and deck lock persisted.
9. Check http://localhost:3000/api/model-calls → anthropic.total = 0.

---

AFTER SMOKE TEST

If everything passes, Phase 2 is done. The next priorities are (pick one):

A) KARN/TIBALT VOICE QUALITY
   - Route some Karn deck-analysis questions to 14B (qwen2.5:14b) for better quality
   - Tibalt currently uses 7B (fast) — roast quality is noticeably softer than target voice
   - Threshold: if a message is a full-deck analysis or roast (not a quick question), route to 14B

B) CHAT SESSION MANAGER (PHASE 4 START)
   - A list of open chats grouped by agent
   - Each shows: agent, locked deck, started time, last activity
   - "New chat" button with agent + deck selector
   - "Archive chat" without deleting history
   - This is the CLAUDE.md Phase 4 item

C) IN-APP FEEDBACK CAPTURE
   - "Report Issue" button in the app
   - Writes to data/feedback/ with timestamp, agent context, message
   - Owner accumulates real usage feedback for future prioritization

Do not start Forge integration, embeddings, semantic retrieval, or learn-to-play.

---

KNOWN GOTCHAS

- npm.cmd not npm (PowerShell execution policy)
- .next cache: if dev server returns 500s after a build, stop dev, delete .next, restart
- Port 3000 vs 3001: if 3000 is occupied by old Codex copy, Claude project uses 3001
- Anthropic must stay at 0 — the API selector is cost control, not a feature
- retrievalMetadata shape is locked: { rulesRetrieved: {ruleNumber,text}[], cardsRetrieved: string[], hallucinations: string[], confidence: 'high'|'low' }

---

ENVIRONMENT

OS: Windows 11
Node: v24.16.0
Models (all local, Ollama):
  OLLAMA_FAST_MODEL = qwen2.5:7b   (Jace/Karn/Tibalt fast questions)
  OLLAMA_MODEL      = qwen2.5:32b  (Deep tier)
  OLLAMA_ARBITER_MODEL = qwen2.5:14b (Arbiter / rules engine)
Dev server: cd app && npm.cmd run dev
Verify: http://localhost:3000 or :3001
Model calls log: http://localhost:3000/api/model-calls
Knowledge status: http://localhost:3000/api/knowledge-status
```
