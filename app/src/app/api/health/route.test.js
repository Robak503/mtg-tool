/**
 * /api/health — the shell's identity gate endpoint. Locks the contract the Rust
 * readiness check depends on: ok:true, the MTG_LAUNCH_NONCE echoed verbatim (null
 * when unset), and a CORS header the tauri-origin placeholder needs to READ the
 * response (an opaque probe can't tell our server from a stale orphan's).
 */
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "./route.js";

const NONCE_KEY = "MTG_LAUNCH_NONCE";
const original = process.env[NONCE_KEY];

afterEach(() => {
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
});
