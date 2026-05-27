/**
 * Tests for the client-side chatPersistence module — beacon path payload
 * shape, sessions save shape, and the v2→v1 shim returned by loadChatState.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let persistence;

beforeEach(async () => {
  // Reset module state so the debounce timer/pending state cannot bleed.
  vi.resetModules();
  vi.useFakeTimers();
  persistence = await import("./chatPersistence.js");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("loadChatState", () => {
  it("returns sessions plus the v1-shim histories/locks projection", async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        version: 2,
        exists: true,
        sessions: [{
          id: "s1",
          agent: "jace",
          messages: [{ role: "user", content: "hi" }],
          lockedDeck: { name: "Atraxa" },
        }],
        histories: {
          jace: [{ role: "user", content: "hi" }],
          karn: [],
          tibalt: [],
          arbiter: [],
        },
        locks: { jace: { name: "Atraxa" }, karn: null, tibalt: null, arbiter: null },
      }),
    };
    globalThis.fetch = vi.fn().mockResolvedValue(mockResponse);

    const state = await persistence.loadChatState();
    expect(state.version).toBe(2);
    expect(state.sessions).toHaveLength(1);
    expect(state.histories.jace).toHaveLength(1);
    expect(state.histories.karn).toEqual([]);
    expect(state.locks.jace.name).toBe("Atraxa");
  });

  it("returns null when the server reports no existing file", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exists: false }),
    });

    const state = await persistence.loadChatState();
    expect(state).toBeNull();
  });
});

describe("beacon path", () => {
  it("sends { sessions } when the pending state is sessions-shaped", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });

    const sessions = [{ id: "s1", agent: "jace", messages: [] }];
    persistence.scheduleChatSessionsSave(sessions, 100);
    // Do NOT advance timers — we want to test that flush picks up the pending state.

    const ok = persistence.flushChatFileSave({ useBeacon: true });
    expect(ok).toBe(true);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe("/api/chats");
    const body = JSON.parse(await blob.text());
    expect(body.sessions).toEqual(sessions);
    expect(body.histories).toBeUndefined();
  });

  it("sends { histories, locks } when called via the v1 shim", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });

    persistence.scheduleChatFileSave({ jace: [{ role: "user", content: "x" }] }, { jace: null });
    persistence.flushChatFileSave({ useBeacon: true });

    const [, blob] = sendBeacon.mock.calls[0];
    const body = JSON.parse(await blob.text());
    expect(body.histories.jace).toHaveLength(1);
    expect(body.sessions).toBeUndefined();
  });

  it("returns true when no save is pending (nothing to flush)", () => {
    const ok = persistence.flushChatFileSave({ useBeacon: true });
    expect(ok).toBe(true);
  });
});

describe("debounced save", () => {
  it("coalesces multiple schedule calls into a single fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    globalThis.fetch = fetchMock;

    persistence.scheduleChatSessionsSave([{ id: "a", agent: "jace", messages: [] }], 500);
    persistence.scheduleChatSessionsSave([{ id: "b", agent: "jace", messages: [] }], 500);
    persistence.scheduleChatSessionsSave([{ id: "c", agent: "jace", messages: [] }], 500);

    vi.advanceTimersByTime(600);
    await vi.runAllTimersAsync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    // Latest pending state wins (id=c).
    expect(body.sessions[0].id).toBe("c");
  });
});
