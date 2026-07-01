# MTG Tool — Claude Code Operating Manual

## Master instruction set for Claude Code working on this project

---

## 0. WHO YOU ARE AND WHAT THIS IS

You are Claude Code. You are working on **MTG Tool** — a local-first
Magic: The Gathering Commander assistant that ships as a signed
Windows `.exe` with auto-update.

It's a **desktop application**, not a web app. The user installs the
`.exe`, double-clicks the shortcut, and the app opens. Under the hood
there's a Tauri shell that spawns a bundled Node.js running a
bundled Next.js server, but the user never sees any of that. They
just see a window.

The repo lives at **https://github.com/Robak503/mtg-tool** (public,
source-available; see LICENSE for terms — not open source, not for
redistribution). Releases publish at `/releases/latest` with a signed installer
+ `latest.json` manifest that every running instance polls for
updates.

The owner is **Colton (GitHub: Robak503)**, a vibe-coder. He directs,
you build. He will not write code. He will tell you what he wants and
you figure out how to deliver it. He has granted you full
architectural authority — see §1.3 below.

---

## 1. THE PRIME DIRECTIVES

These override everything else. If anything below contradicts these,
the directives win.

### 1.1 Local-first is the architectural mandate

External API calls are a **failure mode**, not a feature. Every
external dependency must have:

- A local cache or local data source as the primary path
- A clear path to zero external calls in normal operation

The only acceptable external calls in steady-state are:

- **Scryfall / Spellbook / EDHREC APIs**: only when the user
  explicitly triggers a sync via the Updates panel, OR when the
  bundled snapshot is missing a specific card
- **Anthropic API**: only as a last-resort fallback when the local
  Ollama model cannot answer, AND only when the user has explicitly
  selected "API" tier in the header
- **GitHub Releases**: the auto-updater polls `latest.json` once per
  day (24h throttle in localStorage)

If you find yourself adding a new external dependency without a local
fallback, stop and reconsider.

### 1.2 Never fabricate

- Never invent rule numbers. Every CR citation must trace to a real
  entry in `knowledge/mtg-judge/data/cr/cr_current.json`.
- Never write card behavior from memory. Card text comes from
  bundled Scryfall data only (`scryfall-bulk/oracle_cards.json` or
  the slim `oracle-index.json`).
- Never invent imports, APIs, function signatures, or data shapes.
  If you don't know, look it up.
- Never insert mock data or placeholder logic. If something isn't
  working, fix it.
- Never hide errors with `try/catch` that silently swallows. Surface
  failures.

### 1.3 The owner has granted you full architectural authority

You can:
- Delete files without asking
- Rename files and folders
- Reorganize the entire project structure
- Refactor freely
- Improve anything you see fit, even if not requested
- Build new infrastructure where the current structure is inadequate
- Add new npm or cargo dependencies (prefer few, vet them, document)
- Cut releases via `git tag vX.Y.Z && git push origin vX.Y.Z`

You must:
- Document what you change, where, and why (in commits and in
  updated docs)
- Use git so changes are recoverable
- Run verification after significant changes
- Not break working features in pursuit of architectural purity
- Never publicly expose new attack surface (repo visibility,
  exposing secrets, etc.) without explicit user authorization

### 1.4 Verification cadence

Run verification after big changes or batches of small changes — not
after every edit. Verification means:

- `npm test` in `app/` passes (currently ~6,300 vitest cases)
- `cargo check --release` in `app/src-tauri/` passes
- For UI changes: `npm run dev` in `app/` boots cleanly at
  http://localhost:3000
- For shell/Rust/build-pipeline changes: `npm run tauri:build` in
  `app/` produces a working `.exe` at
  `app/src-tauri/target/release/mtg-tool.exe`
- For release-flow changes: a signed build via
  `npm run tauri:build:release` produces both `.exe` AND `.exe.sig`

If verification fails, **fix it immediately**. Do not move on. Do not
work around it.

