#!/usr/bin/env node
/*
 * Hard wall-clock guard around `vitest run`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Vitest runs each test file in a forked child process (the default
 * `forks` pool). If any test leaks a live handle -- an open timer, an
 * unawaited promise, a spawned child process that never exits -- the
 * worker's event loop never drains and vitest waits for that worker
 * forever. The whole run then hangs with no upper bound.
 *
 * We hit this for real, twice:
 *   1. A `vitest run` sat deadlocked for ~5 hours before anyone noticed.
 *   2. Killing just the parent (a timeout / Ctrl-C) left 24+ orphaned
 *      node.exe workers behind, because Windows does NOT cascade a kill
 *      to child processes the way POSIX does.
 *
 * This wrapper guarantees two things plain `vitest run` cannot:
 *   (1) the run ALWAYS terminates within VITEST_TIMEOUT_MS, and
 *   (2) on timeout (or Ctrl-C) the ENTIRE worker set is torn down, so
 *       no zombie workers survive.
 *
 * It is otherwise transparent: extra args are forwarded to vitest and
 * its exit code is propagated, so `npm test` and `npm test -- <args>`
 * behave exactly as before -- just with a safety net.
 *
 * IMPLEMENTATION NOTE -- why not `taskkill /T`?
 * ---------------------------------------------
 * vitest's worker pool (tinypool) spawns its forks in a way that does
 * NOT keep them as reliable children of the vitest PID -- they reparent,
 * so `taskkill /T /PID <vitest-pid>` walks the tree and misses them
 * (verified: it left 50 orphans). The reliable kill is to match the
 * worker processes by command line (`node.exe` whose args contain the
 * vitest path) and stop them directly. That's what runs below, and it
 * runs synchronously so the wrapper never exits with workers still live.
 */

const { spawn, spawnSync } = require("node:child_process");
const path = require("node:path");

// Default 5 min: ~5x the healthy full-suite runtime (<1 min for ~350
// tests), so a legitimate slow run never trips it but a genuine hang is
// caught quickly. Override for a tighter/looser bound, e.g.
// `VITEST_TIMEOUT_MS=90000 npm test`.
const TIMEOUT_MS = Number(process.env.VITEST_TIMEOUT_MS) || 5 * 60 * 1000;

const isWin = process.platform === "win32";

// Spawn vitest as a direct `node` child. On POSIX we put it in its own
// process group so a negative-PID signal reaches the whole group.
const vitestEntry = path.join(__dirname, "..", "node_modules", "vitest", "vitest.mjs");
const args = [vitestEntry, "run", ...process.argv.slice(2)];

const child = spawn(process.execPath, args, {
  stdio: "inherit",
  detached: !isWin,
});

let killing = false;

// Synchronously tear down vitest + every worker it spawned. Safe to call
// more than once; only does work the first time.
function killVitestTree() {
  if (killing) return;
  killing = true;

  if (isWin) {
    // 1. Kill the vitest MAIN process by PID first. Its worker pool
    //    manager (tinypool) lives here; while it's alive it respawns
    //    replacements for any worker we kill.
    if (child.pid) {
      spawnSync("taskkill", ["/F", "/PID", String(child.pid)], { stdio: "ignore" });
    }
    // 2. Loop-kill the worker set until a pass finds none. tinypool's
    //    forks reparent (so taskkill /T misses them) and the pool can
    //    respawn during a single sweep (verified: one pass left 2
    //    survivors). The loop is self-correcting: once the main is dead
    //    no new workers spawn, so the count converges to zero.
    //
    //    The loop is driven HERE in Node, with each PowerShell call kept
    //    to a single simple pipeline -- an inline PS `for` loop breaks
    //    under spawn's command-line quoting (verified: it silently no-op'd
    //    and left 25 orphans). Match is `*node_modules*vitest*` (the `*`
    //    spans either slash style), which hits the main and every forked
    //    worker whose cmdline embeds the vitest module path, and nothing
    //    else (the app's own node server has no such path).
    const killPs =
      `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*node_modules*vitest*' } | ` +
      `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`;
    const countPs =
      `(@(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | ` +
      `Where-Object { $_.CommandLine -like '*node_modules*vitest*' })).Count`;
    for (let i = 0; i < 12; i++) {
      spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", killPs], {
        stdio: "ignore",
      });
      const r = spawnSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", countPs],
        { encoding: "utf8" }
      );
      if ((parseInt((r.stdout || "").trim(), 10) || 0) === 0) break;
      // Brief synchronous pause so any worker that was mid-spawn appears
      // and gets caught on the next pass.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
    }
  } else {
    try {
      process.kill(-child.pid, "SIGKILL"); // negative pid = whole group
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

let timedOut = false;
const timer = setTimeout(() => {
  timedOut = true;
  process.stderr.write(
    `\n[test-with-timeout] vitest exceeded ${Math.round(TIMEOUT_MS / 1000)}s -- ` +
      `tearing down the worker set (likely a leaked handle or a deadlocked test).\n`
  );
  killVitestTree();
  process.exit(1);
}, TIMEOUT_MS);

// If the wrapper itself is interrupted (Ctrl-C, terminal close), don't
// leave workers behind either.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    clearTimeout(timer);
    killVitestTree();
    process.exit(1);
  });
}

child.on("exit", (code, signal) => {
  clearTimeout(timer);
  if (timedOut) return; // already exiting via the timer path
  if (signal) {
    killVitestTree();
    process.exit(1);
  }
  process.exit(code == null ? 1 : code);
});

child.on("error", (err) => {
  clearTimeout(timer);
  process.stderr.write(`[test-with-timeout] failed to spawn vitest: ${err.message}\n`);
  process.exit(1);
});
