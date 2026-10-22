/**
 * TAUNT FROM THE RAMPART (EDHREC #1978) — "Goad all creatures your opponents control. Until your next turn, those creatures can't
 * block." The mass goad (CR 701.15a, 701.15b — each attacks each combat if able, and a player other than the goader if able, until
 * the caster's next turn) and, on the same creatures for the same span, a block restriction (CR 509.1a, 509.1b): from the moment it
 * resolves — the caster's own combat that turn included — until the caster's next turn begins, none of them may block. "Those
 * creatures" are the creatures it goaded, fixed as it resolves (CR 608.2h, 611.2c): a creature that comes under an opponent's
 * control afterwards is neither goaded nor kept from blocking.
 *
 * Every turn here is walked through the engine's own step driver (nextStep), never a hand-set turn counter.
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const TAUNT = {"name":"Taunt from the Rampart","type":"Sorcery","mana":"{3}{R}{W}","cmc":5,"power":null,"toughness":null,"keywords":["Goad"],"colors":["R","W"],"oracle":"Goad all creatures your opponents control. Until your next turn, those creatures can't block. (Until your next turn, those creatures attack each combat if able and attack a player other than you if able.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"};

const SEATS = ["user", "ai1", "ai2", "ai3"];
const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });

/** The user's precombat main on turn 5: the user holds Taunt with five mana; each seat's library holds Plains for its draws. */
function pod() {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  const boards = {
    user: [P("mine", CRAW_WURM, "user")],
    ai1: [P("b1", GRIZZLY_BEARS, "ai1")],
    ai2: [P("raider", CRAW_WURM, "ai2")],
    ai3: [P("b3", GRIZZLY_BEARS, "ai3")],
  };
  for (const seat of SEATS) {
    players[seat] = { ...g.players[seat], battlefield: boards[seat], hand: [], library: Array.from({ length: 12 }, (_, i) => ({ ...PLAINS, id: `lib-${seat}-${i}` })), life: 40 };
  }
  players.user = { ...players.user, hand: [{ ...TAUNT, id: "h-taunt" }], manaPool: { W: 1, U: 0, B: 0, R: 1, G: 0, C: 3 } };
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [], players };
}

function walkTo(state, seat, step, turn) {
  let s = state;
  for (let i = 0; i < 300; i++) {
    if (s.activePlayer === seat && s.step === step && s.turn === turn) return s;
    if (s.pendingChoice) throw new Error(`walkTo: a pending choice (${s.pendingChoice.kind}) at ${s.activePlayer} ${s.step} turn ${s.turn}`);
    s = nextStep(s);
  }
  throw new Error(`walkTo: ${seat} ${step} turn ${turn} not reached`);
}
function attackInto(state, attacker, defender) {
  const declare = legalActionsForPlayer(state, state.activePlayer).find((a) => a.kind === "declare-attacker" && a.permanentId === attacker && a.defenderId === defender);
  expect(declare, `declare ${attacker} → ${defender}`).toBeTruthy();
  const s = nextStep(dispatchAction(state, declare));
  expect(s.step).toBe("declare-blockers");
  return s;
}
const blockOffered = (s, blocker, attacker, seat) =>
  legalActionsForPlayer({ ...s, priorityHolder: seat }, seat).some((a) => a.kind === "declare-blocker" && a.permanentId === blocker && a.attackerId === attacker);
const cast = (s0) => {
  const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-taunt");
  expect(a, "Taunt is offered").toBeTruthy();
  return resolveTopOfStack(dispatchAction(s0, a));
};
const state = (s, id) => ({ goaded: !!permanentHasKeyword(s, id, "goaded") && !!permanentHasKeyword(s, id, "mustAttack"), cantBlock: !!permanentHasKeyword(s, id, "cantBlock") });

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(TAUNT)).toBe("native-spell");
  });
  it("⭐ one atom: the every-opponent-creature goad carrying the block restriction on the same creatures", () => {
    expect(parseEffectProgram(TAUNT)?.atoms).toEqual([{ op: "goad", targetType: "eachOpponentCreature", alsoCantBlock: true }]);
  });
  it("CONTROL — the bare mass goad carries no restriction; the restriction alone, or another duration, stays unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || [];
    expect({
      bare: atoms("Goad all creatures your opponents control."),
      aloneRestriction: atoms("Until your next turn, those creatures can't block."),
      thisTurn: atoms("Goad all creatures your opponents control. Those creatures can't block this turn."),
    }).toEqual({ bare: [{ op: "goad", targetType: "eachOpponentCreature" }], aloneRestriction: [], thisTurn: [] });
  });
});

describe("the cast", () => {
  it("⭐ every creature an opponent controls is goaded and can't block; the caster's own creature is neither", () => {
    const s = cast(pod());
    expect({ b1: state(s, "b1"), raider: state(s, "raider"), b3: state(s, "b3"), mine: state(s, "mine") }).toEqual({
      b1: { goaded: true, cantBlock: true }, raider: { goaded: true, cantBlock: true }, b3: { goaded: true, cantBlock: true }, mine: { goaded: false, cantBlock: false },
    });
  });

  it("⭐ the caster's own combat that turn: its attacker can't be blocked by the creatures it taunted", () => {
    let s = walkTo(cast(pod()), "user", "declare-attackers", 5);
    s = attackInto(s, "mine", "ai1");
    expect(blockOffered(s, "b1", "mine", "ai1")).toBe(false);
  });

  it("⭐ through the turns between: ai2's goaded Wurm attacks ai1 and ai1's taunted Bears may not block it; as the caster's next turn begins both effects are gone, and ai1's Bears may block the caster's attacker", () => {
    let s = cast(pod());
    s = walkTo(s, "ai2", "declare-attackers", 7);
    s = attackInto(s, "raider", "ai1");
    const row = { ai2Turn: blockOffered(s, "b1", "raider", "ai1") };
    s = walkTo(s, "ai3", "cleanup", 8);
    row.ai3Cleanup = state(s, "b1");
    s = walkTo(s, "user", "untap", 9);
    row.asCastersTurnBegins = state(s, "b1");
    s = walkTo(s, "user", "declare-attackers", 9);
    s = attackInto(s, "mine", "ai1");
    row.blockOnCastersTurn = blockOffered(s, "b1", "mine", "ai1");
    expect(row).toEqual({ ai2Turn: false, ai3Cleanup: { goaded: true, cantBlock: true }, asCastersTurnBegins: { goaded: false, cantBlock: false }, blockOnCastersTurn: true });
  });

  it("⭐ 'those creatures' are the ones it goaded — a creature that enters afterwards may block", () => {
    const s1 = cast(pod());
    let s = { ...s1, players: { ...s1.players, ai1: { ...s1.players.ai1, battlefield: [...s1.players.ai1.battlefield, P("late", GRIZZLY_BEARS, "ai1")] } } };
    expect(state(s, "late")).toEqual({ goaded: false, cantBlock: false });
    s = walkTo(s, "user", "declare-attackers", 5);
    s = attackInto(s, "mine", "ai1");
    expect({ late: blockOffered(s, "late", "mine", "ai1"), b1: blockOffered(s, "b1", "mine", "ai1") }).toEqual({ late: true, b1: false });
  });
});
