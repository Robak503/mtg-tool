import assert from "node:assert/strict";
import test from "node:test";
import {
  deterministicIntent,
  resolveInterpretation,
  validateInterpretation,
} from "../src/interpretationContract.js";

const omnath = { oracleId: "omnath", name: "Omnath, Locus of Creation" };

test("accepts only the closed interpretation JSON shape", () => {
  const accepted = validateInterpretation(JSON.stringify({
    intent: "card_lookup",
    cardNames: ["Omnath, Locus of Creation"],
    ruleNumber: null,
  }));
  assert.equal(accepted.valid, true);
  for (const candidate of [
    "```json {} ```",
    JSON.stringify({ intent: "card_lookup", cardNames: ["Omnath"], ruleNumber: null, answer: "yes" }),
    JSON.stringify({ intent: "card_lookup", cardNames: ["Omnath", "Omnath"], ruleNumber: null }),
    JSON.stringify({ intent: "rule_lookup", cardNames: [], ruleNumber: "not-a-rule" }),
  ]) assert.equal(validateInterpretation(candidate).valid, false);
});

test("resolves every model proposal against exact local records", async () => {
  const repository = {
    async findCardExact(name) { return name === omnath.name ? omnath : null; },
    async getRuleExact(number) { return number === "702.7" ? { ruleNumber: number } : null; },
  };
  const card = await resolveInterpretation(repository, {
    intent: "card_lookup",
    cardNames: [omnath.name],
    ruleNumber: null,
  });
  assert.equal(card.valid, true);
  assert.equal(card.interpretation.cards[0], omnath);
  assert.equal((await resolveInterpretation(repository, {
    intent: "card_lookup",
    cardNames: ["Invented Card"],
    ruleNumber: null,
  })).reason, "unresolved-card");
});

test("deterministic intent keeps interactions out of trusted card lookup", () => {
  assert.equal(deterministicIntent("Show CR 702.7"), "rule_lookup");
  assert.equal(deterministicIntent("What does Omnath, Locus of Creation do?"), "card_lookup");
  assert.equal(deterministicIntent("Does Omnath interact with my trigger?"), "interaction");
});
