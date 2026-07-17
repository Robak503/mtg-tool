/**
 * animate.test.js — WALT-ANIMATE PR2: the animate-SPELL parser ("target land becomes a creature").
 *
 * The framework (PR1) made a granted-Creature permanent a real creature in combat + SBAs. This PR
 * teaches the effect parser to PRODUCE the animate: layer-4 type-ADD + layer-7b P/T-SET + layer-6
 * keyword grants, all until end of turn (applyAnimateEffect). "becomes a creature" is additive by
 * default (the land stays a land — 0 non-additive land-animates in the corpus), so the additive
 * layer-4 is always correct and the "still a land" reminder is stripped as vacuous.
 *
 * CREED: only the cleanly-modelable subset flips HIGH. A PERMANENT animate, a color-set, a
 * counter-scaled 0/0 (awaken), an un-grantable keyword, or a "must be blocked"/Lure rider routes the
 * whole card to the Arbiter (LOW).
 */

import { describe, it, expect } from "vitest";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./parser.js";
import { ATOM_RESOLVERS } from "./effectAtoms.js";
import { runEffectProgram } from "./runProgram.js";
import { RESOLVER_KEYS } from "../resolvers.js";
import { createGameState, createPermanent } from "../gameState.js";
import { boardSnapshot } from "../boardSnapshot.js";
import { permanentIsCreature, permanentPower, permanentToughness, permanentHasKeyword, permanentColors, permanentTypes, expireContinuousEffects } from "../layers.js";

const I = (oracle) => ({ type: "Instant", oracle });
const conf = (c) => programConfidence(parseEffectProgram(c));
const atoms = (c) => parseEffectProgram(c).atoms;

