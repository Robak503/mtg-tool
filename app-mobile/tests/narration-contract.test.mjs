import assert from "node:assert/strict";
import test from "node:test";
import { renderNarration, validateNarrationTemplate } from "../src/narrationContract.js";

const plan = {
  narrationSlots: [{ name: "RESULT", value: "Verified fact." }, { name: "FOLLOW_UP", value: "Ask another." }],
  fallback: "Verified fact.",
};

test("accepts exactly the two grounded placeholders", () => {
  const result = renderNarration(plan, "{{RESULT}} {{FOLLOW_UP}}");
  assert.deepEqual(result, { text: "Verified fact. Ask another.", usedModel: true, rejection: null });
});

test("rejects missing, duplicate, unknown, and oversized placeholders", () => {
  for (const value of ["{{RESULT}}", "{{RESULT}} {{RESULT}}", "{{RESULT}} {{SECRET}}", "I think {{RESULT}} {{FOLLOW_UP}}", "x".repeat(601)]) {
    assert.equal(validateNarrationTemplate(value).valid, false);
    assert.equal(renderNarration(plan, value).text, plan.fallback);
  }
});
