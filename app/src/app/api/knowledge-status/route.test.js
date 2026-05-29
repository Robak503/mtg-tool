/**
 * /api/knowledge-status — module-load smoke.
 *
 * Per CLAUDE.md §5 #10. GET inspects the bundled knowledge directories; this
 * asserts the module loads and exports its handler (catching the gotcha-#10
 * class of load-time crash) without depending on the knowledge dirs being
 * present in the test environment.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

describe("/api/knowledge-status", () => {
  it("exports a GET handler", () => {
    expect(typeof route.GET).toBe("function");
  });
});