// A state whose only permanent is an untapped Forest "L1" the user controls (not summoning sick).
function landState() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const land = createPermanent({ id: "L1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land] } } };
}

describe("WALT-ANIMATE PR2 — animate-spell parser (HIGH: the modeled subset)", () => {
  it("Animate Land — 'target land becomes a 3/3 creature that's still a land' → HIGH", () => {
    const c = I("Until end of turn, target land becomes a 3/3 creature that's still a land.");
    expect(conf(c)).toBe("high");
    expect(atoms(c)).toEqual([
      { op: "animate", targetType: "land", power: 3, toughness: 3, subtypes: [], grantKeywords: [], duration: "endOfTurn" },
    ]);
  });

  it("Hydroform — subtype + flying rider, separate 'It's still a land' sentence → HIGH", () => {
    const c = I("Target land becomes a 3/3 Elemental creature with flying until end of turn. It's still a land.");
    expect(conf(c)).toBe("high");
    expect(atoms(c)).toEqual([
      { op: "animate", targetType: "land", power: 3, toughness: 3, subtypes: ["Elemental"], grantKeywords: ["Flying"], duration: "endOfTurn" },
    ]);
  });

  it("Vivify — animate + cantrip (two clauses) → HIGH with both atoms", () => {
    const c = I("Target land becomes a 3/3 creature until end of turn. It's still a land. Draw a card.");
    expect(conf(c)).toBe("high");
    expect(atoms(c)).toEqual([
      { op: "animate", targetType: "land", power: 3, toughness: 3, subtypes: [], grantKeywords: [], duration: "endOfTurn" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
});

describe("WALT-ANIMATE PR2 — CREED routing (LOW → Arbiter)", () => {
  it("a 'must be blocked this turn if able' (Lure) rider → LOW", () => {
    expect(conf(I("Until end of turn, target land becomes a 4/4 creature with flying. It must be blocked this turn if able."))).toBe("low");
  });
  it("a PERMANENT animate (no until-end-of-turn) → LOW", () => {
    expect(conf(I("Target land becomes a 2/2 creature."))).toBe("low");
  });
  it("a color-SET animate ('becomes a black creature') → LOW", () => {
    expect(conf(I("Until end of turn, target land becomes a 3/3 black creature that's still a land."))).toBe("low");
  });
  it("an un-grantable keyword rider → LOW", () => {
    expect(conf(I("Until end of turn, target land becomes a 3/3 creature with banding."))).toBe("low"); // banding un-grantable (shadow now IS — SLIVER INTERIORS SP-1)
  });
  it("an awaken-style counter-scaled 0/0 → LOW", () => {
    expect(conf(I("Put three +1/+1 counters on target land you control and it becomes a 0/0 Elemental creature with haste that's still a land."))).toBe("low");
  });
});

describe("WALT-ANIMATE PR2 — resolver (applyAnimateEffect) end-to-end", () => {
  it("animates a land into a 3/3 flying creature until end of turn, additive, then reverts at cleanup", () => {
    let state = landState();
    expect(permanentIsCreature(state, "L1")).toBe(false);

    const atom = { op: "animate", targetType: "land", power: 3, toughness: 3, subtypes: ["Elemental"], grantKeywords: ["Flying"], duration: "endOfTurn" };
    const ctx = { controller: "user", targets: [{ type: "permanent", id: "L1", controller: "user" }], cardName: "Hydroform" };
    state = ATOM_RESOLVERS["animate"](state, atom, ctx);

    // now the creature it became: set P/T + granted keyword, read layer-aware
    expect(permanentIsCreature(state, "L1")).toBe(true);
    expect(permanentPower(state, "L1")).toBe(3);
    expect(permanentToughness(state, "L1")).toBe(3);
    expect(permanentHasKeyword(state, "L1", "Flying")).toBe(true);
    // additive — it's STILL a land (the printed type is untouched; layer 4 only ADDS Creature)
    expect(String(state.players.user.battlefield.find(p => p.id === "L1").card.type)).toMatch(/Land/);

    // end-of-turn cleanup expires the animate → back to a plain (non-creature) land
    state = expireContinuousEffects(state, { atCleanupOfTurn: state.turn });
    expect(permanentIsCreature(state, "L1")).toBe(false);
  });

  it("a 0/0 animate dies immediately to the lethal SBA (CR 704.5f)", () => {
    let state = landState();
    const atom = { op: "animate", targetType: "land", power: 0, toughness: 0, subtypes: [], grantKeywords: [], duration: "endOfTurn" };
    const ctx = { controller: "user", targets: [{ type: "permanent", id: "L1", controller: "user" }], cardName: "Test" };
    state = ATOM_RESOLVERS["animate"](state, atom, ctx);
    expect(state.players.user.battlefield.some(p => p.id === "L1")).toBe(false); // toughness 0 → graveyard at resolution
  });
});

describe("WALT-ANIMATE PR2 — FULL cast→resolution path (runEffectProgram, mirrors a real cast)", () => {
  it("casting the real Animate Land program animates the chosen land into a 3/3 creature", () => {
    // The REAL parse (HIGH animate atom) + the EFFECT_PROGRAM resolver path the dispatcher builds at
    // cast — this exercises the programConfidence gate + targetsForAtom threading that the direct-resolver
    // sims above bypass. This is the path the live Academy actually runs.
    const program = parseEffectProgram({ type: "Instant", oracle: "Until end of turn, target land becomes a 3/3 creature that's still a land." });
    expect(programConfidence(program)).toBe("high");
    const targets = [{ type: "permanent", id: "L1", controller: "user", atomIndex: 0 }];
    const stackObj = {
      id: "stk-animate", kind: "spell", source: { name: "Animate Land", oracle: "" },
      controller: "user", targets, cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets } },
    };
    let state = landState();
    state = runEffectProgram(state, stackObj);
    expect(permanentIsCreature(state, "L1")).toBe(true);
    expect(permanentPower(state, "L1")).toBe(3);
    expect(permanentToughness(state, "L1")).toBe(3);

    // The board the Academy UI renders must SHOW it as a creature (a real LIVE-QA catch:
    // permanentView read the printed type, so an animated land displayed as a plain land). It's
    // still a land (additive → shown in the lands row), now a creature with its set P/T.
    const board = boardSnapshot(state);
    const user = board.players.find(p => p.hand !== null) || board.players[0];
    const land = user.lands.find(l => l.id === "L1");
    expect(land).toBeDefined();
    expect(land.isLand).toBe(true);
    expect(land.isCreature).toBe(true);
    expect(land.power).toBe(3);
    expect(land.toughness).toBe(3);
  });
});

// ===== WALT-ANIMATE PR3 — man-lands (self-referential activated animate) =====
function manLandState(name) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const land = createPermanent({ id: "ML1", card: { name, type: "Land", oracle: "" }, controller: "user", summoningSick: false });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [land] } } };
}
const clauseConf = (clause) => programConfidence(parseEffectClause(clause, "Instant"));
const clauseAtom = (clause) => (parseEffectClause(clause, "Instant").atoms || []).find(a => a.op === "animate");

