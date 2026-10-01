/**
 * victimize.test.js — Victimize (the play-weighted program, P·5, 2026-10-01: EDHREC rank #128).
 *
 *   "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the
 *    battlefield tapped."
 *
 * One whole-card template (templateMatchers.matchSacThenReturnChosen) → the controller's sacrifice + the paired reanimate,
 * which carries `ifSacrificed`: runEffectProgram runs it only when that sacrifice really happened — read off the event the
 * sacrifice logged inline, or the settler's answer when the sacrifice paused for a choice. The targets are a mandatory pair
 * chosen at cast (CR 601.2c, 115.3); the rest happens in written order (CR 608.2c); one target gone by then still returns the
 * other, both gone and the spell does not resolve (CR 608.2b).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic fence clauses.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { resolveSacrificeChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VICTIMIZE = { id: "vic", name: "Victimize", type: "Sorcery", mana: "{2}{B}", cmc: 3, colors: ["B"], keywords: [],
  oracle: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped." };
const CRAW_WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };
const HILL_GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, colors: ["R"], power: "3", toughness: "3", keywords: [], oracle: "" };
const GRAY_OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, colors: ["R"], power: "2", toughness: "2", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };

const onBf = (id, card) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false });
function table({ battlefield = [], graveyard = [["wurm", CRAW_WURM], ["giant", HILL_GIANT]] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand: [{ ...VICTIMIZE }], battlefield, graveyard: graveyard.map(([id, c]) => ({ ...c, id })),
      manaPool: { ...s.players.user.manaPool, B: 3 } } },
  };
}
const casts = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "vic");
const castOn = (s, ids) => {
  const a = casts(s).find((c) => (c.targets || []).map((t) => t.id).sort().join() === [...ids].sort().join());
  if (!a) throw new Error(`no Victimize cast on ${ids}`);
  return dispatchAction(s, a);
};
/** Resolve the stack; stop at a pending choice. */
function settle(s) {
  let n = finalizeStackResolution(s), g = 0;
  while (n.stack.length && !n.pendingChoice && g++ < 30) n = finalizeStackResolution(resolveTopOfStack(n));
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const view = (s) => ({
  battlefield: s.players.user.battlefield.map((p) => `${p.card.name}${p.tapped ? " (tapped)" : ""}`).sort(),
  graveyard: s.players.user.graveyard.map((c) => c.name).sort(),
});

describe("the card", () => {
  it("parses to the controller's sacrifice and the paired, gated reanimate; native-spell", () => {
    expect({ atoms: parseEffectProgram(VICTIMIZE)?.atoms, tier: classifyCard(VICTIMIZE) }).toEqual({
      atoms: [
        { op: "sacrifice", who: "controller", what: "creature" },
        { op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", minTargets: 2, maxTargets: 2, entersTapped: true, ifSacrificed: true },
      ],
      tier: "native-spell",
    });
  });

  it("fences (synthetic): another sacrifice, an untapped return or an up-to count is not this card", () => {
    const conf = (oracle) => parseEffectProgram({ ...VICTIMIZE, oracle })?.confidence ?? "low";
    expect([
      conf("Choose two target creature cards in your graveyard. Sacrifice an artifact. If you do, return the chosen cards to the battlefield tapped."),
      conf("Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield."),
      conf("Choose up to two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped."),
    ]).toEqual(["low", "low", "low"]);
  });

  it("castable only with two creature cards in your graveyard (a mandatory pair, CR 601.2c); three cards offer the three pairs", () => {
    const one = table({ graveyard: [["wurm", CRAW_WURM], ["ring", SOL_RING]] });
    const three = table({ graveyard: [["wurm", CRAW_WURM], ["giant", HILL_GIANT], ["ogre", GRAY_OGRE]] });
    expect({ one: casts(one).length, threePairs: casts(three).map((a) => a.targets.map((t) => t.id).sort().join("+")).sort() })
      .toEqual({ one: 0, threePairs: ["giant+ogre", "giant+wurm", "ogre+wurm"] });
  });
});

describe("in play", () => {
  it("one creature: it is sacrificed and both chosen cards return tapped (WITNESS)", () => {
    const s = settle(castOn(table({ battlefield: [onBf("bear", BEARS)] }), ["wurm", "giant"]));
    const witness = { pending: s.pendingChoice?.kind ?? null, ...view(s) };
    console.log(`WITNESS victimize ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ pending: null, battlefield: ["Craw Wurm (tapped)", "Hill Giant (tapped)"], graveyard: ["Grizzly Bears", "Victimize"] });
  });

  it("⛔ no creature to sacrifice: nothing returns — the \"if you do\" gate (WITNESS)", () => {
    const s = settle(castOn(table(), ["wurm", "giant"]));
    const witness = view(s);
    console.log(`WITNESS victimizeNoSac ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ battlefield: [], graveyard: ["Craw Wurm", "Hill Giant", "Victimize"] });
  });

  it("two creatures: the sacrifice is a choice; the picked one goes, the other stays, both chosen cards return tapped", () => {
    const paused = settle(castOn(table({ battlefield: [onBf("bear", BEARS), onBf("ogre", GRAY_OGRE)] }), ["wurm", "giant"]));
    if (paused.pendingChoice?.kind !== "sacrifice-choice") throw new Error("no sacrifice choice");
    const s = settle(resolveSacrificeChoice(paused, "bear"));
    expect({ offered: paused.pendingChoice.candidates.map((c) => c.id).sort(), ...view(s) }).toEqual({
      offered: ["bear", "ogre"],
      battlefield: ["Craw Wurm (tapped)", "Gray Ogre", "Hill Giant (tapped)"],
      graveyard: ["Grizzly Bears", "Victimize"],
    });
  });

  it("⛔ a pick that sacrifices nothing (not a candidate) returns nothing — the gate on the paused path", () => {
    const paused = settle(castOn(table({ battlefield: [onBf("bear", BEARS), onBf("ogre", GRAY_OGRE)] }), ["wurm", "giant"]));
    const s = settle(resolveSacrificeChoice(paused, "not-a-candidate"));
    expect(view(s)).toEqual({ battlefield: ["Gray Ogre", "Grizzly Bears"], graveyard: ["Craw Wurm", "Hill Giant", "Victimize"] });
  });

  it("one chosen card leaves the graveyard first: the sacrifice still happens and the other returns (CR 608.2b)", () => {
    const cast = castOn(table({ battlefield: [onBf("bear", BEARS)] }), ["wurm", "giant"]);
    const gone = { ...cast, players: { ...cast.players, user: { ...cast.players.user, graveyard: cast.players.user.graveyard.filter((c) => c.id !== "wurm") } } };
    expect(view(settle(gone))).toEqual({ battlefield: ["Hill Giant (tapped)"], graveyard: ["Grizzly Bears", "Victimize"] });
  });

  it("both chosen cards gone: the spell does not resolve and nothing is sacrificed (CR 608.2b)", () => {
    const cast = castOn(table({ battlefield: [onBf("bear", BEARS)] }), ["wurm", "giant"]);
    const gone = { ...cast, players: { ...cast.players, user: { ...cast.players.user, graveyard: [] } } };
    expect(view(settle(gone))).toEqual({ battlefield: ["Grizzly Bears"], graveyard: ["Victimize"] });
  });
});
