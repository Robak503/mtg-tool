/**
 * DISRUPT DECORUM (EDHREC #892) — "Goad all creatures you don't control." The mass goad over the creatures another player controls.
 * In this engine's games every other player is an opponent (Free-for-All with no teams — CR 806.1, Commander's default, CR 903.2;
 * CR 102.2, 102.3), so "creatures you don't control" is the set "creatures your opponents control" already reads (Fast Forward):
 * each is goaded (CR 701.15a, 701.15b — it attacks each combat if able, and a player other than the goader if able) until the
 * caster's next turn. Its bundled ruling: "Creatures that enter the battlefield after Disrupt Decorum resolves won't be goaded."
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const DISRUPT_DECORUM = {"name":"Disrupt Decorum","type":"Sorcery","mana":"{2}{R}{R}","cmc":4,"power":null,"toughness":null,"keywords":["Goad"],"colors":["R"],"oracle":"Goad all creatures you don't control. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"}; // arbiter-spell on 0fbdec14
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
function pod() {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s0.players[pid], battlefield, ...extra });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: seat("user", [P("mine", GRIZZLY_BEARS, "user")], { hand: [{ ...DISRUPT_DECORUM, id: "h-dd" }], manaPool: { W: 0, U: 0, B: 0, R: 2, G: 0, C: 2 } }),
      ai1: seat("ai1", [P("b1", GRIZZLY_BEARS, "ai1"), P("ring", SOL_RING, "ai1")]),
      ai2: seat("ai2", [P("w2", CRAW_WURM, "ai2")]),
      ai3: seat("ai3", [P("b3", GRIZZLY_BEARS, "ai3")]) } };
}
const goaded = (s, id) => !!permanentHasKeyword(s, id, "goaded") && !!permanentHasKeyword(s, id, "mustAttack");

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(DISRUPT_DECORUM)).toBe("native-spell");
  });
  it("⭐ one atom: the every-opponent-creature goad, the same atom \"your opponents control\" reads", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || [];
    expect({ decorum: atoms("Goad all creatures you don't control."), opponents: atoms("Goad all creatures your opponents control.") })
      .toEqual({ decorum: [{ op: "goad", targetType: "eachOpponentCreature" }], opponents: [{ op: "goad", targetType: "eachOpponentCreature" }] });
  });
  it("CONTROL — a goad of creatures a target player controls stays unread", () => {
    expect(parseEffectProgram({ name: "x", type: "Sorcery", oracle: "Goad each creature target player controls." })?.atoms || []).toEqual([]);
  });
});

describe("the cast", () => {
  it("⭐ every creature another player controls is goaded and must attack; the caster's own is not, nor a noncreature", () => {
    const s0 = pod();
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-dd");
    const s = resolveTopOfStack(dispatchAction(s0, cast));
    expect({ b1: goaded(s, "b1"), w2: goaded(s, "w2"), b3: goaded(s, "b3"), mine: goaded(s, "mine"), ring: goaded(s, "ring"), inGraveyard: s.players.user.graveyard.some((c) => c.id === "h-dd") })
      .toEqual({ b1: true, w2: true, b3: true, mine: false, ring: false, inGraveyard: true });
  });

  it("⭐ its ruling — a creature that enters after it resolves is not goaded", () => {
    const s0 = pod();
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-dd");
    const s1 = resolveTopOfStack(dispatchAction(s0, cast));
    const s = { ...s1, players: { ...s1.players, ai2: { ...s1.players.ai2, battlefield: [...s1.players.ai2.battlefield, P("late", GRIZZLY_BEARS, "ai2")] } } };
    expect({ w2: goaded(s, "w2"), late: goaded(s, "late") }).toEqual({ w2: true, late: false });
  });
});
