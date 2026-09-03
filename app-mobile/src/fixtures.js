const omnath = {
  oracleId: "fixture-omnath", name: "Omnath, Locus of Creation", matchedName: "Omnath, Locus of Creation",
  manaCost: "{R}{G}{W}{U}", typeLine: "Legendary Creature — Elemental",
  oracleText: "When Omnath enters, draw a card. Landfall — This fixture uses local Oracle text.", faces: [],
};

function repository(mode) {
  return {
    status: { ready: true, schemaVersion: 1, packId: "fixture-pack", databaseBytes: 1024, databaseSha256: "fixture-sha256" },
    async getRuleExact(number) { return mode === "grounded-rule" && number === "702.7" ? { ruleNumber: number, ruleText: "A fixture rule stored on this device.", examples: [] } : null; },
    async findCardExact(name) { return name === omnath.name ? omnath : null; },
    async searchCards() { return mode === "insufficient" ? [] : [omnath]; },
    async getRulings() { return [{ publishedAt: "2026-01-01", comment: "Fixture official ruling." }]; },
    async searchRules() { return mode === "matches" ? [{ ruleNumber: "603.1", ruleText: "A triggered ability has a trigger condition.", examples: [] }] : []; },
  };
}

function fixtureModel(mode) {
  return {
    async status() { return mode === "model-unavailable" ? { state: "unavailable" } : { state: "ready", modelId: "fixture" }; },
    async prepareDefault() { return this.status(); },
    async interpret(_question, onToken) { onToken?.(1); return { valid: false, reason: mode === "model-invalid" ? "invalid-json" : "unavailable", candidate: null }; },
    async narrate(plan, onToken) {
      onToken?.(1);
      return mode === "model-invalid"
        ? { text: plan.fallback, usedModel: false, rejection: "literal-content" }
        : { text: plan.fallback, usedModel: mode !== "model-unavailable", rejection: mode === "model-unavailable" ? "unavailable" : null };
    },
    async cancel() {},
  };
}

export function createFixtureDependencies(name) {
  const mode = name || "ready";
  return {
    verifyRuntime: async () => ({ passed: true, results: [{ id: "fixture-runtime", passed: true }] }),
    openRepository: async () => {
      if (mode === "startup-loading") return new Promise(() => {});
      if (mode === "pack-error") throw new Error("private fixture path");
      return repository(mode);
    },
    model: fixtureModel(mode),
    initialQuestion: {
      grounded: "What does Omnath, Locus of Creation do?",
      "grounded-rule": "Show CR 702.7",
      matches: "How does this mysterious trigger interaction work?",
      insufficient: "Who wins?",
      "model-unavailable": "What does Omnath, Locus of Creation do?",
      "model-invalid": "What does Omnath, Locus of Creation do?",
      cancelled: "What does Omnath, Locus of Creation do?",
    }[mode] ?? null,
    cancelImmediately: mode === "cancelled",
  };
}
