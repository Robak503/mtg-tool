/**
 * THE DURATION LEADS THE TEAM PUMP — "Until end of turn, creatures you control get +N/+N and gain <keywords>." is the instruction
 * "Creatures you control get +N/+N and gain <keywords> until end of turn.":
 *   · Triumph of the Hordes (EDHREC #1180) — "Until end of turn, creatures you control get +1/+1 and gain trample and infect."
 *   · Titanic Ultimatum (#6867) — "Until end of turn, creatures you control get +5/+5 and gain first strike, trample, and lifelink."
 * The set is fixed as it resolves (CR 611.2c; Titanic Ultimatum's ruling: "The set of creatures affected is fixed as Titanic
 * Ultimatum resolves."); the grants end at cleanup (CR 514.2). Infect: damage to a player is poison counters (CR 702.90b), to a
 * creature -1/-1 counters (CR 702.90c).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { resolveCombatDamage } from "./combatResolution.js";

beforeEach(() => _resetIdsForTests());

const TRIUMPH_OF_THE_HORDES = {"name":"Triumph of the Hordes","type":"Sorcery","mana":"{2}{G}{G}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["G"],"oracle":"Until end of turn, creatures you control get +1/+1 and gain trample and infect. (Creatures with infect deal damage to creatures in the form of -1/-1 counters and to players in the form of poison counters.)"}; // arbiter-spell on 0fbdec14
const TITANIC_ULTIMATUM = {"name":"Titanic Ultimatum","type":"Sorcery","mana":"{R}{R}{G}{G}{G}{W}{W}","cmc":7,"power":null,"toughness":null,"keywords":[],"colors":["G","R","W"],"oracle":"Until end of turn, creatures you control get +5/+5 and gain first strike, trample, and lifelink."}; // arbiter-spell on 0fbdec14
const ZEALOUS_PERSECUTION = {"name":"Zealous Persecution","type":"Instant","mana":"{W}{B}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":["B","W"],"oracle":"Until end of turn, creatures you control get +1/+1 and creatures your opponents control get -1/-1."};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), counters: {} });
function table(spell, mana) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: [{ ...spell, id: "h-spell" }], battlefield: [P("b1", GRIZZLY_BEARS, "user"), P("b2", GRIZZLY_BEARS, "user")], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...mana } },
      ai: { ...s0.players.ai, battlefield: [P("wurm", CRAW_WURM, "ai")] } } };
}
const cast = (s) => resolveTopOfStack(dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-spell")));
const row = (s, id, kws) => {
  const p = findPermanent(s, id)?.permanent;
  return [creaturePower(p, s), creatureToughness(p, s), ...kws.map((k) => !!permanentHasKeyword(s, id, k))];
};

describe("the reader", () => {
  it("⭐ both cards play their whole text", () => {
    expect({ triumph: classifyCard(TRIUMPH_OF_THE_HORDES), titanic: classifyCard(TITANIC_ULTIMATUM) }).toEqual({ triumph: "native-spell", titanic: "native-spell" });
  });
  it("⭐ the leading duration reads exactly as the trailing form; a second subject stays unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", oracle })?.atoms || [];
    expect({
      lead: atoms("Until end of turn, creatures you control get +1/+1 and gain trample and infect."),
      trail: atoms("Creatures you control get +1/+1 and gain trample and infect until end of turn."),
      zealous: classifyCard(ZEALOUS_PERSECUTION),
    }).toEqual({
      lead: [{ op: "pump", scope: "youControl", ptDelta: { p: 1, t: 1 }, grantKeywords: ["Trample", "infect"] }],
      trail: [{ op: "pump", scope: "youControl", ptDelta: { p: 1, t: 1 }, grantKeywords: ["Trample", "infect"] }],
      zealous: "arbiter-spell",
    });
  });
});

describe("Triumph of the Hordes", () => {
  it("⭐ the caster's creatures are 3/3 with trample and infect; the opponent's Wurm is untouched", () => {
    const s = cast(table(TRIUMPH_OF_THE_HORDES, { G: 2, C: 2 }));
    const k = ["Trample", "Infect"];
    expect({ b1: row(s, "b1", k), b2: row(s, "b2", k), wurm: row(s, "wurm", k) })
      .toEqual({ b1: [3, 3, true, true], b2: [3, 3, true, true], wurm: [6, 4, false, false] });
  });
  it("⭐ infect: an unblocked attacker gives the defending player poison counters, not damage (CR 702.90b)", () => {
    const s1 = cast(table(TRIUMPH_OF_THE_HORDES, { G: 2, C: 2 }));
    const combat = { ...s1, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "b1", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const s = resolveCombatDamage(combat, { firstStrikeStep: false });
    expect({ life: s.players.ai.life, poison: s.players.ai.poison || 0 }).toEqual({ life: s1.players.ai.life, poison: 3 });
  });
  it("⭐ it ends at cleanup: back to 2/2, no trample, no infect", () => {
    const s = expireContinuousEffects(cast(table(TRIUMPH_OF_THE_HORDES, { G: 2, C: 2 })), { atCleanupOfTurn: 4 });
    expect(row(s, "b1", ["Trample", "Infect"])).toEqual([2, 2, false, false]);
  });
});

describe("Titanic Ultimatum", () => {
  it("⭐ +5/+5, first strike, trample and lifelink on the caster's creatures only", () => {
    const s = cast(table(TITANIC_ULTIMATUM, { R: 2, G: 3, W: 2 }));
    const k = ["First strike", "Trample", "Lifelink"];
    expect({ b1: row(s, "b1", k), wurm: row(s, "wurm", k) }).toEqual({ b1: [7, 7, true, true, true], wurm: [6, 4, false, false, false] });
  });
});
