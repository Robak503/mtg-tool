/**
 * diesExiledInstead.test.js — "exile it instead" at EVERY death site (the 09-06 plan's stage ③, row ⑱, 2026-09-30).
 *
 * One predicate, gameState.diesExiledInstead, asked of the pre-removal state by all four death sites — lethal damage / 0
 * toughness (destroyLethalCreatures), the legend rule (applyLegendRule), destroy (spellEffects.applyDestroyEffect) and
 * sacrifice (removal.sacrificeCreatureEffect). Its three sources: Lava Coil's this-turn stamp, the damage-source static
 * (Incendiary Oracle / Kumano's Pupils — ③ · 8), and the new opponent-creature static ("If a creature an opponent controls
 * would die, exile it instead." — Stone of Erech, Misery's Shadow). Before this, only the first two sites asked, so a
 * creature under any of those replacements that was DESTROYED or SACRIFICED still went to the graveyard — the documented
 * under-application ③ · 8 shipped with, now retired. An exiled creature never died (CR 614), so its dies triggers stay quiet.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, applyLegendRule, markExileIfDies } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STONE = { name: "Stone of Erech", type: "Legendary Artifact", mana: "{1}",
  oracle: "If a creature an opponent controls would die, exile it instead.\n{2}, {T}, Sacrifice Stone of Erech: Exile target player's graveyard. Draw a card." };
const SHADOW = { name: "Misery's Shadow", type: "Creature — Shade", mana: "{1}{B}", power: 2, toughness: 2,
  oracle: "If a creature an opponent controls would die, exile it instead.\n{1}: This creature gets +1/+1 until end of turn." };
const MURDER = { id: "murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", oracle: "Destroy target creature." };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const TRAVELER = { name: "Doomed Traveler", type: "Creature — Human Soldier", mana: "{W}", power: 1, toughness: 1,
  oracle: "When this creature dies, create a 1/1 white Spirit creature token with flying." };
const PUPILS = { name: "Kumano's Pupils", type: "Creature — Human Shaman", mana: "{4}{R}", power: 3, toughness: 3,
  oracle: "If a creature dealt damage by this creature this turn would die, exile it instead." };
const ISAMARU = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", power: 2, toughness: 2, oracle: "" };

const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });
function game({ user = [], ai = [], hand = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: user, hand, manaPool: { ...s.players.user.manaPool, ...pool } }, ai: { ...s.players.ai, battlefield: ai } } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 8 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
function castAt(s, cardId, targetId) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId && (a.targets || []).some((t) => t.id === targetId));
  expect(act).toBeTruthy();
  return settle(dispatchAction(s, act));
}
const zoneOf = (s, name) => ["graveyard", "exile"].find((z) => ["user", "ai"].some((pid) => (s.players[pid][z] || []).some((c) => c.name === name)))
  || (["user", "ai"].some((pid) => s.players[pid].battlefield.some((p) => p.card?.name === name)) ? "battlefield" : "gone");
const murder = (board) => castAt(game({ ...board, hand: [MURDER], pool: { B: 2, C: 1 } }), "murder", "victim");

describe("classification", () => {
  it("Stone of Erech and Misery's Shadow → native-mixed", () => {
    expect([classifyCard(STONE), classifyCard(SHADOW)]).toEqual(["native-mixed", "native-mixed"]);
  });
});

describe("DESTROY — the site that never asked before", () => {
  it("VACUITY CONTROL — Murder on the AI's Grizzly Bears with no replacement: the graveyard", () => {
    expect(zoneOf(murder({ ai: [perm(BEARS, "victim", "ai")] }), "Grizzly Bears")).toBe("graveyard");
  });

  it("⭐ the user's Stone of Erech: Murder exiles the AI's Bears", () => {
    const s = murder({ user: [perm(STONE, "stone", "user")], ai: [perm(BEARS, "victim", "ai")] });
    expect(zoneOf(s, "Grizzly Bears")).toBe("exile");
    console.log(`WITNESS stoneMurder ${zoneOf(s, "Grizzly Bears")}`);
  });

  it("⛔ an OPPONENT's creature only: the user's own Bears, Murdered under the user's Stone, go to the graveyard", () => {
    expect(zoneOf(murder({ user: [perm(STONE, "stone", "user"), perm(BEARS, "victim", "user")] }), "Grizzly Bears")).toBe("graveyard");
  });

  it("⭐ it never died: Doomed Traveler exiled by Murder under Misery's Shadow makes no Spirit (the vacuity run does)", () => {
    const spirits = (s) => s.players.ai.battlefield.filter((p) => /Spirit/.test(p.card?.type || "")).length;
    expect(spirits(murder({ ai: [perm(TRAVELER, "victim", "ai")] }))).toBe(1);
    const s = murder({ user: [perm(SHADOW, "shadow", "user")], ai: [perm(TRAVELER, "victim", "ai")] });
    expect([zoneOf(s, "Doomed Traveler"), spirits(s)]).toEqual(["exile", 0]);
  });

  it("⭐ LAVA COIL's stamp now holds at the destroy site too: marked this turn, then Murdered → exile", () => {
    const board = game({ ai: [perm(BEARS, "victim", "ai")], hand: [MURDER], pool: { B: 2, C: 1 } });
    const s = castAt(markExileIfDies(board, { permanentId: "victim", turn: board.turn }), "murder", "victim");
    expect(zoneOf(s, "Grizzly Bears")).toBe("exile");
  });

  it("⭐ ③ · 8's damage source now holds at the destroy site too: Kumano's Pupils damaged the Bears, then Murder → exile", () => {
    const damagedBears = { ...perm(BEARS, "victim", "ai"), damageMarked: 1, damagedBy: ["pupils"] };
    expect(zoneOf(murder({ user: [perm(PUPILS, "pupils", "user")], ai: [damagedBears] }), "Grizzly Bears")).toBe("exile");
  });
});

describe("SACRIFICE, LETHAL DAMAGE, THE LEGEND RULE — every other site asks the same predicate", () => {
  it("⭐ the AI sacrifices its Bears under the user's Stone: exiled (still sacrificed, never died)", () => {
    const s = sacrificeCreatureEffect(game({ user: [perm(STONE, "stone", "user")], ai: [perm(BEARS, "victim", "ai")] }), "ai", "victim");
    expect(zoneOf(s, "Grizzly Bears")).toBe("exile");
  });

  it("⭐ Lightning Bolt kills the AI's Bears under the user's Stone: exiled", () => {
    const s = castAt(game({ user: [perm(STONE, "stone", "user")], ai: [perm(BEARS, "victim", "ai")], hand: [BOLT], pool: { R: 1 } }), "bolt", "victim");
    expect(zoneOf(s, "Grizzly Bears")).toBe("exile");
  });

  it("⭐ the legend rule: the AI's older Isamaru is exiled under the user's Misery's Shadow", () => {
    const older = { ...perm(ISAMARU, "i1", "ai"), timestamp: 1 };
    const newer = { ...perm(ISAMARU, "i2", "ai"), timestamp: 2 };
    const out = applyLegendRule(game({ user: [perm(SHADOW, "shadow", "user")], ai: [older, newer] })).state;
    expect([(out.players.ai.exile || []).map((c) => c.name), out.players.ai.battlefield.map((p) => p.id)]).toEqual([["Isamaru, Hound of Konda"], ["i2"]]);
  });
});
