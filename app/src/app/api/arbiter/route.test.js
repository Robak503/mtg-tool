/**
 * /api/arbiter — locks the Ollama-only invariant.
 *
 * CLAUDE.md §6 (and the inline comment at route.js:196) make this a hard
 * rule: Arbiter is a local-only rules engine. It must call Ollama and NEVER
 * Anthropic, regardless of what provider/tier/model the caller passes — even
 * when the user has the "API" tier selected in the header and the client
 * forwards `provider: "anthropic"`. Routing Arbiter to a paid API would break
 * both the local-first prime directive and the cost model.
 *
 * The review found the invariant holds (route.js hardcodes `provider:"ollama"`)
 * but was UNTESTED, so a future refactor that read `body.provider` could
 * silently regress it. These tests are that regression guard.
 *
 * Everything external is mocked so the suite is hermetic: the model call is
 * captured (never hits a real LLM), and rules/card lookups return fixtures so
 * the handler reaches the model-call path without a bundled index.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports, so the spy must be created via
// vi.hoisted to exist when the factory runs.
const { callModelMessagesMock } = vi.hoisted(() => ({ callModelMessagesMock: vi.fn() }));

vi.mock("../../../lib/server/modelProvider", () => ({
  callModelMessages: callModelMessagesMock,
}));

// Return a high-confidence rule so the handler skips the retrieval-miss branch
// and reaches the model call (the only place provider is chosen).
vi.mock("../../../lib/server/rulesRetrieval.js", () => ({
  retrieveRules: () => ({
    rules: [{ ruleNumber: "117.3a", text: "A player who has priority may cast a spell." }],
    cardNames: [],
    rulesGuruPrecedents: [],
    confidence: "high",
  }),
}));

vi.mock("../../../lib/server/cardIndex.js", () => ({
  lookupCard: () => null,
}));

import { POST } from "./route.js";

function arbiterRequest(body) {
  return new Request("http://localhost/api/arbiter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  callModelMessagesMock.mockReset();
  // A well-formed successful trace that only cites the allowed rule, so the
  // citation stripper leaves it intact.
  callModelMessagesMock.mockResolvedValue({
    ok: true,
    provider: "ollama",
    status: 200,
    data: {
      content: [
        { text: "STATE\n- ok\n\nRESOLUTION\n1. step\n\nRULE TRACE\n- [117.3a] text\n\nCITATIONS\n[117.3a]" },
      ],
    },
  });
});

describe("Arbiter ollama-only invariant", () => {
  it("pins provider to ollama even when the caller forwards anthropic + API tier", async () => {
    await POST(
      arbiterRequest({
        question: "Does a dies trigger see the creature that died?",
        provider: "anthropic",
        tier: "api",
        model: "claude-3-5-sonnet-latest",
      }),
    );

    expect(callModelMessagesMock).toHaveBeenCalledTimes(1);
    const payload = callModelMessagesMock.mock.calls[0][0];
    expect(payload.provider).toBe("ollama");
    expect(payload.provider).not.toBe("anthropic");
  });

  it("stays ollama in fast mode too", async () => {
    await POST(arbiterRequest({ question: "x", provider: "anthropic", fast: true }));
    const payload = callModelMessagesMock.mock.calls[0][0];
    expect(payload.provider).toBe("ollama");
  });

  it("never forwards an anthropic provider no matter what the body claims", async () => {
    for (const hostile of [
      { question: "a", provider: "anthropic" },
      { question: "b", provider: "ANTHROPIC" },
      { question: "c", provider: "api", anthropic: true },
      { question: "d", useAnthropic: true },
    ]) {
      callModelMessagesMock.mockClear();
      await POST(arbiterRequest(hostile));
      const payload = callModelMessagesMock.mock.calls[0][0];
      expect(payload.provider).toBe("ollama");
    }
  });

  it("response provider reflects the model layer's ollama result, never anthropic", async () => {
    const resp = await POST(arbiterRequest({ question: "x", provider: "anthropic" }));
    const json = await resp.json();
    expect(json.provider).toBe("ollama");
  });

  it("the deterministic (validation) path also never touches a provider call", async () => {
    // validationMode short-circuits before any model call — no provider is
    // selected at all, which is trivially safe. Assert the model layer is
    // never invoked on this path.
    const resp = await POST(arbiterRequest({ question: "x", provider: "anthropic", validationMode: true }));
    const json = await resp.json();
    expect(callModelMessagesMock).not.toHaveBeenCalled();
    expect(json.provider).toBe("deterministic");
  });
});
