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

- `npm test` in `app/` passes (currently ~350 vitest cases)
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
| `<install>\resources\knowledge\mtg-engine\` | Rule layer markdown (96 files) | No |
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
│  │  │  │  └─ ...                     ← (~16 routes total)
│  │  ├─ components/
│  │  │  ├─ MTGAssistant.jsx           ← Main shell (banners, modal wiring)
│  │  │  ├─ UpdatesModal.jsx           ← Updates panel
│  │  │  └─ mtg/                       ← Per-feature components
│  │  ├─ lib/
│  │  │  ├─ agents.js                  ← Jace/Karn/Tibalt/Arbiter prompts
│  │  │  ├─ deckMemory.js              ← Deck parsing + storage
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
│  └─ mtg-engine/                      ← Rule layer markdown (96 files)
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

These cost real time to debug. Read them before touching the build
pipeline or the Rust shell.

1. **Windows UNC prefix `\\?\`** in `resource_dir()` output must be
   stripped before passing paths to Node. Node v22+ tries to lstat
   just `"C:"` and crashes. See `strip_unc()` in `lib.rs`.

2. **Tauri rejects `frontendDist` containing `node_modules`**.
   `.next/standalone` has them. Use a tiny placeholder dir
   (`frontend-placeholder/`) and redirect from there to localhost:3000.

3. **NSIS template caches `installer.nsi`** between builds. Wipe
   `src-tauri/target/release/{bundle,nsis}/` before re-bundling
   after config changes.

4. **`outputFileTracingExcludes` breaks `@vercel/nft`** — adding it
   to `next.config.mjs` causes the tracer to skip Next.js's own
   `dist/lib/metadata/` submodule, breaking the standalone server at
   startup. Don't use it; `strip-standalone-bloat.cjs` handles
   cleanup post-build instead.

5. **Next.js standalone tracing pulls ~3.5 GB of `data/`** into the
   bundle. `strip-standalone-bloat.cjs` is the post-build defense.

6. **Tauri's `cargo build` doesn't clean
   `target/release/resources/`** between builds —
   `prepare-tauri-resources.cjs` wipes it explicitly so stale files
   from old configs don't end up in the new `.exe`.

7. **`/api/decks` auto-seeds the Sliver Hivelord deck** on first
   GET. First-launch detection must use an explicit marker file
   (`.first-launch-marker.json`), NOT `decks.local.json` presence.

8. **`knowledge/mtg-judge/data/forge/.git/`** causes "Access is denied"
   if you reference `knowledge/mtg-judge` directly in `bundle.resources`.
   Stage to local `src-tauri/resources/` dir instead.

9. **`process.cwd()` in the packaged `.exe`** is the bundled
   standalone server dir, NOT the dev tree. Always use `paths.js`
   helpers — never raw `path.join(process.cwd(), ...)`.

10. **`/api/engine` had a latent ReferenceError** from commit
    5f8137e until 7b09ff0 because no test covered the route.
    **Always add at least an import smoke test when introducing a
    new route.** See `app/src/app/api/engine/route.test.js`.

11. **`tauri build --config '<json>'` breaks under `shell:true`**
    on Windows because cmd.exe strips quotes. Write the override
    config to a tempfile and pass the path instead. See
    `scripts/build-signed-release.cjs`.

12. **PowerShell pipes add UTF-8 BOMs** when piping `Get-Content`
    to `gh secret set`. Use `cmd /c "gh secret set X < file"`
    instead — cmd.exe redirection passes raw bytes.

13. **Private repo blocks unauthenticated GitHub release downloads**.
    For auto-update to work without per-user token UX, the repo must
    be public (it currently is).

14. **YAML em-dashes in workflow comments tripped GitHub's parser**
    — the workflow ran with empty jobs in 0 seconds, no error
    surfaced. Keep workflow YAML ASCII-clean.

15. **`createUpdaterArtifacts: true` in tauri.conf.json fails the
    build without signing keys**. Default it to false; enable via
    `--config` override only in the signed release wrapper.

16. **CI runners don't have the gitignored data files**, so without
    sync steps the installer is ~34 MB (no Scryfall/Spellbook/salt
    data). The release workflow now runs sync scripts before
    building.

17. **Spellbook API rate-limits aggressively** — HTTP 429 after ~108
    pages of pulls in a single run. Originally lived in the release
    workflow as `continue-on-error: true` so flaky Spellbook
    wouldn't kill releases; now lives in its own scheduled workflow
    (`.github/workflows/sync-spellbook.yml`) so the failure mode is
    isolated entirely from the release path. The sync script is
    resumable: a partial run writes progress to disk, the cache save
    persists it, and the next scheduled (or manual) run picks up
    where the last one stopped. Users can also sync in-app on demand
    via the Updates panel.

18. **The spawned Node server (next-server) orphans on auto-update**
    unless pinned to a Windows Job Object. Windows does NOT kill a
    child process when its parent dies, and the NSIS auto-updater
    force-replaces `mtg-tool.exe` without ever firing our
    `CloseRequested`/`Destroyed` handlers — so the `child.kill()`
    cleanup path is skipped and the old `node.exe` keeps listening on
    port 3000 ("next-server staying open"). Fix in `lib.rs`:
    `pin_child_to_job()` assigns the child to a Job Object with
    `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` — the OS tears Node down the
    instant the shell dies for ANY reason (update, crash, Task
    Manager). The job handle is **leaked on purpose**; closing it
    early would kill Node. `reap_orphan_servers()` also sweeps any
    pre-fix orphan on launch (Toolhelp snapshot → only kills a
    `node.exe` whose full path == our bundled binary, so it can never
    hit an unrelated process) so the one-time upgrade to the fixed
    build is seamless. Requires the `windows-sys` Windows-only dep
    with `Win32_Security` enabled — `CreateJobObjectW`'s signature
    references `SECURITY_ATTRIBUTES`, so it won't resolve without it.

---

## 6. AGENT SPECS

### Jace — front-facing chat

**Persona**: Calm, precise, plain-English rules expert. Friendly but
never sycophantic. Cites rules inline like `(rule 117.3a)`. Wraps
card names in `[[double brackets]]`.

**Capabilities**:
- Answer general MTG questions
- Explain rules in conversational language
- For rules-sensitive questions: silently call Arbiter, receive
  formal ruling, translate to natural language
- Access locked deck context if a deck is loaded for the conversation
- Optionally show "View Arbiter Trace" button on rules answers
  (collapsed by default)

**Forbidden**:
- Inventing rule numbers
- Card behavior from memory
- Sycophancy ("Great question!")
- Closing flourishes ("Hope that helps!")

### Karn — front-facing deck builder/analyst

**Persona**: Methodical, structured, organized by role. Talks about
decks like an architect talks about buildings. Wraps card names in
`[[double brackets]]`.

**Capabilities**:
- Analyze loaded deck for curve, color balance, role coverage (ramp /
  draw / removal / threats / win conditions / interaction)
- Suggest cuts with reasoning
- Suggest additions
- Build decks from scratch around a commander
- Identify synergies and anti-synergies via Commander Spellbook combo
  data
- Save structured plans to deck memory

**Output structure** (when analyzing decks):
```
RAMP / FIXING
[cards with brief reasoning]