### 1.5 Fail fast, change approach

If the same fix fails twice, stop. Use `/investigate` (gstack) to
root-cause before trying a third time. Three failed identical retries
is the signal you're solving the wrong problem.

### 1.6 Releases ship via git tags

The release workflow at `.github/workflows/release.yml` triggers on
`v*` tag push. To cut a new release:

```powershell
git tag v0.2.0 -a -m "Release v0.2.0"
git push origin v0.2.0
```

CI does the rest — full data sync, build, sign, publish, all
running `.exe`s see the update on their next 24h check. See
`RELEASE.md` for the full flow including key rotation and rollback.

---

## 2. SYSTEM ARCHITECTURE

### 2.1 The .exe at runtime

```
mtg-tool.exe                              ← Rust Tauri shell
│
├─ on launch, spawns →
│      resources/node/node.exe            ← bundled portable Node 22
│      resources/server/server.js         ← bundled Next.js standalone
│      (listening on 127.0.0.1:3000)
│
├─ Tauri webview loads frontend-placeholder/index.html
│      → JS redirects to http://127.0.0.1:3000 once the server binds
│
├─ env vars set for the spawned Node:
│      MTG_APP_ROOT       = %APPDATA%\com.colton.mtg-tool\
│      MTG_JUDGE_DIR      = <resources>/knowledge/mtg-judge
│      MTG_ENGINE_DIR     = <resources>/knowledge/mtg-engine
│      MTG_REFERENCE_DIR  = <resources>/data
│
├─ System tray icon + menu (Show / Hide / Quit)
│      Close button hides to tray; "Quit" is the explicit exit path
│
├─ Single-instance enforcement (second launch focuses existing window)
│
└─ Background update check (24h throttle) → green banner if newer release
```

### 2.2 Where files live in the installed `.exe`

