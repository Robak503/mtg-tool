/**
 * /api/model-calls — module-load smoke.
 *
 * Per CLAUDE.md §5 #10. GET reads the model-call telemetry log; this asserts
 * the module loads and exports its handler (catching the gotcha-#10 class of
 * load-time crash) without depending on any on-disk log fixture.
 */
import { describe, expect, it } from "vitest";

import * as route from "./route.js";

describe("/api/model-calls", () => {
  it("exports a GET handler", () => {
    expect(typeof route.GET).toBe("function");
  });
});
