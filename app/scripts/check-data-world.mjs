#!/usr/bin/env node
/**
 * check-data-world.mjs — am I seeing the SAME filesystem the running app sees?
 *
 * THE HAZARD (ghost-registry root cause #6, 2026-07-11): MSIX-packaged tooling
 * (Claude Desktop et al) runs its child processes in a Windows app container that
 * copy-on-write VIRTUALIZES %APPDATA% — such a process reads/writes a private
 * MIRROR of this app's data at the identical path, indefinitely, and every check
 * it runs against that path is self-consistently wrong. A month of "repairs"
 * landed in a mirror this way while the installed .exe kept serving the real,
 * still-broken registry.
 *
 * THE CHECK: /api/health reports the data root + the profiles.json inode as the
 * SERVER sees them. We stat the same path from THIS process and compare. Same
 * ino = same world (safe to touch data). Different ino = you are in a mirror —
 * DO NOT trust reads or attempt on-disk repairs from here; go through the app's
 * API, attach to the app's node via the inspector, or spawn outside the
 * container (Explorer handoff / Task Scheduler).
 *
 * Usage: node scripts/check-data-world.mjs [health-url]
 *        (default http://127.0.0.1:3000/api/health)
 * Exit codes: 0 same world · 2 MIRRORED · 3 could not determine.
 */

import { statSync } from "node:fs";
import path from "node:path";

const url = process.argv[2] || "http://127.0.0.1:3000/api/health";

let health;
try {
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  health = await res.json();
} catch (error) {
  console.error(`could not reach the app at ${url} — is it running? (${error?.message || error})`);
  process.exit(3);
}

if (!health.dataRoot || !health.registryIno) {
  console.error(
    `the server did not report dataRoot/registryIno (version ${health.version || "?"} — pre-armor build?). Cannot verify; assume MIRRORED.`,
  );
  process.exit(3);
}

const registryPath = path.join(health.dataRoot, "data", "profiles.json");
let myIno;
try {
  myIno = String(statSync(registryPath).ino);
} catch (error) {
  console.error(`this process cannot stat ${registryPath} (${error?.code || error}) — cannot verify; assume MIRRORED.`);
  process.exit(3);
}

console.log(`app data root : ${health.dataRoot}`);
console.log(`registry file : ${registryPath}`);
console.log(`server ino    : ${health.registryIno}`);
console.log(`my ino        : ${myIno}`);

if (myIno === health.registryIno) {
  console.log("VERDICT: SAME WORLD — this process sees the app's real data.");
  process.exit(0);
}
console.log("VERDICT: MIRRORED — this process is inside a container seeing a PRIVATE COPY of the app's data.");
console.log("Do not repair or trust reads from here. Use the app's API, the node inspector, or an outside-container spawn.");
process.exit(2);
