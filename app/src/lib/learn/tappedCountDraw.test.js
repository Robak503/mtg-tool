/**
 * tappedCountDraw.test.js — BLITZ TD-1: "Draw a card for each tapped creature target opponent controls."
 * (Theft of Dreams / Borrowing 100,000 Arrows). The controller draws; the chosen opponent target only
 * supplies the count — read AT RESOLUTION (CR 608.2h) off their battlefield, layer-aware creature test,
 * tapped only. Rides the existing draw atom via amountCount → countForSpec (no new resolver).
 * Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence, programNeedsChosenTarget } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const THEFT = { id: "td", name: "Theft of Dreams", type: "Sorcery", mana: "{2}{U}",
  oracle: "Draw a card for each tapped creature target opponent controls." };

describe("parse + classify", () => {
  it("parses to a chosen-opponent counted draw; both carriers flip; variants stay off", () => {
    const prog = parseEffectProgram(THEFT);
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "draw", who: "controller", targetType: "opponent", amountCount: { kind: "tappedCreaturesOfTargetOpponent" } }]);
    expect(programNeedsChosenTarget(prog)).toBe(true);
    expect(classifyCard(THEFT)).toBe("native-spell");
    expect(classifyCard({ id: "ba", name: "Borrowing 100,000 Arrows", type: "Sorcery", mana: "{1}{U}",
      oracle: "Draw a card for each tapped creature target opponent controls." })).toBe("native-spell");
    // FN guards: an untapped counter and an each-opponent scope never match the anchor.
    expect(classifyCard({ id: "x1", name: "Hypo Untapped", type: "Sorcery", mana: "{U}",
      oracle: "Draw a card for each untapped creature target opponent controls." })).toBe("arbiter-spell");
    expect(classifyCard({ id: "x2", name: "Hypo Each", type: "Sorcery", mana: "{U}",
      oracle: "Draw a card for each tapped creature your opponents control." })).toBe("arbiter-spell");
  });
});

describe("runtime — the count reads the CHOSEN opponent's tapped creatures at resolution", () => {
  it("draws exactly the tapped-creature count of the targeted opponent; the caster and other seats don't matter", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const mk = (id, controller, tapped) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller, tapped, summoningSick: false });
    s = { ...s, players: { ...s.players,
      ai1: { ...s.players.ai1, battlefield: [mk("t1", "ai1", true), mk("t2", "ai1", true), mk("u1", "ai1", false)] },
      ai2: { ...s.players.ai2, battlefield: [mk("t3", "ai2", true)] },   // a DIFFERENT opponent's tapped creature — not counted
      user: { ...s.players.user, battlefield: [mk("t4", "user", true)], library: Array.from({ length: 5 }, (_, i) => ({ id: `lib${i}`, name: `L${i}`, type: "Sorcery", oracle: "" })) } } };
    const handBefore = s.players.user.hand.length;
    const prog = parseEffectProgram(THEFT);
    const after = runEffectProgram(s, { source: { name: "Theft of Dreams" }, payload: { params: { program: prog, controller: "user", targets: [{ type: "player", id: "ai1" }] } } });
    expect(after.players.user.hand.length - handBefore).toBe(2); // ai1's two tapped creatures — not the untapped one, not ai2's, not the caster's
  });
});
