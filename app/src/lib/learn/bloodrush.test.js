/**
 * bloodrush.test.js — Bloodrush (the residue census, 2026-10-01: Rubblebelt Maaka, Skinbrand Goblin, Ghor-Clan Rampager,
 * Skarrg Goliath, Wasteland Viper, Zhur-Taa Swine).
 *
 *   "Bloodrush — {R}, Discard this card: Target attacking creature gets +3/+3 until end of turn."
 *
 * Bloodrush is an ability word (CR 207.2c): the line is the ordinary from-hand discard ability ("<mana>, Discard this card:
 * <effect>"), activated whenever its controller has priority (CR 602.2). Its target exists only in combat, so the from-hand
 * lane gets the ④-AE combat window for programs that target by combat role: in a combat step, either player holding
 * priority. Every other discard ability keeps the own-main-phase window.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic label that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseDiscardCostAbility } from "./effects/abilities.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MAAKA = { name: "Rubblebelt Maaka", type: "Creature — Cat", mana: "{3}{R}", colors: ["R"], power: "3", toughness: "3", keywords: ["Bloodrush"],
  oracle: "Bloodrush — {R}, Discard this card: Target attacking creature gets +3/+3 until end of turn." };
const RAMPAGER = { name: "Ghor-Clan Rampager", type: "Creature — Beast", mana: "{2}{R}{G}", colors: ["R", "G"], power: "4", toughness: "4", keywords: ["Bloodrush", "Trample"],
  oracle: "Trample\nBloodrush — {R}{G}, Discard this card: Target attacking creature gets +4/+4 and gains trample until end of turn." };
const SKINBRAND = { name: "Skinbrand Goblin", type: "Creature — Goblin Warrior", mana: "{1}{R}", colors: ["R"], power: "2", toughness: "1", keywords: ["Bloodrush"],
  oracle: "Bloodrush — {R}, Discard this card: Target attacking creature gets +2/+1 until end of turn." };
const GOLIATH = { name: "Skarrg Goliath", type: "Creature — Beast", mana: "{6}{G}{G}", colors: ["G"], power: "9", toughness: "9", keywords: ["Bloodrush", "Trample"],
  oracle: "Trample\nBloodrush — {5}{G}{G}, Discard this card: Target attacking creature gets +9/+9 and gains trample until end of turn." };
const VIPER = { name: "Wasteland Viper", type: "Creature — Snake", mana: "{G}", colors: ["G"], power: "1", toughness: "2", keywords: ["Bloodrush", "Deathtouch"],
  oracle: "Deathtouch\nBloodrush — {G}, Discard this card: Target attacking creature gets +1/+2 and gains deathtouch until end of turn." };
const SWINE = { name: "Zhur-Taa Swine", type: "Creature — Boar", mana: "{3}{R}{G}", colors: ["R", "G"], power: "5", toughness: "4", keywords: ["Bloodrush"],
  oracle: "Bloodrush — {1}{R}{G}, Discard this card: Target attacking creature gets +5/+4 until end of turn." };
const CARNOSAUR = { name: "Trumpeting Carnosaur", type: "Creature — Dinosaur", mana: "{4}{R}{R}", colors: ["R"], power: "7", toughness: "6", keywords: ["Discover", "Trample"],
  oracle: "Trample\nWhen this creature enters, discover 5.\n{2}{R}, Discard this card: It deals 3 damage to target creature or planeswalker." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** `attacker` attacks with its Bear ATT; `holder` holds priority in `step`; the user has `hand` and `pool`. */
function table({ attacker = "user", holder = attacker, step = "declare-blockers", hand = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const defender = attacker === "user" ? "ai" : "user";
  const inCombat = step !== "main";
  const s = { ...g, turn: 5, activePlayer: attacker, priorityHolder: holder, consecutivePasses: 0, phase: inCombat ? "combat" : "precombat-main", step, stack: [], pendingTriggers: [],
    ...(inCombat ? { combat: { attackers: [{ permanentId: "ATT", attackingPlayer: attacker, defender }], blockers: [] } } : {}) };
  const players = { ...g.players };
  players[attacker] = { ...players[attacker], battlefield: [perm("ATT", BEARS, attacker)] };
  players.user = { ...players.user, hand: hand.map(([id, c]) => ({ ...c, id })), manaPool: { ...players.user.manaPool, ...pool } };
  return { ...s, players };
}
const offers = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "discard-ability" && a.cardId === cardId);

