import assert from "node:assert/strict";
import test from "node:test";
import { createAssistantController } from "../src/assistantController.js";

const omnath = {
  oracleId: "omnath-id",
  name: "Omnath, Locus of Creation",
  matchedName: "Omnath, Locus of Creation",
  manaCost: "{R}{G}{W}{U}",
  typeLine: "Legendary Creature — Elemental",
  oracleText: "Landfall.",
  faces: [],
};

function repository(overrides = {}) {
  return {
    status: { packId: "fixture" },
    async getRuleExact() { return null; },
    async findCardExact() { return null; },
    async searchCards() { return []; },
    async getRulings() { return []; },
    async searchRules() { return []; },
    ...overrides,
  };
}

function model(overrides = {}) {
  return {
    async status() { return { state: "unavailable" }; },
    async prepareDefault() { return { state: "unavailable" }; },
    async interpret() { return { valid: false, reason: "unavailable", candidate: null }; },
    async narrate(plan) { return { text: plan.fallback, usedModel: false, rejection: "unavailable" }; },
    async cancel() {},
    ...overrides,
  };
}

test("boots through runtime and knowledge while model failure stays recoverable", async () => {
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true }),
    openRepository: async () => repository(),
    model: model(),
  });
  const started = await controller.start();
  assert.equal(started.phase, "ready");
  await controller.whenModelSettled();
  assert.equal(controller.getState().model.state, "unavailable");
});

test("does not call narration when the optional model is unavailable", async () => {
  let narrationCalled = false;
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true }),
    openRepository: async () => repository({
      async findCardExact() { return omnath; },
      async getRulings() { return []; },
    }),
    model: model({
      async narrate() {
        narrationCalled = true;
        return new Promise(() => {});
      },
    }),
  });
  await controller.start();
  const result = await controller.ask("What does Omnath, Locus of Creation do?");
  assert.equal(result.answer.status, "grounded");
  assert.equal(result.answer.facts.message, omnath.oracleText);
  assert.equal(narrationCalled, false);
});

test("fails startup closed on a corrupt pack without leaking the exception", async () => {
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true }),
    openRepository: async () => { throw new Error("C:\\private\\pack.sqlite hash mismatch"); },
    model: model(),
  });
  const state = await controller.start();
  assert.equal(state.phase, "error");
  assert.equal(state.errorCode, "knowledge_unavailable");
  assert.equal(state.runtime.passed, true);
  assert.equal(JSON.stringify(state).includes("private"), false);
});

test("retains a privacy-safe failed knowledge receipt for diagnostics", async () => {
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true, checks: [{ id: "classifier", passed: true }] }),
    openRepository: async () => {
      const error = new Error("C:\\private\\pack.sqlite hash mismatch");
      error.knowledgeStatus = {
        ready: false,
        error: "C:\\private\\pack.sqlite hash mismatch",
        databaseBytes: 42,
      };
      throw error;
    },
    model: model(),
  });
  const state = await controller.start();
  assert.equal(state.runtime.passed, true);
  assert.equal(state.knowledge.error, "unavailable");
  assert.equal(state.knowledge.databaseBytes, 42);
  assert.equal(JSON.stringify(state).includes("private"), false);
});

test("accepts model interpretation only after exact repository resolution", async () => {
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true }),
    openRepository: async () => repository({
      async findCardExact(name) { return name === omnath.name ? omnath : null; },
      async getRulings() { return []; },
    }),
    model: model({
      async status() { return { state: "ready" }; },
      async prepareDefault() { return { state: "ready", modelId: "fixture" }; },
      async interpret() {
        return { valid: true, candidate: { intent: "card_lookup", cardNames: [omnath.name], ruleNumber: null } };
      },
    }),
  });
  await controller.start();
  const result = await controller.ask("What does the four-color Omnath do?");
  assert.equal(result.answer.answerTrusted, true);
  assert.equal(result.answer.facts.heading, omnath.name);
});

test("cancellation prevents a late generation from rendering", async () => {
  let finish;
  const generation = new Promise((resolve) => { finish = resolve; });
  const controller = createAssistantController({
    verifyRuntime: async () => ({ passed: true }),
    openRepository: async () => repository({
      async searchCards() { return [omnath]; },
      async getRulings() { return []; },
    }),
    model: model({
      async status() { return { state: "ready" }; },
      async narrate() { return generation; },
    }),
  });
  await controller.start();
  const pending = controller.ask("What does Omnath, Locus of Creation do?");
  await new Promise((resolve) => setImmediate(resolve));
  await controller.cancel();
  finish({ text: "late", usedModel: true, rejection: null });
  assert.equal((await pending).cancelled, true);
  assert.equal(controller.getState().errorCode, "cancelled");
});
