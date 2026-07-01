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

describe("pull-model binary resolution (S-P3)", () => {
  it("spawns the absolute Ollama path from findOllamaBinary, not bare 'ollama'", async () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const spawnCalls = [];
    try {
      vi.resetModules();
      vi.doMock("../../../lib/server/ollamaBinary.js", () => ({
        findOllamaBinary: () => "C:\Fake\Ollama\ollama.exe",
      }));
      vi.doMock("node:child_process", () => ({
        spawn: (cmd, args, opts) => {
          spawnCalls.push({ cmd, args, opts });
          // Minimal fake child process: emits close immediately.
          return {
            stdout: { on: () => {} },
            stderr: { on: () => {} },
            on: (event, cb) => {
              if (event === "close") setTimeout(() => cb(0), 0);
            },
          };
        },
      }));
      const mod = await import("./route.js");
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull-model", model: "qwen2.5:14b" }),
      });
      const resp = await mod.POST(req);
      expect(resp.status).toBe(200);
      // Drain the SSE stream so the fake child's close event flushes through.
      await resp.text();
      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("C:\Fake\Ollama\ollama.exe");
      expect(spawnCalls[0].args).toEqual(["pull", "qwen2.5:14b"]);
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.doUnmock("node:child_process");
      vi.doUnmock("../../../lib/server/ollamaBinary.js");
      vi.resetModules();
    }
  });

  it("falls back to bare 'ollama' when no install location is found", async () => {
    const original = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });
    const spawnCalls = [];
    try {
      vi.resetModules();
      vi.doMock("../../../lib/server/ollamaBinary.js", () => ({
        findOllamaBinary: () => null,
      }));
      vi.doMock("node:child_process", () => ({
        spawn: (cmd, args) => {
          spawnCalls.push({ cmd, args });
          return {
            stdout: { on: () => {} },
            stderr: { on: () => {} },
            on: (event, cb) => {
              if (event === "close") setTimeout(() => cb(0), 0);
            },
          };
        },
      }));
      const mod = await import("./route.js");
      const req = new Request("http://localhost/api/install-ollama", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pull-model", model: "qwen2.5:14b" }),
      });
      const resp = await mod.POST(req);
      await resp.text();
      expect(spawnCalls[0].cmd).toBe("ollama");
    } finally {
      Object.defineProperty(process, "platform", { value: original, configurable: true });
      vi.doUnmock("node:child_process");
      vi.doUnmock("../../../lib/server/ollamaBinary.js");
      vi.resetModules();
    }
  });
});
