/**
 * /api/chat-stream — module-load smoke + early-validation contract.
 *
 * Per CLAUDE.md §5 #10. Both assertions short-circuit before any model call
 * (the handler validates JSON and the messages array before opening a stream),
 * so this never touches Ollama or Anthropic.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function post(body) {
  return new Request("http://localhost/api/chat-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/chat-stream", () => {
  it("exports a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await route.POST(post("{ not valid json"));
    expect(res.status).toBe(400);
  });

  it("rejects a body without a messages array with 400 (before any model call)", async () => {
    const res = await route.POST(post(JSON.stringify({ provider: "ollama" })));
    expect(res.status).toBe(400);
  });
});
