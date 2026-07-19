# Handoff — ladder rung 0.6 "Roots That Travel" (engine-portability guard)

**For:** Cindy · **From:** Omnath seat · **Date:** 2026-07-18
**Status:** built, verified, **NOT merged** — parked on a branch awaiting your review.

| | |
|---|---|
| **Branch** | `claude/omnath-portability-rung-0.6` |
| **Commit** | `506a2e23` (single commit; this doc is a second commit on the same branch) |
| **Based on** | `324b8435` — ⚠️ **3 commits behind `origin/master`** (see §6) |
| **Touches** | 1 new test file + 3 docs. **No product code changed.** |
| **Gate** | 10,422 tests / 801 files green · lint 0 warnings · prettier clean |

**THE ASK:** review the approach, sanity-check it against the live tree, and blend it
into master yourself. Colton wants your eyes on it before it lands. Nothing is pushed;
master is untouched and sits exactly where it did pre-session.

---

## 1. What this is and why it matters

Rung 0.6 of the portability ladder, implementing **step 1** of the vault's
`plan_engine_portability` roadmap — the highest-leverage move in that plan.

The audit found the durable engine has **zero** Tauri coupling: the rules engine, the
server data layer, and the API routes are all already platform-agnostic. Good news — but
it was **accidental**, not enforced. Nothing stopped the next PR from wiring the engine
into the Windows shell one import at a time, and that erosion is invisible until someone
tries to move to a non-Windows box. Same failure shape as
`project_mass_targettype_drift_trap`: a boundary that is true today still rots without a
guard.

This converts "currently clean" into "structurally guaranteed clean."

## 2. The engine-surface allowlist

```
src/lib/learn/**        the rules/play engine
src/lib/server/**       card index, paths.js, model provider, retrieval, all stores
src/app/api/**          every route handler
src/middleware.js       ─┐ added deliberately: both run in the spawned Node server AND
src/instrumentation.js  ─┘ point INTO the surface, so the graph walk never reaches them
```

**…plus everything those transitively import.** 255 seeds → 260 files scanned.

**Why whole-directory on `lib/server` instead of the audit's four named files**
(`cardIndex`, `paths`, `modelProvider`, `rulesRetrieval`): everything under `lib/server`
is Node-side code running in the spawned server process, where Tauri's webview APIs do
not exist *at all*. The broad rule is therefore both **stricter** and **lower-maintenance**
— an enumerated list needs someone to remember to extend it when they add the 55th server
module, and the one time they forget is exactly when the leak lands. Flag it if you'd
rather scope it tighter.

**Two design choices worth your scrutiny:**

- **It forbids the globals, not just the imports.** Every real Tauri import in this repo
  is a dynamic `await import()`, and the shell's own idiom is
  `window.__TAURI__ || window.__TAURI_INTERNALS__` (all 5 shell files). An engine file
  copy-pasting that pattern couples to the shell with **zero imports and a green build**.
  So `__TAURI__`, `__TAURI_INTERNALS__`, and `tauri://` are forbidden in the surface too.
  This is the likeliest real-world leak — more likely than the import.
- **It follows the import graph, not just the directory.** engine → UI module → Tauri is
  just as broken as a direct import, and a flat per-directory grep misses it entirely.
  Relative specifiers are resolved and walked out past the surface boundary; a violation
  reports the full chain that reached it.

## 3. Verification — observed, not assumed

Full suite **10,422 / 801 files green**, lint **0 warnings**, prettier clean.

Six deliberate mutation probes. Each was run, each fired, each was reverted, and
`git status` was verified clean afterward:

| # | Probe | Result |
|---|---|---|
| 1 | Direct `@tauri-apps` import in `cardIndex.js` | 🔴 caught |
| 2 | Backtick dynamic import ``import(`@tauri-apps/api/app`)`` | 🔴 caught — **evaded the first draft** |
| 3 | Transitive: engine → `hooks/useTauriAppVersion.js` → Tauri | 🔴 caught, full chain printed |
| 4 | `window.__TAURI_INTERNALS__` with **no import at all** | 🔴 caught |
| 5 | Moved/renamed engine root | 🔴 actionable message, not a raw ENOENT stack |
| 6 | Stale `DOCUMENTED_EXCEPTIONS` entry | 🔴 caught |

