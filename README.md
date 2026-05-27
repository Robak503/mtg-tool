# MTG Tool

A local-first, multi-agent Magic: The Gathering Commander assistant. Built for personal use — deck building, deck roasting, rules questions during play, goldfish simulation, and (eventually) interactive learn-to-play tutoring.

## What it does

**Five AI agents, three front-facing, two background:**

- **Jace** — Plain-English MTG chat. Rules questions, card explanations, general assistance.
- **Karn** — Deck builder and analyst. Curve, color balance, role coverage, suggested cuts and adds.
- **Tibalt** — Deck roaster. Sharp, funny, surgical. Critiques your decks like a good friend who knows the format too well.
- **Arbiter** — Backend rules engine. Called silently by Jace for rules-sensitive questions. Returns formal rulings with verified citations from the Comprehensive Rules.
- **Garfield** — Goldfish simulator and future learn-to-play tutor. Runs your decks against themselves and (eventually) other decks to teach you to pilot them.

## Architecture

Local-first. All card data, rules data, deck data, and chat history live on your machine. Local Ollama model for generation. External APIs (Anthropic, Scryfall) are deliberate fallbacks for missing data or user-selected API mode only.

```
Agents → Arbiter (rules engine) → Local Knowledge Layer
                                  ├─ Scryfall bulk (5 datasets)
                                  ├─ mtg-judge rules codex
                                  ├─ RulesGuru question bank
                                  ├─ Forge card scripts
                                  └─ GBrain (project memory)
```

## Quick start

Requirements:
- Windows 11 (current) or macOS (future)
- Node.js 20+
- [Ollama](https://ollama.com) running locally
- [gstack](https://github.com/garrytan/gstack) for Claude Code workflow (optional but recommended)

Setup:
1. Clone or copy this project to your local machine
2. `cd app && npm install`
3. Copy `.env.local.example` to `.env.local` and fill in your keys
4. Set up Ollama (see below)
5. Run sync to populate local data: `npm run sync:scryfall-bulk` (downloads all 5 bulk datasets) followed by `npm run build:oracle-index` (builds the slim ~29MB lookup table — drops cold start from ~3-5s to ~200ms)
6. Start the app: `npm run dev` from `app/`
7. Open http://localhost:3000

## Common commands

```bash
npm run dev                  # Next.js dev server
npm run build                # Production build (cleans .next first)
npm test                     # Vitest unit/integration suite
npm run test:watch           # Vitest in watch mode
npm run build:oracle-index   # Re-build the slim oracle index after sync
npm run sync:scryfall-bulk   # Pull the 5 Scryfall bulk datasets
npm run backup               # Snapshot data/ → data/backups/{ts}/
```

## Features as of 2026-05-26

- **Multi-session chat per agent.** Each Jace/Karn/Tibalt conversation lives in its own session with a locked-deck snapshot. Switch sessions via the SessionSidebar (desktop). Archive completed chats; they remain searchable.
- **Per-session locked deck.** When you start a chat, the active deck is hard-locked to that session. Changing the active deck in the sidebar doesn't change the lock. To talk about a different deck, start a new chat.
- **Garfield v2 goldfish.** Archetype-aware simulator (aggro / control / combo / ramp / voltron / tokens / aristocrats / midrange). Proper London mulligan. type_line + keywords classification, DFC handled. Game records save to `data/games/`.
- **Goldfish history insights.** Karn/Tibalt/Jace see your last N runs' stats — average score, mulligan rate, commander-on-curve rate, threat-by-turn-5 rate, weak/strong signals — in their system prompt. They reference real data instead of vibing.
- **In-app feedback capture.** Floating 💬 button → modal with compose + inbox. Writes to `data/feedback/`.
- **Ollama health banner.** Auto-detects when the daemon isn't running or models aren't pulled. One-click "Use Anthropic instead" fallback or dismiss.
- **Atomic chat-file writes.** Crash mid-write never leaves a half-written `chats.local.json`. v1 files auto-migrate to v2 on first read with a `.v1.bak` backup.
- **Cost stays at 0.** All chat/Arbiter calls hit Ollama by default. Anthropic API is opt-in (toggle in the header).

## Local model setup (Ollama)

The app uses a local Ollama model by default — no API costs.

1. Install Ollama: https://ollama.com
2. Start the server: `ollama serve`
3. Pull the three model tiers (defaults; configurable via env):
   - `ollama pull qwen2.5:32b`  (Deep tier — Jace, Arbiter big context)
   - `ollama pull qwen2.5:14b`  (Mid tier — Karn, Tibalt)
   - `ollama pull qwen2.5:7b`   (Fast tier — quick replies)
4. Confirm: `ollama list`

The app pings `/api/tags` on load and renders an inline banner if the daemon is down or any of the three tiers is missing. The banner has two paths to clear: "Use Anthropic instead" (one-click switch) or × dismiss for this session.

Env overrides:
- `OLLAMA_BASE_URL` — defaults to `http://127.0.0.1:11434`
- `OLLAMA_MODEL` / `OLLAMA_FAST_MODEL` / `OLLAMA_AGENT_MODEL` — override per-tier models
- `ANTHROPIC_API_KEY` — only needed if you want the API fallback
- `MAX_SESSION_MESSAGES` (default 500), `MAX_ARCHIVED_SESSIONS` (default 50), `MAX_ARCHIVED_DAYS` (default 90) — chat-file size caps
- `MAX_GAMES_PER_DECK` (default 200), `MAX_GAMES_DAYS` (default 365) — goldfish history caps

## For Claude Code users

- Read `CLAUDE.md` for the full operating manual.
- Read `ROADMAP.md` for current phase and upcoming work.
- Read `TODOS.md` for the open queue, sorted by priority.
- Read `docs/phase6-learn-to-play.md` for the design of the next major build.

## Project status

Phases 1-5 complete (audit → critical fixes → unified knowledge layer → Ollama integration → session manager UI → archetype-aware Garfield). Phase 4 end-of-pass feedback capture shipped. Phase 6 (Learn-to-Play Mode) design doc written; implementation queued behind GitHub remote setup. 81 Vitest cases across 9 files; full `npm test` clean.

See `ROADMAP.md` for the rolling status, `TODOS.md` for the queue.

## License

Personal project. Not for redistribution.

