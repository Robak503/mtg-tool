/**
 * subtypeScopedTriggers.test.js — FRONTIER round 3 (v0.49.0). Two reuse-an-existing-system seams:
 *
 *  (A) FILTERED MASS-COUNTER — "put N +1/+1 counter(s) on each <filter> you control" where the filter is
 *      "other" (CR 113.7 self-exclude), a curated subtype (Vampire/Elf/…), or an artifact/enchantment creature.
 *      The resolver was ALREADY built: scope:"youControl" routes through controllerCreatureTargets, which
 *      honors excludeSource + subtypeFilter (the SAME gatherer the team-pump "other/<Subtype>s you control"
 *      parser feeds). This slice only taught addCounterClauseParser to EMIT those fields (counters.js).
 *      Flips: Ridgescale Tusker, Web-Warriors, The Falcon, Cordial Vampire, Indulgent Aristocrat, Steel Overseer.
 *
 *  (B) SUBTYPE-SCOPED ETB/dies trigger — "a/an <Subtype> you control enters" (Bishop of Wings — "an Angel you
 *      control enters") and the "an"-article + type-word-guard fix for the existing "a <Subtype> you control
 *      dies" matcher. Maps to subtypeYouControl, whose runtime gate (scopeMatches) fires only when the
 *      triggering permanent's type line carries the subtype AND it's the source-controller's — so the metric
 *      credits EXACTLY the cards the runtime plays (lands fire it too: applyPlayLand → checkEnterTriggers, so
 *      Dread Presence "a Swamp you control enters" / Battlewand Oak "a Forest you control enters" resolve).
 *
 * CREED: every flip models the WHOLE card; a non-curated filter word ("Villain"/"Fractal"), a card-TYPE subject
 * ("a permanent you control"), or a scope-inexpressible restriction stays body-only/Arbiter (anti-FP pins below).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { enterPermanent } from "./resolvers.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

function stateWith(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const flushResolve = (s) => resolveTopOfStack(flushTriggers(s, { chooseTargets: () => ({}) }));

// ===================================================================================================
// BUCKET A — FILTERED MASS-COUNTER
// ===================================================================================================
describe("FILTERED MASS-COUNTER — parser emits the scope-narrowing fields", () => {
  const parse = (clause) => parseEffectClause(clause, "Instant");
  it("'each other creature you control' → add-counter scope:youControl excludeSource (HIGH)", () => {
    const p = parse("put a +1/+1 counter on each other creature you control");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", scope: "youControl", excludeSource: true, amount: 1 });
  });
  it("'each Vampire you control' → subtypeFilter Vampire (HIGH)", () => {
    const p = parse("put a +1/+1 counter on each Vampire you control");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", scope: "youControl", subtypeFilter: "Vampire" });
  });
  it("'each artifact creature you control' → subtypeFilter Artifact; two-counter Elf → amount 2", () => {
    expect(parse("put a +1/+1 counter on each artifact creature you control").atoms[0]).toMatchObject({ subtypeFilter: "Artifact" });
    expect(parse("put two +1/+1 counters on each Elf you control").atoms[0]).toMatchObject({ subtypeFilter: "Elf", amount: 2 });
  });
  it("CREED — a non-curated filter word ('Villain') or a non-subtype adjective ('tapped') stays LOW (Arbiter)", () => {
    expect(programConfidence(parse("put a +1/+1 counter on each Villain you control"))).toBe("low");
    expect(programConfidence(parse("put a +1/+1 counter on each tapped creature you control"))).toBe("low");
  });
});

describe("FILTERED MASS-COUNTER — runtime places the counters on exactly the filtered set", () => {
  it("'each other creature you control' buffs the team but NOT the source, NOT the opponent's", () => {
    // Source = an ETB watcher; one friendly other creature; one opponent creature.
    const tusker = createPermanent({ id: "src", card: { name: "Ridgescale Tusker", type: "Creature — Dinosaur", power: 4, toughness: 4, oracle: "When this creature enters, put a +1/+1 counter on each other creature you control." }, controller: "user" });
    const friend = createPermanent({ id: "fr", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const foe = createPermanent({ id: "foe", card: { name: "Foe", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai" });
    let s = stateWith();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [friend] }, ai: { ...s.players.ai, battlefield: [foe] } } };
    s = enterPermanent(s, tusker.card, "user", { printedCard: tusker.card }); // enters → fires its own ETB
    s = flushResolve(s);
    const bf = s.players.user.battlefield;
    expect(bf.find((p) => p.id === "fr").counters?.["+1/+1"]).toBe(1);      // friendly OTHER creature buffed
    const srcPerm = bf.find((p) => p.card.name === "Ridgescale Tusker");
    expect(srcPerm.counters?.["+1/+1"] || 0).toBe(0);                        // source EXCLUDED (CR 113.7)
    expect(s.players.ai.battlefield.find((p) => p.id === "foe").counters?.["+1/+1"] || 0).toBe(0); // opp untouched
  });

  it("'each Vampire you control' (Cordial Vampire dies-trigger) buffs only Vampires", () => {
    const cordial = createPermanent({ id: "cv", card: { name: "Cordial Vampire", type: "Creature — Vampire", power: 2, toughness: 2, oracle: "Whenever this creature or another creature dies, put a +1/+1 counter on each Vampire you control." }, controller: "user" });
    const vamp2 = createPermanent({ id: "v2", card: { name: "Vamp Friend", type: "Creature — Vampire", power: 1, toughness: 1, oracle: "" }, controller: "user" });
    const elf = createPermanent({ id: "elf", card: { name: "Elf", type: "Creature — Elf", power: 1, toughness: 1, oracle: "" }, controller: "user" });
    let s = stateWith();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [cordial, vamp2, elf] } } };
    // A creature died (fed the dead look-back exactly as destroyLethalCreatures would).
    s = checkDiesTriggers(s, [{ id: "dead", controller: "user", card: { name: "Token", type: "Creature — Soldier" } }]);
    s = flushResolve(s);
    const bf = s.players.user.battlefield;
    expect(bf.find((p) => p.id === "cv").counters?.["+1/+1"]).toBe(1);       // the Vampire source IS a Vampire → buffed
    expect(bf.find((p) => p.id === "v2").counters?.["+1/+1"]).toBe(1);       // other Vampire buffed
    expect(bf.find((p) => p.id === "elf").counters?.["+1/+1"] || 0).toBe(0); // the Elf is NOT a Vampire → untouched
  });
});

describe("FILTERED MASS-COUNTER — classification", () => {
  it("the modeled cards classify native; an unmodeled-filter card stays body-only", () => {
    expect(classifyCard({ name: "Ridgescale Tusker", type: "Creature — Dinosaur", oracle: "When this creature enters, put a +1/+1 counter on each other creature you control." })).toBe("native-trigger");
    expect(classifyCard({ name: "Steel Overseer", type: "Artifact Creature — Construct", oracle: "{T}: Put a +1/+1 counter on each artifact creature you control." })).toBe("native-activated");
    // CREED anti-FP: "each Villain you control" is not a curated subtype → the effect can't parse → body-only.
    expect(classifyCard({ name: "Fake Villain Lord", type: "Creature — Human", oracle: "When this creature enters, put a +1/+1 counter on each Villain you control." })).toBe("body-only");
  });
});

// ===================================================================================================
// BUCKET B — SUBTYPE-SCOPED ETB / dies trigger
// ===================================================================================================
describe("SUBTYPE-SCOPED ETB/dies — detection", () => {
  const det = (oracle) => detectTriggers({ name: "x", type: "Creature — Bear", oracle });
  it("'a/an <Subtype> you control enters' is detected as subtypeYouControl ETB", () => {
    expect(det("Whenever an Angel you control enters, you gain 4 life.")[0]).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Angel" });
    expect(det("Whenever a Goblin you control enters, draw a card.")[0]).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Goblin" });
  });
  it("the 'an <Subtype> you control dies' article gap is fixed", () => {
    expect(det("Whenever an Elf you control dies, draw a card.")[0]).toMatchObject({ event: "dies", scope: "subtypeYouControl", subtypeFilter: "Elf" });
  });
  it("CREED — a card-TYPE subject is NOT mis-read as a subtype (routes to its own path or Arbiter)", () => {
    // "a permanent you control enters" — not a subtype, not a permanentEnters type → UNDETECTED (Arbiter).
    expect(det("Whenever a permanent you control enters, draw a card.")).toHaveLength(0);
    // "an artifact you control enters" → the EXISTING permanentEnters/artifactYouControl path, NOT my subtype branch.
    expect(det("Whenever an artifact you control enters, draw a card.")[0]).toMatchObject({ event: "permanentEnters", scope: "artifactYouControl" });
    // "a token you control enters" → the DEDICATED permanentEnters/tokenYouControl path (Junk Winder slice),
    // NOT the subtype branch (token is denylisted as a subtype). Was previously UNDETECTED (token parked); the
    // token-enters trigger is now modeled, so it routes through its own scope (still never the subtype path).
    expect(det("Whenever a token you control enters, draw a card.")[0]).toMatchObject({ event: "permanentEnters", scope: "tokenYouControl" });
  });
});

describe("SUBTYPE-SCOPED ETB — runtime fires through the real entry path", () => {
  it("Bishop of Wings: an Angel entering triggers gain 4 life; a non-Angel does NOT", () => {
    const bishop = { id: "card-bishop", name: "Bishop of Wings", type: "Creature — Human Cleric", power: 1, toughness: 4, oracle: "Whenever an Angel you control enters, you gain 4 life." };
    let s = enterPermanent(stateWith(), bishop, "user");          // its own entry is not an Angel → no fire
    expect(s.pendingTriggers || []).toHaveLength(0);
    const lifeBefore = s.players.user.life;
    // A non-Angel enters → still no fire (subtype filter is exact).
    s = enterPermanent(s, { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user");
    expect(s.pendingTriggers || []).toHaveLength(0);
    // An Angel enters → Bishop fires.
    s = enterPermanent(s, { id: "card-angel", name: "Serra Angel", type: "Creature — Angel", power: 4, toughness: 4, oracle: "" }, "user");
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushResolve(s);
    expect(s.players.user.life).toBe(lifeBefore + 4);
  });

  it("CREED — the subtype watcher does NOT fire for an OPPONENT's matching-subtype creature (you-control gate)", () => {
    const bishop = createPermanent({ id: "bsh", card: { name: "Bishop of Wings", type: "Creature — Human Cleric", power: 1, toughness: 4, oracle: "Whenever an Angel you control enters, you gain 4 life." }, controller: "user" });
    let s = stateWith();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bishop] } } };
    const lifeBefore = s.players.user.life;
    s = enterPermanent(s, { id: "opp-angel", name: "Opp Angel", type: "Creature — Angel", power: 4, toughness: 4, oracle: "" }, "ai"); // an OPPONENT's Angel
    expect(s.pendingTriggers || []).toHaveLength(0);              // you-control gate → no fire (nothing to resolve)
    expect(s.players.user.life).toBe(lifeBefore);
  });

  it("a LAND subtype entry fires the ETB watcher (Dread Presence — 'a Swamp you control enters')", () => {
    // Dread Presence is modal; here we assert the SUBTYPE-ETB DETECTION + that a land entry would fire it.
    expect(detectTriggers({ name: "Dread Presence", type: "Creature — Nightmare", oracle: "Whenever a Swamp you control enters, draw a card." })[0]).toMatchObject({ event: "etb", scope: "subtypeYouControl", subtypeFilter: "Swamp" });
    const watcher = createPermanent({ id: "dp", card: { name: "Swampwatch", type: "Creature — Nightmare", power: 2, toughness: 2, oracle: "Whenever a Swamp you control enters, you gain 4 life." }, controller: "user" });
    let s = stateWith();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [watcher] } } };
    const lifeBefore = s.players.user.life;
    s = enterPermanent(s, { id: "swamp", name: "Swamp", type: "Basic Land — Swamp", oracle: "" }, "user"); // a land entry
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushResolve(s);
    expect(s.players.user.life).toBe(lifeBefore + 4);
  });
});

describe("SUBTYPE-SCOPED ETB — classification", () => {
  it("Bishop of Wings + Woodland Liege classify native-trigger", () => {
    expect(classifyCard({ name: "Bishop of Wings", type: "Creature — Human Cleric", oracle: "Whenever an Angel you control enters, you gain 4 life.\nWhenever an Angel you control dies, create a 1/1 white Spirit creature token with flying." })).toBe("native-trigger");
    expect(classifyCard({ name: "Woodland Liege", type: "Creature — Elf Druid Noble", oracle: "Whenever a Beast you control enters, draw a card." })).toBe("native-trigger");
  });
});