**The guard is built not to become a hollow gate itself** (per
`feedback_hollow_gate_law`). It carries a file-count floor (235; actual 260), a live-tree
witness that the walk still leaves the roots, and — critically — a **fixture-tree
SEEN-TO-FAIL**: only 5 files are reached transitively on the real tree, so if
`resolveRelative` regressed to always-null, the entire graph-walk feature would die while
`scanned` dropped only 260→255, still cleared the floor, and the suite stayed green. The
fixture builds a real 2-hop violation and asserts the chain, so the walker can't silently
rot. There are also resolver unit tests and an import-cycle termination test.

An adversarial review pass (independent agent, tasked to *break* it) produced findings 2
and 4 above and the hollow-gate hole — all three are fixed in `506a2e23`. Its remaining
low-severity notes (minified edge forms, symlink traversal, `.mjs/.ts` resolution) are
also addressed.

## 4. Known limitations — stated plainly

- **A static scanner cannot stop a *deliberately* indirected import.**
  `const M = "@tauri-apps/api"; await import(M);` or a `createRequire` alias defeats it.
  Closing that needs real dataflow analysis. **This guard is built to stop accidental
  erosion — the ordinary PR with the ordinary import — not an adversary smuggling the
  dependency past a test named "portability guard."** The globals check narrows it a lot,
  since an indirected import still has to *call* something to be useful. This limit is
  documented in the test file header, not hidden.
- **One live exception, judged NOT a break.** `src/lib/server/originGuard.js:36` carries
  `"tauri://localhost"` in its CSRF Origin allowlist. That is an **inert string in a pure,
  dependency-free module** — it never matches on a Mac and needs no shell present, so it
  does not block portability. It's a `DOCUMENTED_EXCEPTIONS` entry with a written
  rationale rather than a violation. **This is the judgment call most worth your second
  opinion.** The exception list is self-policing: an allowance that stops matching fails
  the suite, so it can't quietly become a dumping ground.
- **Scope:** this is step 1 of the portability plan only. Steps 3–6 (Ollama adapter shape,
  request-level headless smoke test, macOS bundle targets, the `#[cfg(target_os = "macos")]`
  supervisor) remain open and are still box-gated or low-urgency.

## 5. What's in the commit

```
app/src/lib/enginePortability.test.js  (new, 513 lines — the guard)
docs/orchestration/PROJECT-SCAFFOLD.md (+26 — new §2.3 writes the seam down; plan step 2)
docs/orchestration/WAKE-REPORT.md      (+36 — status entry)
CHANGELOG.md                           (+10 — Unreleased ### Internal)
```

No product code changed. No new public surface, no secrets, no endpoints.

## 6. ⚠️ Rebase note before you blend

The branch is based on `324b8435`, which was local master's HEAD at session start. Local
master was **already 3 commits behind `origin/master`** at that point (not caused by this
work):

```
84dc309e refactor(learn-view): build the UI seam gate, extract LEYLINE styles (decomp slice 1)
0da55b88 docs(method): the hollow-gate law — never-skip #13 + §3b
5c9a3188 refactor(learn-view): extract the decision-panel layer (decomp slice 2)
```

Those are your learn-view decomp slices plus the hollow-gate law. **Expect a rebase onto
`origin/master` before merging.** Conflict risk is low — the decomp slices touch
learn-view UI, which is outside the engine surface — but the guard *scans* the live tree,
so re-run it after rebasing: if the slices moved anything under the engine roots, the
coverage-witness floor or the "still leaves the roots" assertion will tell you immediately.

Two files were dirty in the worktree the whole session and are **not** mine, left
untouched: `app/package-lock.json`, `app/public/card-names.json`.

## 7. Suggested review path

1. `git checkout claude/omnath-portability-rung-0.6`
2. Read the test file header first — it states the design, the bias, and the limits up front.
3. Sanity-check §2's allowlist against your read of the live tree. Is whole-directory
   `lib/server` right, or too broad?
4. Second-opinion the `originGuard.js` exception in §4.
5. Re-run the probes yourself if you want SEEN-TO-FAIL in your own hands — probe 4 is the
   most interesting (append
   `export const v = () => window.__TAURI_INTERNALS__.invoke("x");` to any engine file,
   run `npx vitest run src/lib/enginePortability.test.js`, then revert).
6. Rebase onto `origin/master`, re-run `npm test` + `npm run lint`, blend into master.

---

*Related vault notes: `plan_engine_portability` (the roadmap this implements step 1 of) ·
`ladder_omnath_achievements` (rung 0.6) · `feedback_hollow_gate_law` (SEEN-TO-FAIL +
coverage witness, which this guard applies to itself) ·
`project_mass_targettype_drift_trap` (the precedent for structural-guard-beats-observed-clean).*
