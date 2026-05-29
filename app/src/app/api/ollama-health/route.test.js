/**
 * Tests for /api/ollama-health — server-down, model-missing, and ok paths.
 *
 * Strategy: stub global fetch (the daemon probe) and mock findOllamaBinary
 * (the Windows install-location check). The latter is host-coupled, so without
 * the mock the "server-down" path is only reachable on a machine that actually
 * has Ollama installed — which is exactly why this used to fail in CI.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Force "Ollama is installed" so the server-down assertions exercise the
// daemon-fetch path deterministically, regardless of the host / CI runner.
vi.mock("../../../lib/server/ollamaBinary.js", () => ({
  findOllamaBinary: () => "C:/Program Files/Ollama/ollama.exe",
}));

let route;

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers();
  // Reset env between tests so a previous test's OLLAMA_MODEL doesn't leak.
  delete process.env.OLLAMA_BASE_URL;
  delete process.env.OLLAMA_MODEL;
  delete process.env.OLLAMA_FAST_MODEL;
  delete process.env.OLLAMA_AGENT_MODEL;
  route = await import("./route.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("server down", () => {
  it("returns ok=false with server-down status when fetch rejects", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("fetch failed"));

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe("server-down");
    expect(data.message).toMatch(/Could not reach Ollama/);
    expect(data.missing).toEqual(data.modelsConfigured);
  });

  it("flags an AbortError as a timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe("server-down");
    expect(data.timeout).toBe(true);
    expect(data.message).toMatch(/3s/);
  });

  it("reports server-down when /api/tags returns a non-200", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe("server-down");
    expect(data.message).toMatch(/500/);
  });
});

describe("model missing", () => {
  it("returns ok=false with model-missing status when configured models aren't pulled", async () => {
    process.env.OLLAMA_MODEL = "qwen2.5:32b";
    process.env.OLLAMA_FAST_MODEL = "qwen2.5:7b";
    process.env.OLLAMA_AGENT_MODEL = "qwen2.5:14b";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: "qwen2.5:7b" }, { name: "qwen2.5:14b" }],
        // 32b is missing
      }),
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe("model-missing");
    expect(data.missing).toEqual(["qwen2.5:32b"]);
    expect(data.message).toMatch(/ollama pull qwen2.5:32b/);
  });

  it("returns all configured models as missing when /api/tags has no models", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [] }),
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(false);
    expect(data.status).toBe("model-missing");
    expect(data.missing.length).toBeGreaterThan(0);
  });
});

describe("healthy", () => {
  it("returns ok=true when all three tiers are pulled", async () => {
    process.env.OLLAMA_MODEL = "qwen2.5:32b";
    process.env.OLLAMA_FAST_MODEL = "qwen2.5:7b";
    process.env.OLLAMA_AGENT_MODEL = "qwen2.5:14b";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [
          { name: "qwen2.5:32b" },
          { name: "qwen2.5:7b" },
          { name: "qwen2.5:14b" },
          { name: "llama3:70b" }, // extra model — fine
        ],
      }),
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.missing).toEqual([]);
    expect(data.modelsConfigured.sort()).toEqual(["qwen2.5:14b", "qwen2.5:32b", "qwen2.5:7b"]);
  });

  it("dedupes configured models when env vars point at the same model", async () => {
    process.env.OLLAMA_MODEL = "qwen2.5:7b";
    process.env.OLLAMA_FAST_MODEL = "qwen2.5:7b";
    process.env.OLLAMA_AGENT_MODEL = "qwen2.5:7b";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ models: [{ name: "qwen2.5:7b" }] }),
    });

    const response = await route.GET();
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.modelsConfigured).toEqual(["qwen2.5:7b"]);
  });
});
