/**
 * /api/feedback/open — module-load smoke + early-validation contract.
 *
 * Per CLAUDE.md §5 #10. Both error assertions short-circuit before the native
 * shell handoff (the handler validates JSON and the target enum before any
 * spawn), so this never opens a file manager or editor.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function post(body) {
  return new Request("http://localhost/api/feedback/open", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

describe("/api/feedback/open", () => {
  it("exports a POST handler", () => {
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON with 400", async () => {
    const res = await route.POST(post("{ not valid json"));
    expect(res.status).toBe(400);
  });

  it("rejects an unknown target with 400 (before any spawn)", async () => {
    const res = await route.POST(post(JSON.stringify({ target: "evil" })));
    expect(res.status).toBe(400);
  });
});
