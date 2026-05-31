/**
 * Tests for the local-first provider allowlist (CLAUDE.md §1.1).
 *
 * Security-critical invariant: a mistyped / unknown provider string must
 * resolve to local Ollama, NEVER Anthropic — a typo cannot spend API credits.
 * Only the explicit "anthropic" / "api" aliases reach the cloud; "auto" opts
 * into local-first-with-fallback.
 *
 * Routing tests mock global fetch so they never touch a real model server.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let tmpDir;
let originalCwd;
let originalFetch;
const savedEnv = {};
let mod;
let fetchedUrls;

async function loadModule() {
  vi.resetModules();
  mod = await import("./modelProvider.js");
}

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "model-provider-test-"));
  originalCwd = process.cwd();
  process.chdir(tmpDir);

  // Deterministic env: no ambient provider override, no real API key by default.
  for (const key of ["MTG_MODEL_PROVIDER", "MODEL_PROVIDER", "ANTHROPIC_API_KEY"]) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }

  originalFetch = globalThis.fetch;
  fetchedUrls = [];
  globalThis.fetch = vi.fn(async (url) => {
    fetchedUrls.push(String(url));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        message: { content: "hi" },
        content: [{ type: "text", text: "hi" }],
        eval_count: 1,
      }),
    };
  });

  await loadModule();
});

afterEach(async () => {
  globalThis.fetch = originalFetch;
  for (const key of ["MTG_MODEL_PROVIDER", "MODEL_PROVIDER", "ANTHROPIC_API_KEY"]) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  process.chdir(originalCwd);
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("normalizeProvider", () => {
  it("maps the explicit cloud aliases to anthropic", () => {
    expect(mod.normalizeProvider("anthropic")).toBe("anthropic");
    expect(mod.normalizeProvider("api")).toBe("anthropic");
    expect(mod.normalizeProvider("  ANTHROPIC  ")).toBe("anthropic");
    expect(mod.normalizeProvider("Api")).toBe("anthropic");
  });

  it("maps auto to auto", () => {
    expect(mod.normalizeProvider("auto")).toBe("auto");
    expect(mod.normalizeProvider(" AUTO ")).toBe("auto");
  });

  it("maps ollama/local and the Fast/Deep tier names to ollama", () => {
    for (const v of ["ollama", "local", "fast", "deep", "LOCAL", "Ollama"]) {
      expect(mod.normalizeProvider(v)).toBe("ollama");
    }
  });

  it("maps unknown / empty / typo / non-string values to ollama, never anthropic", () => {
    for (const v of ["", " ", "ollamaa", "anthropc", "antropic", "openai", "xyz", null, undefined, 42, {}]) {
      expect(mod.normalizeProvider(v)).toBe("ollama");
    }
  });
});

describe("selectedProvider", () => {
  it("defaults to ollama when nothing is requested", () => {
    expect(mod.selectedProvider(undefined)).toBe("ollama");
    expect(mod.selectedProvider("")).toBe("ollama");
  });

  it("normalizes a requested value through the allowlist", () => {
    expect(mod.selectedProvider("api")).toBe("anthropic");
    expect(mod.selectedProvider("nonsense")).toBe("ollama");
  });
});

describe("callModelMessages routing (a typo must not bill the user)", () => {
  const body = (provider) => ({ provider, messages: [{ role: "user", content: "hi" }] });
  const hitOllama = () => fetchedUrls.some((u) => u.includes("11434"));
  const hitAnthropic = () => fetchedUrls.some((u) => u.includes("api.anthropic.com"));

  it("routes a typo'd provider to Ollama, never Anthropic — even with a key set", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-routing-test";
    await mod.callModelMessages(body("anthropc")); // missing an 'i'
    expect(hitOllama()).toBe(true);
    expect(hitAnthropic()).toBe(false);
  });

  it("routes explicit 'anthropic' to Anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-routing-test";
    await mod.callModelMessages(body("anthropic"));
    expect(hitAnthropic()).toBe(true);
  });

  it("routes explicit 'api' to Anthropic", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-routing-test";
    await mod.callModelMessages(body("api"));
    expect(hitAnthropic()).toBe(true);
  });

  it("routes 'ollama' to Ollama", async () => {
    await mod.callModelMessages(body("ollama"));
    expect(hitOllama()).toBe(true);
    expect(hitAnthropic()).toBe(false);
  });

  it("routes the default (no provider) to Ollama", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-routing-test";
    await mod.callModelMessages({ messages: [{ role: "user", content: "hi" }] });
    expect(hitOllama()).toBe(true);
    expect(hitAnthropic()).toBe(false);
  });
});
