/**
 * grantProtectionColor.test.js — "Target creature gains protection from black until end of turn."
 * (Obsidian Acolyte, Crimson Acolyte) and the SELF form (Keeper of Kookus).
 *
 * Same shape as the poison slice: the LAYER OP already existed — the static anthem path emits
 * `addProtection` and layers.permanentProtectionColors reads it — but nothing PARSED to it for a targeted,
 * turn-scoped grant. The read side had been waiting for a writer.
 *
 * The resolver is a deliberate mirror of applyCantBlock: both are "grant a layer-6 quality to the targets
 * for the turn", and only the op differs.
 *
 * ⚠️ This file leads with a RUNTIME assertion, per the lesson from the wrong-owner near-miss earlier in this
 * batch: asserting the atom is not asserting the effect. The atom shape was right in that case too.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentProtectionColors } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const atomsOf = (o) => parseEffectClause(o, "Instant")?.atoms;

const board = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (id) => createPermanent({ id, card: { name: id, type: "Creature — Bear", mana: "{1}{G}", oracle: "", id: `c${id}` }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("alpha"), mk("beta")] } } };
};

const run = (oracle, targets) => {
  const out = runEffectProgram(board(), {
    source: { name: "C" },
    payload: { params: { program: parseEffectClause(oracle, "Instant"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return out?.state ?? out;
};

describe("⭐ ENFORCEMENT — the protection actually lands", () => {
  it("VACUITY CONTROL: nobody has protection to begin with", () => {
    const st = board();
    expect([...permanentProtectionColors(st, "alpha")]).toEqual([]);
    expect([...permanentProtectionColors(st, "beta")]).toEqual([]);
  });

  it("grants the named colour to the TARGET and not its neighbour", () => {
    const st = run("Target creature gains protection from black until end of turn.",
      [{ type: "creature", id: "alpha", controller: "user", atomIndex: 0 }]);
    expect([...permanentProtectionColors(st, "alpha")]).toEqual(["B"]);
    // The discriminating half — a grant that hit every creature would pass everything else here.
    expect([...permanentProtectionColors(st, "beta")]).toEqual([]);
  });

  it("grants the COLOUR THE CARD NAMED, not some other colour", () => {
    const st = run("Target creature gains protection from red until end of turn.",
      [{ type: "creature", id: "alpha", controller: "user", atomIndex: 0 }]);
    expect([...permanentProtectionColors(st, "alpha")]).toEqual(["R"]);
  });
});

describe("parse", () => {
  it("emits the colour letter for both subjects", () => {
    expect(atomsOf("Target creature gains protection from black until end of turn."))
      .toEqual([{ op: "grant-protection", targetType: "creature", colors: ["B"] }]);
    expect(atomsOf("This creature gains protection from red until end of turn."))
      .toEqual([{ op: "grant-protection", target: "self", colors: ["R"] }]);
  });

  it("⛔ refuses qualities that are not a single colour", () => {
    // Collapsing these to a colour the card never named would be a confidently wrong grant — they are
    // different mechanics, not spellings of this one.
    expect(atomsOf("Target creature gains protection from everything until end of turn.")).toEqual([]);
    expect(atomsOf("Target creature gains protection from all colors until end of turn.")).toEqual([]);
    expect(atomsOf("Target creature gains protection from the color of your choice until end of turn.")).toEqual([]);
  });

  it("leaves the plain keyword grant untouched", () => {
    expect(atomsOf("Target creature gains hexproof until end of turn.")?.[0]?.op).toBe("pump");
  });
});

describe("the real cards", () => {
  it("flips all three carriers", () => {
    // Oracle text from the bundled snapshot.
    expect(classifyCard({ name: "Obsidian Acolyte", type: "Creature — Human Cleric", mana: "{1}{W}",
      oracle: "Protection from black\n{W}: Target creature gains protection from black until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Crimson Acolyte", type: "Creature — Human Cleric", mana: "{1}{W}",
      oracle: "Protection from red\n{W}: Target creature gains protection from red until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Keeper of Kookus", type: "Creature — Goblin", mana: "{2}{R}",
      oracle: "{R}: This creature gains protection from red until end of turn." })).toBe("native-activated");
  });
});
