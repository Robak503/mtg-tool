# MTG Tool — Total Handoff to a New Claude Account

> **Written 2026-06-17 by the outgoing Claude (Opus 4.8) for the incoming Claude on a fresh
> account.** This is a deliberate brain-dump: everything about the tool, the architecture, how to
> work with the owner, the release machinery, every land-mine, and the methodology that has kept
> this project shipping cleanly. Read it once end-to-end before touching anything.
>
> **Why this doc exists:** Claude's auto-memory (the `~/.claude/projects/.../memory/` files) is
> **local to an account** — it does NOT transfer when the owner switches accounts. So everything I
> "remembered" about this project would otherwise be lost. The high-value, non-obvious knowledge
> from those memories is transcribed below. The **code, `CLAUDE.md`, and `CHANGELOG.md` travel with
> the repo** and are authoritative; this doc is the connective tissue and the institutional memory.

---

## 0. First five minutes (orientation)

Read these, in this order, before you do anything:

1. **`CLAUDE.md`** (repo root) — the operating manual. It OVERRIDES your defaults. Prime directives,
   architecture, agent specs, the full "known gotchas" list, forbidden patterns. Non-negotiable.
2. **`CHANGELOG.md`** — authoritative record of what has shipped. Currently topped by **v0.36.0**.
3. **This doc** — the bridge + institutional memory.
4. **`docs/coverage-handoff.md`** — the per-slice playbook for the active workstream (note: as of
   this writing its "next slice" section is stale — it still says team pump and "hold the exe"; both
   are superseded. The *playbook* and *guardrails* sections are still gospel).
5. Skim `docs/` — there are several handoff/design docs (`HANDOFF.md`, `handoff-learn-engine.md`,
   `phase7-engine-rebuild.md`, `design/engine-rebuild/`). They're point-in-time; trust the code.

**The single most important rule of this project:** *a false-negative is SAFE, a false-positive is
FORBIDDEN.* (Explained in §6. Internalize it — it governs every engine decision.)

---

## 1. Who Colton is and how to work with him

This is the most valuable thing I can pass on, because it's invisible in the code.

- **Colton (GitHub: Robak503) is a vibe-coder, not a developer.** He directs; you build. He will not
  write code and does not want code walkthroughs. He wants **results** and a short, honest summary —
  not a narration of what you did.
- He plays **Commander/EDH**. MTG Tool is a personal tool for his own games and brewing. He is the
  only user. Design for *him*, not a hypothetical audience.
- He runs **Windows 11**, high-end (Core Ultra 9 275HX, 32GB DDR5, **RTX 5080 16GB**) — great for
  local Ollama models. A future Mac mini (48GB) is mentioned in CLAUDE.md.
- He switched to Claude Code **from OpenAI Codex** because Codex burned API credits and produced
  fragmented architecture. He values **coherent, single-voice architecture** and trusts you to keep
  it that way. Outperforming the previous tools is an explicit expectation.
- **He has granted full architectural authority and standing autonomy.** You may delete/rename/
  refactor freely, add vetted dependencies, and — critically — **commit, push, open PRs, merge, and
  cut releases without asking per-step.** His words across sessions: *"till you stop me or tokens run
  out."* Don't ask permission for routine work. Don't check in for verification. **Build the thing.**
- **When to actually check in:** a genuine judgment call with no obvious right answer, something
  failing that the tooling can't resolve, or an action that exposes public surface he hasn't
  authorized (repo visibility, secrets). Otherwise, proceed.

### How he likes the work done (hard-won feedback, treat as standing rules)

- **One chat, sequential, for big work.** For large refactors/coverage pushes he wants a SINGLE chat
  doing the whole job in order — not parallel agents — for a consistent result and single authorial
  voice. He is wary of divergence (the codebase already carried two competing styling vocabularies
  from past parallel sessions).
- **Don't fragment with task chips.** If a follow-up is the natural next step of what you're doing
  (same files, same workstream), **just do it inline in the same pass.** He once clicked a chip I
  spawned and it launched a parallel session on the same engine files — exactly the overlap to
  avoid. Reserve `spawn_task` chips for genuinely out-of-scope tangents (a bug in a sibling repo, an
  unrelated cleanup), never for the next step of the current work.
