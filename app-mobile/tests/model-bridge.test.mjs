import assert from "node:assert/strict";
import test from "node:test";
import { createModelClient } from "../src/modelBridge.js";

const response = { text: '{"intent":"unknown","cardNames":[],"ruleNumber":null}' };

test("missing token event permission does not prevent local interpretation", async () => {
  const client = createModelClient({
    invokeCommand: async (command) => command.endsWith("status") ? { state: "ready" } : response,
    listen: async () => { throw new Error("listener permission unavailable"); },
  });
  assert.equal((await client.interpret("Hello", () => {})).valid, true);
});

test("late optional listeners are removed and stuck native generation times out", async () => {
  let resolveListener;
  let removed = 0;
  let cancelled = 0;
  const client = createModelClient({
    invokeCommand: async (command) => {
      if (command.endsWith("status")) return { state: "ready" };
      if (command.endsWith("cancel")) { cancelled++; return {}; }
      return new Promise(() => {});
    },
    listen: () => new Promise((resolve) => { resolveListener = resolve; }),
    listenerTimeoutMs: 5, generationTimeoutMs: 10,
  });
  assert.equal((await client.interpret("Hello", () => {})).valid, false);
  resolveListener({ unregister() { removed++; } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(removed, 1);
  assert.equal(cancelled, 1);
});
