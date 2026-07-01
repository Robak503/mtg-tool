/**
 * originGuard.test.js — the cross-origin write gate (S-P1-4).
 *
 * Covers the pure policy (isAllowedOrigin / shouldBlockOrigin) AND the
 * src/middleware.js wrapper itself — the wrapper uses only web-standard
 * Request/Response, so the exact production code path is testable here even
 * though vitest never boots the Next server.
 */
import { describe, expect, it } from "vitest";

import { isAllowedOrigin, shouldBlockOrigin } from "./originGuard.js";
import { middleware } from "../../middleware.js";

describe("isAllowedOrigin", () => {
  it("passes when no Origin header is present (curl, scripts, server-side)", () => {
    expect(isAllowedOrigin(null)).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("")).toBe(true);
  });

  it("allows the three local app origins", () => {
    expect(isAllowedOrigin("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedOrigin("http://localhost:3000")).toBe(true);
    expect(isAllowedOrigin("tauri://localhost")).toBe(true);
  });

  it("rejects everything else, including 'null' and near-misses", () => {
    expect(isAllowedOrigin("https://evil.example")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false); // sandboxed iframe
    expect(isAllowedOrigin("http://127.0.0.1:3001")).toBe(false);
    expect(isAllowedOrigin("https://127.0.0.1:3000")).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000/")).toBe(false); // trailing slash is not how browsers send it
    expect(isAllowedOrigin("http://evil.example#http://127.0.0.1:3000")).toBe(false);
  });
});

describe("shouldBlockOrigin", () => {
  it("never blocks safe methods, whatever the origin", () => {
    expect(shouldBlockOrigin("GET", "https://evil.example")).toBe(false);
    expect(shouldBlockOrigin("HEAD", "https://evil.example")).toBe(false);
    expect(shouldBlockOrigin("OPTIONS", "https://evil.example")).toBe(false);
  });

  it("blocks state-changing methods from a disallowed origin", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(shouldBlockOrigin(method, "https://evil.example")).toBe(true);
    }
    expect(shouldBlockOrigin("post", "null")).toBe(true); // method case-insensitive
  });

  it("passes state-changing methods with no Origin or a local origin", () => {
    expect(shouldBlockOrigin("POST", null)).toBe(false);
    expect(shouldBlockOrigin("DELETE", "http://127.0.0.1:3000")).toBe(false);
    expect(shouldBlockOrigin("POST", "http://localhost:3000")).toBe(false);
    expect(shouldBlockOrigin("PUT", "tauri://localhost")).toBe(false);
  });
});

describe("middleware wrapper", () => {
  const url = "http://127.0.0.1:3000/api/decks";

  it("403s a cross-origin POST with a JSON error body", async () => {
    const res = middleware(
      new Request(url, { method: "POST", headers: { origin: "https://evil.example" } }),
    );
    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toMatch(/cross-origin request blocked/i);
  });

  it("lets a same-origin POST continue (returns nothing)", () => {
    expect(
      middleware(new Request(url, { method: "POST", headers: { origin: "http://127.0.0.1:3000" } })),
    ).toBeUndefined();
  });

  it("lets an Origin-less POST continue (curl, scripts)", () => {
    expect(middleware(new Request(url, { method: "POST" }))).toBeUndefined();
  });

  it("lets a cross-origin GET continue (reads are not gated)", () => {
    expect(
      middleware(new Request(url, { method: "GET", headers: { origin: "https://evil.example" } })),
    ).toBeUndefined();
  });
});
