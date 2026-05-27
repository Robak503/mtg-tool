/**
 * Tests for the client-side chatPersistence module — v2 sessions shape only.
 * The v1 backward-compat shim was removed once PR2's session-manager UI
 * shipped (T20).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let persistence;

beforeEach(async () => {
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
  it("returns the v2 sessions shape directly", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
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
      }),
    });

    const state = await persistence.loadChatState();
    expect(state.version).toBe(2);
    expect(state.sessions).toHaveLength(1);
    expect(state.sessions[0].agent).toBe("jace");
  });

  it("returns null when the server reports no existing file", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ exists: false }),
    });
    const state = await persistence.loadChatState();
    expect(state).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down"));
    const state = await persistence.loadChatState();
    expect(state).toBeNull();
  });
});

describe("beacon path", () => {
  it("sends { sessions } via sendBeacon when there is pending state", async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { sendBeacon });

    const sessions = [{ id: "s1", agent: "jace", messages: [] }];
    persistence.scheduleChatSessionsSave(sessions, 100);

    const ok = persistence.flushChatFileSave({ useBeacon: true });
    expect(ok).toBe(true);

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, blob] = sendBeacon.mock.calls[0];
    expect(url).toBe("/api/chats");
    const body = JSON.parse(await blob.text());
    expect(body.sessions).toEqual(sessions);
    // No v1 keys should ever appear.
    expect(body.histories).toBeUndefined();
    expect(body.locks).toBeUndefined();
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
    expect(body.sessions[0].id).toBe("c");
  });
});
