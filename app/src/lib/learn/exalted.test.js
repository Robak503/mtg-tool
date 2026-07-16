/**
 * exalted.test.js — KW-EXALTED (CR 702.83, verified vs the bundled cr_current.json — BLITZ EX-1).
 * "Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn."
 * Fired at the checkAttackTriggers exalted site: EXACTLY ONE declared attacker → count the
 * controller's battlefield exalted instances (reminder-stripped, any permanent type) → ONE
 * aggregated fire-time +N/+N descriptor on the lone attacker (the rampage pattern; sourcePermanent
 * = the attacker so "this creature" binds to it).
 * CREED FPs guarded: two attackers → NO exalted fire; the aggregate must count instances across
 * permanents (a non-creature carrier counts). Real oracle fixtures (bundled Scryfall).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkAttackTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AKRASAN_SQUIRE = { id: "as", name: "Akrasan Squire", type: "Creature — Human Soldier", mana: "{W}",
  power: "1", toughness: "1", oracle: "Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)" };
const ARDENT_PLEA = { id: "ap", name: "Ardent Plea", type: "Enchantment", mana: "{1}{W}{U}",
  oracle: "Exalted (Whenever a creature you control attacks alone, that creature gets +1/+1 until end of turn.)\nCascade (When you cast this spell, exile cards from the top of your library until you exile a nonland card that costs less. You may cast it without paying its mana cost. Put the exiled cards on the bottom of your library in a random order.)" };

describe("classify", () => {
  it("Akrasan Squire (keyword-only) and Ardent Plea (exalted + cascade enchantment) flip native", () => {
    expect(classifyCard(AKRASAN_SQUIRE)).toBe("native-body");
    // isKeywordOnly covers any permanent type, so a keyword-only enchantment lands native-body too.
    expect(["native-body", "native-static", "native-mixed", "native-trigger"]).toContain(classifyCard(ARDENT_PLEA));
  });
});

describe("fire-time — exactly-one-attacker gate, instance aggregation", () => {
  const bear = (id) => createPermanent({ id, card: { name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });

  function board(attackerIds) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const squire1 = createPermanent({ id: "sq1", card: AKRASAN_SQUIRE, controller: "user", summoningSick: false });
    const plea = createPermanent({ id: "plea", card: ARDENT_PLEA, controller: "user", summoningSick: false });
    s = {
      ...s,
      players: { ...s.players, user: { ...s.players.user, battlefield: [squire1, plea, bear("b1"), bear("b2")] } },
      combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai1" })), blockers: [] },
    };
    return s;
  }

  it("one attacker + two exalted instances (creature + enchantment) → ONE +2/+2 descriptor on the attacker", () => {
    const out = checkAttackTriggers(board(["b1"]));
    const ex = (out.pendingTriggers || []).filter((t) => t.descriptor?.event === "exalted");
    expect(ex).toHaveLength(1);
    expect(ex[0].descriptor.effectClause).toBe("this creature gets +2/+2 until end of turn");
    expect(ex[0].source?.permanentId).toBe("b1");
  });

  it("CREED — two attackers → NO exalted fire", () => {
    const out = checkAttackTriggers(board(["b1", "b2"]));
    expect((out.pendingTriggers || []).filter((t) => t.descriptor?.event === "exalted")).toHaveLength(0);
  });
});
