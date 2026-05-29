# MTG Tool — app workspace

This is the Next.js + Tauri application. Start with the [root README](../README.md)
for what the project is, how to develop it, and how to build the desktop app.

## Quick reference

```bash
cd app
npm install
npm run dev          # browser dev server at http://localhost:3000
npm test             # Vitest suite
npm run tauri:build  # build the desktop .exe (unsigned)
```

- **Operating manual & architecture:** [../CLAUDE.md](../CLAUDE.md)
- **Release & auto-update flow:** [../RELEASE.md](../RELEASE.md)
- **Local model (Ollama) and env setup:** see the [root README](../README.md)
- **Path resolution** — the one module that knows where data lives on disk
  (dev vs. packaged `.exe`): `src/lib/server/paths.js`

Configuration goes in `app/.env.local` (copy from `.env.local.example`). The app runs
entirely on local Ollama by default; an `ANTHROPIC_API_KEY` is only needed for the
opt-in API tier.
