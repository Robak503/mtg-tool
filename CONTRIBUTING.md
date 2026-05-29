# Contributing to MTG Tool

Thanks for your interest. MTG Tool is **source-available** (see [LICENSE](LICENSE)):
the code is public to read, learn from, and improve via contributions back to this
repo — it is not open source for redistribution. Issues and pull requests are welcome.

## Getting set up

You need Node.js 22+ and, for local-model chat, [Ollama](https://ollama.com). Then:

```bash
cd app
npm install
cp .env.local.example .env.local   # only needed for the Anthropic fallback tier
npm run dev                         # http://localhost:3000
```

See the [root README](README.md) for data sync and Ollama model setup, and
[ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit together.

## Running tests

```bash
cd app
npm test               # full Vitest suite (hard-timeout wrapped so it can't hang)
npm run test:watch     # watch mode
npx vitest run <name>  # a subset by filename, e.g. npx vitest run spellbook
```

Every new API route or server module should ship with at least an import/smoke test —
an untested route is how a `ReferenceError` once shipped silently to users.

## Principles (please respect these)

This is a **local-first** tool. The guiding rule: every change should make it *less*
dependent on external services, not more.

- **Never fabricate rules or card text.** Rule citations must trace to real entries in
  `mtg-judge/data/cr/cr_current.json`; card behavior comes from the bundled Scryfall
  data, never from memory.
- **Use `app/src/lib/server/paths.js`** for any on-disk path. Never `process.cwd()` or
  `path.join(__dirname, ...)` in app code — the packaged `.exe` has a different layout
  than the dev tree, and only `paths.js` resolves both correctly.
- **Surface errors.** No `try/catch` that silently swallows failures.
- **External API calls** (Anthropic, Scryfall, Spellbook, EDHREC) belong only on an
  explicit user action or a documented fallback path.

## Code style

JavaScript (not TypeScript), ES modules, React 19 / Next.js 15. Match the surrounding
style; comments should explain *why*, not *what*. (Automated linting/formatting is
being added — see `docs/production-cleanup-plan.md`.)

## Commits and pull requests

- **[Conventional Commits](https://www.conventionalcommits.org/):** `feat:`, `fix:`,
  `refactor:`, `docs:`, `chore:`, `test:`, `ci:`, `build:`.
- Branch off `master` with a descriptive name (`fix/...`, `feat/...`, `docs/...`,
  `chore/...`).
- Keep each PR focused on one area; include a short summary and how you verified it.
- Run `npm test` before opening a PR.

## The desktop build

The product ships as a signed Windows `.exe` (Tauri shell + bundled Node + Next.js).
Build it locally with `npm run tauri:build`. Releases are cut from `vX.Y.Z` git tags
via CI — see [RELEASE.md](RELEASE.md). You don't need to touch the release flow to
contribute features or fixes.
