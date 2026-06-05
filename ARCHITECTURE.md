# Architecture

A contributor's-eye view of how MTG Tool fits together. For the full operational
manual (every gotcha, the release-key flow, agent prompt specs), see [CLAUDE.md](CLAUDE.md).

## Overview

MTG Tool is a **local-first desktop app**. Almost everything — card data, rules data,
decks, chats, game logs — lives on the user's machine. Generation runs on a local
Ollama model by default; cloud APIs are opt-in fallbacks.

## Runtime model

The shipped product is a single `.exe`:

```
mtg-tool.exe  (Tauri / Rust shell)
  spawns ->  bundled Node 22  ->  Next.js standalone server on 127.0.0.1:3000
  webview ->  loads a placeholder that redirects to the local server once it's up
```

The Rust shell (`app/src-tauri/src/lib.rs`) owns the OS-level concerns: spawning and
supervising the Node server, the system tray, single-instance enforcement, the
auto-updater, and a Windows Job Object that guarantees the Node child dies with the
shell (so it can't orphan on update). In development you skip all of that and run the
Next.js server directly (`npm run dev`).

## The five agents

Defined in `app/src/lib/agents.js`:

| Agent    | Role                                  | Visible to user? |
|----------|---------------------------------------|------------------|
| Jace     | Front-facing rules/chat explainer     | yes              |
| Karn     | Front-facing deck builder / analyst   | yes              |
| Tibalt   | Front-facing deck roaster             | yes              |
| Arbiter  | Backend rules engine (Ollama-only)    | no               |
| Garfield | Goldfish simulator / learn-to-play    | from deck view   |

Jace silently consults Arbiter for rules-sensitive questions. Arbiter never calls the
cloud — it is hardcoded to Ollama so rulings stay local and deterministic.

## Knowledge / data layer

- **Scryfall bulk** — card Oracle text, rulings, art. A slim `oracle-index.json` is
  built from it for fast lookups.
- **knowledge/mtg-judge** — the Comprehensive Rules as JSON (`data/cr/cr_current.json`)
  plus the RulesGuru question bank.
- **knowledge/mtg-engine** — rule-layer markdown the engine route retrieves over.
- **Commander Spellbook / EDHREC** — combo and "saltiness" data.

`/api/rules-retrieval` does rule-aware retrieval over these sources; `/api/arbiter`
produces formal rulings with verified citations.

## Path resolution

`app/src/lib/server/paths.js` is the single source of truth for "where on disk does
this live?" It resolves the same logical path differently in dev (the repo tree) vs.
the packaged `.exe` (writable `%APPDATA%` for user data, bundled resources for
read-only reference data), with a fallback so an in-app data sync transparently takes
precedence. **All server code must go through it** — never raw `cwd` / `__dirname`.

## Build & release

`npm run build:tauri-standalone` chains the steps: download the portable Node binary,
`next build`, strip over-traced bulk data, copy assets, and stage everything into the
Tauri resources dir. `npm run tauri:build` then produces the `.exe`. Releases are
tag-triggered (`vX.Y.Z`) in CI, which syncs data, builds, signs, and publishes a
self-update manifest. Full details: [RELEASE.md](RELEASE.md).

## Where things live

```
app/src/app/api/         backend routes (chat, arbiter, engine, decks, collection, ...)
app/src/components/       React UI (MTGAssistant shell + per-feature components)
app/src/lib/              shared logic; lib/server/ is server-only (paths, card index, ...)
app/src-tauri/            the Rust desktop shell + build config
app/scripts/              build and data-sync scripts (.cjs)
knowledge/                the bundled rules knowledge layer (mtg-judge + mtg-engine)
```
