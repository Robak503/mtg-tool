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
  for (const key of ["MTG_MODEL_PROVIDER", "MODEL_PROVIDER", "ANTHROPIC_API_KEY", "MTG_STREAM_IDLE_TIMEOUT_MS"]) {
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
  for (const key of ["MTG_MODEL_PROVIDER", "MODEL_PROVIDER", "ANTHROPIC_API_KEY", "MTG_STREAM_IDLE_TIMEOUT_MS"]) {
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

describe("streaming idle timeouts (A4)", () => {
  // Decode an enqueued `data: {json}\n\n` chunk back to an object.
  function decodeEvent(u8) {
    const text = new TextDecoder().decode(u8);
    return JSON.parse(text.replace(/^data:\s*/, "").trim());
  }
  function makeController() {
    const events = [];
    return { events, enqueue: (chunk) => events.push(decodeEvent(chunk)) };
  }
  // A body whose reader yields `firstChunk` then stalls forever until the
  // request's AbortController fires — mirrors a stalled upstream stream.
  function stallingBody(firstChunk, signal) {
    let calls = 0;
    return {
      getReader() {
        return {
          read() {
            calls += 1;
            if (calls === 1) {
              return Promise.resolve({ done: false, value: new TextEncoder().encode(firstChunk) });
            }
            return new Promise((_resolve, reject) => {
              const onAbort = () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
              if (signal?.aborted) onAbort();
              else signal?.addEventListener("abort", onAbort, { once: true });
            });
          },
          cancel() {},
        };
      },
    };
  }
  // A body whose reader yields the given chunks then completes cleanly.
  function completingBody(chunks) {
    let i = 0;
    return {
      getReader() {
        return {
          read() {
            if (i < chunks.length) {
              const value = new TextEncoder().encode(chunks[i]);
              i += 1;
              return Promise.resolve({ done: false, value });
            }
            return Promise.resolve({ done: true, value: undefined });
          },
          cancel() {},
        };
      },
    };
  }

  // Set a short idle timeout + a custom fetch, then reload the module so the
  // env-driven STREAM_IDLE_TIMEOUT_MS takes effect.
  async function loadStreamingModule(setup) {
    process.env.MTG_STREAM_IDLE_TIMEOUT_MS = "40";
    setup();
    vi.resetModules();
    return import("./modelProvider.js");
  }

  it("ollama: a stalled body times out instead of hanging", async () => {
    const streaming = await loadStreamingModule(() => {
      globalThis.fetch = vi.fn(async (_url, options) => ({
        ok: true,
        status: 200,
        body: stallingBody('{"message":{"content":"hi"}}\n', options.signal),
      }));
    });
    const controller = makeController();
    const result = await streaming.streamOllamaMessages(
      { messages: [{ role: "user", content: "go" }] },
      controller
    );
    expect(controller.events.some(e => e.type === "text_delta" && e.text === "hi")).toBe(true);
    const err = controller.events.find(e => e.type === "error");
    expect(err).toBeTruthy();
    expect(err.timeout).toBe(true);
    expect(err.error).toMatch(/stalled/i);
    expect(result.errorOccurred).toMatch(/stalled/i);
  });

  it("ollama: a normally-completing stream emits done with no error", async () => {
    const streaming = await loadStreamingModule(() => {
      globalThis.fetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        body: completingBody(['{"message":{"content":"hi"}}\n', '{"done":true,"eval_count":2}\n']),
      }));
    });
    const controller = makeController();
    const result = await streaming.streamOllamaMessages(
      { messages: [{ role: "user", content: "go" }] },
      controller
    );
    expect(controller.events.some(e => e.type === "text_delta")).toBe(true);
    expect(controller.events.some(e => e.type === "done")).toBe(true);
    expect(controller.events.some(e => e.type === "error")).toBe(false);
    expect(result.errorOccurred).toBeNull();
  });

  it("anthropic: a stalled body times out instead of hanging", async () => {
    const streaming = await loadStreamingModule(() => {
      process.env.ANTHROPIC_API_KEY = "sk-ant-stream-test";
      globalThis.fetch = vi.fn(async (_url, options) => ({
        ok: true,
        status: 200,
        body: stallingBody(
          'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}\n',
          options.signal
        ),
      }));
    });
    const controller = makeController();
    const result = await streaming.streamAnthropicMessages(
      { messages: [{ role: "user", content: "go" }] },
      controller
    );
    expect(controller.events.some(e => e.type === "text_delta" && e.text === "hi")).toBe(true);
    const err = controller.events.find(e => e.type === "error");
    expect(err).toBeTruthy();
    expect(err.timeout).toBe(true);
    expect(err.error).toMatch(/stalled/i);
    expect(result.errorOccurred).toMatch(/stalled/i);
  });

  it("ollama: a model-too-big memory error falls back to the fast model with a notice (B3)", async () => {
    const streaming = await loadStreamingModule(() => {
      globalThis.fetch = vi.fn(async (_url, options) => {
        const reqModel = JSON.parse(options.body).model;
        // The big model can't load; the fast model answers.
        if (reqModel !== "qwen2.5:7b") {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: "model requires more system memory (18.0 GiB) than is available (12.0 GiB)" }),
          };
        }
        return { ok: true, status: 200, body: completingBody(['{"message":{"content":"ok"}}\n', '{"done":true,"eval_count":3}\n']) };
      });
    });
    const controller = makeController();
    const result = await streaming.streamOllamaMessages(
      { messages: [{ role: "user", content: "go" }], ollamaModel: "qwen2.5:14b" },
      controller
    );
    const notice = controller.events.find(e => e.type === "notice");
    expect(notice).toBeTruthy();
    expect(notice.notice).toMatch(/qwen2\.5:7b/);
    expect(controller.events.some(e => e.type === "text_delta" && e.text === "ok")).toBe(true);
    expect(controller.events.some(e => e.type === "error")).toBe(false);
    expect(result.model).toBe("qwen2.5:7b"); // resolved to the fallback
  });

  it("ollama: does not show the raw VRAM string when the fast model itself OOMs", async () => {
    const streaming = await loadStreamingModule(() => {
      globalThis.fetch = vi.fn(async () => ({
        ok: false,
        status: 500,
        json: async () => ({ error: "model requires more system memory than is available" }),
      }));
    });
    const controller = makeController();
    await streaming.streamOllamaMessages(
      { messages: [{ role: "user", content: "go" }], ollamaModel: "qwen2.5:7b" }, // already the fast model
      controller
    );
    const err = controller.events.find(e => e.type === "error");
    expect(err).toBeTruthy();
    expect(err.error).not.toMatch(/system memory|GiB/i); // scrubbed
    expect(err.error).toMatch(/Not enough memory/i);
  });
});
