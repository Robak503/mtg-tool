/**
 * capAmericaSuperSoldier.test.js — the shield-counter-gated PLAYER+GROUP hexproof union
 * (SHELF CAP3 — Captain America, Super-Soldier).
 *
 * "As long as Captain America has a shield counter on him, you and other Heroes you control have
 * hexproof." Seams:
 *   1. parseAsLongAsGate gains the NAMED-COUNTER PRESENCE arm ("[this creature] has a <name> counter
 *      on it/him/her" → countersOnSelf ≥ 1, gateOn:"source") — the ±1/+1 and loyalty kinds refused.
 *   2. the gated-group branch's union arm: "you and other <Subtype>s you control have hexproof" emits
 *      the gated playerHexproof op (player half) + a gated addKeyword over subtypes+excludeSelf (group).
 *   3. layers.playerHasHexproof evaluates op.gate against the SOURCE live (CR 613.7).
 * CREED FP = hexproof held with NO shield counter, Cap granting HIMSELF the keyword ("other"), a
 * non-Hero creature protected, or any keyword other than hexproof riding the union arm.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { playerHasHexproof, permanentHasKeyword } from "./layers.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const CAP = {
  id: "cap", name: "Captain America, Super-Soldier", type: "Legendary Creature — Human Soldier Hero", mana: "{1}{W}{W}",
  power: "2", toughness: "3",
  oracle: "First strike\nCaptain America enters with a shield counter on him. (If he would be dealt damage or destroyed, remove a shield counter from him instead.)\nAs long as Captain America has a shield counter on him, you and other Heroes you control have hexproof.",
};

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withField(s, pid, perms) {
  return { ...s, players: { ...s.players, [pid]: { ...s.players[pid], battlefield: perms } } };
}
const hero = (id, controller) => createPermanent({ id, controller, card: { name: id, type: "Creature — Human Hero", power: "2", toughness: "2", oracle: "" } });
const bear = (id, controller) => createPermanent({ id, controller, card: { name: id, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" } });

describe("parse + classify", () => {
  it("the gated union emits BOTH halves under one gate; the whole card flips native", () => {
    const descs = parseStaticAbilities(CAP);
    const player = descs.find((d) => d.op?.layerOp === "playerHexproof");
    expect(player).toBeTruthy();
    expect(player.op.gate).toMatchObject({ countSpec: { kind: "countersOnSelf", counterType: "shield" }, atLeast: 1 });
    const group = descs.find((d) => d.op?.layerOp === "addKeyword");
    expect(group).toMatchObject({
      layer: 6, op: { layerOp: "addKeyword", keyword: "hexproof" },
      affects: { mode: "dynamic", selector: { controllerScope: "you", subtypes: ["Hero"], excludeSelf: true } },
    });
    expect(group.op.gate).toMatchObject({ countSpec: { counterType: "shield" }, atLeast: 1 });
    expect(classifyCard(CAP)).toBe("native-static");
  });

  it("CREED — a non-hexproof keyword on the union subject does NOT ride this arm", () => {
    const v = { name: "Variant", type: "Creature — Human Hero", power: "1", toughness: "1", oracle: "As long as this creature has a shield counter on him, you and other Heroes you control have lifelink." };
    expect(parseStaticAbilities(v).some((d) => d.op?.layerOp === "playerHexproof")).toBe(false);
    expect(classifyCard(v)).toBe("body-only");
  });

  it("a +1/+1 presence gate rides the PRE-EXISTING arm, not the new named-counter one — no double-handling", () => {
    // The new arm refuses ±1/+1 (its `[a-z]+` can't even spell it); the CA-1 presence arm already owns that
    // form. Pin that the union still parses with the CORRECT counterType — one gate, one vocabulary owner.
    const v = { name: "Variant2", type: "Creature — Human", power: "1", toughness: "1", oracle: "As long as this creature has a +1/+1 counter on it, you and other Heroes you control have hexproof." };
    const descs = parseStaticAbilities(v);
    const gates = descs.map((d) => d.op?.gate).filter(Boolean);
    expect(gates).toHaveLength(2);
    for (const g of gates) expect(g.countSpec).toMatchObject({ kind: "countersOnSelf", counterType: "+1/+1" });
  });
});

describe("runtime — the gate reads the shield pile live", () => {
  function board(capCounters) {
    const cap = { ...createPermanent({ id: "cap", card: CAP, controller: "user" }), counters: capCounters };
    let s = withField(baseState(), "user", [cap, hero("ally", "user"), bear("bruin", "user")]);
    s = withField(s, "ai1", [hero("foeHero", "ai1")]);
    return s;
  }

  it("with a shield counter: YOU have hexproof, the other Hero has it, Cap himself and the non-Hero do NOT", () => {
    const s = board({ shield: 1 });
    expect(playerHasHexproof(s, "user")).toBe(true);
    expect(permanentHasKeyword(s, "ally", "Hexproof")).toBe(true);
    expect(permanentHasKeyword(s, "cap", "Hexproof")).toBe(false);   // "other" — excludeSelf
    expect(permanentHasKeyword(s, "bruin", "Hexproof")).toBe(false); // not a Hero
  });

  it("FP guard — the OPPONENT's Hero and the opponent player get nothing (controllerScope you)", () => {
    const s = board({ shield: 1 });
    expect(permanentHasKeyword(s, "foeHero", "Hexproof")).toBe(false);
    expect(playerHasHexproof(s, "ai1")).toBe(false);
  });

  it("no shield counter → the whole union is OFF (live gate, CR 613.7)", () => {
    const s = board({});
    expect(playerHasHexproof(s, "user")).toBe(false);
    expect(permanentHasKeyword(s, "ally", "Hexproof")).toBe(false);
  });
});
