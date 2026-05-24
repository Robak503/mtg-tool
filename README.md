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

Local-first. All card data, rules data, deck data, and chat history live on your machine. Local Ollama model for generation. External APIs (Anthropic, Scryfall) are fallbacks for missing data only.

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
3. Pull a local model: `ollama pull qwen2.5:32b` (or similar — see CLAUDE.md for recommendations)
4. Run sync to populate local data: `npm run sync:scryfall && npm run sync:rulesguru`
5. Start the app: `npm run dev`
6. Open http://localhost:3000

For Claude Code users:
- Read `CLAUDE.md` for the full operating manual
- Read `ROADMAP.md` for current build state and priorities

## Project status

In active development. See `ROADMAP.md` for current phase and upcoming work.

## License

Personal project. Not for redistribution.
