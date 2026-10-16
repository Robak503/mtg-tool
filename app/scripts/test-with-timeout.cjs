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
 * `taskkill /T /PID <vitest-pid>` walks the LIVE tree, and the pool can
 * respawn workers while vitest is alive (verified: it left 50 orphans).
 * So the main is killed first (no more respawns), then the tree is
 * collected from a process snapshot by ParentProcessId -- Windows keeps a
 * child's ParentProcessId after its parent dies -- and stopped, pass after
 * pass, until a pass finds nothing.
 *
 * ONLY THIS RUN'S PROCESSES (2026-10-16). The kill used to match every
 * node.exe whose command line held node_modules + vitest, which on a
 * machine running several sessions' test runs at once (one worktree each,
 * node_modules junctioned into the main tree) stopped everyone's runs when
 * one of them timed out. It now stops only descendants of this wrapper's
 * own vitest process, and only processes created after the wrapper
 * started, so a recycled PID can never pull in an unrelated process.
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
const startedAtMs = Date.now();

// One PowerShell pass over the process tree rooted at `rootPid`: every
// descendant created at or after `sinceMs` (epoch ms) is stopped, and the
// number found is printed.
function treeSweepScript(rootPid, sinceMs) {
  return [
    "$all = @(Get-CimInstance Win32_Process)",
    "$byParent = @{}",
    "foreach ($p in $all) { $k = [string]$p.ParentProcessId; if (-not $byParent.ContainsKey($k)) { $byParent[$k] = New-Object System.Collections.ArrayList }; [void]$byParent[$k].Add($p) }",
    "$since = [DateTimeOffset]::FromUnixTimeMilliseconds(" + Number(sinceMs) + ")",
    "$queue = New-Object System.Collections.Queue",
    "$queue.Enqueue('" + Number(rootPid) + "')",
    "$found = 0",
    "while ($queue.Count -gt 0) {",
    "  $parent = $queue.Dequeue()",
    "  if (-not $byParent.ContainsKey($parent)) { continue }",
    "  foreach ($c in $byParent[$parent]) {",
    "    if ([DateTimeOffset]$c.CreationDate -lt $since) { continue }",
    "    $found++",
    "    $queue.Enqueue([string]$c.ProcessId)",
    "    Stop-Process -Id $c.ProcessId -Force -ErrorAction SilentlyContinue",
    "  }",
    "}",
    "$found",
  ].join("\n");
}

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
    // 2. Stop this run's descendants until a pass finds none. One pass
    //    collects the tree rooted at the vitest PID from a single process
    //    snapshot (by ParentProcessId), keeps only processes created since
    //    the wrapper started, stops them, and prints how many it found.
    //    The script goes over -EncodedCommand: an inline PS loop passed
    //    through spawn's command-line quoting silently no-ops (verified
    //    once: it left 25 orphans).
    if (child.pid) {
      const sweep = Buffer.from(treeSweepScript(child.pid, startedAtMs - 2000), "utf16le").toString("base64");
      for (let i = 0; i < 12; i++) {
        const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-EncodedCommand", sweep], {
          encoding: "utf8",
        });
        if ((parseInt((r.stdout || "").trim(), 10) || 0) === 0) break;
        // Brief synchronous pause so any worker that was mid-spawn appears
        // and gets caught on the next pass.
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
      }
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
