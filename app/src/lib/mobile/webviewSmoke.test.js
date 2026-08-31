import { describe, expect, it } from "vitest";
import { runWebviewSmoke } from "./webviewSmoke.js";

describe("Omnath bundled WebView smoke contract", () => {
  it("passes every deterministic runtime case before browser packaging", () => {
    const result = runWebviewSmoke();
    expect(result.checks).toEqual({
      exactRuntimeExports: true,
      classifier: true,
      plot: true,
      adventure: true,
      emerge: true,
    });
    expect(result.passed).toBe(true);
  });
});
