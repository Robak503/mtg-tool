/**
 * lieutenantAnthem.test.js — the LIEUTENANT ability word (CR 903; Commander 2016). Thunderfoot Baloth:
 * "Lieutenant — As long as you control your commander, this creature gets +2/+2 and other creatures you
 * control get +2/+2 and have trample." A commander-presence-GATED compound static: a self pump + a group
 * anthem (+ granted trample) over your OTHER creatures. Parsed by parseLieutenantStatic into three gated
 * descriptors (self ptModifyGated 7c, group ptModifyGated 7c with gateOn:"source", group layer-6 addKeyword
 * with gateOn:"source"), all on gate.kind:"controlYourCommander" — a live battlefield scan for the
 * controller's isCommander flag (layers.gateMet), reusing the SAME flag selector.commanderOnly reads and the
 * SAME "you control your commander" predicate the intervening-if half of the cycle uses.
 *
 * CREED core (the enforcement, invisible to classify): with the commander in play the whole grant is LIVE
 * (self 5/5, others 4/4 + trample); with it gone NOTHING applies; a commander leaving DROPS it that same
 * derive. The source takes ONLY its self +2/+2 (excludeSelf keeps the group buff off it — never doubled);
 * an opponent's creature never gets it (controllerScope you).
 *
 * Mutation-checked (via Edit): (1) disabling parseLieutenantStatic's match → Thunderfoot body-only (parse +
 * classify pins die); (2) neutering the gateMet controlYourCommander branch (return false) → the grant never
 * applies even WITH the commander (every live-enforcement pin dies) — proving the gate is load-bearing, not
 * cosmetic.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { deriveCharacteristics, permanentHasKeyword } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const THUNDERFOOT_ORACLE = "Trample\nLieutenant — As long as you control your commander, this creature gets +2/+2 and other creatures you control get +2/+2 and have trample. (You control your commander if it's on the battlefield or in the command zone.)";
const thunderCard = (id = "tf-card") => ({ id, name: "Thunderfoot Baloth", type: "Creature — Beast", power: "3", toughness: "3", mana: "{4}{G}", oracle: THUNDERFOOT_ORACLE });

const commander = (id) => createPermanent({ id, card: { id: `${id}-c`, name: "My Commander", type: "Legendary Creature — Elf", power: "2", toughness: "2", oracle: "", isCommander: true }, controller: "user", summoningSick: false });
const bear = (id, controller) => createPermanent({ id, card: { name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller });

function board({ withCommander }) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const tf = createPermanent({ id: "tf", card: thunderCard(), controller: "user", summoningSick: false });
  const userBf = [tf, bear("ally", "user"), ...(withCommander ? [commander("cmd")] : [])];
  return {
    ...s,
    activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: userBf },
      ai1: { ...s.players.ai1, battlefield: [bear("foe", "ai1")] },
    },
  };
}

describe("LIEUTENANT — parse + classify", () => {
  it("Thunderfoot emits three commander-gated descriptors (self 7c, group 7c gateOn:source, group trample 6)", () => {
    const d = parseStaticAbilities(thunderCard());
    const self = d.find((x) => x.affects.mode === "self" && x.op.layerOp === "ptModifyGated");
    const groupPt = d.find((x) => x.affects.mode === "dynamic" && x.op.layerOp === "ptModifyGated");
    const groupKw = d.find((x) => x.op.layerOp === "addKeyword");
    expect(self.op).toMatchObject({ power: 2, toughness: 2, gate: { kind: "controlYourCommander" } });
    expect(groupPt.op).toMatchObject({ power: 2, toughness: 2, gate: { kind: "controlYourCommander", gateOn: "source" } });
    expect(groupPt.affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], excludeSelf: true });
    expect(groupKw.op).toMatchObject({ keyword: "Trample", gate: { kind: "controlYourCommander", gateOn: "source" } });
  });
  it("the whole card classifies native-static", () => {
    expect(classifyCard(thunderCard())).toBe("native-static");
  });
  it("an unmodeled keyword in the grant tail nulls the WHOLE clause (safe FN — whole-card CREED parks it)", () => {
    // 'phasing' isn't a grantable static keyword → parseAnthemHaveTail returns null → the Lieutenant clause
    // stays LOW (all-or-nothing — the +2/+2 is never silently kept without the unmodeled grant).
    const bad = { id: "x", name: "Fake Lt", type: "Creature — Beast", power: "3", toughness: "3",
      oracle: "Lieutenant — As long as you control your commander, this creature gets +2/+2 and other creatures you control get +2/+2 and have phasing." };
    expect(parseStaticAbilities(bad).length).toBe(0);
    expect(classifyCard(bad)).toBe("body-only");
  });
});

describe("LIEUTENANT — the grant is ENFORCED live (CREED core)", () => {
  it("WITH the commander: self is 5/5, the ally is 4/4 and has trample", () => {
    const s = board({ withCommander: true });
    const tf = deriveCharacteristics(s, "tf");
    const ally = deriveCharacteristics(s, "ally");
    expect([tf.power, tf.toughness]).toEqual([5, 5]);      // base 3/3 + self +2/+2 only (excludeSelf keeps the group buff off it)
    expect([ally.power, ally.toughness]).toEqual([4, 4]);  // base 2/2 + group +2/+2
    expect(permanentHasKeyword(s, "ally", "trample")).toBe(true);
  });
  it("WITHOUT the commander: nothing applies — self 3/3, ally 2/2, no granted trample", () => {
    const s = board({ withCommander: false });
    const tf = deriveCharacteristics(s, "tf");
    const ally = deriveCharacteristics(s, "ally");
    expect([tf.power, tf.toughness]).toEqual([3, 3]);
    expect([ally.power, ally.toughness]).toEqual([2, 2]);
    expect(permanentHasKeyword(s, "ally", "trample")).toBe(false);
  });
  it("an OPPONENT's creature never gets the grant, even with your commander in play (controllerScope you)", () => {
    const s = board({ withCommander: true });
    const foe = deriveCharacteristics(s, "foe");
    expect([foe.power, foe.toughness]).toEqual([2, 2]);
    expect(permanentHasKeyword(s, "foe", "trample")).toBe(false);
  });
});
