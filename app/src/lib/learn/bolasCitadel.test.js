/**
 * bolasCitadel.test.js — Bolas's Citadel and the count-sacrifice cost (the play-weighted program, P·17, 2026-10-01: EDHREC
 * rank #263; CR 118.9, 118.9a, 107.3b, 118.6a, 119.4, 701.21a).
 *
 *   "You may look at the top card of your library any time.
 *    You may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana
 *    value rather than pay its mana cost.
 *    {T}, Sacrifice ten nonland permanents: Each opponent loses 10 life."
 *
 * Two pieces. (1) The life-cost rider: before this slice the static parser read the permission and dropped the rider, so a
 * Citadel in play let a spell be cast from the top paying MANA. Now the rider is a marker playFromTopPermission pairs with the
 * permission on the same card — its spells are offered only as life-cost casts. (2) "Sacrifice N <class>" activation costs
 * (abilities.js SAC-N-CLASS): the least valuable N members of the class are frozen on the action, the spell-side policy.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { playFromTopPermission } from "./staticAbilityParser.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CITADEL = { name: "Bolas's Citadel", type: "Legendary Artifact", mana: "{3}{B}{B}{B}", cmc: 6, colors: ["B"], keywords: [],
  oracle: "You may look at the top card of your library any time.\nYou may play lands and cast spells from the top of your library. If you cast a spell this way, pay life equal to its mana value rather than pay its mana cost.\n{T}, Sacrifice ten nonland permanents: Each opponent loses 10 life." };
const FUTURE_SIGHT = { name: "Future Sight", type: "Enchantment", mana: "{2}{U}{U}{U}", cmc: 5, colors: ["U"], keywords: [],
  oracle: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Draw two cards." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, colors: [], power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const MEMNITE = { name: "Memnite", type: "Artifact Creature — Construct", mana: "{0}", cmc: 0, colors: [], power: "1", toughness: "1", keywords: [], oracle: "" };
const SAI = { name: "Sai, Master Thopterist", type: "Legendary Creature — Human Artificer", mana: "{2}{U}", cmc: 3, colors: ["U"], power: "1", toughness: "4", keywords: [],
  oracle: "Whenever you cast an artifact spell, create a 1/1 colorless Thopter artifact creature token with flying.\n{1}{U}, Sacrifice two artifacts: Draw a card." };
const ZOPANDREL = { name: "Zopandrel, Hunger Dominus", type: "Legendary Creature — Phyrexian Horror", mana: "{5}{G}{G}", cmc: 7, colors: ["G"], power: "4", toughness: "6", keywords: ["Reach", "Double"],
  oracle: "Reach\nAt the beginning of each combat, double the power and toughness of each creature you control until end of turn.\n{G/P}{G/P}, Sacrifice two other creatures: Put an indestructible counter on Zopandrel. ({G/P} can be paid with either {G} or 2 life.)" };

/** The user's main phase: `board` in play, `top` on top of a library backed by two more Bears, `life` and `pool` given. */
function table({ board = [["cit", CITADEL]], top = BEARS, life = 40, pool = {}, step = "main", phase = "precombat-main", stack = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const library = [...(top ? [{ ...top, id: "top" }] : []), { ...BEARS, id: "lib-2" }, { ...BEARS, id: "lib-3" }];
  return { ...g, turn: 4, phase, step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack,
    players: { ...g.players, user: { ...g.players.user, life, library, manaPool: { ...g.players.user.manaPool, ...pool },
      battlefield: board.map(([id, c]) => createPermanent({ id: `p-${id}`, card: { ...c, id }, controller: "user", summoningSick: false })) } } };
}
const topCasts = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "top");

describe("the card", () => {
  it("the rider is read: the permission becomes a life-cost one; the card is native-mixed", () => {
    expect({ perm: playFromTopPermission(table(), "user"), tier: classifyCard(CITADEL) })
      .toEqual({ perm: { lands: true, spellFilter: null, lifeSpellFilter: "any" }, tier: "native-mixed" });
  });
});

