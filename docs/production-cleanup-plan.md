# Production Cleanup Plan

> **Status:** In progress — Phases A, B, C1, C3, and D2 merged (10 PRs, CI green).
> The heaviest items (the `knowledge/` rename and the Phase E refactors) are paused
> for a fresh session. See **Progress** below for exactly what's done and what's next.
> **Mode:** Researched read-only while other sessions were active; execution happens
> against a clean tree (see [Execution sequencing](#execution-sequencing)).
> **Delivery:** Incremental pull requests, one per area, each verified with
> `npm test` + `cargo check` before merge.
> **Remove this file** once the cleanup is complete — it is a working tracker, not
> permanent documentation.

Last updated: 2026-05-29.

## Progress

**Merged (10 PRs, CI green throughout):**
- **Phase A** — engine `TOOL_ROOT` 500 + `spellbook`/`edhrec` `__dirname` packaging bugs, with tests.
- **B1** — archived 19 root scratch docs; deleted the dead `mtg-judge/MTGAssistant.jsx` orphan + a `.bak`.
- **B2** — source-available `LICENSE`; reconciled the licensing contradiction.
- **B3** — README overhauled for outsiders (desktop build path); retired stale `app/README`.
- **B4** — `.gitattributes`, `CONTRIBUTING`, `ARCHITECTURE`, `SECURITY`, `CHANGELOG`.
- **Test health** — fixed the `collectionCsvImport.test.js` leak that hung the whole suite (now 636 tests in ~2s).
- **C3** — CI gate: `ci.yml` runs lint + tests on push/PR; `release.yml` gated on a green suite.
- **C1** — ESLint + Prettier + knip; lint wired into CI (0 errors, ~60 tracked warnings).
- **CI fix** — extracted `findOllamaBinary` to `lib/server/ollamaBinary.js`; made `ollama-health` test hermetic.
- **D2** — corrected stale "Electron" doc references to the Tauri shell.

**Remaining (paused — resume here):**
- **C2** — git hooks (commitlint + simple-git-hooks + lint-staged).
- **C4** — Rust rustfmt + clippy + cargo-audit (wire into CI).
- **D1** — normalize npm script names to `verb:noun`.
- **D3** — disambiguate duplicate fn names (`searchCards`, `detectCardNamesInText`, `normalizeName`).
- **D4** — consolidate data dirs under `knowledge/` (renames `MTG ENGINE/`; touches the signed `.exe` build — verify with `npm run tauri:build`).
- **E1–E6** — add `powerRanker` + rules-retrieval tests; shared `theme.js`/`styleHelpers`/`<Modal>`; decompose `MTGAssistant.jsx` + `FeedbackButton.jsx`; split `agents.js`/`powerRanker.js`/`lib.rs`; dedupe backend helpers + card-context builders; frontend dead-code cleanup.
- **Deferred** — run the `/health` + `/cso` baseline.

The detailed PR-by-PR breakdown is in the sections below.

---

## 1. Goal

Bring MTG Tool from "works on the maintainer's machine" to "a professional engineer
who has never seen it can clone it, understand it, build it, and contribute." The
review found the code is in good structural shape — the gap is the polish layer:
tooling, docs, naming, test coverage, and dead-weight removal. Plus two real latent
bugs worth fixing regardless.

## 2. Locked decisions

| Decision | Choice | Implication |
|---|---|---|
| **License** | **Source-available, not OSS** | Public + readable, all rights reserved, not for redistribution. No MIT/Apache file. Reconcile the three contradictory licensing statements (`CLAUDE.md` "MIT/public" vs `README` "Not for redistribution" vs `app/README` "not a public SaaS") to one consistent source-available statement. |
| **Knowledge dirs** | **Consolidate under `knowledge/`** | `MTG ENGINE/` → `knowledge/mtg-engine/` (kills the space in the path), `mtg-judge/` → `knowledge/mtg-judge/`, plus a `knowledge/README.md` explaining data provenance. Full signed-`.exe` build verification required. |

Keep `CONTRIBUTING.md` + `ARCHITECTURE.md` (serve the "hand it to a non-vibe-coder"
goal). Skip OSS-ceremony files (CODE_OF_CONDUCT, issue templates) unless requested.

## 3. Confirmed bugs (fix regardless of the rest)

1. **`app/src/app/api/engine/route.js:508`** — `formatRulesContext` references an
   undefined `TOOL_ROOT` in `path.relative(TOOL_ROOT, CR_FILE)`. Throws a 500 on any
   **POST** rules query that returns rules. Uncovered because the colocated test only
   exercises GET. Same class as the documented gotcha #10. Fix: use `appRoot()` /
   `mtgJudgeDir()`.
2. **`app/src/lib/server/spellbook.js:21`** and **`edhrecSalt.js:8`** — use raw
   `path.join(__dirname, "../../../data")` instead of the mandatory `paths.js` helpers
   (forbidden pattern #7 / gotcha #9). In the packaged `.exe`, `__dirname` is the
   standalone bundle dir, so these silently ignore `MTG_REFERENCE_DIR` and the
   writable AppData override. Works today only because data sits adjacent. Fix: route
   through `dataPath(...)`.

## 4. Findings by area

Each finding has a file reference so it can be acted on cold.

### Frontend / UI (`app/src/components/**`)
- Oversized components: `MTGAssistant.jsx` (1150), `FeedbackButton.jsx` (1241),
  `ChatPanel.jsx` (651), `CollectionView.jsx` (524).
- Theme palette redefined in 3+ places (`MTGAssistant.jsx:603`,
  `FeedbackWindowApp.jsx:116`, `CollectionView.jsx:27`) — no shared `theme.js`. Two
  parallel styling vocabularies (`BG/LINE/pb` vs `COLORS/FONT/btn`).
- Cryptic style props (`pb`, `sb`, `bg`, `bg3`, `F`, `cfg`) drilled into ~10
  components with no documentation.
- Inline styles everywhere, zero CSS modules — the biggest "not a pro codebase" tell.
- Dead/stale: `CollectionView` `onClose` prop never wired (`MTGAssistant.jsx:1064`);
  "Add and Import buttons coming in Step 6" copy that already shipped
  (`CollectionView.jsx:497`); "Step N" build-phase comments leaking into source.
- Duplicated modal scaffolds across 4 collection modals — needs a shared `<Modal>`.
- `window.innerWidth` read during render (`MTGAssistant.jsx:43`); `confirm()` used for
  delete (`CollectionCardDetail.jsx:93`); render-time `localStorage` reads
  (`UpdatesModal.jsx:445`).
- No prop docs on high-fan-in components (DeckView ~45 props, ChatPanel ~20).

### API routes (`app/src/app/api/**`, ~24 routes)
- **No `paths.js`/`cwd` violations** — invariant holds. Good.
- **Arbiter ollama-only invariant holds** (`arbiter/route.js:200` hardcodes
  `provider:"ollama"`). Good — but **untested**.
- Duplication: feedback logic (~150 lines across `feedback/route.js` +
  `feedback/bundle/route.js`); `findOllamaBinary` (ollama-health + install-ollama);
  `sanitiseId` (games + games-summary); `validateStacks` (collection routes).
- Module-level `const dataPath(...)` resolution is inconsistent (some eager, some
  thunked); `decks/route.js:12` comment claims lazy resolution it doesn't deliver.
- **Untested routes:** arbiter, chat-stream, cards, power-rank, spellbook,
  symbolic-engine, model-calls, knowledge-status, feedback/open. `engine` has a test
  but it never hits the POST path that contains bug #1.

### Core lib / server (`app/src/lib/**`)
- `paths.js` + `modelProvider.js:12` docs say **"Electron"** — the shell is **Tauri**.
  Wrong-runtime docs in the most load-bearing module.
- Big files: `powerRanker.js` (1165, **zero tests**), `agents.js` (990, mostly one
  630-line Karn prompt), `goldfish.js` (750), `modelProvider.js` (516),
  `rulesRetrieval.js` (508), `scryfall.js` (511).
- Duplicate function names with different contracts: `searchCards` (scryfall vs
  cardIndex), `detectCardNamesInText` (scryfall vs cardIndex), `normalizeName` (3
  variants across cardIndex/spellbook/edhrecSalt).
- Card-context builders duplicated (scryfall.js client vs server/cardContext.js).
- Magic scoring constants in `powerRanker.js` unexplained (`impact += 3.6`, power
  weights, bracket thresholds).
- **Test gaps:** powerRanker (highest priority), rules-retrieval (guards the "never
  fabricate rule numbers" prime directive), modelProvider, spellbook, edhrecSalt.

### Build / native / CI
- **No CI test gate.** `release.yml` builds and ships a *signed public release* with
  zero verification that tests pass. No PR/push CI workflow at all.
- `build-signed-release.cjs:53` silently defaults the signing password to `""` if the
  secret is unset — should fail fast.
- `lib.rs` (484 lines) conflates 5 concerns (server spawn, tray, updater,
  single-instance, job-object/orphan-reaping) — split into modules. No Rust tests
  (`strip_unc` is trivially testable).
- package.json mixes naming schemes (`sync:scryfall-bulk` vs `refresh-tokens`,
  `backup`); script-name drift (`refresh-tokens` runs `generate-token-names.cjs`).
- In-code comments are genuinely good — the documented Windows gotchas are explained
  at their call sites. Keep that standard.
- README never mentions Tauri / `.exe` / `tauri:build`; factual drift ("5 datasets" →
  actually 4; "Node 20+" → bundles 22).

### Docs / data / repo hygiene
- **~16–19 scratch docs at repo root** (`CODEX_*`, `PHASE*`, `*_HANDOFF`,
  `NEXT_SESSION_PROMPT`, `PR_SUMMARY`) — reads as a scratchpad, not a product.
- **License contradiction** (see §2) + **no LICENSE/usage statement**.
- Test-count drift (README/ROADMAP say 81; reality ~350). Status drift (ROADMAP says
  "no GitHub remote yet"; repo is live). Broken refs in `app/README.md`.
- `AUDIT.md` is a frozen 2026-05-23 first-run log, not a living audit.
- 1167-line dead orphan `mtg-judge/MTGAssistant.jsx` (references an obsolete "Nissa"
  agent). Tracked junk in `mtg-judge/`: `.bak`, `report.md`, `run_v3.md`, cite audits.
- Gitignored plaintext file literally named **`THE KEY.txt`** still on disk in
  `MTG ENGINE/` — scary near-miss; delete it.
- Missing: `CONTRIBUTING`, `ARCHITECTURE`, `SECURITY`, `CHANGELOG`, `.gitattributes`.

## 5. Staged PR plan

Effort: `[S]` small, `[M]` medium, `[L]` large. 🔥 = touches files currently being
edited by other sessions; sequence after they land.

### Phase A — Correctness (first; isolated)
- **A1** Fix `engine/route.js` `TOOL_ROOT` + add a POST-with-rules test `[S]`
- **A2** Fix `spellbook.js`/`edhrecSalt.js` `__dirname` → `paths.js` + tests `[S]`

### Phase B — Repo hygiene & docs (low risk, high payoff)
- **B1** Archive ~16–19 root scratch docs → `docs/archive/`; delete the
  `mtg-judge/MTGAssistant.jsx` orphan + `.bak`/`report`/`run_v3` junk; remove
  `THE KEY.txt` `[S]`
- **B2** Add a source-available `LICENSE`/usage statement; reconcile licensing across
  `README` / `app/README` / `CLAUDE.md` `[S]`
- **B3** README overhaul: add Tauri/`.exe` build path; fix test counts / dataset count
  / Node version / "no remote"; retire stale `app/README.md`; rewrite/retire
  `AUDIT.md` `[M]`
- **B4** Add `CONTRIBUTING.md` + `ARCHITECTURE.md` (human-facing, from CLAUDE.md) +
  `SECURITY.md` + `.gitattributes` (`* text=auto eol=lf`) + `CHANGELOG.md` `[M]`

### Phase C — Tooling & CI (the production backbone)
- **C1** ESLint flat + Prettier + knip; `lint`/`format` scripts; fix what surfaces
  `[M–L]` 🔥package.json
- **C2** commitlint + simple-git-hooks + lint-staged `[S]` 🔥package.json
- **C3** `ci.yml` (npm test + build + `cargo fmt --check` + clippy on PR); gate
  `release.yml` on tests; fail-fast on missing signing password; Dependabot +
  osv-scanner `[M]`
- **C4** Rust rustfmt + clippy clean + cargo-audit `[S–M]`

### Phase D — Naming & in-place structure (moderate risk)
- **D1** Normalize npm script names to `verb:noun` `[S]` 🔥package.json
- **D2** Refresh stale code docs (Electron→Tauri; dead comments; single-instance
  `_argv` vs the Declined file-association) `[S]`
- **D3** Disambiguate duplicate function names (`searchCards`,
  `detectCardNamesInText`, `normalizeName`) `[S]`
- **D4** Consolidate data under `knowledge/` (rename `MTG ENGINE/`) — update `lib.rs`
  (`MTG_ENGINE_DIR`/`MTG_JUDGE_DIR`), `paths.js`, `prepare-tauri-resources.cjs`,
  `.gitignore`, `tauri.conf.json`; **full signed-`.exe` build verification** `[M]`

### Phase E — Refactors & dedupe (largest; safety nets first)
- **E1** Add tests **before** refactoring: `powerRanker` golden-master,
  rules-retrieval, Arbiter ollama-only invariant, ~8 route smoke tests `[M]`
- **E2** Extract shared `theme.js` + `styleHelpers.js` + `<Modal>` primitive `[M]`
- **E3** Decompose `MTGAssistant.jsx` + `FeedbackButton.jsx` `[L]`
- **E4** Split `agents.js`, `powerRanker.js`, `lib.rs` into modules `[L]`
- **E5** Dedupe backend helpers (`feedbackStore.js`, `findOllamaBinary`, `sanitiseId`,
  `validateStacks`) + card-context builders `[M]`
- **E6** Frontend dead-code/UX cleanup (onClose, "Step N", `confirm()`, render-time
  reads) `[S–M]` 🔥collection

**Ordering rationale:** bugs first (cheap, real), then hygiene/docs (low risk, makes
the repo *look* finished), then tooling/CI (the backbone that keeps it clean and gates
releases), then naming (moderate ripple), then the big refactors last — gated behind
the E1 test safety net so we can refactor without fear.

## 6. Tooling to adopt

Web-scout vetted for safety and current (2025/2026) maintenance.

**Adopt (starter set):** ESLint flat config + Prettier + `eslint-config-next` +
`eslint-config-prettier`; **knip** (dead code/exports/deps, confirmed JS support);
commitlint + **simple-git-hooks** (not husky — avoids husky's auto-install script) +
lint-staged; rustfmt + clippy + cargo-audit; osv-scanner (spans npm *and* Cargo) +
npm audit + Dependabot (**never auto-merge** — 2026's top npm attack vector);
**ast-grep** for safe repo-wide codemods during refactors.

**Defer:** JSDoc HTML site (only after code is annotated); Biome (loses Next.js rules
in a JS app); cargo-deny (cargo-audit suffices); socket.dev; Serena MCP (vet before
filesystem access).

**Reject:** changesets (the tag-based release already works for a single package).

Note: Next.js 16 removes built-in `next lint`, so wiring a standalone linter is
required regardless.

## 7. Validation

- Every PR: `npm test` (vitest) + `cargo check` per CLAUDE.md §1.4; `tauri:build`
  verification specifically for D4 and any Rust/build-pipeline change.
- `/health` (code-quality dashboard) + `/cso` (security audit) as a clean baseline
  **right before execution** — running them against the actively-changing tree now
  would be noise.
- `/codex` second opinion: CLI installed (`0.135.0`), but the OpenAI account is at its
  usage limit until ~2026-05-30. Retry when quota resets.
- **Security pre-check (2026-05-28): CLEAN — no bad actor.** Remote is only
  `Robak503/mtg-tool`; no new or suspicious dependencies; no `eval`/dynamic-code/obfuscation;
  the only `child_process` uses are documented (winget Ollama install, native open, sync
  scripts); external network hosts are all expected (Scryfall, Anthropic fallback, Ollama
  localhost), and the art-crop SSRF guard is unit-tested against a hostile host. The
  concurrent session's commits are coherent and on-theme. Full `/cso` audit still runs at
  the execution baseline.

## Execution sequencing

Execution is **solo** — one chat, one consistent voice, no parallel split (owner's call,
for coherence and clarity).

Status as of 2026-05-28: the concurrent session **committed and pushed** its work to the
branch **`feat/collection-followups`** (learn 4P FFA, format detection, art-crop cache,
test watchdog). This checkout is currently *on that branch*, and the working tree is
otherwise clean. That branch is the other session's line — committing on it would be overlap.

**No-overlap mechanism:** do the cleanup on its own branch off **`master`**, in an isolated
`git worktree`, so this checkout and `feat/collection-followups` are never touched. Rebase
onto `master` after that branch's PR merges — Phase A's files (`engine`, `spellbook`,
`edhrec`) don't overlap the collection work, so the rebase stays clean.

The 🔥-flagged PRs (anything touching `package.json` or collection files) run only after
`feat/collection-followups` has merged to `master`.
