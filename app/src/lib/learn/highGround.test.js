/**
 * highGround.test.js — "Each creature you control can block an additional creature each combat." (High Ground, Brave the Sands —
 * census rank 52 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * Multi-block existed for the SELF static (Selesnya Sagittars / Palace Guard — combatEvasion.maxBlocksOf, capped at the
 * declare-blockers offer, damage divided at resolution per CR 510.1d); the TEAM static was listed as a known safe FN. It is
 * CUMULATIVE — both cards' rulings: "If you have a creature that can already block an additional creature, now it can block three
 * creatures"; two Brave the Sands → three — so combatEvasion.maxBlocksFor adds one block per team static the blocker's controller
 * has, and the offer reads it. One core pattern feeds the runtime reader and the classifier mirror (the file's lockstep law).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Blocks are offered by legalActionsForPlayer; damage resolves for real.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HIGH_GROUND = { name: "High Ground", type: "Enchantment", mana: "{W}", keywords: [], oracle: "Each creature you control can block an additional creature each combat." };
const BRAVE = { name: "Brave the Sands", type: "Enchantment", mana: "{1}{W}", keywords: [],
  oracle: "Creatures you control have vigilance.\nEach creature you control can block an additional creature each combat." };
const SAGITTARS = { name: "Selesnya Sagittars", type: "Creature — Elf Archer", mana: "{3}{G}{W}", power: "2", toughness: "5", keywords: ["Reach"],
  oracle: "Reach (This creature can block creatures with flying.)\nThis creature can block an additional creature each combat." };
const GUARD = { name: "Palace Guard", type: "Creature — Human Soldier", mana: "{2}{W}", power: "1", toughness: "4", keywords: [], oracle: "This creature can block any number of creatures." };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", power: "3", toughness: "3", keywords: [], oracle: "" };
const bear = (n) => ({ name: `Bear ${n}`, type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" });

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const A = [1, 2, 3, 4].map((n) => perm(`a${n}`, bear(n), "user"));
// A declare-blockers board: the user's attackers vs the AI's blockers (+ `aiExtra`, e.g. High Ground), with declared blocks.
function blockBoard({ attackers = A.slice(0, 3), blockers, aiExtra = [], userExtra = [], declared = [] }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, activePlayer: "user", priorityHolder: "ai", phase: "combat", step: "declare-blockers",
    combat: { attackers: attackers.map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })),
      blockers: declared.map(([blockerId, attackerId]) => ({ blockerId, attackerId, blockingPlayer: "ai" })) },
    players: { ...g.players, user: { ...g.players.user, battlefield: [...attackers, ...userExtra] }, ai: { ...g.players.ai, battlefield: [...blockers, ...aiExtra] } } };
}
const offeredBlocks = (s) => legalActionsForPlayer(s, "ai", { declaredAttackers: s.combat.attackers.map((a) => a.permanentId) })
  .filter((a) => a.kind === "declare-blocker").map((a) => `${a.permanentId}::${a.attackerId}`).sort();

describe("classification", () => {
  it("High Ground and Brave the Sands classify native", () => {
    expect(classifyCard(HIGH_GROUND)).toMatch(/^native-/);
    expect(classifyCard(BRAVE)).toMatch(/^native-/);
  });
});

describe("RUNTIME — one more block per team static, cumulative, the controller's only", () => {
  it("VACUITY CONTROL — a Hill Giant already blocking is offered nothing more", () => {
    expect(offeredBlocks(blockBoard({ blockers: [perm("g", GIANT, "ai")], declared: [["g", "a1"]] }))).toEqual([]);
  });

  it("⭐ with High Ground the Giant blocking one attacker is re-offered against the other two — never the same one — and stops at two", () => {
    const once = offeredBlocks(blockBoard({ blockers: [perm("g", GIANT, "ai")], aiExtra: [perm("hg", HIGH_GROUND, "ai")], declared: [["g", "a1"]] }));
    expect(once).toEqual(["g::a2", "g::a3"]);
    const twice = offeredBlocks(blockBoard({ blockers: [perm("g", GIANT, "ai")], aiExtra: [perm("hg", HIGH_GROUND, "ai")], declared: [["g", "a1"], ["g", "a2"]] }));
    expect(twice).toEqual([]);
    console.log(`WITNESS highGroundOffers ${JSON.stringify({ afterOne: once, afterTwo: twice })}`);
  });

  it("⭐ cumulative: two High Grounds — a third block; Selesnya Sagittars under one High Ground — a third block too", () => {
    const two = blockBoard({ blockers: [perm("g", GIANT, "ai")], aiExtra: [perm("hg1", HIGH_GROUND, "ai"), perm("hg2", HIGH_GROUND, "ai")], declared: [["g", "a1"], ["g", "a2"]] });
    expect(offeredBlocks(two)).toEqual(["g::a3"]);
    const sag = blockBoard({ blockers: [perm("s", SAGITTARS, "ai")], aiExtra: [perm("hg", HIGH_GROUND, "ai")], declared: [["s", "a1"], ["s", "a2"]] });
    expect(offeredBlocks(sag)).toEqual(["s::a3"]);
  });

  it("⭐ Brave the Sands adds the same block; Palace Guard stays unlimited", () => {
    expect(offeredBlocks(blockBoard({ blockers: [perm("g", GIANT, "ai")], aiExtra: [perm("bts", BRAVE, "ai")], declared: [["g", "a1"]] }))).toEqual(["g::a2", "g::a3"]);
    const guard = blockBoard({ attackers: A, blockers: [perm("pg", GUARD, "ai")], aiExtra: [perm("hg", HIGH_GROUND, "ai")], declared: [["pg", "a1"], ["pg", "a2"], ["pg", "a3"]] });
    expect(offeredBlocks(guard)).toEqual(["pg::a4"]);
  });

  it("the controller's only: High Ground on the ATTACKER's side doesn't raise the AI blocker's cap", () => {
    expect(offeredBlocks(blockBoard({ blockers: [perm("g", GIANT, "ai")], userExtra: [perm("hg", HIGH_GROUND, "user")], declared: [["g", "a1"]] }))).toEqual([]);
  });

  it("⭐ at resolution (CR 510.1d): the Giant blocking two Bears under High Ground deals 2 + 1 and takes 4", () => {
    const s = blockBoard({ attackers: A.slice(0, 2), blockers: [perm("g", GIANT, "ai")], aiExtra: [perm("hg", HIGH_GROUND, "ai")], declared: [["g", "a1"], ["g", "a2"]] });
    const after = resolveCombatDamage(s, { firstStrikeStep: false });
    const b2 = after.players.user.battlefield.find((p) => p.id === "a2");
    expect({ firstBear: after.players.user.battlefield.some((p) => p.id === "a1"), secondBearMarked: b2?.damageMarked ?? null, giant: after.players.ai.battlefield.some((p) => p.id === "g"), aiLife: after.players.ai.life - s.players.ai.life })
      .toEqual({ firstBear: false, secondBearMarked: 1, giant: false, aiLife: 0 });
  });
});