- **Player CHOICES need real in-game UI, not engine auto-pick.** This is a *teaching* tool — the
  player practicing the decision (which card to tutor, which mode, scry order) IS the point. An
  engine that silently picks for the player is *worse* than routing to the Arbiter (which at least
  lets them choose). Auto-pick is only acceptable for the AI/opponents and Expert autopilot. The
  reusable resolution-time-choice pattern exists (`pendingChoice.js`, suspend/resume in
  `runProgram`, the `/api/learn/choose` route, the LearnView picker panels).
- **Acceptance is LIVE, not a green unit suite.** His literal standard: *"Acceptance test is
  live-casting in `npm run dev` and clicking a card — not a green unit suite."* Every shipped slice
  must be verified by driving the **real** product (real card enrichment → real engine), because the
  unit tests build shaped fixtures and skip the enrichment path — which is exactly where the worst
  bugs have hidden (see §6, the 0/0-creatures and blank-card disasters).
- He is fine with you cutting releases at user-visible milestones. He'll tell you when he wants one
  ("lets push an exe release as this is a nice point to lock down"). He'll also tell you when to
  *hold* releases (during a long coverage push he said "hold the exe until the coverage project is
  done" — then later lifted it). Honor the current directive; when unsure, ask once.

---

## 2. What the tool actually is

**MTG Tool** is a **local-first desktop app** — a signed Windows `.exe` with auto-update. The user
double-clicks a shortcut and a window opens. Under the hood:

```
mtg-tool.exe  (Rust / Tauri 2 shell)
  └─ spawns → bundled Node 22 running a bundled Next.js 15 standalone server on 127.0.0.1:3000
  └─ Tauri webview loads a placeholder page → redirects to localhost:3000 once the server binds
  └─ system tray (Show/Hide/Quit), single-instance, autostart toggle, 24h auto-update check
```

The user never sees Node/Next/Rust. They see a window. **It is a desktop app, not a web app** —
never design as if it's hosted.

**The prime architectural mandate is LOCAL-FIRST.** The owner's vision: *"use this on a desert
island with no internet, eventually."* External API calls are a **failure mode**, not a feature.
Every external dependency must have a local cache/source as the primary path. The only acceptable
steady-state external calls:

- **Scryfall / Commander Spellbook / EDHREC** — only on an explicit user-triggered sync (Updates
  panel), or when the bundled snapshot is missing a specific card.
- **Anthropic API** — only as a last-resort fallback when local Ollama can't answer, AND only when
  the user explicitly selected the "API" tier. (The Arbiter rules engine is **Ollama-only, always**
  — hardcoded; it must never call Anthropic regardless of UI tier.)
- **GitHub Releases** — the auto-updater polls `latest.json` once/day.

Evaluate every architectural decision against: *does this make the tool more or less dependent on
external services?* More → reconsider. Less → probably right.

### The five agents

| Agent | Role | Visible? |
|---|---|---|
| **Jace** | Calm plain-English rules chat; silently calls Arbiter for rules-sensitive Qs | yes |
| **Karn** | Methodical deck builder/analyst (curve, roles, synergy via Spellbook) | yes |
| **Tibalt** | Sharp-tongued deck roaster (mean to the deck, never the user) | yes |
| **Arbiter** | Backend rules engine; structured rulings with CR citations; **Ollama-only** | hidden |
| **Garfield** | Tutor + simulator → **"The Academy"** (the learn-to-play engine; the active workstream) | from deck view |

Prompts live in `app/src/lib/agents.js`. Agents wrap card names in `[[double brackets]]` and cite
rules inline like `(rule 117.3a)`. **Never fabricate rule numbers or card text** — CR citations must
trace to `knowledge/mtg-judge/data/cr/cr_current.json`; card text comes from bundled Scryfall data
(`scryfall-bulk/oracle_cards.json` or the slim `oracle-index.json`). No memory-based card behavior.

---

## 3. Repo + runtime architecture (the parts you'll touch)

```
MTG-TOOL/
├─ CLAUDE.md, CHANGELOG.md, README.md, RELEASE.md, ROADMAP.md, TODOS.md
├─ .github/workflows/  release.yml (tag-triggered build/sign/publish), ci.yml (lint+test),
│                      sync-spellbook.yml (weekly, isolated from releases)
├─ app/                     ← the Next.js + Tauri app (you live here)
│  ├─ src/app/api/          ← backend routes (~16). ALWAYS resolve files via paths.js.
│  │   ├─ arbiter/          ← rules engine (provider:"ollama" hardcoded)
│  │   ├─ learn/            ← The Academy: start / step / choose / continue / saves / resume
│  │   ├─ rules-retrieval/  ← (formerly /api/engine) rule-aware search
│  │   ├─ art-crop/         ← local-first card-art proxy (timeout + size cap + content-type check)
│  │   └─ decks/ first-launch/ install-ollama/ sync-data/ ...
│  ├─ src/components/        ← MTGAssistant.jsx (shell), LearnView (The Academy UI), mtg/*, UpdatesModal
│  ├─ src/lib/
│  │   ├─ agents.js          ← the 5 agent prompts
│  │   ├─ server/
│  │   │   ├─ paths.js       ← THE path-resolution module (read §3 below)
│  │   │   ├─ cardIndex.js   ← lookupCard / publicCard (Scryfall lookups + enrichment)
│  │   │   ├─ learnDeckEnrich.js ← fills deck cards from the index before a learn session
│  │   │   └─ rulesRetrieval.js, symbolicEngine.cjs (the Arbiter's CR engine)
│  │   └─ learn/             ← *** THE ACADEMY ENGINE — the active workstream (see §5) ***
│  ├─ src-tauri/            ← Rust shell: src/lib.rs, tauri.conf.json, frontend-placeholder/
│  ├─ scripts/              ← build pipeline + data sync (.cjs)
│  └─ package.json, next.config.mjs, eslint.config.mjs
├─ knowledge/
│  ├─ mtg-judge/data/cr/cr_current.json   ← Comprehensive Rules (every CR citation must trace here)
│  └─ mtg-engine/                          ← 96 rule-layer markdown files
└─ docs/                    ← strategic + handoff + design docs (+ docs/archive/)
```

### `paths.js` — the one place that knows where files live (§2.3 of CLAUDE.md)

In the packaged `.exe`, `process.cwd()` is the bundled standalone server dir, **NOT** the dev tree.
**Never use raw `process.cwd()` / `path.join(__dirname, …)` in API routes** — always call the
`paths.js` helpers (`dataPath`, `mtgJudgePath`, `mtgEnginePath`, `profilePath`). They resolve:
writable user dir first (`%APPDATA%\com.colton.mtg-tool\data\`), then the bundled read-only resource
dir (via `MTG_REFERENCE_DIR`/`MTG_JUDGE_DIR`/`MTG_ENGINE_DIR` env vars the Rust shell sets), so
bundled data is read in place until an in-app sync writes a fresher copy.

### Multi-user profiles

Decks, Vault, chats, games, agent notes are scoped per profile under `data/profiles/<id>/` (via
`profilePath()`); shared reference data stays at the `data/` root (via `dataPath()`). Fully local, no
auth. A `ProfileGate` picker + header menu. Persisted-state shape changes need a schema bump +
migration + fixture.

---

## 4. Current state (as of 2026-06-17)

- **v0.36.0 is LIVE** — released today. The GitHub Release published successfully with all signed
  assets (`latest.json`, `MTG-Tool-Setup.exe` + `.exe.sig`, the versioned installer + `.sig`).
  Running installs will auto-update within 24h. `package.json` + `tauri.conf.json` are at `0.36.0`.
- **Master is green and clean** (`b0cc0e3` was the targeted-removal merge; `4453416` is the v0.36.0
  release commit; the tag `v0.36.0` points at it). Test suite **2017 vitest cases**, lint clean.
- **The whole product works end-to-end** as a signed `.exe`: first-launch import wizard, Ollama
  install/model-pull wizard, in-app data sync, tray, single-instance, autostart, auto-update,
  The Vault (collection manager), deck import from Moxfield/Archidekt URLs, and **The Academy**
  (playable learn engine).
- **Active workstream: the Academy coverage push** (Phase 7) — driving native rules coverage toward
  ~85–100%, slice by slice. See §5.
- There is **one untracked file in the working tree, `ACADEMY-CONVO.md`** — it's the owner's, not
  mine. Never stage it. (Always `git add` explicit paths, never `git add -A`/`git add .` — scratch
  files and that file have slipped into commits before.)

---

## 5. The Academy engine (the active workstream) — how it works

`app/src/lib/learn/` is a from-scratch, **serialization-safe, deterministic** MTG rules engine that
plays real games (1v1 and 4-player Commander) at three difficulties (Beginner/Intermediate/Expert).
It powers teaching, goldfishing, and play-vs-AI. The "Phase 7" rebuild built it in layers:

- **Foundation (done, v0.23–0.25):** a serializable `{resolver, params}` stack (no closures on the
  stack — everything must serialize), state-threaded deterministic IDs (`state.idSeq`/`mintId`, no
  `Math.random`/`Date.now` in state mutation — thread `state.rngSeed`), a real triggered-abilities
  system (`triggers.js`), and a **CR 613 layers engine** (`layers.js` — `deriveCharacteristics`,
  continuous effects, P/T in layer 7c, granted keywords in layer 6).
- **Depth (the coverage push, ongoing):** a general oracle→effect interpreter. Card text is parsed
  into an **EffectProgram** of **atoms** (`effects/parser.js` → `{op, …}` atoms; resolved by
  `ATOM_RESOLVERS` in `effects/effectAtoms.js`). The interpreter is **all-or-nothing**: a program is
  `programConfidence` HIGH only if *every* clause/atom is modeled; any unmodeled clause → LOW → the
  whole card routes to the **Arbiter** (the permanent fail-safe). This is the heart of the
  no-silent-gaps guarantee.

### Key engine modules

- `coverage.js` — `classifyCard(card)` → a tier (`native-spell`/`native-trigger`/`native-aura`/
  `body-only`/`arbiter-spell`/…). `isNativeTier`. This is the metric. `npm run coverage` runs the
  dashboard. **The classifier MIRRORS the runtime** — if the runtime gates an effect out, the
  classifier must too, or the metric over-claims.
- `effects/parser.js` — `parseEffectProgram` / `parseEffectClause` / `programConfidence` /
  `parseExtendedAtom` (the anchored atom matchers) / `splitClauses` / the `programContains*` gate
  helpers (`…Counter`, `…ChosenPermanentRemoval`, `…MassRemoval`, `…TeamPump`).
- `effects/effectAtoms.js` — `ATOM_RESOLVERS` (the op → state-mutation table) + `atomTargets`.
- `triggers.js` — `detectTriggers` (regex-anchored When/Whenever/At), `classifyCondition`,
  `scopeMatches`, the event checks. **A trigger's whole same-line effect is one ability** (this was a
  recent fix — see §6).
- `gameEngine.js` — `buildTriggerStack`/`flushTriggers` (routes trigger effects; **gates** counter +
  chosen-target permanent-removal out of the first-legal flush, routing them to a no-op instead).
- `spellEffects.js` — `enumerateTargets` (legal targets by `targetType`, restriction-aware),
  `applyDestroyEffect`/`applyDamageEffect`/etc., `chooseAITarget` (enemy-only; the AI HOLDS what it
  can't safely target).
- `gameState.js` — pure state helpers (zones, life, counters, `millCards`, `destroyLethalCreatures`,
  the SBA loop).
- `runProgram.js` — runs an EffectProgram; **suspends on `state.pendingChoice`** (the resolution-time
  player-choice seam) and resumes via `resumeAfterChoice`.
- `learnSession.js` — `advanceUntilDecision` (the driver) + `applyPendingChoice` (dispatches a
  player's tutor/scry/clone choice).
- `combatResolution.js`, `legalChoices.js`, `actionDispatcher.js`, `opponentAI.js`,
  `staticAbilityParser.js`, `cloneCopy.js`, `keywords.js`.

### What's modeled natively (as of v0.36.0)

Lands+mana, vanilla/keyword bodies, damage (single + each-opponent + each-creature/wipes),
single-target destroy/exile of **creatures and of artifact/enchantment/land/permanent** (cast path),
draw, life gain/loss, target-creature pump + keyword grant (combat tricks), **team pump**, **scry/
surveil** (interactive), **mill**, **counter target spell**, **tutors** (interactive picker),
**graveyard recursion**, **clones** (Clone/Mirror Image), create-token (single-color creatures),
static anthems/lords, **equipment + auras** (attach), board wipes, **self-reference pump/counter**
(firebreathing), **controller-scoped enter/dies triggers**, and the **", then"** sequence split.

### The coverage metric reality (don't be fooled)

The headline "% native across the 16 sample decks" sits around **47%** and is **lumpy + sample-
limited** — optimized Commander decks are ~44% lands+mana, and vanilla tricks/auras/wipes barely
appear in them. **The real signal is the corpus count** — how many of the ~33,639 bundled cards a
slice newly makes native. Use the per-mechanism gap buckets, not the headline %, to pick work.

---

## 6. The non-negotiable creed + the methodology that keeps it true

### The creed: false-negative SAFE, false-positive FORBIDDEN

- **A false-NEGATIVE — routing a card to the Arbiter / a no-op — is SAFE.** The Arbiter is a
  permanent, intended fail-safe. Under-covering is fine.
- **A false-POSITIVE is FORBIDDEN.** That means: claiming a card plays natively but then silently
  dropping text, mis-applying it, **partially** applying it (firing some clauses but not others), or
  hitting the wrong target/set. Partial application of a card is the cardinal sin. **Model the WHOLE
  card natively, or route the whole thing to the Arbiter.** Never half-do it.
- Corollaries: never fabricate rule numbers or card text; never insert mock/placeholder logic; never
  swallow errors in silent try/catch; all-or-nothing parsing (any unmodeled clause → whole program
  LOW → Arbiter); only grant keywords that are actually enforced + layer-aware.

### The per-slice discipline (follow it every single time — this is why the engine is trustworthy)

1. **Branch off master** (`git checkout -b feat/<slice>`).
2. **Build** the parser matcher + the resolver. Anchored (`^…$`) matchers are the allowlist
   discipline — the clause must reduce EXACTLY to the modeled shape, so any extra/unmodeled text
   fails the anchor → LOW. **ALLOWLIST beats denylist** for the confidence gate (a denylist of "bad"
   markers always has holes; adversarial review proved this repeatedly).
3. **Corpus sweep — the false-positive gate.** Write a temp script that runs the **REAL**
   `parseEffectProgram`/`classifyCard` over the whole `oracle_cards.json` **via `publicCard`
   enrichment** (NOT hand-joined card_faces — split/MDFC must stay un-parseable like production).
   Count new natives; hunt false-positives. **Require 0 real false-positives.** Name it `_sweep_*` or
   `_verify_*` (both are gitignored now) and **delete it before commit** (a stray `console.*` script
   in `app/` breaks the CI lint job — this has bitten the project repeatedly).
4. **Update parser pins** in `effects/parser.test.js` (`MUST_STAY_HIGH` + `MUST_DROP_TO_LOW` — the CI
   merge gate). Pin BOTH directions so a later tightening can't silently over-correct.
5. **Multi-lens adversarial review via the Workflow tool.** This is not optional — it has caught real
   forbidden partials that the corpus sweep and unit tests both missed. Pattern: a `pipeline` of ~4
   lenses (over-match / CR-correctness+SBA / regression / AI-and-trigger-paths) → per-finding
   `parallel` verification (each verifier defaults to `isReal:false` and must reproduce against the
   real code). **Crucial:** the corpus sweep only exercises the CAST path; the shared parser ALSO
   feeds the auto-choosing TRIGGER-flush and activated paths — adversarially review THOSE (the
   first-legal-target hazard). **If the review dies on a session limit, do NOT merge — re-run it.**
   (Gotcha: the Workflow validator rejects literal `Math.random`/`Date.now`/`new Date()` and nested
   backticks inside prompt strings — obfuscate or avoid them.)
6. **Live real-enrichment QA** (the owner mandate). Enrich REAL cards via `lookupCard`→`publicCard`
   and drive the REAL engine (`dispatchAction`→`resolveTopOfStack`, or the HTTP API), OR `npm run
   dev` + the preview tools. This is the path units skip. Delete temp scripts before commit.
7. **`npm test` + `npm run lint`** from `app/` — BOTH clean. `npm test` does NOT lint; CI lints with
   `eslint . --max-warnings 0` and fails on a single warning. Branch protection does NOT block a red
   merge, and **`gh pr checks --watch` has exited 0 on a FAILING check** — so explicitly confirm `gh
   pr checks <n>` shows the word `pass`, don't trust the exit code.
8. **PR** (`gh pr create`) → watch CI → **squash-merge + delete branch** → sync master.
9. **Update `CHANGELOG.md` `[Unreleased]`** (user-facing prose) and your own memory/notes.

### Why the live-QA step is load-bearing (two disasters it caught)

- **The blank-card disaster (v0.29.0):** the Academy was feeding the engine BLANK cards —
  `deckToCardArray` read fields the deck store didn't have, so every card had no cost/type/oracle.
  Mana never gated casting, nothing was a creature, NO spell effect ever fired. The *entire* effect
  engine was DARK in the real product — and invisible to ~1558 unit tests (they build shaped cards
  directly). Fixed by enriching in `/api/learn/start`. **Lesson: the deck→session-card path is
  untested by units; live-dogfood every slice or whole subsystems can be silently dead.**
- **The 0/0-creatures disaster (v0.35.0 era):** the slim `oracle-index.json` (the ACTIVE lookup
  source) stripped power/toughness/colors, so every creature enriched to 0/0 — combat dealt 0,
  pumps/auras built off 0/0. Units never saw it (shaped fixtures). Fixed at the slim-index root.
  **Lesson: the slim-index enrichment path is THE silent-gap risk. Verify with real
  `lookupCard`→`publicCard`, never only fixtures.**

### A recent example finding (so you trust the process)

In the mill slice (#191), the adversarial review surfaced a **pre-existing forbidden partial** that
the corpus sweep and units both missed: a trigger whose effect spanned two sentences fired only the
*first* and silently dropped the rest (Shroudstomper dropped its "gain 2 life and draw"; Recon Craft
Theta made a 0/0 token but dropped the "+1/+1 counter" rider → the 0/0 died to an SBA = a visibly
wrong board). The fix was structural: **one oracle line = one ability**, so `detectTriggers` now
captures the whole same-line effect; if any part is unmodeled the *whole* trigger routes to the
Arbiter. Verified 0 partials across all 33,639 cards. **Lesson: take adversarial findings seriously;
the bug is sometimes in the SHAPE, not the atom.**

---

## 7. Releases + signing (how to ship the `.exe`)

Releases are **tag-driven**. The full flow (matches `RELEASE.md` and the last two releases):

1. Branch `release/vX.Y.Z`.
2. Bump version in **both** `app/package.json` and `app/src-tauri/tauri.conf.json`.
3. Roll `CHANGELOG.md` `[Unreleased]` into `## [X.Y.Z] - <date>` (leave a fresh empty `[Unreleased]`).
4. Commit `release: vX.Y.Z — <summary>`, PR, CI green, squash-merge, sync master.
5. **Tag on master and push:** `git tag vX.Y.Z -a -m "Release vX.Y.Z"` then `git push origin vX.Y.Z`.
6. CI (`.github/workflows/release.yml`, triggers on `v*`) does the rest: data sync (cached), build
   slim oracle index, build rules index, EDHREC salt, **signed** `tauri:build:release`, build
   `latest.json`, publish the GitHub Release. ~18–30 min. **Verify it actually published** with
   signed assets (`gh release view`) before calling it done — don't claim "released" on a tag push
   alone.

**Signing keys** (local-only, never commit): `~/.tauri/mtg-tool.key` + `.password`; the public key is
burned into `tauri.conf.json` (`plugins.updater.pubkey`); CI uses repo secrets
`TAURI_SIGNING_PRIVATE_KEY` + `…_PASSWORD`. **Losing the private key means you can't ship updates —
it must be backed up.** Upload secrets with `cmd /c "gh secret set X < file"` (PowerShell pipes add
a UTF-8 BOM that corrupts the key).

The repo is **public** (source-available, see §9) specifically so unauthenticated installs can
download release assets for auto-update. Don't change visibility without explicit authorization.

---

## 8. The land-mine field (every gotcha that has cost real time)

These are in `CLAUDE.md §5` too, but here's the consolidated list with the engine ones added:

**Build / Tauri / Windows:**
1. Strip the Windows UNC prefix `\\?\` from `resource_dir()` before passing to Node (Node 22 crashes
   lstat-ing `"C:"`). See `strip_unc()` in `lib.rs`.
2. Tauri rejects a `frontendDist` containing `node_modules` (`.next/standalone` has them) — use the
   tiny `frontend-placeholder/` that redirects to localhost:3000.
3. NSIS caches `installer.nsi` — wipe `target/release/{bundle,nsis}/` after config changes.
4. `outputFileTracingExcludes` breaks `@vercel/nft` (skips Next's own metadata submodule). Don't use
   it; `strip-standalone-bloat.cjs` cleans the ~3.5GB of traced `data/` post-build instead.
5. `prepare-tauri-resources.cjs` must wipe `target/release/resources/` (cargo doesn't clean it).
6. `knowledge/mtg-judge/data/forge/.git/` causes "Access is denied" if referenced directly in
   `bundle.resources` — stage to local `src-tauri/resources/` first.
7. The spawned Node server orphans on auto-update unless pinned to a Windows **Job Object**
   (`pin_child_to_job()` in `lib.rs`, `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`; handle leaked on
   purpose). `reap_orphan_servers()` sweeps pre-fix orphans. Needs `windows-sys` with
   `Win32_Security`.
8. `createUpdaterArtifacts: true` fails the build without signing keys — default it false, enable via
   the signed-release wrapper only.
9. YAML em-dashes in workflow comments broke GitHub's parser (jobs ran empty, 0s, no error). Keep
   workflow YAML ASCII-clean.

**Data / routes:**
10. `/api/decks` auto-seeds the Sliver Hivelord deck on first GET — first-launch detection must use
    the explicit `.first-launch-marker.json`, not deck-file presence.
11. Always add at least an import smoke test for a new route (`/api/rules-retrieval` had a latent
    `ReferenceError` for commits because nothing covered it).
12. Spellbook rate-limits hard (HTTP 429 after ~108 pages) — it lives in its own weekly workflow
    (`sync-spellbook.yml`), isolated from releases; the sync script is resumable.

**Engine / workflow discipline (the ones I learned the hard way this era):**
13. **`process.cwd()` in the `.exe`** is the standalone server dir — always use `paths.js`.
14. **Stage explicit paths**, never `git add -A`/`.` — scratch `_sweep_*.mjs`/`_verify_*.mjs` and the
    owner's untracked `ACADEMY-CONVO.md` have been swept into commits/branches more than once. (They
    are gitignored now, but the habit matters.)
15. **`cd app` before `node`/`npm`** — the Bash tool's cwd resets to repo root after `git` commands.
16. **The classifier must mirror the runtime exactly.** When you gate an effect out of native
    routing (e.g. counter and chosen-permanent-removal are gated out of the trigger flush so a
    first-legal pick can't hit the controller's own spell/permanent), add the SAME gate to
    `coverage.triggerRoutesNatively` or the metric over-claims.
17. **Bump the save schema** (`CURRENT_SCHEMA_VERSION` + a `MIGRATIONS[old]` + a fixture) for ANY
    persisted-state shape change, and keep the index's `resumable` computation migration-aware (a
    bump once stranded every existing save by computing resumable on the raw, not migrated, doc).

---

## 9. Facts that contradict stale docs (trust these)

- **License: source-available, NOT open source.** Public + readable, all rights reserved, not for
  redistribution. No MIT/Apache. `CLAUDE.md` may still say "MIT/public" in places — that's stale;
  the source-available statement wins. `LICENSE` in the repo is authoritative.
- **Window close = hide to tray** (validated): the X button hides to tray; the tray menu **Quit** is
  the explicit exit. (After the Job-Object orphan fix, this is clean — no leftover `node.exe`.)
- **`/api/engine` was renamed to `/api/rules-retrieval`.** Some older docs/memories say `/api/engine`.

---

## 10. What's next + open threads

**The immediate, well-specified open task** (a real correctness gap, flagged but not yet fixed):

> **Model `indestructible` in the learn engine.** It is modeled **nowhere** in
> `app/src/lib/learn/`. A "Destroy target …" effect (`spellEffects.applyDestroyEffect`) and the
> lethal-damage SBA (`gameState.destroyLethalCreatures`) both send an indestructible permanent to
> the graveyard, which is wrong (CR 702.12b: indestructible can't be destroyed and isn't destroyed
> by lethal damage). The mass-wipe path flows through `applyDestroyEffect` too.
>
> The fix must be **uniform and layer-aware**: a single `isIndestructible(permanent, state)` that
> reads the layer engine (`layers.js` / `permanentHasKeyword`) so GRANTED indestructible (an aura/
> equipment, or a static "creatures you control have indestructible") is honored, not just printed.
> Then: `applyDestroyEffect` skips destroying an indestructible permanent (log a no-op); 
> `destroyLethalCreatures` skips an indestructible creature with lethal damage **but a 0-toughness
> creature still dies** (CR 704.5f — that's not "destroy"). Tests: Darksteel Forge survives
> Vindicate; an indestructible creature survives lethal combat damage but a 0/0 still dies; a
> GRANTED-indestructible creature (via a native aura/equipment) survives. The Arbiter's separate
> `symbolicEngine.cjs` already honors indestructible (~line 574) — this is only the native engine.
>
> This was surfaced as a LOW parity gap by the adversarial review of the targeted-permanent-removal
> slice (#192) — the destroy-creature path has always had the same gap, so the new permanent-removal
> path merely inherits it; the proper fix is engine-wide.

**The coverage roadmap (data-driven, re-scan each time — the best next atom shifts as the modeled set
grows):** I was mid-way through an exhaustive corpus gap-audit Workflow when the owner switched
accounts (it partially completed, then hit a session limit). Re-run that audit fresh. From the last
good scan, the strongest remaining clean candidates were:

- **Loot** — "draw a card, then discard a card" (needs a `discard` atom + an interactive discard
  picker; the ", then" split already exists).
- **"You may" optional wrappers** on effects.
- **Treasure / Food / Clue named tokens** — needs sacrifice-cost activated abilities first (the
  activated-ability system currently models cost = mana + `{T}` only).
- **Clone "except" riders** (Spark Double / Phyrexian Metamorph) + filtered/non-creature copies.
- Targeted `+1/+1` counter on a creature is already done.

**Deferred structural seams (high leverage, bigger lifts):**
- The **enemy-aware / interactive trigger-target chooser.** Today the trigger flush picks
  first-legal, which is why targeted removal + counter are *gated out* of triggers. Building a chooser
  (mirror `chooseAITarget` for the AI; a Beginner-interactive ask) would un-gate a large body-only
  bucket. This is probably the single highest-leverage non-atom move.
- **AI use of activated abilities** (the AI never activates) and **AI casting of non-creature
  removal / pumps / wipes / auras** (it currently holds them). These are gameplay-completeness, not
  correctness — safe to defer, but they make the AI feel passive.
- The **simultaneous-dies-trigger look-back** (a creature dying in a wipe alongside others doesn't
  fire its own "whenever a creature dies" for the co-dying companions).

---

## 11. Tooling you have (and how this project uses it)

- **gstack skills** (`/review`, `/qa`, `/investigate`, `/cso`, `/ship`, `/land-and-deploy`,
  `/document-release`, `/codex`, …) — used as review gates. `/browse` for web (never the raw Chrome
  MCP). The roadmap is loose (no hard phase gates); reviews are the gates.
- **The Workflow tool** — the adversarial-review and gap-audit engine. The project leans on it for
  every engine ship (see §6 step 5). With "ultracode" on, prefer it for substantive work.
- **Preview tools** (`preview_start`/`preview_eval`/`preview_snapshot`/`preview_screenshot`/…) — for
  live QA against `npm run dev`. This is how you satisfy the owner's "acceptance is live" mandate.
- **GBrain** (if set up) — cross-session memory; `gbrain search` before solving a known problem.
- **Auto-memory** — account-local (this is why this doc exists). On the new account, start your own
  memory files for durable facts; seed them from this doc's §1 (how Colton works) and §6 (the creed +
  discipline) first, because those are the things you'll most want to not relearn.

### Verify commands (from `app/`)
```
npm test          # full vitest suite (~2017 cases)
npm run lint      # eslint . --max-warnings 0  (what CI runs; npm test does NOT lint)
npm run coverage  # native-% dashboard + tier breakdown + gap buckets
npm run dev       # http://localhost:3000  (live QA)
npm run tauri:build         # local unsigned .exe
npm run tauri:build:release # local signed .exe (needs the key; CI is authoritative)
```

---

## 12. The one-paragraph version (if you read nothing else)

MTG Tool is Colton's personal, **local-first**, signed-Windows-`.exe` Commander assistant (Tauri +
bundled Next/Node + local Ollama). The active work is **The Academy** — a serialization-safe,
deterministic rules engine (`app/src/lib/learn/`) whose coverage we grow slice by slice toward
~85–100% native, with the **Arbiter (Ollama-only) as a permanent fail-safe**. The inviolable rule is
**false-negative SAFE, false-positive FORBIDDEN** — model a card's WHOLE behavior natively or route
the whole thing to the Arbiter; never partially apply. Every slice goes branch → build (anchored
allowlist parser) → **real-corpus sweep (0 false-positives)** → parser pins → **multi-lens
adversarial Workflow review** → **live real-enrichment QA** → test+lint → PR → squash-merge →
CHANGELOG. Colton directs and you build with **full standing autonomy** (commit/PR/merge/release
freely); he wants results not narration, one coherent chat for big work, real UI for player choices,
and live acceptance not green units. **v0.36.0 just shipped.** The next concrete task is modeling
`indestructible` engine-wide (§10); the highest-leverage structural move is the enemy-aware
trigger-target chooser. Read `CLAUDE.md`, trust the code over any doc, and protect the creed.

---

*Handoff written by Claude Opus 4.8, 2026-06-17, at the v0.36.0 release point. Good luck — it's a
genuinely well-built tool and a disciplined codebase. Keep the creed and it stays that way.*
