<!-- Relocated from CLAUDE.md §5 on 2026-06-24 to keep the always-loaded operating manual lean.
     This is the canonical copy; CLAUDE.md §5 links here. Load on demand. -->

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

10. **`/api/rules-retrieval` (formerly `/api/engine`) had a latent
    ReferenceError** from commit 5f8137e until 7b09ff0 because no test
    covered the route. **Always add at least an import smoke test when
    introducing a new route.** See
    `app/src/app/api/rules-retrieval/route.test.js`.

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

19. **Windows session-tooling traps** (cost the overhaul pass real time):
    (a) the Bash tool eats one backslash level even inside quoted heredocs and
    evaluates backtick spans — write patch/doc content via the **Write tool +
    `node script.cjs`**, never a heredoc carrying backslashes/backticks;
    (b) NEVER set `MTG_APP_ROOT` when running vitest (~176 phantom filesystem
    failures); (c) after ANY Edit/Write, verify the file landed in YOUR worktree
    and `git -C <main-tree> status` is clean (the Edit-misroute env bug).
    Full recipes: docs/orchestration/OVERHAUL-PLAYBOOK.md §2/§4.

---

## Session/orchestration hazards (added 2026-07-04 — full patterns: docs/orchestration/MASTER-GUIDE.md §4)

- **Worktree junction deletion**: `git worktree remove` (and any recursive delete) FOLLOWS a
  `node_modules` junction and wipes the MAIN tree's node_modules. Delete the junction first
  (`cmd //c rmdir <wt>\app\node_modules`); recover with `npm ci` from main `app/`.
- **Fan-out concurrency cap**: ≤2 builder lanes (~10-20 agents) at once — 4+ concurrent
  batches hit server-side API rate limits and get workflows KILLED mid-run.
- **`git rev-parse --show-toplevel` before any branch op**: an empty/swept worktree silently
  falls through to the MAIN repo, and a checkout there moves the main tree's branch pointer.
  Never trust a worktree directory you didn't just list.
