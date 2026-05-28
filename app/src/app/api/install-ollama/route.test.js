/**
 * Tests for /api/install-ollama — covers what's testable without
 * actually spawning winget or ollama. The runInstall and streamModelPull
 * functions wrap real subprocesses; integration coverage there happens
 * via the manual .exe smoke-test, not vitest.
 */

import { describe, expect, it, vi } from "vitest";

describe("/api/install-ollama", () => {
  it("imports without throwing", async () => {
    await expect(import("./route.js")).resolves.toBeDefined();
  });

  it("exports GET that returns installed state", async () => {
    const mod = await import("./route.js");
    const resp = await mod.GET(new Request("http://localhost/api/install-ollama"));
    const body = await resp.json();
    expect(typeof body.installed).toBe("boolean");
    expect(body.platform).toBe(process.platform);
  });

  it("POST rejects unknown action with 400", async () => {
    // Force the platform check to pass so we exercise the action dispatch.
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      vi.resetModules();
      const mod = await import("./route.js");
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rm-rf-slash" }),
      });
      const resp = await mod.POST(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain("Unknown action");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
    }
  });

  it("POST rejects invalid JSON with 400", async () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      vi.resetModules();
      const mod = await import("./route.js");
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ broken",
      });
      const resp = await mod.POST(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain("Invalid JSON");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
    }
  });

  it("POST pull-model rejects malformed model names", async () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    try {
      vi.resetModules();
      const mod = await import("./route.js");
      // Names with shell metacharacters should never reach `ollama pull`.
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull-model", model: "qwen; rm -rf /" }),
      });
      const resp = await mod.POST(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain("Invalid model");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
    }
  });

  it("POST rejects non-Windows with 400", async () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "linux", configurable: true });
    try {
      vi.resetModules();
      const mod = await import("./route.js");
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install" }),
      });
      const resp = await mod.POST(req);
      expect(resp.status).toBe(400);
      const body = await resp.json();
      expect(body.error).toContain("Windows");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
    }
  });
});