CARD ADVANTAGE
[cards]

INTERACTION
[cards]

WIN CONDITIONS
[cards]

SYNERGY PIECES
[cards]

SUGGESTED CUTS
[cards from the deck with reasons]

SUGGESTED ADDS
[cards not in the deck, with reasons and rough budget tier]
```

### Tibalt — front-facing deck roaster

**Persona**: Sharp-tongued, deck-literate, funny, mean in a way that
diagnoses real problems.

**Capabilities**:
- Roast the locked deck with surgical precision
- Hunt for "identity crisis" decks (commander wants X, 99 does Y)
- Mock manabases, redundant packages, missing protection, random
  inclusions
- Always end with a "verdict" paragraph that lands the thesis
- Save roasts to deck memory with timestamps so deck drift can be
  compared over time

**Tone calibration**:
- Mean, but every joke has a diagnosis attached
- Never insulting toward the user — only toward the deck
- Funny grounded in deck-building reality, not generic snark

**Forbidden**:
- Generic insults with no rules content
- Repeating the same critique structure each time
- Going easy when a deck genuinely deserves it

### Arbiter — backend rules engine

**Persona**: Procedural, terse, structured. Hidden from the user
except via "View Arbiter Trace" button on Jace's rules-sensitive
answers.

**Capabilities**:
- Accept a structured query (rules question + optional board state)
- Retrieve relevant rules from `knowledge/mtg-judge` codex with verified
  citations
- Retrieve relevant cards with Oracle text from `oracle_cards.json`
- Retrieve relevant rulings from `rulings.json`
- Run state assessment using the 5-question protocol
- Walk the 21-step execution loop when needed
- Return structured output

**Fixed output format**:
```
STATE
[One line per relevant question from state assessor]

