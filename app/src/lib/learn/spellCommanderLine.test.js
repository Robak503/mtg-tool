/**
 * spellCommanderLine.test.js — "Spell commander" (the 09-06 plan's stage ③ · 46, 2026-09-30 — Ransack, the Lab; Rampant, Growth).
 *
 * "Spell commander (This card can be your commander. In Limited, it can partner like other monocolored legends.)" is a
 * deck-construction permission: it grants no ability and changes nothing about the spell cast from hand, which is the only
 * way the engine plays these five playtest sorceries (buildableCommanders never offers a sorcery as a commander, and none
 * is Commander-legal). parseHelpers.stripCostOnlyKeywordLines now drops the BARE keyword line, on the one path both the
 * classifier and the cast program read, so the two can't disagree.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice, autoPickTutorCandidate, resolveImpulseDigChoice } from "./effects/runProgram.js";
import { stripCostOnlyKeywordLines } from "./effects/parseHelpers.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REMINDER = " (This card can be your commander. In Limited, it can partner like other monocolored legends.)";
const RAMPANT = { id: "rg", name: "Rampant, Growth", type: "Sorcery", mana: "{1}{G}", mana_cost: "{1}{G}", cmc: 2, colors: ["G"], keywords: [],
  oracle: `Spell commander${REMINDER}\nSearch your library for a basic land card, put that card onto the battlefield tapped, then shuffle.` };
const RANSACK = { id: "rl", name: "Ransack, the Lab", type: "Sorcery", mana: "{1}{B}", mana_cost: "{1}{B}", cmc: 2, colors: ["B"], keywords: [],
  oracle: `Spell commander${REMINDER}\nLook at the top three cards of your library. Put one of them into your hand and the rest into your graveyard.` };
const LAVA_AXE = { name: "Lava, Axe", type: "Sorcery", mana: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: `Spell commander${REMINDER}\nLava, Axe deals 5 damage to target player or planeswalker.` };
const CLEAR = { name: "Clear, the Mind", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [],
  oracle: `Spell commander${REMINDER}\nTarget player shuffles their graveyard into their library.\nDraw a card.` };

// The user in their main phase with `card` in hand, mana in pool for it, and a small library.
function board(card, pool, library) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, hand: [card], library, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
}
// Cast it through the real offer and the stack, settling any pick the way the AI does.
function castAndResolve(s0, cardId) {
  let s = dispatchAction(s0, legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId));
  for (let i = 0; i < 6 && ((s.stack || []).length || s.pendingChoice); i++) {
    if (s.pendingChoice?.kind === "tutor-search") s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    else if (s.pendingChoice?.kind === "impulse-dig") s = resolveImpulseDigChoice(s, s.pendingChoice.candidates[0].id);
    else if (s.pendingChoice) break;
    else s = flushTriggers(resolveTopOfStack(s));
  }
  return s;
}

describe("the line and the carriers", () => {
  it("⭐ Ransack, the Lab and Rampant, Growth read native; the bare keyword line is what the strip drops", () => {
    expect([RANSACK, RAMPANT].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
    expect(stripCostOnlyKeywordLines(RAMPANT.oracle)).toBe("Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.");
  });
  it("the siblings park on their OWN lines, never this one — Lava, Axe on its self-named damage; Clear, the Mind reads native once its graveyard shuffle landed (stage ③ · 51)", () => {
    expect([LAVA_AXE, CLEAR].map((c) => isNativeTier(classifyCard(c)))).toEqual([false, true]);
  });
  it("only the bare keyword line goes — a line that merely mentions the phrase stays", () => {
    const text = "Spell commander spells you cast cost {1} less to cast.";
    expect(stripCostOnlyKeywordLines(text)).toBe(text);
  });
});

describe("⭐ cast from hand, it is exactly the printed spell", () => {
  it("⭐ Rampant, Growth: the Forest comes out tapped, the Bears stay in the library", () => {
    const lib = [{ id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, { id: "b1", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" }];
    const out = castAndResolve(board(RAMPANT, { G: 1, C: 1 }, lib), "rg");
    const forest = out.players.user.battlefield.find((p) => p.card?.name === "Forest");
    const row = { forest: !!forest, tapped: forest?.tapped ?? null, library: out.players.user.library.map((c) => c.name), inGrave: out.players.user.graveyard.some((c) => c.name === "Rampant, Growth") };
    console.log(`WITNESS spellCommanderRampant ${JSON.stringify(row)}`);
    expect(row).toEqual({ forest: true, tapped: true, library: ["Grizzly Bears"], inGrave: true });
  });
  it("⭐ Ransack, the Lab: of the top three, one to hand and two to the graveyard; the fourth stays", () => {
    const lib = ["A", "B", "C", "D"].map((n) => ({ id: `c${n}`, name: `Card ${n}`, type: "Sorcery", oracle: "" }));
    const out = castAndResolve(board(RANSACK, { B: 1, C: 1 }, lib), "rl");
    const u = out.players.user;
    expect({ hand: u.hand.length, graveyardCards: u.graveyard.filter((c) => /^Card /.test(c.name)).length, library: u.library.map((c) => c.name) })
      .toEqual({ hand: 1, graveyardCards: 2, library: ["Card D"] });
  });
});