describe("WALT-ANIMATE PR3 — man-land self-animate parser (HIGH: the modeled subset)", () => {
  it("Treetop Village — '3/3 green Ape creature with trample' (color + subtype + keyword) → HIGH", () => {
    const clause = "This land becomes a 3/3 green Ape creature with trample until end of turn. It's still a land.";
    expect(clauseConf(clause)).toBe("high");
    expect(clauseAtom(clause)).toEqual({ op: "animate", target: "self", power: 3, toughness: 3, colors: ["G"], subtypes: ["Ape"], cardTypes: [], grantKeywords: ["Trample"], duration: "endOfTurn" });
  });
  it("Faerie Conclave — '2/1 blue Faerie creature with flying' → HIGH", () => {
    expect(clauseAtom("This land becomes a 2/1 blue Faerie creature with flying until end of turn. It's still a land."))
      .toMatchObject({ target: "self", power: 2, toughness: 1, colors: ["U"], subtypes: ["Faerie"], grantKeywords: ["Flying"] });
  });
  it("Mishra's Factory — '2/2 Assembly-Worker artifact creature' (artifact card-type) → HIGH", () => {
    expect(clauseAtom("This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land."))
      .toMatchObject({ target: "self", power: 2, toughness: 2, subtypes: ["Assembly-Worker"], cardTypes: ["Artifact"] });
  });
});

describe("WALT-ANIMATE PR3 — man-land CREED routing (LOW → Arbiter)", () => {
  it("Creeping Tar Pit — the 'can't be blocked' rider now MODELS (SC-1 graduation: the self anchor + layer-aware selfTargets)", () => {
    // (This pin guarded a dropped rider until BLITZ SC-1 added the cant-be-blocked SELF anchor and made
    // selfTargets layer-aware — the unblockable grant genuinely lands on the animated land at runtime.)
    expect(clauseConf("Until end of turn, this land becomes a 3/2 blue and black Elemental creature. It's still a land. It can't be blocked this turn.")).toBe("high");
  });
  it("Mutavault — 'with all creature types' (changeling) → LOW", () => {
    expect(clauseConf("This land becomes a 2/2 creature with all creature types until end of turn. It's still a land.")).toBe("low");
  });
  it("Inkmoth Nexus — infect (un-grantable keyword) → LOW", () => {
    expect(clauseConf("This land becomes a 1/1 Phyrexian Blinkmoth artifact creature with flying and infect until end of turn. It's still a land.")).toBe("low");
  });
});

describe("WALT-ANIMATE PR3 — man-land self-animate resolves (activation path via ctx.sourceId)", () => {
  const activate = (state, clause, name) => {
    const program = parseEffectClause(clause, "Instant");
    const stackObj = {
      id: "stk-ml", kind: "ability", source: { name, oracle: "" },
      controller: "user", targets: [], cost: null,
      payload: { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program, controller: "user", targets: [], sourceId: "ML1" } },
    };
    return runEffectProgram(state, stackObj);
  };

  it("Treetop Village animates ITSELF into a 3/3 green Ape with trample, still a land, reverts at cleanup", () => {
    let state = manLandState("Treetop Village");
    expect(permanentIsCreature(state, "ML1")).toBe(false);
    state = activate(state, "This land becomes a 3/3 green Ape creature with trample until end of turn. It's still a land.", "Treetop Village");

    expect(permanentIsCreature(state, "ML1")).toBe(true);
    expect(permanentPower(state, "ML1")).toBe(3);
    expect(permanentToughness(state, "ML1")).toBe(3);
    expect(permanentHasKeyword(state, "ML1", "Trample")).toBe(true);
    expect(permanentColors(state, "ML1")).toContain("G");       // layer-5 color set
    expect(permanentTypes(state, "ML1").subtypes).toContain("Ape");
    expect(String(state.players.user.battlefield.find(p => p.id === "ML1").card.type)).toMatch(/Land/); // still a land

    state = expireContinuousEffects(state, { atCleanupOfTurn: state.turn });
    expect(permanentIsCreature(state, "ML1")).toBe(false);       // reverts at end of turn
  });

  it("Mishra's Factory becomes an ARTIFACT creature too (layer-4 adds Artifact)", () => {
    let state = manLandState("Mishra's Factory");
    state = activate(state, "This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.", "Mishra's Factory");
    expect(permanentIsCreature(state, "ML1")).toBe(true);
    expect(permanentTypes(state, "ML1").types).toEqual(expect.arrayContaining(["Creature", "Artifact"]));
  });
});
