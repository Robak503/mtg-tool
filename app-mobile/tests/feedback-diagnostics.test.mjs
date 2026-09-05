import assert from "node:assert/strict";
import test from "node:test";
import { buildDiagnosticReceipt, copyDiagnosticReceipt } from "../src/diagnostics.js";
import { createFeedbackStore } from "../src/feedbackStore.js";

function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
}

test("feedback persists aggregates without accepting conversation text", () => {
  const feedback = createFeedbackStore(memoryStorage());
  feedback.recordRating({ rating: "helpful", status: "grounded", modelRejection: "unavailable", question: "private question", answer: "private answer" });
  feedback.recordCorrection({ status: "grounded", question: "also private" });
  const serialized = JSON.stringify(feedback.snapshot());
  assert.equal(feedback.snapshot().totals.helpful, 1);
  assert.equal(feedback.snapshot().totals.corrected, 1);
  assert.equal(serialized.includes("private"), false);
});

test("diagnostics preserve named engine witnesses from the real WebView smoke shape", () => {
  const receipt = buildDiagnosticReceipt({ runtime: { passed: true, checks: { classifier: true, plot: true, adventure: false } } });
  assert.deepEqual(receipt.runtime.witnesses, [
    { id: "classifier", passed: true }, { id: "plot", passed: true }, { id: "adventure", passed: false },
  ]);
  assert.equal(typeof receipt.app.build, "string");
});

test("diagnostic receipt whitelists receipts and excludes private fields", async () => {
  const receipt = buildDiagnosticReceipt({
    runtime: { passed: true, checks: [{ id: "combat", passed: true }], realm: { processAbsent: true }, private: "question" },
    knowledge: {
      ready: true,
      packId: "pack-1",
      databaseSha256: "abc123",
      artReady: true,
      artPackId: "art-1",
      artDatabaseBytes: 1234,
      artDatabaseSha256: "def456",
      artError: "C:\\secret-art",
      path: "C:\\secret",
    },
    model: { state: "ready", modelId: "enhanced", prompt: "private prompt" },
    lastOutcome: { status: "grounded", modelRejection: null, answer: "private answer" },
    errorCode: "knowledge_unavailable",
    feedback: { schemaVersion: 1, totals: { helpful: 1 }, outcomes: {}, modelRejections: {} },
    generatedAt: "2026-08-30T00:00:00.000Z",
  });
  const text = JSON.stringify(receipt);
  assert.equal(text.includes("private"), false);
  assert.equal(text.includes("secret"), false);
  assert.deepEqual(receipt.runtime.witnesses, [
    { id: "combat", passed: true },
    { id: "processAbsent", passed: true },
  ]);
  assert.deepEqual(receipt.startup, { errorCode: "knowledge_unavailable" });
  assert.deepEqual(receipt.knowledge.art, {
    ready: true,
    packId: "art-1",
    databaseBytes: 1234,
    databaseSha256: "def456",
    error: "unavailable",
  });
  let copied = "";
  assert.equal((await copyDiagnosticReceipt(receipt, { async writeText(value) { copied = value; } })).copied, true);
  assert.equal(copied, JSON.stringify(receipt, null, 2));
});
