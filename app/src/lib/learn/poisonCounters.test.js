/**
 * poisonCounters.test.js — "<who> gets N poison counters." (CR 122 / 704.5c).
 *
 * The poison TRACK has existed on player state since KW-POISON (gameState.addPoison; ten counters lose the
 * game), and infect/toxic combat damage already fed it — but NO CLAUSE EVER PARSED TO IT, so every card
 * handing out poison outside combat was unmodelled. This is the parse+resolve pair, not a new subsystem.
 *
 * applyAddPoison is a deliberate structural mirror of applyLoseLife: same four recipients, same order, same
 * eliminated-player handling. Poison is a player resource like life and should read like one, and keeping
 * them identical is what stops them drifting as recipient kinds are added.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const sorcery = (o) => ({ name: "C", type: "Sorcery", mana: "{1}{B}", oracle: o });
const atomsOf = (o) => parseEffectClause(o, "Sorcery")?.atoms;

const run = (oracle, targets = []) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const victim = createPermanent({ id: "vic", card: { name: "Bird", type: "Creature — Bird", mana: "{U}", oracle: "Flying", id: "cvic" }, controller: "ai" });
  const st = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [victim] } } };
  const out = runEffectProgram(st, {
    source: { name: "C" },
    payload: { params: { program: parseEffectClause(oracle, "Sorcery"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return (out?.state ?? out).players;
};

describe("poison — parse", () => {
  it("maps each printed recipient to the right who/targetType", () => {
    expect(atomsOf("Each opponent gets a poison counter.")).toEqual([{ op: "add-poison", amount: 1, who: "eachOpponent", targetType: null }]);
    expect(atomsOf("Each player gets a poison counter.")).toEqual([{ op: "add-poison", amount: 1, who: "eachPlayer", targetType: null }]);
    expect(atomsOf("You get a poison counter.")).toEqual([{ op: "add-poison", amount: 1, who: "controller", targetType: null }]);
    expect(atomsOf("Target player gets 2 poison counters.")).toEqual([{ op: "add-poison", amount: 2, who: "target", targetType: "player" }]);
    expect(atomsOf("Target opponent gets a poison counter.")).toEqual([{ op: "add-poison", amount: 1, who: "target", targetType: "opponent" }]);
  });

  it("⛔ a QUALIFIED subject stays on the Arbiter", () => {
    // A recipient the engine cannot restrict exactly is not a recipient — the same refusal every sibling
    // player-payload arm makes.
    expect(atomsOf("Each opponent who attacked gets a poison counter.")).toEqual([]);
    expect(classifyCard(sorcery("Target player with no cards in hand gets a poison counter."))).toBe("arbiter-spell");
  });

  it("rides the player-referent projection (Pistus Strike)", () => {
    const atoms = atomsOf("Destroy target creature with flying. Its controller gets a poison counter.");
    expect(atoms?.[1]).toMatchObject({ op: "add-poison", amount: 1, bindPreviousTargets: true, playerFrom: "controller" });
  });
});

describe("⭐ ENFORCEMENT — the counters land on the right players", () => {
  it("VACUITY CONTROL: nobody starts poisoned", () => {
    const p = run("Draw a card.");
    expect(p.user.poison).toBe(0);
    expect(p.ai.poison).toBe(0);
  });

  it("each opponent — the CASTER is not poisoned", () => {
    const p = run("Each opponent gets a poison counter.");
    expect(p.ai.poison).toBe(1);
    expect(p.user.poison).toBe(0);   // the discriminating half
  });

  it("each player — everyone, including the caster", () => {
    const p = run("Each player gets a poison counter.");
    expect(p.ai.poison).toBe(1);
    expect(p.user.poison).toBe(1);
  });

  it("you — only the caster", () => {
    const p = run("You get a poison counter.");
    expect(p.user.poison).toBe(1);
    expect(p.ai.poison).toBe(0);
  });

  it("counts higher than one are honoured", () => {
    const p = run("Each opponent gets 3 poison counters.");
    expect(p.ai.poison).toBe(3);
  });

  it("⭐ the referent form poisons the DESTROYED creature's controller, not the caster", () => {
    const p = run("Destroy target creature with flying. Its controller gets a poison counter.",
      [{ type: "creature", id: "vic", controller: "ai", atomIndex: 0 }]);
    expect(p.ai.poison).toBe(1);
    expect(p.user.poison).toBe(0);   // without the projection this would be the caster
  });
});

describe("the real cards", () => {
  it("flips the carriers", () => {
    // Oracle text from the bundled snapshot.
    expect(classifyCard({ name: "Pistus Strike", type: "Instant", mana: "{G}",
      oracle: "Destroy target creature with flying. Its controller gets a poison counter." })).toBe("native-spell");
    expect(classifyCard({ name: "Prologue to Phyresis", type: "Instant", mana: "{U}",
      oracle: "Each opponent gets a poison counter.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Ichor Rats", type: "Creature — Phyrexian Rat", mana: "{3}{B}",
      oracle: "Infect (This creature deals damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)\nWhen this creature enters, each player gets a poison counter." })).toBe("native-trigger");
  });
});
