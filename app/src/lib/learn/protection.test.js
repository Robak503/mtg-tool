/**
 * protection.test.js — KW-PROTECTION (CR 702.16), quality = COLOR. PR1 enforces the two combat
 * sub-rules: BLOCK (702.16f — an attacking protected creature can't be blocked by that color) and
 * DAMAGE (702.16e — combat damage from a source of that color is prevented). Targeting / enchant-equip
 * / non-combat (pinger & spell) damage are PR2 (safe false-negatives).
 */
import { describe, it, expect } from "vitest";
import { createPermanent } from "./gameState.js";
import { parseProtectionColors, protectionApplies } from "./protection.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";

describe("parseProtectionColors", () => {
  it("parses a single color", () => {
    expect([...parseProtectionColors({ oracle: "Protection from red" })]).toEqual(["R"]);
    expect([...parseProtectionColors({ oracle: "Flying\nProtection from black" })]).toEqual(["B"]);
  });
  it("parses 'A and from B' as both (CR 702.16g)", () => {
    expect([...parseProtectionColors({ oracle: "Protection from white and from black" })].sort()).toEqual(["B", "W"]);
  });
  it("parses 'all colors' / 'each color' as all five", () => {
    expect([...parseProtectionColors({ oracle: "Protection from all colors" })].sort()).toEqual(["B", "G", "R", "U", "W"]);
    expect([...parseProtectionColors({ oracle: "protection from each color" })].sort()).toEqual(["B", "G", "R", "U", "W"]);
  });
  it("ignores non-color qualities (artifacts / creatures / everything) — unenforced, safe FN", () => {
    expect(parseProtectionColors({ oracle: "Protection from artifacts" }).size).toBe(0);
    expect(parseProtectionColors({ oracle: "Protection from creatures" }).size).toBe(0);
    expect(parseProtectionColors({ oracle: "Protection from everything" }).size).toBe(0);
  });
  it("stops at a comma / reminder so 'protection from red, flying' reads only red", () => {
    expect([...parseProtectionColors({ oracle: "Protection from red, flying" })]).toEqual(["R"]);
    expect([...parseProtectionColors({ oracle: "Protection from blue (it can't be...)" })]).toEqual(["U"]);
  });
  it("returns an empty set when there's no protection", () => {
    expect(parseProtectionColors({ oracle: "Vigilance" }).size).toBe(0);
    expect(parseProtectionColors({}).size).toBe(0);
  });
});

describe("protectionApplies", () => {
  it("is true when a source color is in the protected-from set", () => {
    expect(protectionApplies(new Set(["R"]), ["R"])).toBe(true);
    expect(protectionApplies(new Set(["W", "B"]), ["B", "G"])).toBe(true);
  });
  it("is false otherwise (no overlap / empty)", () => {
    expect(protectionApplies(new Set(["R"]), ["U"])).toBe(false);
    expect(protectionApplies(new Set(), ["R"])).toBe(false);
    expect(protectionApplies(new Set(["R"]), [])).toBe(false);
  });
});

const creature = (name, power, toughness, controller, { colors = [], oracle = "" } = {}) =>
  createPermanent({ card: { id: `${name}-card`, name, power, toughness, type_line: "Creature", colors, oracle }, controller });
const combatState = ({ userBf = [], aiBf = [] }, combat) => ({
  turn: 3, log: [],
  players: {
    user: { life: 40, poison: 0, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
    ai: { life: 40, poison: 0, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
  },
  combat,
});
const permByName = (s, pid, name) => s.players[pid].battlefield.find((p) => p.card.name === name);
const gy = (s, pid) => s.players[pid].graveyard.map((c) => c.name);

describe("KW-PROTECTION — BLOCK (CR 702.16f)", () => {
  it("an attacking creature with protection from red can't be blocked by a red creature", () => {
    const att = creature("Knight", 2, 2, "user", { colors: ["W"], oracle: "Protection from red" });
    const redBlk = creature("Goblin", 2, 2, "ai", { colors: ["R"] });
    const state = combatState({ userBf: [att], aiBf: [redBlk] }, { attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(canBlockAttacker(state, redBlk.id, att.id, "ai")).toBe(false);
  });
  it("the same attacker CAN be blocked by a non-red creature", () => {
    const att = creature("Knight", 2, 2, "user", { colors: ["W"], oracle: "Protection from red" });
    const blueBlk = creature("Drake", 2, 2, "ai", { colors: ["U"] });
    const state = combatState({ userBf: [att], aiBf: [blueBlk] }, { attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(canBlockAttacker(state, blueBlk.id, att.id, "ai")).toBe(true);
  });
});

describe("KW-PROTECTION — DAMAGE in combat (CR 702.16e)", () => {
  it("a creature with protection from red takes NO combat damage from a red attacker", () => {
    const redAtt = creature("Dragon", 3, 3, "user", { colors: ["R"] });
    const blk = creature("Paladin", 2, 4, "ai", { colors: ["W"], oracle: "Protection from red" });
    const out = resolveCombatDamage(combatState({ userBf: [redAtt], aiBf: [blk] }, {
      attackers: [{ permanentId: redAtt.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: redAtt.id }],
    }));
    const paladin = permByName(out, "ai", "Paladin");
    expect(paladin.damageMarked || 0).toBe(0); // red damage prevented
    // ...and the Paladin still deals its 2 back to the (unprotected) red attacker.
    expect(permByName(out, "user", "Dragon").damageMarked).toBe(2);
  });

  it("the prevention is color-specific — a BLUE attacker still damages a protection-from-red creature", () => {
    const blueAtt = creature("Serpent", 3, 3, "user", { colors: ["U"] });
    const blk = creature("Paladin", 2, 4, "ai", { colors: ["W"], oracle: "Protection from red" });
    const out = resolveCombatDamage(combatState({ userBf: [blueAtt], aiBf: [blk] }, {
      attackers: [{ permanentId: blueAtt.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: blueAtt.id }],
    }));
    expect(permByName(out, "ai", "Paladin").damageMarked).toBe(3); // not prevented (blue ≠ red)
  });

  it("a red attacker with trample blocked by a protection-from-red creature tramples its FULL power (702.19e)", () => {
    const redAtt = creature("Trampler", 5, 5, "user", { colors: ["R"], oracle: "Trample" });
    const blk = creature("Wall", 0, 6, "ai", { colors: ["W"], oracle: "Protection from red" });
    const out = resolveCombatDamage(combatState({ userBf: [redAtt], aiBf: [blk] }, {
      attackers: [{ permanentId: redAtt.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: redAtt.id }],
    }));
    expect(permByName(out, "ai", "Wall").damageMarked || 0).toBe(0); // prevented
    expect(out.players.ai.life).toBe(35); // 5 power assigned 0 to the protected blocker → full 5 tramples
  });

  it("is behavior-neutral for a normal (no-protection) creature", () => {
    const redAtt = creature("Dragon", 3, 3, "user", { colors: ["R"] });
    const blk = creature("Bear", 2, 4, "ai", { colors: ["G"] });
    const out = resolveCombatDamage(combatState({ userBf: [redAtt], aiBf: [blk] }, {
      attackers: [{ permanentId: redAtt.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: redAtt.id }],
    }));
    expect(permByName(out, "ai", "Bear").damageMarked).toBe(3); // ordinary damage
    expect(gy(out, "ai")).toEqual([]); // 3 < 4, survives
  });
});
