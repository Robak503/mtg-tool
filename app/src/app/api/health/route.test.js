/**
 * /api/health — the shell's identity gate endpoint + the Sim Center's freshness
 * contract. Locks: ok:true, the MTG_LAUNCH_NONCE echoed verbatim (null when
 * unset), the CORS header the tauri-origin placeholder needs to READ the response
 * (an opaque probe can't tell our server from a stale orphan's), and the
 * freshness identity fields — version (the bundle's package.json), registryId
 * (8-hex content hash of the live profiles registry), activeProfile.
 *
 * chdir-sandboxed (the profiles.test.js pattern): the route now calls
 * listProfiles(), which runs the one-time migration — a test must never write a
 * registry into the working tree.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import pkg from "../../../../package.json";
import { GET } from "./route.js";

const NONCE_KEY = "MTG_LAUNCH_NONCE";
const original = process.env[NONCE_KEY];

let workDir;
const originalCwd = process.cwd();

beforeEach(async () => {
  workDir = await fs.mkdtemp(path.join(os.tmpdir(), "health-"));
  await fs.mkdir(path.join(workDir, "data"), { recursive: true });
  process.chdir(workDir);
});

afterEach(async () => {
  process.chdir(originalCwd);
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  if (original === undefined) delete process.env[NONCE_KEY];
  else process.env[NONCE_KEY] = original;
});

describe("/api/health", () => {
  it("echoes the launch nonce back verbatim (the shell's identity check)", async () => {
    process.env[NONCE_KEY] = "mtg-12345-9876543210";
    const resp = await GET();
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.nonce).toBe("mtg-12345-9876543210");
    expect(typeof body.pid).toBe("number");
  });

  it("returns nonce:null when no nonce env is set (dev mode) — still ok:true", async () => {
    delete process.env[NONCE_KEY];
    const resp = await GET();
    const body = await resp.json();
    expect(body.ok).toBe(true);
    expect(body.nonce).toBeNull();
  });

  it("sets the CORS header so the tauri-origin placeholder can read the body", async () => {
    const resp = await GET();
    expect(resp.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("reports the freshness identity: version, an 8-hex registryId, the active profile, now", async () => {
    const resp = await GET();
    const body = await resp.json();
    // Same source the route uses (env in dev, the bundled package.json in the .exe).
    expect(body.version).toBe(process.env.npm_package_version || pkg.version);
    expect(body.registryId).toMatch(/^[0-9a-f]{8}$/);
    expect(body.activeProfile).toMatchObject({ name: expect.any(String) });
    expect(body.activeProfile.id).toMatch(/^prof_/);
    expect(typeof body.now).toBe("number");
    expect(body.registryError).toBeNull();
  });

  it("changes registryId when the registry changes — the Sim Center's staleness signal", async () => {
    const first = await (await GET()).json();
    // Mutate the registry via the same module the route reads it through.
    const { createProfile } = await import("../../../lib/server/profiles.js");
    createProfile("Second");
    const second = await (await GET()).json();
    expect(second.registryId).toMatch(/^[0-9a-f]{8}$/);
    expect(second.registryId).not.toBe(first.registryId);
  });
});
