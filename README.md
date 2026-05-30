# MTG Tool

A local-first, multi-agent Magic: The Gathering Commander assistant, packaged as a
signed Windows desktop app. Deck building, deck roasting, rules questions during play,
goldfish simulation, and (in progress) interactive learn-to-play tutoring.

> **Source-available, not open source** — see [LICENSE](LICENSE). Unofficial Fan
> Content; not affiliated with or endorsed by Wizards of the Coast.

## What it does

**Five AI agents — three front-facing, two background:**

- **Jace** — Plain-English MTG chat. Rules questions, card explanations, general help.
- **Karn** — Deck builder and analyst. Curve, color balance, role coverage, cuts and adds.
- **Tibalt** — Deck roaster. Sharp, funny, surgical — critiques your decks like a friend who knows the format too well.
- **Arbiter** — Backend rules engine. Called silently by Jace for rules-sensitive questions; returns formal rulings with verified Comprehensive Rules citations. (Ollama-only, never the cloud.)
- **Garfield** — Goldfish simulator and (in progress) learn-to-play tutor.

## How it ships

The product is a **desktop app**: a Tauri (Rust) shell that bundles its own Node 22
runtime and a Next.js server, so you install a signed `.exe` and open a window — no
terminal, no separate Node install. It auto-updates from GitHub Releases. Under the
hood it's a normal Next.js app you can also run in a browser during development.

## Architecture

Local-first. All card data, rules data, deck data, and chat history live on your
machine. A local Ollama model does generation by default. External APIs (Anthropic,
Scryfall, Commander Spellbook, EDHREC) are deliberate fallbacks — for missing data, or
for the user-selected "API" tier only.

```
Agents -> Arbiter (rules engine) -> Local knowledge layer
                                    |- Scryfall bulk card data
                                    |- knowledge/mtg-judge rules codex (Comprehensive Rules JSON)
                                    |- knowledge/mtg-engine rule-layer docs
                                    |- RulesGuru question bank
                                    |- Commander Spellbook + EDHREC data
```

See [CLAUDE.md](CLAUDE.md) for the full system architecture and runtime layout.

## Develop (browser, fast loop)

Requirements:
- Node.js 22+ (the desktop build bundles its own Node 22; dev uses your system Node)
- [Ollama](https://ollama.com) running locally, for local-model chat

Setup:
1. `cd app && npm install`
2. Copy `app/.env.local.example` to `app/.env.local` (only needed for the Anthropic fallback tier)
3. Populate local data: `npm run sync:scryfall-bulk` (Scryfall bulk: oracle, default, artwork, rulings) then `npm run build:oracle-index` (builds the slim ~29MB lookup table — drops cold start from ~3-5s to ~200ms)
4. `npm run dev`, then open http://localhost:3000

## Build the desktop app

```bash
cd app
npm run tauri:build          # unsigned local build (fast) - good for trying the .exe
npm run tauri:build:release  # signed build with auto-update artifacts (needs the signing key)
```

Output lands in `app/src-tauri/target/release/` (`mtg-tool.exe` plus an NSIS installer).
Releases ship via CI on a `vX.Y.Z` git tag — see [RELEASE.md](RELEASE.md) for the full
signed-release and auto-update flow.

## Common commands

```bash
npm run dev                  # Next.js dev server
npm run build                # Production web build (cleans .next first)
npm test                     # Vitest suite (hard-timeout wrapped so it can't hang)
npm run test:watch           # Vitest in watch mode
npm run tauri:build          # Build the desktop .exe (unsigned)
npm run sync:scryfall-bulk   # Pull the Scryfall bulk datasets
npm run backup               # Snapshot data/ -> data/backups/{timestamp}/
```

## Features

- **Multi-session chat per agent.** Each Jace/Karn/Tibalt conversation has its own session with a locked-deck snapshot. Archive completed chats; they stay searchable.
- **Per-session locked deck.** Starting a chat hard-locks the active deck to that session. To talk about a different deck, start a new chat.
- **Garfield goldfish.** Archetype-aware simulator (aggro / control / combo / ramp / voltron / tokens / aristocrats / midrange), London mulligan, type-line + keyword classification. Game records save to `data/games/`.
- **Goldfish history insights.** Agents see your recent runs' stats (average score, mulligan rate, on-curve rate, threat-by-turn-5) in their prompt, so they reference real data instead of vibing.
- **Card collection.** Import your library (CSV), track price history, resolve conflicts; Tibalt can roast your collection.
- **In-app data sync, Ollama install wizard, feedback capture, and self-update** — all from the app UI.
- **Cost stays at $0 by default.** Chat/Arbiter calls hit Ollama; the Anthropic API tier is opt-in (header toggle).

## Local model setup (Ollama)

1. Install Ollama: https://ollama.com, then `ollama serve`
2. Pull the model tiers (defaults; configurable via env):
   - `ollama pull qwen2.5:32b`  (deep tier — Jace, Arbiter)
   - `ollama pull qwen2.5:14b`  (mid tier — Karn, Tibalt)
   - `ollama pull qwen2.5:7b`   (fast tier — quick replies)
3. `ollama list` to confirm

The app detects a down daemon or missing models and shows an inline banner with a
one-click "Use Anthropic instead" fallback.

Env overrides (in `app/.env.local`):
- `OLLAMA_BASE_URL` — defaults to `http://127.0.0.1:11434`
- `OLLAMA_MODEL` / `OLLAMA_FAST_MODEL` / `OLLAMA_AGENT_MODEL` — per-tier model overrides
- `ANTHROPIC_API_KEY` — only for the opt-in API tier
- chat/goldfish size caps: `MAX_SESSION_MESSAGES`, `MAX_ARCHIVED_SESSIONS`, `MAX_ARCHIVED_DAYS`, `MAX_GAMES_PER_DECK`, `MAX_GAMES_DAYS`

## For contributors

- [CLAUDE.md](CLAUDE.md) — full operating manual and system architecture.
- [ROADMAP.md](ROADMAP.md) — current phase and upcoming work.
- [TODOS.md](TODOS.md) — open queue by priority.
- [RELEASE.md](RELEASE.md) — signed release and auto-update flow.
- [docs/phase6-learn-to-play.md](docs/phase6-learn-to-play.md) — design of the in-progress learn-to-play mode.

## Project status

Phases 1-5 are complete (knowledge layer, Ollama integration, agent rewiring, session
manager, archetype-aware Garfield). The Tauri desktop shell, auto-updater, card
collection, and in-app data sync have shipped. Phase 6 (Learn-to-Play) is in progress.
Run `npm test` for the current suite; see [ROADMAP.md](ROADMAP.md) for the rolling status.

## License

**Source-available, not open source.** The code is public so you can read it, learn
from it, and build it for your own personal use, and contributions are welcome — but it
is **not** licensed for redistribution. See [LICENSE](LICENSE) for the full terms.

This is unofficial Fan Content. Magic: The Gathering and the Comprehensive Rules are
property of Wizards of the Coast; this project is not affiliated with or endorsed by them.
