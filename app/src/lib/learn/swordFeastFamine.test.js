/**
 * swordFeastFamine.test.js — the "you <verb>" second conjunct of an and-compound trigger effect.
 *
 * "Whenever equipped creature deals combat damage to a player, that player discards a card and you untap
 * all lands you control." (Sword of Feast and Famine) — the and-split handed the second conjunct to the
 * untap parser as "you untap all lands you control", whose anchor didn't allow the (redundant) leading
 * subject. Both atoms existed; only the leading "you " blocked the compound. The untap anchor now accepts
 * it — the subject is redundant, the resolver already scopes to the controller (CR 701.20).
 *
 * CREED: the widening is the untap-all-lands anchor ONLY — a "you <unmodeled verb>" conjunct still drops
 * the whole program to LOW (pinned).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveDiscardChoice, autoPickDiscardCandidate } from "./effects/runProgram.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SFF_ORACLE = "Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}";
const SFF = { name: "Sword of Feast and Famine", type: "Artifact — Equipment", oracle: SFF_ORACLE, mana: "{3}" };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}

describe("SWORD OF FEAST AND FAMINE — recognition", () => {
  it("the full card classifies native-equipment and its trigger routes", () => {
    expect(classifyCard(SFF)).toBe("native-equipment");
    const d = detectTriggers(SFF);
    expect(d).toHaveLength(1);
    expect(!!triggerRoutesNatively(d[0])).toBe(true);
  });

  it("the compound payload parses to BOTH atoms (discard by the damaged player + untap all lands)", () => {
    const p = parseEffectClause("that player discards a card and you untap all lands you control", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op).sort()).toEqual(["discard", "untap-lands"]);
    expect(p.atoms.find((a) => a.op === "discard")).toMatchObject({ who: "damagedPlayer", amount: 1 });
    expect(p.atoms.find((a) => a.op === "untap-lands")).toMatchObject({ all: true });
  });

  it("CREED: a 'you <unmodeled verb>' conjunct still drops the whole program LOW", () => {
    const p = parseEffectClause("that player discards a card and you venture into the dungeon", "Instant", { hasX: false });
    expect(programConfidence(p)).toBe("low");
  });
});

describe("SWORD OF FEAST AND FAMINE — runtime", () => {
  it("equipped creature connects → the damaged player discards and the controller's lands untap", () => {
    const knight = permObj({ name: "Knight", type: "Creature — Human Knight", power: 2, toughness: 2, oracle: "" }, "user", "knight", { attachments: ["sff"] });
    const sword = permObj(SFF, "user", "sff", { attachedTo: "knight" });
    const land1 = permObj({ name: "Plains", type: "Basic Land — Plains", oracle: "" }, "user", "l1", { tapped: true });
    const land2 = permObj({ name: "Forest", type: "Basic Land — Forest", oracle: "" }, "user", "l2", { tapped: true });
    const base = { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage" };
    let s = {
      ...base,
      players: {
        ...base.players,
        user: { ...base.players.user, battlefield: [knight, sword, land1, land2] },
        ai: { ...base.players.ai, hand: [{ id: "h1", name: "Filler", type: "Instant" }, { id: "h2", name: "Filler 2", type: "Instant" }] },
      },
    };
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "knight", attackingPlayer: "user", defender: "ai", amount: 4 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    let resolved = resolveTopOfStack(flushTriggers(s));
    // the damaged player CHOOSES the card — the discard parks a pendingChoice for them (the decide seam)
    expect(resolved.pendingChoice?.kind).toBe("discard");
    expect(resolved.pendingChoice?.controller).toBe("ai");
    resolved = resolveDiscardChoice(resolved, autoPickDiscardCandidate(resolved, resolved.pendingChoice));
    expect(resolved.players.ai.hand.length).toBe(1);                                  // the damaged player discarded
    const lands = resolved.players.user.battlefield.filter((p) => /Land/.test(p.card.type));
    expect(lands.every((l) => !l.tapped)).toBe(true);                                 // the controller's lands untapped
  });
});
