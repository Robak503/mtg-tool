/**
 * Graveyard recursion (CR 608) — "Return target [creature] card from your graveyard to your
 * hand" (Raise Dead / Cemetery Recruitment / Regrowth). A new `return-from-graveyard` atom + a
 * `graveyardCard` targetType: the target is a card in the CASTER'S OWN graveyard (a public zone),
 * chosen at cast time, so it flows through the normal cast-time target enumeration — no
 * resolution-time picker. Covers: the parser (creature/any filter; other filters/zones/cardinality
 * route to Arbiter), enumeration scoped to the caster's graveyard, resolution graveyard->hand, the
 * CR 608.2b illegal-target no-op, native-spell coverage, and the AI holding recursion.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const RAISE_DEAD = { id: "c-raise", name: "Raise Dead", type: SORCERY, mana: "{B}", oracle: "Return target creature card from your graveyard to your hand." };
const REGROWTH = { id: "c-regrowth", name: "Regrowth", type: SORCERY, mana: "{1}{G}", oracle: "Return target card from your graveyard to your hand." };
const gyCreature = (id, name) => ({ id, name, type: "Creature — Beast", power: 2, toughness: 2, oracle: "" });
const gyLand = (id, name) => ({ id, name, type: "Land", oracle: "" });
const gyInstant = (id, name) => ({ id, name, type: "Instant", oracle: "Deal 3 damage to any target." });
const gyToken = (id, name) => ({ id, name, type: "Token Creature — Beast", power: 2, toughness: 2, oracle: "", token: true });

function boardState({ userGy = [], aiGy = [], hand = [], pool = { C: 6, B: 1, G: 1 } } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, graveyard: userGy, hand, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, graveyard: aiGy },
    },
  };
}

describe("parser — graveyard recursion is HIGH for creature/any; other filters route to Arbiter", () => {
  it("creature-card + unfiltered-card parse high with the right cardFilter", () => {
    expect(parseEffectProgram(RAISE_DEAD).atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" }]);
    expect(parseEffectProgram(REGROWTH).atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any" }]);
  });
  it("a different filter / zone / cardinality / destination is low", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Return target instant or sorcery card from your graveyard to your hand.");  // unmodeled filter
    low("Return target artifact card from your graveyard to your hand.");            // unmodeled filter
    low("Return target creature card from a graveyard to your hand.");               // any graveyard, not "your"
    low("Return up to two target creature cards from your graveyard to your hand."); // multi-card
    low("Return target creature card from your graveyard to the battlefield.");      // reanimation (battlefield dest)
  });
  it("composes in a multi-clause spell (recursion + draw)", () => {
    const p = parseEffectProgram({ type: SORCERY, oracle: "Return target creature card from your graveyard to your hand. Draw a card." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "creature" },
      { op: "draw", amount: 1, targetType: null },
    ]);
  });
});

describe("coverage — clean graveyard recursion is native-spell", () => {
  it("Raise Dead + Regrowth classify native-spell; a filtered one is arbiter-spell", () => {
    expect(classifyCard(RAISE_DEAD)).toBe("native-spell");
    expect(classifyCard(REGROWTH)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "X", oracle: "Return target artifact card from your graveyard to your hand." })).toBe("arbiter-spell");
  });
});

describe("enumeration — only the CASTER'S graveyard, filtered by card type", () => {
  it("creature filter surfaces only the caster's creature cards; opponent's graveyard is never offered", () => {
    const s = boardState({
      userGy: [gyCreature("u-bear", "Grizzly Bears"), gyLand("u-forest", "Forest"), gyInstant("u-bolt", "Lightning Bolt"), gyToken("u-tok", "Bear Token")],
      aiGy: [gyCreature("a-bear", "Enemy Bear")],
    });
    const t = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "creature" });
    expect(t.map((x) => x.id)).toEqual(["u-bear"]);                  // only the user's creature CARD (token excluded — not a card)
    const any = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "any" });
    expect(any.map((x) => x.id).sort()).toEqual(["u-bolt", "u-forest", "u-bear"].sort()); // every user CARD (token excluded)
    expect(any.every((x) => x.controller === "user")).toBe(true);   // never the opponent's graveyard
    expect(any.some((x) => x.id === "u-tok")).toBe(false);          // a token is not a card
  });

  it("CR 712.4a — a transform card whose FRONT is non-creature is not a creature-card target", () => {
    // "Westvale Abbey // Ormendahl, Profane Prince" is a LAND in the graveyard (front face only).
    const dfc = { id: "u-abbey", name: "Westvale Abbey", type: "Land // Legendary Creature — Demon", oracle: "" };
    const s = boardState({ userGy: [dfc, gyCreature("u-bear", "Grizzly Bears")] });
    const creatures = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "creature" });
    expect(creatures.map((x) => x.id)).toEqual(["u-bear"]);          // the DFC's front is a Land — excluded
    const any = enumerateTargets(s, "user", { targetType: "graveyardCard", cardFilter: "any" });
    expect(any.some((x) => x.id === "u-abbey")).toBe(true);          // but it IS a card (any filter offers it)
  });
});

describe("resolution — the chosen card moves graveyard -> hand", () => {
  const cast = (s, cardId, targetId) => {
    const action = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === cardId && a.targets?.[0]?.id === targetId);
    expect(action).toBeTruthy();
    expect(action.needsTargets).toBe(true);
    return resolveTopOfStack(dispatchAction(s, action));
  };

  it("Raise Dead returns the chosen creature card to hand, leaving others in the graveyard", () => {
    let s = boardState({
      userGy: [gyCreature("u-bear", "Grizzly Bears"), gyCreature("u-elf", "Llanowar Elves")],
      aiGy: [gyCreature("a-bear", "Enemy Bear")],
      hand: [RAISE_DEAD],
    });
    s = cast(s, "c-raise", "u-bear");
    expect(s.players.user.hand.some((c) => c.id === "u-bear")).toBe(true);          // returned to hand
    expect(s.players.user.graveyard.map((c) => c.id)).toEqual(["u-elf"]);           // the other stays
    expect(s.players.ai.graveyard.map((c) => c.id)).toEqual(["a-bear"]);            // opponent untouched
  });

  it("Regrowth can return a noncreature card (a land) to hand", () => {
    let s = boardState({ userGy: [gyLand("u-forest", "Forest")], hand: [REGROWTH] });
    s = cast(s, "c-regrowth", "u-forest");
    expect(s.players.user.hand.some((c) => c.id === "u-forest")).toBe(true);
    expect(s.players.user.graveyard.length).toBe(0);
  });

  it("a target that already left the graveyard is a clean no-op (CR 608.2b), not a throw", () => {
    // Build a stack object by hand to simulate the targeted card vanishing before resolution.
    let s = boardState({ userGy: [gyCreature("u-bear", "Grizzly Bears")], hand: [RAISE_DEAD] });
    const action = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-raise");
    s = dispatchAction(s, action);
    // Remove the targeted card from the graveyard while the spell is on the stack.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [] } } };
    expect(() => { s = resolveTopOfStack(s); }).not.toThrow();
    expect(s.players.user.hand.some((c) => c.id === "u-bear")).toBe(false);
  });

  it("a creature-filter recursion offers no cast when the graveyard has no creature card", () => {
    const s = boardState({ userGy: [gyLand("u-forest", "Forest")], hand: [RAISE_DEAD] });
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "c-raise");
    expect(casts).toHaveLength(0); // no legal target -> uncastable (CR 601.2c)
  });
});

describe("AI — holds graveyard recursion (deferred seam)", () => {
  it("the AI does not cast a graveyard-return spell (effect null -> no target -> holds)", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
      players: {
        ...base.players,
        ai: { ...base.players.ai, hand: [RAISE_DEAD], graveyard: [gyCreature("a-bear", "Enemy Bear")], manaPool: { C: 6, B: 1 } },
      },
    };
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind === "cast-spell").toBe(false);
  });
});
