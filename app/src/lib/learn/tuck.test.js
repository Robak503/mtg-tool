/**
 * TUCK-1 — bounce-to-library: "put target <permanent> on top / the bottom of its owner's library"
 * (Time Ebb, Griptide, Excommunicate, Temporal Spring, Totally Lost, Temporal Eddy, Run Aground). A new
 * `tuck` op mirroring the bounce op with a library destination; `where: "top"|"bottom"` rides on the
 * atom and the resolver prepends (top) / appends (bottom) via moveCardToZone's `toTop` flag. Bare anchored
 * forms only — a creature restriction, a 3-way union, a positional "Nth from the top", or an unmodeled
 * rider fails the anchor → low → Arbiter.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());
const I = (oracle, type = "Instant") => ({ type, oracle, name: "X" });

describe("TUCK-1 — classification", () => {
  it("clean tuck spells flip native-spell with the right atom", () => {
    const cases = [
      ["Put target creature on top of its owner's library.", { op: "tuck", targetType: "creature", where: "top" }],
      ["Put target permanent on top of its owner's library.", { op: "tuck", targetType: "permanent", where: "top" }],
      ["Put target nonland permanent on top of its owner's library.", { op: "tuck", targetType: "nonlandPermanent", where: "top" }],
      ["Put target creature or land on top of its owner's library.", { op: "tuck", targetType: "creatureOrLand", where: "top" }],
      ["Put target artifact or creature on top of its owner's library.", { op: "tuck", targetType: "creatureOrArtifact", where: "top" }],
      ["Put target creature on the bottom of its owner's library.", { op: "tuck", targetType: "creature", where: "bottom" }],
    ];
    for (const [oracle, atom] of cases) {
      expect(classifyCard(I(oracle))).toBe("native-spell");
      expect(parseEffectProgram(I(oracle)).atoms).toEqual([atom]);
    }
  });
  it("MUST stay arbiter — a restriction, a 3-way union, or a positional tuck (deferred fast-follow)", () => {
    expect(classifyCard(I("Put target creature with power 4 or greater on the bottom of its owner's library.", "Sorcery"))).toBe("arbiter-spell");
    expect(classifyCard(I("Put target artifact, creature, or enchantment on top of its owner's library.", "Sorcery"))).toBe("arbiter-spell");
    expect(classifyCard(I("Put target creature into its owner's library third from the top."))).toBe("arbiter-spell");
  });
});

describe("TUCK-1 — engine-first: the target leaves the battlefield to its OWNER's library", () => {
  const victim = () => createPermanent({ id: "vic", card: { id: "cvic", name: "Victim", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
  const withBoard = () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    // Set ai's library explicitly (bypass opening-hand draw/shuffle) so order is deterministic.
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [victim()], library: [{ id: "lib0", name: "TopCard", type: "Instant", oracle: "" }] } } };
  };
  const targets = [{ type: "creature", id: "vic", controller: "ai" }];

  it("'on top' prepends to the owner's library; the permanent is gone from the battlefield", () => {
    let s = withBoard();
    // ctx.controller = the CASTER (user), but the card returns to its own controller's (ai's) library.
    s = ATOM_RESOLVERS["tuck"](s, { op: "tuck", targetType: "creature", where: "top" }, { controller: "user", targets });
    expect(s.players.ai.battlefield.find((p) => p.id === "vic")).toBeUndefined();
    expect(s.players.ai.library[0].name).toBe("Victim");   // tucked to the TOP (index 0)
    expect(s.players.ai.library[1].name).toBe("TopCard");  // old top pushed down
  });

  it("'on the bottom' appends to the owner's library", () => {
    let s = withBoard();
    s = ATOM_RESOLVERS["tuck"](s, { op: "tuck", targetType: "creature", where: "bottom" }, { controller: "user", targets });
    expect(s.players.ai.battlefield.find((p) => p.id === "vic")).toBeUndefined();
    const lib = s.players.ai.library;
    expect(lib[lib.length - 1].name).toBe("Victim"); // bottom
    expect(lib[0].name).toBe("TopCard");             // top unchanged
  });
});
