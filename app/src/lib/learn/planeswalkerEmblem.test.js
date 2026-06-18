/**
 * Emblem subsystem (PW-5) — "You get an emblem with '<ability>'." A static-anthem emblem parses HIGH
 * (a create-emblem atom), creates a command-zone emblem, and its anthem applies continuously via the
 * layer engine, scoped to the emblem's controller. A triggered/complex emblem stays LOW → Arbiter
 * (PW-6 adds triggered emblems). This is the planeswalker-ultimate keystone.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, addEmblem, findPermanent } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const creature = (name, over = {}) => ({ id: `c-${name}`, name, type: "Creature — Bear", type_line: "Creature — Bear", power: 2, toughness: 2, oracle: "", ...over });
function withBf(state, pid, perms) { return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } }; }
const conf = (clause) => { const p = parseEffectClause(clause, "Instant"); return p ? programConfidence(p) : "none"; };

describe("emblem parsing", () => {
  it("a static-anthem emblem parses HIGH as a create-emblem atom", () => {
    const p = parseEffectClause('You get an emblem with "Creatures you control get +1/+1."', "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0].op).toBe("create-emblem");
    expect(p.atoms[0].emblemOracle).toMatch(/Creatures you control get \+1\/\+1/);
  });
  it("an anthem+keyword emblem parses HIGH", () => {
    expect(conf('You get an emblem with "Creatures you control get +2/+2 and have trample."')).toBe("high");
  });
  it("a TRIGGERED emblem stays LOW (→ Arbiter, PW-6)", () => {
    expect(conf('You get an emblem with "At the beginning of your end step, draw a card."')).toBe("low");
  });
  it("an emblem with an unmodeled rider stays LOW (no partial coverage)", () => {
    // The anthem is modeled but the second clause isn't a static → all-or-nothing → LOW.
    expect(conf('You get an emblem with "Creatures you control get +1/+1. Whenever a creature you control dies, draw a card."')).toBe("low");
  });
});

describe("emblem application via the layer engine", () => {
  function boardWithEmblem(oracle) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "user", [createPermanent({ id: "mine", card: creature("Mine"), controller: "user", summoningSick: false })]);
    s = withBf(s, "ai", [createPermanent({ id: "theirs", card: creature("Theirs"), controller: "ai", summoningSick: false })]);
    return addEmblem(s, { playerId: "user", oracle });
  }

  it("a +1/+1 anthem emblem buffs ONLY the controller's creatures", () => {
    const s = boardWithEmblem("Creatures you control get +1/+1.");
    expect(permanentPower(s, "mine")).toBe(3);
    expect(permanentToughness(s, "mine")).toBe(3);
    expect(permanentPower(s, "theirs")).toBe(2);     // opponent unaffected
    expect(permanentToughness(s, "theirs")).toBe(2);
  });

  it("a keyword-granting emblem grants the keyword to the controller's creatures", () => {
    const s = boardWithEmblem("Creatures you control have trample.");
    expect(permanentHasKeyword(s, "mine", "Trample")).toBe(true);
    expect(permanentHasKeyword(s, "theirs", "Trample")).toBe(false);
  });

  it("the emblem persists in the command zone (it isn't a battlefield permanent)", () => {
    const s = boardWithEmblem("Creatures you control get +1/+1.");
    expect(s.players.user.emblems).toHaveLength(1);
    expect(findPermanent(s, s.players.user.emblems[0].id)).toBeNull(); // not on the battlefield
  });
});

describe("create-emblem atom resolution", () => {
  it("resolving the atom gives the controller the emblem and its anthem takes effect", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = withBf(s, "user", [createPermanent({ id: "mine", card: creature("Mine"), controller: "user", summoningSick: false })]);
    const prog = parseEffectClause('You get an emblem with "Creatures you control get +3/+3."', "Instant");
    s = resolveAtom(s, prog.atoms[0], { controller: "user" });
    expect(s.players.user.emblems).toHaveLength(1);
    expect(permanentPower(s, "mine")).toBe(5); // 2 +3
  });
});

describe("emblem coverage classification", () => {
  it("a planeswalker whose ultimate makes a static-anthem emblem can be fully native", () => {
    // Every ability modeled (draw / +1/+1-counter / anthem-emblem) + pure loyalty → native-planeswalker.
    const oracle = "+1: Draw a card.\n−2: Put a +1/+1 counter on target creature.\n−7: You get an emblem with \"Creatures you control get +2/+2.\"";
    expect(classifyCard({ type: "Legendary Planeswalker — Test", oracle, loyalty: "5", name: "Embler" })).toBe("native-planeswalker");
  });
  it("a planeswalker whose ultimate is a TRIGGERED emblem stays playable-pw (ultimate → Arbiter)", () => {
    const oracle = "+1: Draw a card.\n−7: You get an emblem with \"At the beginning of your end step, draw a card.\"";
    expect(classifyCard({ type: "Legendary Planeswalker — Test", oracle, loyalty: "5", name: "Trigemb" })).toBe("playable-pw");
  });
});
