/**
 * /api/cards — module-load smoke + early-validation contract.
 *
 * Per CLAUDE.md §5 #10 every route needs at least an import smoke test —
 * the engine route's latent ReferenceError (gotcha #10) is exactly the class
 * these catch (a module/handler that throws on load or on entry). The POST
 * handler also asserts the invalid-JSON guard returns 400 before doing work.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function badJsonPost() {
  return new Request("http://localhost/api/cards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json",
  });
}

describe("/api/cards", () => {
  it("exports GET and POST handlers", () => {
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON on POST with 400", async () => {
    const res = await route.POST(badJsonPost());
    expect(res.status).toBe(400);
  });
});
