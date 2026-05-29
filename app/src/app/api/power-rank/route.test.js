/**
 * /api/power-rank — module-load smoke + early-validation contract.
 *
 * Per CLAUDE.md §5 #10. The deterministic scorer itself is covered in
 * powerRanker.test.js; this guards the route wrapper against load-time and
 * entry-time crashes (gotcha #10) and confirms the invalid-JSON guard.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

function badJsonPost() {
  return new Request("http://localhost/api/power-rank", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{ not valid json",
  });
}

describe("/api/power-rank", () => {
  it("exports GET and POST handlers", () => {
    expect(typeof route.GET).toBe("function");
    expect(typeof route.POST).toBe("function");
  });

  it("rejects invalid JSON on POST with 400", async () => {
    const res = await route.POST(badJsonPost());
    expect(res.status).toBe(400);
  });
});
