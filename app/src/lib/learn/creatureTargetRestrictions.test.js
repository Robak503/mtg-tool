/**
 * β-1 — creature-target restrictions (color negation / type negation / combat state).
 *
 * Extends P2.4 (controller/tapped/power) so "Destroy target nonblack creature" (Doom Blade),
 * "nonartifact creature" (Go for the Throat), and "attacking/blocking creature" (Divine Verdict,
 * Immolating Glare) are MODELED. The safety invariant: enumerateTargets must only offer LEGAL targets —
 * a black creature is never a target for Doom Blade, a non-attacker never for an attacking-only removal.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (oracle) => parseEffectProgram({ type: "Instant", oracle }).atoms[0];
const cre = (id, colors, type = "Creature — Bear") =>
  createPermanent({ id, card: { id, name: id, type, colors }, controller: id[0] === "u" ? "user" : "ai" });
const boardWith = (perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = { user: [], ai: [] };
  for (const p of perms) bf[p.controller].push(p);
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf.user }, ai: { ...s.players.ai, battlefield: bf.ai } } };
};
const ids = (ts) => ts.map((t) => t.id).sort();

describe("β-1 — color negation", () => {
  it("'nonblack creature' excludes black creatures; colorless + other colors are legal", () => {
    const s = boardWith([cre("ablack", ["B"]), cre("agreen", ["G"]), cre("acolorless", [], "Artifact Creature — Golem")]);
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target nonblack creature.")))).toEqual(["acolorless", "agreen"]);
  });
  it("a multicolor creature that INCLUDES black is excluded", () => {
    const s = boardWith([cre("agb", ["G", "B"]), cre("agw", ["G", "W"])]);
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target nonblack creature.")))).toEqual(["agw"]);
  });
});

describe("β-1 — type negation", () => {
  it("'nonartifact creature' excludes artifact creatures", () => {
    const s = boardWith([cre("abear", ["G"]), cre("agolem", [], "Artifact Creature — Golem")]);
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target nonartifact creature.")))).toEqual(["abear"]);
  });
});

describe("β-1 — combat state", () => {
  const withCombat = (s, attackers = [], blockers = []) => ({ ...s, combat: { attackers, blockers } });
  it("'attacking creature' offers only attackers", () => {
    let s = boardWith([cre("aatk", ["R"]), cre("aidle", ["R"])]);
    s = withCombat(s, [{ permanentId: "aatk", attackingPlayer: "ai", defender: "user" }]);
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target attacking creature.")))).toEqual(["aatk"]);
  });
  it("'attacking or blocking creature' offers either role, not an idle creature", () => {
    let s = boardWith([cre("aatk", ["R"]), cre("ublk", ["W"]), cre("aidle", ["R"])]);
    s = withCombat(s, [{ permanentId: "aatk", attackingPlayer: "ai", defender: "user" }], [{ blockerId: "ublk", blockingPlayer: "user", attackerId: "aatk" }]);
    expect(ids(enumerateTargets(s, "user", atomOf("Destroy target attacking or blocking creature.")))).toEqual(["aatk", "ublk"]);
  });
  it("no combat in progress → an attacking-restricted removal has NO legal target (uncastable)", () => {
    const s = boardWith([cre("abear", ["G"])]);
    expect(enumerateTargets(s, "user", atomOf("Destroy target attacking creature."))).toHaveLength(0);
  });
});