RESOLUTION
[Numbered steps through the execution loop, max ~10]

RULE TRACE
[Bullet list of every rule cited, with file reference]

CITATIONS
[Comma-separated list of codex files consulted]
```

**Critical invariant**: Arbiter is **Ollama-only**. It must never
call Anthropic regardless of UI tier setting. See
`/api/arbiter/route.js` — the `provider: "ollama"` field is
hardcoded.

### Garfield — simulator and tutor

**Current state**: Goldfish v2 shipped. Draws opening hand,
classifies cards by archetype, plays turns 1-6 with
archetype-specific priorities, saves game records to
`data/games/`, summarizes insights via `gameInsights.js`.

**Phase 6 Learn-to-Play Mode** (in progress, PRs 1-6 shipped):
- Three difficulty levels: Beginner, Intermediate, Expert
- Beginner: explains every step, every priority window, every
  trigger, every SBA
- Intermediate: explains key decisions and tricky interactions
- Expert: plays at speed, explains mistakes
- Uses Arbiter for rules accuracy
- Uses Jace's voice for explanations

See `docs/phase6-learn-to-play.md` for the full spec.

---

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

Updated whenever phases complete. Last update: 2026-05-28.

> **Current status + actionable next steps live in `docs/HANDOFF.md`** — start a
> new chat by reading it. This §9 is the higher-level snapshot; the handoff has
> the copy-paste "what's next" prompts for each remaining piece.

### Shipped

- ✅ Phases 1-5 (Foundation, Knowledge Layer, Ollama, Agent
  rewiring, Garfield goldfish v2)
- ✅ Phase 6 PRs 1-6 (gameState, gameEngine, legalChoices,
  opponentAI, decisionGate, LearnView)
- ✅ In-app feedback capture
- ✅ Backup script (`npm run backup`)
- ✅ Tauri `.exe` shell (production builds work end-to-end)
- ✅ First-launch import wizard (marker-based detection)
- ✅ Ollama install + model pull wizard (winget + SSE)
- ✅ In-app Sync Data UI (Scryfall, Spellbook, EDHREC, indexes)
- ✅ Bundled portable Node 22 LTS (no external Node dependency)
- ✅ System tray + minimize-to-tray
- ✅ Single-instance enforcement
- ✅ Autostart-with-Windows toggle (opt-in)
- ✅ Background app-update check + banner
- ✅ Tauri auto-updater (signed manifest, CI release pipeline)
- ✅ GitHub remote (Robak503/mtg-tool, public)
- ✅ Repo signing secrets configured
- ✅ Reference-dir architecture (read bundled data without copying
  to AppData first)
- ✅ Phase 6 PR 7 (Intermediate trap warnings + auto-attack)
- ✅ Spellbook resilience — moved out of release pipeline into a
  weekly scheduled workflow (`.github/workflows/sync-spellbook.yml`)
- ✅ Deck-size → format auto-detection (100→Commander, 60±SB→Standard;
  `app/src/lib/learn/formatDetection.js`)
- ✅ Phase 6 PR 8 (engine mode refactor — `state.mode`/`turnOrder`,
  `opponentsOf`/`nextInTurnOrder`; Standard + Commander foundation)
- ✅ Phase 6 PR 9 (Commander 4P FFA session start — 3-deck pod = 4
  players total, 4-seat turn rotation, per-opponent AI, player
  elimination + multiplayer win/loss)

### Open

- ⏳ Phase 6 PR 10 (multi-defender combat — `declare-attacker`
  `defenderId`, AI defender heuristic, multi-opponent trap detection;
  combat-damage application)
- ⏳ Phase 6 PR 11 (LearnView 4P layout — 3 opponent strips, mode +
  format picker wired to `detectDeckFormat`)
- ⏳ Phase 6 PR 12 (Expert mode + post-game analysis, mode-aware)
- ⏳ Phase 6 learn-session persistence (`data/learn-sessions/`, PR 13)
- ⏳ Code signing (Authenticode) — paid cert, optional (eliminates
  SmartScreen warning on first install)
- ⏳ Microsoft Store distribution — deferred until needed

### Declined

- ✗ File associations (.dec/.txt) — owner imports from Archidekt /
  Moxfield via copy-paste; file-based deck workflows aren't part of
  the loop. Decided 2026-05-28.

### Test coverage

~388 vitest cases across 27 files (learn engine alone is 279). Run with
`npm test` in `app/`.

---

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
