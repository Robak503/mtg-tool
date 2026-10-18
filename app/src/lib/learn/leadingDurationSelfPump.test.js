/**
 * leadingDurationSelfPump.test.js — the play-weighted program (2026-10-18): Resplendent Angel (EDHREC #1979)
 * "{3}{W}{W}{W}: Until end of turn, this creature gets +2/+2 and gains lifelink." The duration leads the sentence; the same
 * instruction written with it last ("This creature gets +2/+2 and gains lifelink until end of turn.") is the self pump the
 * engine reads, and the two say the same thing: the duration covers both halves. Only that exact shape is reordered — a
 * count ("+1/+1 for each …"), a choice ("your choice of flying, …") or another subject stays as printed and unread.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-18).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword, permanentPower, permanentToughness, expireContinuousEffects } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANGEL = { id: "c-ra", name: "Resplendent Angel", type: "Creature — Angel", mana: "{1}{W}{W}", power: 3, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nAt the beginning of each end step, if you gained 5 or more life this turn, create a 4/4 white Angel creature token with flying and vigilance.\n{3}{W}{W}{W}: Until end of turn, this creature gets +2/+2 and gains lifelink." };
// CREED controls — a count and a choice behind the same leading duration stay unread on both trees.
const OCHU = { id: "c-gpo", name: "Gran Pulse Ochu", type: "Creature — Plant Beast", mana: "{G}", power: 1, toughness: 1, keywords: ["Deathtouch"],
  oracle: "Deathtouch\n{8}: Until end of turn, this creature gets +1/+1 for each permanent card in your graveyard." };
const AVENGER = { id: "c-aa", name: "Argivian Avenger", type: "Artifact Creature — Shapeshifter", mana: "{6}", power: 5, toughness: 5, keywords: [],
  oracle: "{1}: Until end of turn, this creature gets -1/-1 and gains your choice of flying, vigilance, deathtouch, or haste." };
const PLAINS = (id) => ({ id: "c-" + id, name: "Plains", type: "Basic Land — Plains", keywords: [], oracle: "({T}: Add {W}.)" });

const put = (card, id, controller = "user", over = {}) => ({ ...createPermanent({ id, card, controller }), summoningSick: false, ...over });
const lib = (n, tag = "u") => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));

describe("classifier and parser", () => {
  it("Resplendent Angel is native", () => {
    expect(classifyCard(ANGEL)).toMatch(/^native-/);
  });
  it("the leading-duration sentence reads as the same self pump as the trailing one", () => {
    const lead = parseEffectClause("Until end of turn, this creature gets +2/+2 and gains lifelink.");
    const trail = parseEffectClause("This creature gets +2/+2 and gains lifelink until end of turn.");
    expect(lead?.confidence).toBe("high");
    expect(lead.atoms).toEqual(trail.atoms);
  });
  it("CREED controls: a count and a choice behind the leading duration stay unread", () => {
    expect(classifyCard(OCHU)).toBe("body-only");
    expect(classifyCard(AVENGER)).toBe("body-only");
  });
});

describe("runtime — +2/+2 and lifelink until end of turn", () => {
  it("six Plains pay; the Angel is a 5/5 with lifelink, then a 3/3 without it after cleanup", () => {
    const plains = Array.from({ length: 6 }, (_, i) => put(PLAINS("P" + i), "P" + i));
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
      players: { ...s.players, user: { ...s.players.user, library: lib(4), battlefield: [put(ANGEL, "RA"), ...plains] }, ai: { ...s.players.ai, library: lib(4, "a") } } };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "RA");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    while (s.stack.length) s = resolveTopOfStack(s);
    expect([permanentPower(s, "RA"), permanentToughness(s, "RA")]).toEqual([5, 5]);
    expect(permanentHasKeyword(s, "RA", "Lifelink")).toBe(true);
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect([permanentPower(s, "RA"), permanentToughness(s, "RA")]).toEqual([3, 3]);
    expect(permanentHasKeyword(s, "RA", "Lifelink")).toBe(false);
  });
});
