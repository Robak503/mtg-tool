# PROJECT-SCAFFOLD — the whole system, mapped for a session without Fable 5

> **What this is.** A durable, high-signal map of the entire MTG Tool project —
> how the `.exe` runs, how the app is built and shipped, where everything lives,
> how the docs + memory + agent-orchestration model fit together. Written during
> the one-time Fable 5 consolidation pass (2026-07-01) so future Opus/Sonnet
> sessions can navigate and extend the project without re-deriving it. Companion:
> [ENGINE-SCAFFOLD.md](ENGINE-SCAFFOLD.md) (the rules engine, deep). The operating
> rules live in the repo root [CLAUDE.md](../../CLAUDE.md) — this doc is the *map*,
> CLAUDE.md is the *law*. When a fact here and the code disagree, the code wins.

---

## 0. What the product is

A **local-first Magic: The Gathering Commander assistant** that ships as a signed
Windows `.exe` with auto-update. The user double-clicks a shortcut and a window
opens. Under the hood a Tauri (Rust) shell spawns a bundled Node.js running a
bundled Next.js server on `127.0.0.1:3000`, and the webview loads that. The user
never sees any of it.

**The prime directive: local-first.** The user should be able to run this on a
desert island. External API calls are a *failure mode*, not a feature. The only
sanctioned external calls in steady state are: user-triggered data syncs
(Scryfall/Spellbook/EDHREC), a per-card cache-miss fallback, the manual
"Anthropic API tier" for chat, and the once-daily GitHub update check. Everything
else runs against bundled data and a local Ollama model.

**The five agents** (personas, all prompt-only in `app/src/lib/agents.js`): **Jace**
(rules chat), **Karn** (deck builder), **Tibalt** (deck roaster), **Arbiter**
(hidden rules engine, Ollama-only — never Anthropic), **Garfield** (the
Learn/Academy simulator). A conversation hard-locks the active deck at start.

---

## 1. THE RUNTIME — how the `.exe` actually runs

```
mtg-tool.exe  (Rust Tauri shell — app/src-tauri/src/lib.rs)
│
├─ resource_dir()/resources/  ← the staged bundle (strips \\?\ UNC prefix)
├─ reap_orphan_servers()      ← kills a leftover bundled node.exe from a prior run
├─ spawn: resources/node/node.exe resources/server/server.js
│     env: PORT=3000  HOSTNAME=127.0.0.1  (loopback only)
│          MTG_APP_ROOT=%APPDATA%\com.colton.mtg-tool   (the WRITABLE user dir)
│          MTG_JUDGE_DIR / MTG_ENGINE_DIR = <resources>/knowledge/*
│          MTG_REFERENCE_DIR = <resources>/data          (the READ-ONLY bundle)
│     child pinned to a Job Object (KILL_ON_JOB_CLOSE) → Node dies with the shell
├─ wait_for_port(3000, 30s); webview shows frontend-placeholder/index.html which
│     polls http://127.0.0.1:3000/ then redirects
├─ plugins: single-instance (focus existing) · updater · autostart
├─ tray: Show / Hide / Quit; window close = hide-to-tray; Quit kills the child
└─ updater: the Next-served page calls updater.check() EVERY launch (banner-first
      opt-out in localStorage); endpoint releases/latest/download/latest.json;
      pubkey burned into tauri.conf.json
```

