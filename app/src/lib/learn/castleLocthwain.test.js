/**
 * castleLocthwain.test.js — Castle Locthwain (play-weighted #793):
 *
 *   "This land enters tapped unless you control a Swamp. / {T}: Add {B}. /
 *    {1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand."
 *
 * The draw happens first, so the hand is counted after it (CR 608.2c — instructions in written order; the number is read as the
 * life loss happens, CR 608.2h). The AI draws with it only while the loss leaves it at 10 life or more — the same life-prudence
 * floor its other life payments use (the shockland auto-policy, an alternative cost's life payment).
 *
 * Oracle text copied from the bundled Scryfall snapshot (oracle_cards.json, read 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CASTLE = { name: "Castle Locthwain", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "This land enters tapped unless you control a Swamp.\n{T}: Add {B}.\n{1}{B}{B}, {T}: Draw a card, then you lose life equal to the number of cards in your hand." };
const VISLOR = { name: "Vislor Turlough", type: "Legendary Creature — Rogue", mana: "{3}{U}{B}", cmc: 5, colors: ["U", "B"], keywords: [], power: "3", toughness: "4",
  oracle: "Deal with the Black Guardian — When Vislor Turlough enters, you may have an opponent gain control of it. If you do, it's goaded for as long as they control it.\nAt the beginning of your end step, draw a card, then you lose life equal to the number of cards in your hand.\nDoctor's companion (You can have two commanders if the other is the Doctor.)" };
const SWAMP = { name: "Swamp", type: "Basic Land — Swamp", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {B}.)" };
const card = (id, name = "Filler") => ({ id, name, type: "Sorcery", mana: "{9}", cmc: 9, colors: [], keywords: [], oracle: "" });

/** `who` holds the Castle and three untapped Swamps, `hand` cards in hand and a library of five, at `life`. */
function table(who, { hand = 2, life = 40, active = who } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const P = (id, c) => createPermanent({ id, controller: who, summoningSick: false, card: { ...c, id: `c-${id}` } });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: who, consecutivePasses: 0, stack: [],
    players: { ...s0.players, [who]: { ...s0.players[who], life, landsPlayedThisTurn: 1,
      battlefield: [P("castle", CASTLE), P("s1", SWAMP), P("s2", SWAMP), P("s3", SWAMP)],
      hand: Array.from({ length: hand }, (_, i) => card(`h${i}`)), library: Array.from({ length: 5 }, (_, i) => card(`lib${i}`, `Lib ${i}`)) } } };
}
const castleDraw = (a) => a.kind === "activate-ability" && a.permanentId === "castle" && (a.program?.atoms || []).some((x) => x.op === "draw");

describe("classification", () => {
  it("⭐ Castle Locthwain is `land`", () => {
    expect(classifyCard(CASTLE)).toBe("land");
  });

  it("⭐ the draw line reads: draw, then lose life by the hand's size", () => {
    const ab = parseActivatedAbilities(CASTLE).find((a) => /Draw a card/.test(a.raw));
    expect(ab.modeled).toBe(true);
    expect(ab.program.atoms.map((a) => a.op)).toEqual(["draw", "lose-life"]);
    expect(ab.program.atoms[1]).toMatchObject({ who: "controller", amountCount: { kind: "cardsInHand", per: 1 } });
  });

  it("control — Vislor Turlough's own other lines keep it parked", () => {
    expect(classifyCard(VISLOR)).toBe("body-only");
  });

  it("⭐ …but its end-step trigger (the same sentence) now routes natively, so a game plays it", () => {
    const d = detectTriggers(VISLOR).find((x) => x.event === "endStep");
    expect(d.effectClause).toBe("draw a card, then you lose life equal to the number of cards in your hand");
    expect(triggerRoutesNatively(d)).toBe(true);
  });
});

describe("runtime", () => {
  it("⭐ the activation draws first and then loses life equal to the hand AFTER the draw", () => {
    const s = table("user", { hand: 2, life: 40 });
    const act = legalActionsForPlayer(s, "user").find(castleDraw);
    expect(act).toBeTruthy();
    let n = dispatchAction(s, act);
    let g = 0;
    while (n.stack?.length && g++ < 4) n = resolveTopOfStack(n);
    expect(n.players.user.hand).toHaveLength(3);
    expect(n.players.user.life).toBe(37);
    expect(n.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort()).toEqual(["castle", "s1", "s2", "s3"]);
  });

  it("⭐ an empty hand: draw one, lose 1", () => {
    const s = table("user", { hand: 0, life: 20 });
    const act = legalActionsForPlayer(s, "user").find(castleDraw);
    expect(act).toBeTruthy();
    let n = dispatchAction(s, act);
    while (n.stack?.length) n = resolveTopOfStack(n);
    expect(n.players.user.hand).toHaveLength(1);
    expect(n.players.user.life).toBe(19);
  });

  it("control — it enters untapped beside a Swamp and tapped without one", () => {
    const play = (bf) => {
      const s0 = createGameState({ userDeck: [], aiDeck: [] });
      const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
        players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...CASTLE, id: "c-castle" }], battlefield: bf, landsPlayedThisTurn: 0 } } };
      return dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "c-castle" }).players.user.battlefield.find((p) => p.card.name === "Castle Locthwain").tapped;
    };
    expect(play([createPermanent({ id: "s1", controller: "user", card: { ...SWAMP, id: "c-s1" } })])).toBe(false);
    expect(play([])).toBe(true);
  });
});

describe("the AI", () => {
  it("⭐ draws with it on its own turn when the loss leaves it at 10 or more", () => {
    const s = table("ai", { hand: 2, life: 40 });
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && castleDraw(a)).toBe(true);
  });

  it("⭐ draws at exactly the floor: life 13 with two cards in hand (13 − 3 = 10)", () => {
    const s = table("ai", { hand: 2, life: 13 });
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && castleDraw(a)).toBe(true);
  });

  it("⛔ holds it when the loss would drop it under 10 (life 12, two cards in hand: 12 − 3 = 9)", () => {
    const s = table("ai", { hand: 2, life: 12 });
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && castleDraw(a)).toBe(false);
  });

  it("⛔ never draws itself to death (life 3, five cards in hand)", () => {
    const s = table("ai", { hand: 5, life: 3 });
    const a = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(a && castleDraw(a)).toBe(false);
  });
});