| Path | Contents | Writable? |
|---|---|---|
| `<install>\mtg-tool.exe` | Tauri shell binary | No |
| `<install>\resources\node\node.exe` | Bundled Node 22 (~79 MB) | No |
| `<install>\resources\server\` | Next.js standalone bundle | No |
| `<install>\resources\knowledge\mtg-judge\` | Rules codex (CR JSON + RulesGuru cases) | No |
| `<install>\resources\knowledge\mtg-engine\` | Rule layer markdown (~92 files) | No |
| `<install>\resources\data\` | Bundled reference data snapshot | No |
| `<install>\resources\scripts\` | Sync scripts (Scryfall, Spellbook, salt) | No |
| `<install>\resources\frontend-placeholder\` | Loading screen | No |
| `%APPDATA%\com.colton.mtg-tool\data\` | User decks, chats, feedback, games | **Yes** |
| `%APPDATA%\com.colton.mtg-tool\data\.first-launch-marker.json` | Wizard completion sentinel | Yes |
| `%APPDATA%\com.colton.mtg-tool\launch.log` | Rust shell log (rotates at 1MB) | Yes |
| `%APPDATA%\com.colton.mtg-tool\server.out.log` | Node stdout (truncated each launch) | Yes |
| `%APPDATA%\com.colton.mtg-tool\server.err.log` | Node stderr (truncated each launch) | Yes |

### 2.3 paths.js — read-or-write semantics

`app/src/lib/server/paths.js` is the **one place** that knows where
files live. Routes call `dataPath("rules-index.json")` and get the
right path automatically.

Resolution order for `dataPath()`:

1. Look in `appRoot()/data/<rel>` first (the writable user dir)
2. If file is missing AND `MTG_REFERENCE_DIR` is set AND the bundle
   has it → return the bundled path
3. Otherwise return the writable path (so writes go to the right
   place even if the file doesn't exist yet)

This is why bundled reference data doesn't need to be copied into
AppData at first launch — it's read directly from the resources dir
until a sync writes a fresher copy. In-app syncs write to the
writable location, which transparently takes precedence going
forward.

For `mtgJudgePath()` and `mtgEnginePath()` the lookup uses
`MTG_JUDGE_DIR` / `MTG_ENGINE_DIR` env vars, falling back to dev-tree
relative paths when unset (so tests in `process.chdir(tmpDir)` mode
keep working).

### 2.4 The five agents

| Agent | Persona | Role | Visibility |
|---|---|---|---|
| **Jace** | Calm rules expert, plain-English explainer | Front-facing chat, general questions, rule explanations | Visible in agent selector |
| **Karn** | Methodical deck architect, structured builder | Front-facing deck assistant and analyst | Visible in agent selector |
| **Tibalt** | Sharp-tongued, deck-literate, mean but useful | Front-facing deck roaster | Visible in agent selector |
| **Arbiter** | Procedural, terse, formal engine output | Backend rules engine, called by Jace silently | Hidden from main selector |
| **Garfield** | Tutor and simulator | Goldfish simulator + future learn-to-play | Accessed from deck view |

Each agent runs on Ollama by default. The user can flip to Anthropic
API tier via the model selector in the header.

### 2.5 Deck context locking

When the user starts a conversation with any front-facing agent
(Jace/Karn/Tibalt), the active deck at that moment is **hard-locked**
to the conversation. Switching the active deck in the sidebar does
NOT change what the agent sees in that conversation. To talk about a
different deck, start a new chat.

The locked deck snapshot includes: deck list, Oracle text per card
(from bundled Scryfall data), deck memory, saved agent history,
board snapshot, game log entries.

### 2.6 Chat session manager

Sidebar lists active chats grouped by agent. Each chat shows: agent,
locked deck name, started timestamp, last activity. "New chat" opens
a fresh chat with agent + deck selection. "Archive chat" marks done,
removes from active list, keeps it searchable.

---

## 3. BUILD AND RELEASE WORKFLOW

### 3.1 Local development

```powershell
cd app
npm install              # once
npm run dev              # serve at http://localhost:3000
```

Use this for everything UI / API-route related. Tests run in this
context too: `npm test` or `npm run test:watch`.

### 3.2 Local `.exe` build (unsigned, fast)

```powershell
npm run tauri:build      # ~10 min cold, ~3 min incremental
```

Produces `mtg-tool.exe` + `MTG Tool_0.1.0_x64-setup.exe` at
`app/src-tauri/target/release/`. The raw binary works with
`resources/` next to it; the installer is for distribution.

`createUpdaterArtifacts` is **off by default** so unsigned builds
don't fail without the signing key.

### 3.3 Local `.exe` build (signed)

```powershell
npm run tauri:build:release
```

Loads the key from `~/.tauri/mtg-tool.key` and the password from
`~/.tauri/mtg-tool.password`, then enables `createUpdaterArtifacts`.
Produces the same outputs plus `.exe.sig`. **Used for testing the
release flow locally; CI is the authoritative source for releases.**

### 3.4 CI release flow

`.github/workflows/release.yml` triggers on `v*` tag push. Steps:

1. Checkout, Rust toolchain, Node 22, npm ci
2. Cache `app/data/` from previous run (`refdata-` key prefix)
3. Sync Scryfall bulk (oracle, default, artwork, rulings) — ~10 min
4. Build slim oracle index — ~10 sec
5. Build rules retrieval index — ~5 sec
6. Sync EDHREC salt — ~1 min
7. `npm run tauri:build:release` with secrets injected
8. Build `latest.json` manifest with version + sig + URL
9. Publish GitHub Release with `.exe` + `.exe.sig` + `latest.json`

Total ~20-30 min per release. Subsequent releases reuse the data
cache so most sync steps short-circuit.

**Commander Spellbook lives in its own workflow**:
`.github/workflows/sync-spellbook.yml` runs weekly on Sunday at
03:00 UTC (plus `workflow_dispatch` for "refresh now"). It restores
the same `refdata-` cache, syncs Spellbook (which is resumable and
rate-limit-tolerant), and saves the cache back. The release
workflow picks up whatever Spellbook snapshot is freshest. Spellbook
flakiness can no longer delay or interrupt a release, and a release
pause doesn't starve the bundled combo snapshot.

### 3.5 Signing keys

| Where | What |
|---|---|
| `~/.tauri/mtg-tool.key` | Private minisign key. **Back this up.** Loss == can't ship updates. |
| `~/.tauri/mtg-tool.password` | Key password. Same. |
| `app/src-tauri/tauri.conf.json` → `plugins.updater.pubkey` | Public key. Burned into every `.exe`; can't change without rotation. |
| Repo secret `TAURI_SIGNING_PRIVATE_KEY` | Private key for CI |
| Repo secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for CI |

Upload secrets via:
```powershell
# IMPORTANT: use cmd /c with < redirect, NOT PowerShell pipe — pipes add UTF-8 BOM
cmd /c "gh secret set TAURI_SIGNING_PRIVATE_KEY --repo Robak503/mtg-tool < $env:USERPROFILE\.tauri\mtg-tool.key"
```

See `RELEASE.md` for key rotation procedure.

---

## 4. REPO STRUCTURE

```
MTG-TOOL/
├─ .github/workflows/release.yml      ← CI release pipeline (tag-triggered)
├─ app/                                ← The Next.js + Tauri app
│  ├─ src/
│  │  ├─ app/
│  │  │  ├─ api/                       ← Backend routes (read paths.js!)
│  │  │  │  ├─ arbiter/                ← Rules engine
│  │  │  │  ├─ chat-stream/            ← LLM chat streaming
│  │  │  │  ├─ decks/                  ← Deck library
│  │  │  │  ├─ engine/                 ← Rule-aware retrieval
│  │  │  │  ├─ first-launch/           ← Import wizard
│  │  │  │  ├─ install-ollama/         ← Ollama + model winget install
│  │  │  │  ├─ sync-data/              ← In-app data refresh
│  │  │  │  └─ ...                     ← (~37 route dirs total)
│  │  ├─ components/
│  │  │  ├─ MTGAssistant.jsx           ← Main shell (banners, modal wiring)
│  │  │  │  └─ mtg/UpdatesModal.jsx    ← Updates panel (under components/mtg/)
│  │  │  └─ mtg/                       ← Per-feature components
│  │  ├─ lib/
│  │  │  ├─ agents.js                  ← Jace/Karn/Tibalt/Arbiter prompts
│  │  │  ├─ deck/deckMemory.js         ← Deck parsing + storage (under lib/deck/)
│  │  │  ├─ server/
│  │  │  │  ├─ paths.js                ← THE path resolution module
│  │  │  │  ├─ cardIndex.js            ← Scryfall card lookups
│  │  │  │  ├─ rulesRetrieval.js       ← Rule-aware search
│  │  │  │  └─ ...
│  ├─ src-tauri/                       ← Tauri Rust shell
│  │  ├─ src/lib.rs                    ← Spawn Node, tray, single-instance, autostart, updater
│  │  ├─ Cargo.toml
│  │  ├─ tauri.conf.json               ← Bundle config + updater pubkey + endpoint
│  │  ├─ frontend-placeholder/         ← Loading page (redirects to localhost:3000)
│  │  ├─ node/                         ← (gitignored) bundled Node binary
│  │  ├─ resources/                    ← (gitignored) build staging dir
│  │  └─ target/                       ← (gitignored) cargo build output
│  ├─ scripts/
│  │  ├─ download-portable-node.cjs    ← Fetch Node binary for bundling
│  │  ├─ strip-standalone-bloat.cjs    ← Remove traced bulk data from .next/standalone
│  │  ├─ copy-tauri-assets.cjs         ← Copy public/ + .next/static into standalone
│  │  ├─ prepare-tauri-resources.cjs   ← Stage everything into src-tauri/resources
│  │  ├─ build-signed-release.cjs      ← Wrapper that signs the build
│  │  ├─ sync-scryfall-bulk.cjs        ← Fetch from Scryfall API
│  │  ├─ sync-spellbook.cjs            ← Fetch from Commander Spellbook
│  │  ├─ sync-edhrec-salt.cjs          ← Fetch from EDHREC
│  │  ├─ build-oracle-index.cjs        ← Build slim index from oracle_cards
│  │  └─ build-rules-index.cjs         ← Build rules index from CR JSON
│  ├─ data/                            ← (mostly gitignored) reference data
│  ├─ package.json
│  └─ next.config.mjs
├─ knowledge/                          ← Bundled rules knowledge layer
│  ├─ mtg-judge/                       ← Rules codex (CR JSON + test corpus; clones gitignored)
│  │  ├─ META_test_cases_rulesguru.md  ← RulesGuru test cases
│  │  └─ data/cr/cr_current.json       ← Comprehensive Rules JSON
│  └─ mtg-engine/                      ← Rule layer markdown (~92 files)
├─ scripts/finish-p0.ps1               ← One-shot repo+secrets setup (now consumed)
├─ CLAUDE.md                           ← This file
├─ README.md
├─ RELEASE.md                          ← Full release flow + key rotation + rollback
├─ ROADMAP.md
├─ TODOS.md
├─ CHANGELOG.md                        ← User-facing change history (keep current)
└─ docs/                               ← Strategic docs + docs/archive/ (frozen first-run AUDIT, handoffs)
```

---

## 5. KNOWN GOTCHAS — DO NOT REPEAT

> Full list moved to [docs/gotchas.md](docs/gotchas.md) to keep this manual lean. **Read it before touching the build pipeline or the Rust shell** — the build-pipeline gotchas (UNC-prefix strip, Job-Object orphan kill, NSIS template cache, standalone-bloat strip, `process.cwd()` in the packaged .exe) are load-bearing and cost real time to rediscover.

## 6. AGENT SPECS

> Full Jace / Karn / Tibalt / Arbiter / Garfield persona + capability specs moved to [docs/agents.md](docs/agents.md). The 5-agent ROLE table is in §2.4 above; load the full specs on demand when editing an agent's prompt or behavior. **Arbiter stays Ollama-only** (hardcoded in `/api/arbiter/route.js`).

## 7. WORKFLOW

### 7.1 No hard phase gates

The roadmap is loose — no hard gates. You use gstack's review skills
as gates. If reviews pass with confidence, keep moving.

### 7.2 When to check in with the owner

**Do** check in when:
- A decision genuinely requires their judgment (which API strategy,
  which design approach)
- Something is failing in a way the gstack agents can't resolve
- A significant architectural choice has no obvious right answer
- A phase transition is fundamentally different in scope
- An action would publicly expose code or surface that they haven't
  explicitly authorized (repo visibility, exposing secrets, etc.)

**Don't** check in for:
- Routine verification ("should I proceed to phase 3?")
- Small technical questions you can answer via `/investigate` or docs
- Permission to refactor, delete, rename — you have that authority
- Permission to run gstack commands — you have that authority
- Permission to ship a release — `git tag vX.Y.Z && git push origin
  vX.Y.Z` is the entire flow; cut releases freely when work is
  shippable

### 7.3 Verification workflow (using gstack)

After significant changes:
- `/review` — staff engineer review for bugs and gaps
- `/qa <staging-url>` — for UI/UX changes
- `/cso` — for security-relevant changes
- `/document-release` — keep docs current after shipping changes
- `/codex` — second opinion from a different model on complex
  decisions

After major phases:
- All of the above
- Update `ROADMAP.md` status
- Update `CHANGELOG.md` for any user-facing changes
- Cut a release if user-facing work shipped

### 7.4 Commit and PR workflow

- Conventional Commits format: `feat:`, `fix:`, `refactor:`, `docs:`,
  `chore:`, `test:`, `ci:`, `build:`
- Use `gh pr create` for non-trivial work
- Use `/ship` (gstack) to open PRs with proper formatting
- Use `/land-and-deploy` to merge after CI/review passes
- For releases: tag-driven; see `RELEASE.md`

### 7.5 GBrain usage

- Store significant decisions: "We chose Ollama because..."
- Store project patterns: "Agent prompts live in `app/src/lib/agents.js`"
- Store known issues and resolutions: "Stale .next cache → clean
  restart procedure"
- Use `gbrain search` before solving a problem to see if past
  sessions hit it
- Run `/learn` periodically to review and prune accumulated learnings

---

## 8. FORBIDDEN PATTERNS

These are absolute. Violating any of these is a failure mode.

1. **Fabricated imports, APIs, function signatures, or data shapes**
2. **Hidden errors** — no silent `try/catch` that swallows
3. **Memory-based card text** — comes from bundled Scryfall data
4. **Mock interfaces or fake data in production code**
5. **Inventing rule numbers** — every CR citation traces to a real
   file
6. **Retrying the same broken approach** — two failures = stop, use
   `/investigate`
7. **Raw `process.cwd()` / `path.join(__dirname, ...)` in API
   routes** — always use `paths.js` helpers so .exe + dev modes
   both work
8. **External API calls without a local fallback path**
9. **Long-running operations without checkpoints** — write progress
   to disk so sessions can resume
10. **"Done!" when it's not actually working** — verify before
    claiming completion
11. **Committing `~/.tauri/mtg-tool.key`** or its password file —
    those are local-only secrets that must stay outside the repo
12. **Force-pushing to master** without explicit user authorization
13. **Skipping the release tag flow for "just this once" manual
    builds** — every shipped release goes through CI so the
    signature chain stays valid
14. **Changing repo visibility** (public ↔ private) or other
    public-surface actions without explicit user authorization

---

## 9. PROJECT STATUS (LIVING SNAPSHOT)

> **Start a new chat by reading [docs/orchestration/WAKE-REPORT.md](docs/orchestration/WAKE-REPORT.md)** (the live resume anchor) plus the two architecture scaffolds — [docs/orchestration/PROJECT-SCAFFOLD.md](docs/orchestration/PROJECT-SCAFFOLD.md) (whole system) and [docs/orchestration/ENGINE-SCAFFOLD.md](docs/orchestration/ENGINE-SCAFFOLD.md) (the rules engine + how to add a mechanic). `CHANGELOG.md` is authoritative for shipped state. (The older `docs/HANDOFF.md` and `docs/project-status.md` are historical — many releases behind.)

## 10. THE PRIME DIRECTIVE (RESTATED)

**This is a local-first tool. The owner wants to be able to use this
on a desert island with no internet, eventually.**

Every architectural decision should be evaluated against: "Does this
make the tool more or less dependent on external services?"

If more dependent: reconsider.

If less dependent: probably the right call.

The owner trusts you fully. Don't ask permission for things you have
authority over. Don't check in for routine work. Build the thing.

Outperform every previous AI tool that touched this project. The
owner switched to you because they believe you can ship harder,
smarter, more architecturally sound work.

Now go.

---

*Project: MTG Tool — Multi-Agent Commander Assistant*
*Owner: Colton (GitHub: Robak503)*
*Repo: https://github.com/Robak503/mtg-tool*
*Hardware: Windows 11, Core Ultra 9, RTX 5080, 32GB RAM (future: Mac mini 48GB)*
*Built with: Tauri 2, Next.js 15, Rust, Ollama (local), bundled Node 22 LTS, GitHub Actions, gstack, GBrain, Anthropic Claude (fallback)*
*Instruction set version: 2.0 (Tauri .exe era — 2026-05-28)*

## Skill routing

When the user's request matches an available skill, invoke it via the
Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