**The two roots you must respect** (this is the #1 source of ".exe-only" bugs):
- `MTG_APP_ROOT` → `%APPDATA%\com.colton.mtg-tool\` — **writable**. User decks,
  chats, collection, games, synced data.
- `MTG_REFERENCE_DIR` → `<install>/resources/data` — **read-only** bundle.

`app/src/lib/server/paths.js` is the **one module** that knows this. `dataPath(rel)`
returns the writable `appRoot/data/<rel>` if it exists, else falls back to the
read-only bundled copy, else returns the writable path (so writes land correctly
even for a not-yet-created file). **Forbidden:** raw `process.cwd()` /
`path.join(__dirname,…)` in a route or server lib — in the packaged .exe the
spawned Node's cwd is `resources/server`, so those resolve wrong. Always use the
`paths.js` helpers. (A subtle corollary bug class: a module that captures
`dataPath(...)` in a *module-scope const* freezes the bundled path on a fresh
install and never sees a later sync — resolve per-call. See WAKE-REPORT.)

---

## 2. THE APP — Next.js server + React client

### 2.1 Server (`app/src/app/api/*`, `app/src/lib/server/*`)

~37 route directories. Groups:
- **LLM seam**: `chat-stream` (SSE), `arbiter` (Ollama-**pinned**), `tibalt`,
  `learn/ask`, `model-calls`. All go through `lib/server/modelProvider.js` — the
  single provider gate: `{anthropic, api}` → cloud; `auto` → Ollama-then-cloud
  only if `ALLOW_ANTHROPIC_AUTO_FALLBACK=true`; anything else → local Ollama.
- **Rules**: `rules-retrieval` (walks the knowledge markdown + CR JSON),
  `knowledge-status`.
- **Card data**: `cards` (local `cardIndex.js`), `printings/*`, `art-crop` +
  `card-image` (local-first image proxy: disk cache → SSRF-guarded Scryfall →
  atomic write).
- **User data** (per-profile via `profilePath`): `decks`, `chats` (v1→v2
  migration), `collection/*` (15 subroutes, single-writer lock), `games`,
  `watchlist`, `price-alerts`, `profiles`.
- **Finance**: `finance`, `collection/prices` (daily local snapshot),
  `collection/refresh-prices` (user-triggered, capped).
- **Sync**: `sync-data` (spawns bundled sync scripts, SSE progress),
  `install-ollama`, `ollama-health`.
- **Engine wrappers**: `learn/*` (drives the game engine), `self-play`,
  `power-rank`, `pod-balance`, `recommend`, `deck-report`, `combos`, `spellbook`.

**Storage discipline:** all user-facing writes are atomic (tmp+rename via
`atomicJson.js` or a local equivalent) with corruption recovery. External fetches
are user-triggered or per-card cache-miss, with host allowlists + size/time
bounds. Arbiter is hard-pinned to Ollama; chat only reaches Anthropic on an
explicit `anthropic` provider.

### 2.2 Client (`app/src/components/*`, `app/src/hooks/*`)

`MTGAssistant.jsx` is the shell (loaded `ssr:false` so all `window`/`localStorage`
access is client-only). It owns cross-cutting UI state; the real data layer is in
hooks: `useProfiles` (→ `/api/profiles`), `useDeckStore` (saved decks + Scryfall
hydration + analytics memos), `useChatSessions` (the ~800-line send pipeline:
assemble system prompt from deck/oracle/engine/collection context → SSE stream
from `/api/chat-stream`), `useCardSearch`, `useLearnSession` (the game-UI wire
loop). The **Learn/Academy** UI drives the native engine: a server-owned
`GameState` emits a wire `decision`, the UI renders it (option buttons /
click-to-act board / a side-sheet per interactive `pendingChoice` kind), the user
answers, `POST /api/learn/choose|step|continue` advances. **SelfPlayPanel /
SimCenter** drive `/api/self-play`. Reference client-mutation pattern worth
copying: `CollectionView`'s optimistic stepper (`collectionRef` + per-row seq +
reconcile).

---

## 3. THE BUILD + RELEASE PIPELINE

### 3.1 Local build (`npm run tauri:build` from `app/`)

`beforeBuildCommand` = `build:tauri-standalone`, which chains:
1. `download-portable-node.cjs` — Node v22.12.0, **SHA-256 verified**, idempotent.
2. `next build` (standalone output).
3. `strip-standalone-bloat.cjs` — remove traced `data/`+`knowledge/` from the
   standalone (they're bundled separately as resources, not traced copies).
4. `copy-tauri-assets.cjs` — put `.next/static` + `public/` back.
5. `prepare-tauri-resources.cjs` — **wipe and restage** `src-tauri/resources/`:
   the judge CR JSON + RulesGuru md, the engine `L*/META_*.md`, a ~19-file `data/`
   allowlist (~1 GB), the sync/index scripts, `node.exe`, the standalone server.
   Ships a **strict mode** (`CI=true` / `--strict`) that hard-fails if a REQUIRED
   bundle file is missing (the guard that stops a silently-gutted .exe).

`build-signed-release.cjs` (via `npm run tauri:build:release`) loads the minisign
key from `~/.tauri/` (or env), flips `createUpdaterArtifacts:true` through a
tempfile `--config` (a cmd.exe quote-stripping workaround), and produces the
`.exe` + `.exe.sig`.

### 3.2 CI release (`.github/workflows/release.yml`, triggers on `v*` tag)

`npm ci` → **test gate** → sync `tauri.conf.json` version from the tag → restore
the `refdata-` cache (restore-only) → sync Scryfall-bulk / build oracle-index /
build printings-index / seed prices (best-effort) / build rules-index / sync
EDHREC salt / sync Card Kingdom (best-effort) / **sync Spellbook combos**
(bounded, resumable, best-effort) → signed build → build `latest.json` (sig from
`.exe.sig`, space→dot asset URL) + a stable-name `MTG-Tool-Setup.exe` copy →
`softprops/action-gh-release`. Guarded `if: github.ref_type == 'tag'` so a manual
branch dispatch can't build a garbage "master" version.

Other workflows: `ci.yml` (lint + test on master/PR), `rust.yml` (fmt, clippy
`-D warnings`, cargo-audit — also the master-scoped cargo-cache warmer),
`sync-spellbook.yml` (weekly, resumable, maintains the shared `refdata-` cache).

**To cut a release:** `git tag vX.Y.Z -a -m "…" && git push origin vX.Y.Z`. CI does
the rest. Bump `app/package.json` + `app/src-tauri/tauri.conf.json` versions and
date a `CHANGELOG.md` section first. Signing keys live only in `~/.tauri/` +
repo secrets — never committed. Full flow + key rotation + rollback: [RELEASE.md](../../RELEASE.md).

### 3.3 The engine-tooling scripts (dev/orchestrator, not CI)

`measure-coverage.mjs` (coverage dashboard), `tier-fingerprint.mjs` (the flip-diff
gate), `program-fingerprint.mjs` (parser-seam gate), `runtime-fingerprint.mjs`
(mana drift), `qa-sweep.mjs`, `allowlist-guard.mjs` (self-certification tamper
guard), `clause-frontier.mjs`, `play-ranked-backlog.mjs`, `self-play.mjs`. These
are how the engine work is verified — see ENGINE-SCAFFOLD §7.

---

## 4. THE KNOWLEDGE LAYER (`knowledge/`)

- `knowledge/mtg-judge/data/cr/cr_current.json` — the Comprehensive Rules, keyed
  by rule number. **The source of truth for every CR citation** (never invent a
  rule number). Consumed by `build-rules-index.cjs` → `data/rules-index.json` (read
  by `rulesRetrieval.js`), the arbiter suite generator, and the rules-retrieval
  route. Bundled in the `.exe`.
- `knowledge/mtg-judge/META_test_cases*.md` — the Arbiter test corpus
  (handcrafted + generated + a RulesGuru import). `META_test_cases_rulesguru.md` is
  the one bundled at runtime (`rulesGuruRetrieval.js`).
- `knowledge/mtg-engine/L*.md` + `META_*.md` (~92 files) — the rule-layer markdown
  retrieval corpus, chunked at runtime by `/api/rules-retrieval`;
  `META_query_router.md` + `META_layer_index.md` are the routing layer. Bundled
  (excludes `_source/`, which is provenance-only).

---

## 5. DOCS + MEMORY — where the project's brain lives

### 5.1 Docs (`docs/`, `docs/orchestration/`)

- **Live anchors** (read these to resume): `docs/orchestration/WAKE-REPORT.md` (the
  single resume anchor — state, findings, parked items), this scaffold pair,
  `CHANGELOG.md` (authoritative version history), `docs/gotchas.md` (build-pipeline
  landmines — read before touching the build or the Rust shell), `RELEASE.md`.
- **Orchestration**: `coverage-run.md` (the operating spec for the coverage grind),
  `play-ranked-backlog.md`, the FP ledgers (`fp-watch.md`, `retired-fp-ledger.md`),
  `agents/clyde.md` + `agents/omnath.md` (the two live roles).
- **`docs/archive/`** — consumed one-shot handoffs and superseded plans. Historical
  faculty-era planning docs (coverage-autopilot, the retired-builder manuals) live
  or belong here.

### 5.2 Memory (`memory/`, loaded by the `/omnath` boot)

A file-per-fact store with an index (`MEMORY.md`) and a rolling resume spine
(`CONTINUITY.md`). This is the **Omnath brain** — the strategy/product/collector
side of the project, distinct from the Clyde (build) side. Recall is the scaling
layer (semantic search over the files), not bigger files. Durable decisions go to
a memory file + an index pointer; the `COMMS.md` channel is the async Clyde↔Omnath
back-and-forth.

---

## 6. THE AGENT-ORCHESTRATION MODEL

The project runs on **one owner chat per role**, never a second standing session:
- **Clyde** — sole build-and-integrate owner of `master` (the engine/coverage
  grind, releases, integration). This is the seat this scaffold serves.
- **Omnath** — strategy/product/collector brain (the memory store, the self-play
  pilots, deck/collector work). Owns `omnath-tools/`, rides the engine read-only.

**How work fans out:** an owner chat spawns *ephemeral* `Agent()` sub-agents (often
in isolated git worktrees with `node_modules` junctioned from the main tree) to
build/verify in parallel, then integrates their branches ff-only. One chat = one
owner, *not* "work without tools" — the sub-agents are how you scale. The
**MODEL SPLIT** (decided 2026-07-01): the orchestrator runs Opus 4.8 @ xhigh
(judgment: CREED, integration, releases); background build/verify workers spawn
with `model: "sonnet"` (the flip-diff + gate verify every worker regardless of
tier, so Sonnet is the correct cheaper default). Omitting `model` silently
inherits the orchestrator's tier — always pass it. (This consolidation pass was the
one-time exception: Fable 5 for the scan + scaffolds.)

**Integration invariants:** work on a branch; integrate to master ff-only; never
force-push; release via tag. The flip-diff (ENGINE-SCAFFOLD §7) is the truth for
"did this change coverage", computed by script, never claimed by an agent.

**The active env bug** (bit multiple sessions): the Edit/Write tools can silently
misroute an absolute path to the MAIN tree instead of the worktree — the tool
reports success but the file is unchanged and `git -C <main>` goes dirty. Prefer
Bash (node fs / sed / a script file) for edits; after any tool edit, verify it
landed where intended AND `git -C <main-tree> status` is clean.

---

## 7. WHERE TO START (a cold-boot checklist)

1. `git fetch origin && git log origin/master -5` — ground on the live head.
2. Read `docs/orchestration/WAKE-REPORT.md` — the resume anchor.
3. Skim `CHANGELOG.md` for the current version + recent waves.
4. For engine work: [ENGINE-SCAFFOLD.md](ENGINE-SCAFFOLD.md) + `memory/orders/clyde-13deck-grind.md`.
5. For build/shell/release work: `docs/gotchas.md` + [RELEASE.md](../../RELEASE.md) + §3 above.
6. Set up a worktree, junction `node_modules`, and verify the gate is green
   *before* you change anything (so a later failure is attributable to you).

---

*Consolidation pass, Claude Fable 5, 2026-07-01. Keep current: when the runtime
launch sequence, the route groups, or the release flow change, update §1–3.*