describe("the cards", () => {
  it("the six single-line bloodrush creatures read native; the label is read like Channel's", () => {
    expect([MAAKA, SKINBRAND, RAMPAGER, GOLIATH, VIPER, SWINE].map((c) => classifyCard(c))).toEqual(Array(6).fill("native-body"));
    expect(parseDiscardCostAbility(MAAKA)).toEqual({ cost: "{R}", effectText: "Target attacking creature gets +3/+3 until end of turn.", channel: false, reduction: null });
  });

  it("fence (synthetic): an unknown label is not read", () => {
    expect(parseDiscardCostAbility({ name: "Probe", type: "Creature — Cat", oracle: "Swiftrush — {R}, Discard this card: Target attacking creature gets +3/+3 until end of turn." })).toBe(null);
  });
});

describe("in combat", () => {
  it("your attacking Bear: Rubblebelt Maaka is discarded and the Bear gets +3/+3 (WITNESS)", () => {
    const s0 = table({ hand: [["maaka", MAAKA]], pool: { R: 1 } });
    const [action] = offers(s0, "maaka");
    const s = resolveTopOfStack(dispatchAction(s0, action));
    const witness = { targets: action.targets.map((t) => t.id), graveyard: s.players.user.graveyard.map((c) => c.name), size: [permanentPower(s, "ATT"), permanentToughness(s, "ATT")] };
    console.log(`WITNESS bloodrush ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ targets: ["ATT"], graveyard: ["Rubblebelt Maaka"], size: [5, 5] });
  });

  it("Ghor-Clan Rampager's bloodrush also grants trample", () => {
    const s0 = table({ hand: [["ramp", RAMPAGER]], pool: { R: 1, G: 1 } });
    const s = resolveTopOfStack(dispatchAction(s0, offers(s0, "ramp")[0]));
    expect({ size: [permanentPower(s, "ATT"), permanentToughness(s, "ATT")], trample: permanentHasKeyword(s, "ATT", "Trample") }).toEqual({ size: [6, 6], trample: true });
  });

  it("the defender holding priority may bloodrush the AI's attacker too (either player, CR 602.2)", () => {
    expect(offers(table({ attacker: "ai", holder: "user", hand: [["maaka", MAAKA]], pool: { R: 1 } }), "maaka").map((a) => a.targets[0].id)).toEqual(["ATT"]);
  });
});

describe("the window", () => {
  it("a discard ability that does not target by combat role keeps the main phase only: Trumpeting Carnosaur", () => {
    const hand = [["carno", CARNOSAUR]], pool = { R: 3 };
    expect({
      yourMain: offers(table({ step: "main", hand, pool }), "carno").length > 0,
      yourCombat: offers(table({ hand, pool }), "carno").length,
      theirMain: offers(table({ attacker: "ai", holder: "user", step: "main", hand, pool }), "carno").length,
    }).toEqual({ yourMain: true, yourCombat: 0, theirMain: 0 });
  });

  it("on the battlefield the bloodrush line is not an ability of the permanent: Maaka offers nothing there", () => {
    const s0 = table({ pool: { R: 1 } });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...s0.players.user.battlefield, perm("MK", MAAKA, "user")] } } };
    expect(legalActionsForPlayer(s, "user").filter((a) => a.permanentId === "MK" || a.sourceId === "MK" || a.cardId === "MK")).toEqual([]);
  });

  it("with priority elsewhere nothing is offered", () => {
    expect(offers(table({ holder: "ai", hand: [["maaka", MAAKA]], pool: { R: 1 } }), "maaka")).toEqual([]);
  });
});