describe("casting from the top", () => {
  it("the top card is offered for life equal to its mana value, never for mana — cast it and it resolves (WITNESS)", () => {
    const s = table({ pool: { G: 2 } });
    const offered = topCasts(s).map((a) => ({ alt: a.altCost, free: !!a.freeCast, mana: a.cost?.generic ?? 0 }));
    const cast = dispatchAction(s, topCasts(s)[0]);
    const done = resolveTopOfStack(cast);
    const witness = { offered, life: done.players.user.life, pool: done.players.user.manaPool.G, bears: done.players.user.battlefield.filter((p) => p.card?.name === "Grizzly Bears").length };
    console.log(`WITNESS bolasCitadel ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ offered: [{ alt: { kind: "payLife", payLife: 2 }, free: false, mana: 0 }], life: 38, pool: 2, bears: 1 });
  });

  it("a mana value of 0 pays nothing (Ornithopter)", () => {
    expect(topCasts(table({ top: ORNITHOPTER })).map((a) => a.altCost)).toEqual([{ kind: "free" }]);
  });

  it("⛔ life is paid only if the total covers it (CR 119.4): 2 life casts a 2-drop, 1 life doesn't", () => {
    expect([topCasts(table({ life: 2 })).length, topCasts(table({ life: 1 })).length]).toEqual([1, 0]);
  });

  it("⛔ a spell cast this way keeps its normal timing: a sorcery waits for the main phase with an empty stack", () => {
    const combat = table({ top: DIVINATION, phase: "combat", step: "declare-attackers" });
    expect([topCasts(table({ top: DIVINATION })).length, topCasts(combat).length]).toEqual([1, 0]);
  });

  it("a land on top is played from the library", () => {
    expect(legalActionsForPlayer(table({ top: FOREST }), "user").filter((a) => a.kind === "play-land" && a.cardId === "top").map((a) => a.fromZone)).toEqual(["library"]);
  });

  it("beside Future Sight, both ways are offered: the mana cast and the life cast", () => {
    const s = table({ board: [["cit", CITADEL], ["fs", FUTURE_SIGHT]], pool: { G: 2 } });
    expect(topCasts(s).map((a) => (a.altCost ? `life ${a.altCost.payLife}` : "mana")).sort()).toEqual(["life 2", "mana"]);
  });

  it("the AI casts from the top for life", () => {
    const s = table();
    const pick = pickAction(s, "user", legalActionsForPlayer(s, "user"));
    expect({ card: pick?.cardId, life: pick?.altCost?.payLife }).toEqual({ card: "top", life: 2 });
  });
});

describe("Sacrifice N <class> (SAC-N-CLASS)", () => {
  it("Citadel's ten: offered with ten nonland permanents, not with nine (lands never count); each opponent loses 10", () => {
    const thopters = (n) => Array.from({ length: n }, (_, i) => [`t${i}`, ORNITHOPTER]);
    const ten = table({ board: [["cit", CITADEL], ...thopters(9)] });
    const nine = table({ board: [["cit", CITADEL], ...thopters(8), ["f1", FOREST], ["f2", FOREST], ["f3", FOREST]] });
    const act = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p-cit");
    const fired = resolveTopOfStack(dispatchAction(ten, act(ten)[0]));
    expect({ ten: act(ten).length, nine: act(nine).length, ai: fired.players.ai.life, left: fired.players.user.battlefield.length })
      .toEqual({ ten: 1, nine: 0, ai: 30, left: 0 });
  });

  it("Sai sacrifices its two least valuable artifacts, whatever their order on the battlefield", () => {
    const s = table({ board: [["sai", SAI], ["cit", CITADEL], ["mem", MEMNITE], ["orn", ORNITHOPTER]], pool: { U: 1, C: 1 } });
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p-sai");
    expect(act.map((a) => [...a.sacCountIds].sort())).toEqual([["p-mem", "p-orn"]]);
  });

  it("⛔ \"two OTHER creatures\" never counts the source (Zopandrel)", () => {
    const zop = (others) => table({ board: [["zop", ZOPANDREL], ...others], pool: { G: 2 } });
    const act = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "p-zop");
    expect([act(zop([["b1", BEARS], ["b2", BEARS]])).map((a) => [...a.sacCountIds].sort()), act(zop([["b1", BEARS]])).length])
      .toEqual([[["p-b1", "p-b2"]], 0]);
  });
});

describe("the action names what it sacrifices", () => {
  it("a class sacrifice lists its frozen victims (no subtype to pluralize)", () => {
    const s = table({ board: [["sai", SAI], ["cit", CITADEL], ["mem", MEMNITE], ["orn", ORNITHOPTER]], pool: { U: 1, C: 1 } });
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "p-sai");
    expect(act.abilityText).toMatch(/^Sacrifice (Memnite, Ornithopter|Ornithopter, Memnite): /);
  });
});
