import assert from "node:assert/strict";
import test from "node:test";
import { planOfflineAnswer } from "../src/answerPlanner.js";

function repository(overrides = {}) {
  return {
    async getRuleExact() {
      return null;
    },
    async getRuleSection() {
      return [];
    },
    async findCardExact() {
      return null;
    },
    async searchCards() {
      return [];
    },
    async getRulings() {
      return [];
    },
    async searchRules() {
      return [];
    },
    ...overrides,
  };
}

const omnath = {
  oracleId: "omnath-id",
  name: "Omnath, Locus of Creation",
  matchedName: "Omnath, Locus of Creation",
  manaCost: "{R}{G}{W}{U}",
  typeLine: "Legendary Creature — Elemental",
  oracleText: "When Omnath enters, draw a card.",
  faces: [],
};

test("quotes exact card text and ruling receipts when the full card is named", async () => {
  const answer = await planOfflineAnswer(
    repository({
      async searchCards() {
        return [omnath];
      },
      async getRulings() {
        return [
          { publishedAt: "2020-09-25", comment: "A verified ruling." },
        ];
      },
    }),
    "What does Omnath, Locus of Creation do?",
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.answerTrusted, true);
  assert.equal(answer.facts.message, omnath.oracleText);
  assert.equal(answer.citations[0].kind, "oracle-card");
  assert.equal(answer.citations[1].kind, "official-ruling");
});

test("extracts the exact card name from a natural card question before searching", async () => {
  const answer = await planOfflineAnswer(
    repository({
      async findCardExact(name) {
        assert.equal(name, "Omnath, Locus of Creation");
        return omnath;
      },
    }),
    "What does Omnath, Locus of Creation do?",
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.facts.heading, "Omnath, Locus of Creation");
  assert.equal(answer.facts.message, omnath.oracleText);
});

test("quotes an exact CR rule when a number is supplied", async () => {
  const answer = await planOfflineAnswer(
    repository({
      async getRuleExact(number) {
        return {
          ruleNumber: number,
          ruleText: "A verified rule.",
          examples: [],
        };
      },
    }),
    "Show CR 702.7",
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.answerTrusted, true);
  assert.equal(answer.facts.heading, "Rule 702.7");
  assert.deepEqual(answer.citations.map(({ label }) => label), [
    "Comprehensive Rules 702.7",
  ]);
});

test("expands a numbered CR section into its verified subrules", async () => {
  const section = [
    { ruleNumber: "702.7", ruleText: "First Strike", examples: [] },
    { ruleNumber: "702.7a", ruleText: "First strike is a static ability.", examples: [] },
    { ruleNumber: "702.7b", ruleText: "A second combat damage step is created.", examples: [] },
  ];
  const answer = await planOfflineAnswer(
    repository({
      async getRuleExact() { return section[0]; },
      async getRuleSection() { return section; },
    }),
    "Show CR 702.7",
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.facts.subheading, "First Strike");
  assert.equal(answer.facts.message, `CR 702.7a — ${section[1].ruleText}`);
  assert.deepEqual(answer.relatedRules.map(({ ruleNumber }) => ruleNumber), ["702.7b"]);
  assert.deepEqual(answer.citations.map(({ ruleNumber }) => ruleNumber), ["702.7", "702.7a", "702.7b"]);
});

test("grounds a plain-language rule definition only when the CR title matches exactly", async () => {
  const section = [
    { ruleNumber: "702.7", ruleText: "First Strike", examples: [] },
    { ruleNumber: "702.7a", ruleText: "First strike is a static ability.", examples: [] },
  ];
  const answer = await planOfflineAnswer(
    repository({
      async searchRules(text) {
        assert.equal(text, "first strike");
        return [section[0]];
      },
      async getRuleSection() { return section; },
    }),
    "Explain first strike",
  );
  assert.equal(answer.status, "grounded");
  assert.equal(answer.answerTrusted, true);
  assert.equal(answer.facts.heading, "Rule 702.7");
  assert.equal(answer.facts.message, `CR 702.7a — ${section[1].ruleText}`);
});

test("fails closed when retrieved matches do not prove an answer", async () => {
  const answer = await planOfflineAnswer(
    repository({
      async searchRules() {
        return [
          { ruleNumber: "603.1", ruleText: "A triggered ability has a trigger condition." },
        ];
      },
    }),
    "Does the mysterious combo work?",
  );
  assert.equal(answer.status, "matches");
  assert.equal(answer.answerTrusted, false);
  assert.match(answer.facts.message, /not enough/i);
});

test("never fabricates a ruling when retrieval is empty", async () => {
  const answer = await planOfflineAnswer(repository(), "Who wins this weird interaction?");
  assert.equal(answer.status, "insufficient");
  assert.equal(answer.answerTrusted, false);
  assert.equal(answer.citations.length, 0);
  assert.match(answer.facts.message, /won’t invent/i);
});

test("does not mark a named interaction trusted without a deterministic verdict", async () => {
  const answer = await planOfflineAnswer(
    repository({
      async searchCards() { return [omnath]; },
      async getRulings() { return []; },
    }),
    "Does Omnath, Locus of Creation interact with this trigger?",
  );
  assert.equal(answer.status, "matches");
  assert.equal(answer.answerTrusted, false);
  assert.match(answer.facts.message, /not a complete ruling|still needs/i);
});
