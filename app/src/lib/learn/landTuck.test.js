/**
 * landTuck.test.js — BLITZ LT-1: LAND-TUCK ("Put target land on top of its owner's library." — Fallow
 * Earth / Uproot; Rootrunner's "{G}{G}, Sacrifice this creature:" activated twin. Corpus-probed
 * 2026-07-16: exactly these 3 carriers). "land" joins tuckClauseParser's alternation — the SAME proven
 * machinery end to end: PERMANENT_PREDICATES.land enumeration → a type:"permanent" target →
 * applyZoneMove(library, toTop) with owner = the permanent's controller (the controller-as-owner proxy
 * every bounce/tuck uses). Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FALLOW_EARTH = { id: "c-fe", name: "Fallow Earth", type: "Sorcery", mana: "{2}{G}", oracle: "Put target land on top of its owner's library." };
const UPROOT = { id: "c-up", name: "Uproot", type: "Sorcery — Arcane", mana: "{3}{G}", oracle: "Put target land on top of its owner's library." };
const ROOTRUNNER = { id: "c-rr", name: "Rootrunner", type: "Creature — Spirit", power: 2, toughness: 2, mana: "{2}{G}{G}", oracle: "{G}{G}, Sacrifice this creature: Put target land on top of its owner's library.\nSoulshift 3 (When this creature dies, you may return target Spirit card with mana value 3 or less from your graveyard to your hand.)" };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withPlayerBits(state, playerId, bits) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], ...bits } } };
}
const land = (id, name, controller) => createPermanent({ id, card: { id: "c-" + id, name, type: "Basic Land — Forest", oracle: "" }, controller });

describe("LT-1 parser — the land tuck is HIGH; scoped/subtype variants stay LOW", () => {
  it("'put target land on top of its owner's library' → tuck/land/top", () => {
    const p = parseEffectClause("Put target land on top of its owner's library.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "tuck", targetType: "land", where: "top" }]);
  });
  it("FN guards: a controller scope / subtype / 'another' / different-owner phrasing stays LOW", () => {
    const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Sorcery"))).toBe("low");
    low("Put target land you control on top of its owner's library.");
    low("Put target Forest on top of its owner's library.");
    low("Put another target land on top of its owner's library.");
    low("Put target land on top of your library.");
  });
  it("classify: Fallow Earth + Uproot flip native-spell; Rootrunner (sac-self cost + soulshift) flips native-activated", () => {
    expect(classifyCard(FALLOW_EARTH)).toBe("native-spell");
    expect(classifyCard(UPROOT)).toBe("native-spell");
    expect(classifyCard(ROOTRUNNER)).toBe("native-activated");
  });
});

describe("LT-1 runtime — the chosen land goes to the TOP of its OWNER's library", () => {
  it("tucks an OPPONENT's land onto the OPPONENT's library top (index 0 = top)", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", { hand: [FALLOW_EARTH], manaPool: { ...s.players.user.manaPool, C: 2, G: 1 } });
    s = withPlayerBits(s, "ai", { battlefield: [land("p-af", "Enemy Forest", "ai")], library: [{ id: "a-top", name: "Old Top" }] });
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-fe" && a.targets?.[0]?.id === "p-af");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.ai.battlefield.some((p) => p.id === "p-af")).toBe(false);                 // left the battlefield
    expect(s.players.ai.library.map((c) => c.name)).toEqual(["Enemy Forest", "Old Top"]);       // TOP of the OWNER's library
    expect(s.players.user.library).toHaveLength(0);                                             // never the caster's library
  });

  it("tucks the caster's OWN land onto the caster's library top (owner routing follows the permanent)", () => {
    let s = mainState();
    s = withPlayerBits(s, "user", {
      hand: [UPROOT], battlefield: [land("p-uf", "My Forest", "user")],
      library: [{ id: "u-top", name: "Old Top" }], manaPool: { ...s.players.user.manaPool, C: 3, G: 1 },
    });
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "c-up" && a.targets?.[0]?.id === "p-uf");
    expect(act).toBeTruthy();
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(s.players.user.library.map((c) => c.name)).toEqual(["My Forest", "Old Top"]);
  });
});
