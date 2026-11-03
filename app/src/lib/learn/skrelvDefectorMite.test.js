/**
 * skrelvDefectorMite.test.js — SKRELV, DEFECTOR MITE (the play-weighted program, EDHREC #1123):
 *
 *   "Toxic 1" · "Skrelv can't block."
 *   "{W/P}, {T}: Choose a color. Another target creature you control gains toxic 1 and hexproof from that color until end of turn. It
 *    can't be blocked by creatures of that color this turn."
 *
 * One atom (effects/atoms/chosenColorShield.js): the colour is chosen as the ability resolves (CR 608.2d) — a person through the colour
 * question the protection grants use (the protection-color pause, its text naming this grant), the AI seat by the shared automatic
 * chooser. Then, until end of turn, the target has toxic 1 (a granted instance, cumulative with its own — CR 702.164b, the ruling;
 * combat damage to a player gives that many poison counters, CR 702.164c), hexproof from that colour (CR 702.11d — opponents' sources of
 * that colour can't target it) and can't be blocked by creatures of that colour this turn (CR 509.1b). The ability targets: a target gone
 * as it resolves means nothing happens (CR 608.2b). {W/P} is paid with {W} or 2 life (CR 107.4f). Witnessed through real game states.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { finalizeStackResolution, resolveTopOfStack } from "./gameEngine.js";
import { resolveProtectionColorChoice } from "./effects/runProgram.js";
import { expireContinuousEffects, permanentHasKeyword } from "./layers.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { gainControlIndefinitely } from "./controlMove.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SKRELV = {"name":"Skrelv, Defector Mite","type":"Legendary Artifact Creature — Phyrexian Mite","mana":"{W}","oracle":"Toxic 1 (Players dealt combat damage by this creature also get a poison counter.)\nSkrelv can't block.\n{W/P}, {T}: Choose a color. Another target creature you control gains toxic 1 and hexproof from that color until end of turn. It can't be blocked by creatures of that color this turn. ({W/P} can be paid with either {W} or 2 life.)","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":["Toxic"],"colors":["W"],"colorIdentity":["W"]}; // EDHREC #1123
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","oracle":"{T}: Add {G}.","layout":"normal","cmc":1,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #58
const BOLT = {"name":"Lightning Bolt","type":"Instant","mana":"{R}","oracle":"Lightning Bolt deals 3 damage to any target.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #157
const BEAST = {"name":"Beast Within","type":"Instant","mana":"{2}{G}","oracle":"Destroy target permanent. Its controller creates a 3/3 green Beast creature token.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #25
const SYPHONER = {"name":"Pestilent Syphoner","type":"Creature — Phyrexian Insect","mana":"{1}{B}","oracle":"Flying\nToxic 1 (Players dealt combat damage by this creature also get a poison counter.)","layout":"normal","cmc":2,"power":"1","toughness":"1","loyalty":null,"keywords":["Flying","Toxic"],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #6565

const FROG = {"name":"Turn to Frog","type":"Instant","mana":"{1}{U}","oracle":"Until end of turn, target creature loses all abilities and becomes a blue Frog with base power and toughness 1/1.","layout":"normal","cmc":2,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #8993
const VEIL = {"name":"Veil of Summer","type":"Instant","mana":"{G}","oracle":"Draw a card if an opponent has cast a blue or black spell this turn. Spells you control can't be countered this turn. You and permanents you control gain hexproof from blue and from black until end of turn. (You and they can't be the targets of blue or black spells or abilities your opponents control.)","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #525
const UNSUMMON = {"name":"Unsummon","type":"Instant","mana":"{U}","oracle":"Return target creature to its owner's hand.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #2928
const PYROMANCER = {"name":"Prodigal Pyromancer","type":"Creature — Human Wizard","mana":"{2}{R}","oracle":"{T}: This creature deals 1 damage to any target.","layout":"normal","cmc":3,"power":"1","toughness":"1","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #11683
const EMISSARY = {"name":"Burning-Tree Emissary","type":"Creature — Human Shaman","mana":"{R/G}{R/G}","oracle":"When this creature enters, add {R}{G}.","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G","R"],"colorIdentity":["G","R"]}; // EDHREC #14650
const VITALIZE = {"name":"Vitalize","type":"Instant","mana":"{G}","oracle":"Untap all creatures you control.","layout":"normal","cmc":1,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #3573

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/**
 * `seat`'s precombat main: Skrelv and Grizzly Bears for `seat` (+ `board`), the other seat's Hill Giant (red) and Llanowar Elves (green)
 * (or `foes`) and its `foeHand` with {R}{G}{2} floating; `pool` for `seat`. Heads-up; the person plays the user seat.
 */
function table({ seat = "user", board = [], foes = null, foeHand = [], pool = { W: 1 } } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const other = seat === "user" ? "ai" : "user";
  const players = { ...g.players };
  players[seat] = { ...players[seat], battlefield: [on(seat, "skrelv", SKRELV), on(seat, "bears", BEARS), ...board], hand: [], graveyard: [], library: [],
    manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } };
  players[other] = { ...players[other], battlefield: foes ?? [on(other, "giant", GIANT), on(other, "elves", ELVES)], graveyard: [], library: [],
    hand: foeHand.map((c, i) => ({ ...c, id: `f${i}` })), manaPool: { W: 0, U: 0, B: 0, R: 1, G: 1, C: 2 } };
  return { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: seat, priorityHolder: seat, consecutivePasses: 0, players };
}
const offers = (s, seat = "user") => legalActionsForPlayer(s, seat).filter((a) => a.kind === "activate-ability" && a.permanentId === "skrelv" && !a.isManaAbility);
const offerAt = (s, targetId, seat = "user") => offers(s, seat).find((a) => (a.targets || []).some((t) => t.id === targetId));
/** `seat` activates Skrelv at `targetId`; as it resolves the person is asked the colour (answered `color`); the AI seat picks its own. */
function activate(s, targetId, color = null, seat = "user") {
  const a = offerAt(s, targetId, seat);
  expect(a, `Skrelv's ability is not offered at ${targetId}`).toBeTruthy();
  let n = resolveTopOfStack(dispatchAction(s, a));
  let question = null;
  if (n.pendingChoice?.kind === "protection-color") {
    question = n.pendingChoice;
    n = resolveProtectionColorChoice(n, color);
  }
  return { s: finalizeStackResolution(n), question, action: a };
}
const blockersOf = (s, attackerId, blockSeat = "ai") => {
  const atk = { ...s, phase: "combat", step: "declare-blockers", activePlayer: blockSeat === "ai" ? "user" : "ai", priorityHolder: blockSeat,
    combat: { attackers: [{ permanentId: attackerId, attackingPlayer: blockSeat === "ai" ? "user" : "ai", defender: blockSeat }], blockers: [] } };
  return [...new Set(legalActionsForPlayer(atk, blockSeat).filter((a) => a.kind === "declare-blocker" && a.attackerId === attackerId).map((a) => a.permanentId))].sort();
};
const boltTargets = (s, cardId = "f0", seat = "ai") => [...new Set(legalActionsForPlayer({ ...s, priorityHolder: seat }, seat)
  .filter((a) => a.kind === "cast-spell" && a.cardId === cardId).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();

describe("the card", () => {
  it("⭐ native: every line plays", () => {
    expect(isNativeTier(classifyCard(SKRELV))).toBe(true);
  });
});

describe("the offer", () => {
  it("⭐ another target creature you control: the Bears, never Skrelv itself or an opponent's", () => {
    const targets = [...new Set(offers(table()).flatMap((a) => (a.targets || []).map((t) => t.id)))].sort();
    expect(targets).toEqual(["bears"]);
  });
  it("⭐ {W/P}: with {W} floating it is paid with the {W}; with none, with 2 life (CR 107.4f)", () => {
    const withW = activate(table(), "bears", "R");
    const noW = activate(table({ pool: {} }), "bears", "R");
    expect({ w: withW.s.players.user.manaPool.W, wLife: withW.s.players.user.life, life: noW.s.players.user.life, price: noW.action.phyrexianLife ?? null, tapped: noW.s.players.user.battlefield.find((p) => p.id === "skrelv")?.tapped })
      .toEqual({ w: 0, wLife: 40, life: 38, price: 2, tapped: true });
  });
});

describe("the person chooses a colour as it resolves (CR 608.2d)", () => {
  it("⭐ asked among the five colours, the grant named", () => {
    const { question } = activate(table(), "bears", "R");
    expect({ kind: question?.kind, colors: (question?.candidates || []).map((c) => c.id), cardName: question?.cardName, text: /toxic 1 and hexproof from the color you choose/.test(question?.grantText || "") })
      .toEqual({ kind: "protection-color", colors: ["W", "U", "B", "R", "G"], cardName: "Grizzly Bears", text: true });
  });
  it("⭐ red: the Bears have toxic 1; the AI's Lightning Bolt can't target them, its green Beast Within still can (hexproof from red only)", () => {
    const { s } = activate(table({ foeHand: [BOLT, BEAST] }), "bears", "R");
    expect({ toxic: permanentHasKeyword(s, "bears", "toxic"), bolt: boltTargets(s, "f0").includes("bears"), beast: boltTargets(s, "f1").includes("bears"), skrelvBolt: boltTargets(s, "f0").includes("skrelv") })
      .toEqual({ toxic: true, bolt: false, beast: true, skrelvBolt: true });
  });
  it("⭐ red: the Bears can't be blocked by the red Hill Giant this turn; the green Elves still may", () => {
    const { s } = activate(table(), "bears", "R");
    expect({ after: blockersOf(s, "bears"), before: blockersOf(table(), "bears") }).toEqual({ after: ["elves"], before: ["elves", "giant"] });
  });
  it("⭐ green: then the Elves can't block them and the Giant can; Lightning Bolt can target them", () => {
    const { s } = activate(table({ foeHand: [BOLT] }), "bears", "G");
    expect({ blockers: blockersOf(s, "bears"), bolt: boltTargets(s, "f0").includes("bears") }).toEqual({ blockers: ["giant"], bolt: true });
  });
  it("⭐ toxic 1: the Bears connect unblocked — 2 damage and a poison counter (CR 702.164c)", () => {
    const { s } = activate(table(), "bears", "W");
    const hit = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "bears", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect({ life: hit.players.ai.life, poison: hit.players.ai.poison ?? 0 }).toEqual({ life: 38, poison: 1 });
  });
  it("⭐ its ruling — toxic is cumulative: Pestilent Syphoner (toxic 1) given toxic 1 gives 2 poison counters", () => {
    const { s } = activate(table({ board: [on("user", "mite", SYPHONER)] }), "mite", "W");
    const hit = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "mite", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect({ poison: hit.players.ai.poison ?? 0 }).toEqual({ poison: 2 });
  });
  it("⭐ until end of turn: after the cleanup the Bears have no toxic, the Giant may block them and Lightning Bolt target them again", () => {
    const { s } = activate(table({ foeHand: [BOLT] }), "bears", "R");
    const next = { ...expireContinuousEffects(s, { atCleanupOfTurn: s.turn }), turn: s.turn + 1 };
    expect({ toxic: permanentHasKeyword(next, "bears", "toxic"), blockers: blockersOf(next, "bears"), bolt: boltTargets(next, "f0").includes("bears") })
      .toEqual({ toxic: false, blockers: ["elves", "giant"], bolt: true });
  });
  it("⭐ the Bears die in response (the AI's Lightning Bolt): nothing to grant — no question, no effect (CR 608.2b)", () => {
    const s0 = table({ foeHand: [BOLT] });
    const a = offerAt(s0, "bears");
    expect(a, "Skrelv's ability is not offered at bears").toBeTruthy();
    const s1 = { ...dispatchAction(s0, a), priorityHolder: "ai" };
    const bolt = legalActionsForPlayer(s1, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "f0" && (x.targets || []).some((t) => t.id === "bears"));
    expect(bolt, "Lightning Bolt at the Bears is not offered in response").toBeTruthy();
    let n = resolveTopOfStack(dispatchAction(s1, bolt));
    n = resolveTopOfStack(n);
    expect({ asked: n.pendingChoice?.kind ?? null, bears: n.players.user.battlefield.some((p) => p.id === "bears") }).toEqual({ asked: null, bears: false });
  });
  it("⭐ in response: the AI's Lightning Bolt aimed at the Bears, the person activates Skrelv and chooses red — the Bolt's target is illegal and the Bears live (CR 608.2b)", () => {
    const s0 = { ...table({ foeHand: [BOLT] }), activePlayer: "ai", priorityHolder: "ai" };
    const bolt = legalActionsForPlayer(s0, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "f0" && (x.targets || []).some((t) => t.id === "bears"));
    expect(bolt, "Lightning Bolt at the Bears is not offered").toBeTruthy();
    const s1 = { ...dispatchAction(s0, bolt), priorityHolder: "user" };
    const a = offerAt(s1, "bears");
    expect(a, "Skrelv's ability is not offered in response").toBeTruthy();
    let n = resolveTopOfStack(dispatchAction(s1, a));
    expect(n.pendingChoice?.kind).toBe("protection-color");
    n = resolveProtectionColorChoice(n, "R");
    n = finalizeStackResolution(resolveTopOfStack(n));
    expect({ bears: n.players.user.battlefield.some((p) => p.id === "bears"), damage: n.players.user.battlefield.find((p) => p.id === "bears")?.damageMarked ?? null, stack: n.stack.length })
      .toEqual({ bears: true, damage: 0, stack: 0 });
  });
  it("⭐ the grant outlives Skrelv: Skrelv Bolted after its ability resolved — the Bears keep toxic 1, and the red Giant still can't block them", () => {
    const { s } = activate(table({ foeHand: [BOLT] }), "bears", "R");
    const bolt = legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "f0" && (x.targets || []).some((t) => t.id === "skrelv"));
    expect(bolt, "Lightning Bolt at Skrelv is not offered").toBeTruthy();
    const after = finalizeStackResolution(resolveTopOfStack(dispatchAction({ ...s, priorityHolder: "ai" }, bolt)));
    expect({ skrelv: after.players.user.battlefield.some((p) => p.id === "skrelv"), toxic: permanentHasKeyword(after, "bears", "toxic"), blockers: blockersOf(after, "bears") })
      .toEqual({ skrelv: false, toxic: true, blockers: ["elves"] });
  });
  it("⭐ hexproof is the creature's own (CR 702.11d): the Bears taken by the AI this turn — the AI's own Bolt may target them, the person's may not", () => {
    const { s } = activate(table({ foeHand: [BOLT] }), "bears", "R");
    const stolen = gainControlIndefinitely(s, "bears", "ai");
    const mine = { ...stolen, players: { ...stolen.players, user: { ...stolen.players.user, hand: [{ ...BOLT, id: "u0" }], manaPool: { ...stolen.players.user.manaPool, R: 1 } } } };
    expect({ ai: boltTargets(mine, "f0", "ai").includes("bears"), user: boltTargets(mine, "u0", "user").includes("bears") }).toEqual({ ai: true, user: false });
  });
});

describe("the AI seat", () => {
  it("holds it: its main phase picks no Skrelv activation", () => {
    const s = table({ seat: "ai", foes: [on("user", "giant", GIANT)] });
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick?.kind === "activate-ability" && pick?.permanentId === "skrelv").toBe(false);
  });
  it("⭐ made to activate it, it chooses its own colour without a question: the colour of the person's creatures (two red, one green) — red", () => {
    const foes = [on("user", "giant", GIANT), on("user", "giant2", GIANT), on("user", "elves", ELVES)];
    const { s, question } = activate(table({ seat: "ai", foes }), "bears", null, "ai");
    expect({ question, toxic: permanentHasKeyword(s, "bears", "toxic"), blockers: blockersOf(s, "bears", "user") })
      .toEqual({ question: null, toxic: true, blockers: ["elves"] });
  });
});

describe("a later \"loses all abilities\" (the review of pw26, F1 — CR 613.1f, 613.7, 702.164a, 702.11d)", () => {
  /** The AI casts `cardId` from its hand at `targetId` with priority, and it resolves; the AI's pool gets {U}{U} for it. */
  const aiCastsAt = (s, cardId, targetId) => {
    const p = { ...s, priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.ai, manaPool: { ...s.players.ai.manaPool, U: 2 } } } };
    const a = legalActionsForPlayer(p, "ai").find((x) => x.kind === "cast-spell" && x.cardId === cardId && (x.targets || []).some((t) => t.id === targetId));
    expect(a, `${cardId} at ${targetId} is not offered to the AI`).toBeTruthy();
    return { ...finalizeStackResolution(resolveTopOfStack(dispatchAction(p, a))), priorityHolder: "user" };
  };
  const hitAi = (s, attackerId) => resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: attackerId, attackingPlayer: "user", defender: "ai" }], blockers: [] } });
  it("⭐ Skrelv's red grant, then the AI's Turn to Frog at the Bears: no toxic — 1 damage and no poison; the AI's red Bolt may target them; red creatures still can't block them (an effect, not an ability)", () => {
    const { s } = activate(table({ foeHand: [FROG, BOLT] }), "bears", "R");
    const frog = aiCastsAt(s, "f0", "bears");
    const hit = hitAi(frog, "bears");
    expect({ toxic: permanentHasKeyword(frog, "bears", "toxic"), bolt: boltTargets(frog, "f1").includes("bears"), life: hit.players.ai.life, poison: hit.players.ai.poison ?? 0, blockers: blockersOf(frog, "bears") })
      .toEqual({ toxic: false, bolt: true, life: 39, poison: 0, blockers: ["elves"] });
  });
  it("⭐ Turn to Frog first, then Skrelv's red grant: the newer grant applies — 1 damage and 1 poison, and the Bolt can't target them", () => {
    const frog = aiCastsAt(table({ foeHand: [FROG, BOLT] }), "f0", "bears");
    const { s } = activate(frog, "bears", "R");
    const hit = hitAi(s, "bears");
    expect({ toxic: permanentHasKeyword(s, "bears", "toxic"), bolt: boltTargets(s, "f1").includes("bears"), life: hit.players.ai.life, poison: hit.players.ai.poison ?? 0 })
      .toEqual({ toxic: true, bolt: false, life: 39, poison: 1 });
  });
  it("⭐ Veil of Summer's shield too: the person's Veil, then their own Turn to Frog at their Bears — the AI's blue Unsummon may target them; without the Frog it may not", () => {
    const s0 = table({ foeHand: [UNSUMMON] });
    const user = { ...s0.players.user, hand: [{ ...VEIL, id: "u0" }, { ...FROG, id: "u1" }], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 1, C: 1 } };
    let s = { ...s0, players: { ...s0.players, user, ai: { ...s0.players.ai, manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 0 } } } };
    const cast = (st, cardId, targetId = null) => {
      const a = legalActionsForPlayer(st, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId && (!targetId || (x.targets || []).some((t) => t.id === targetId)));
      expect(a, `${cardId} is not offered`).toBeTruthy();
      return finalizeStackResolution(resolveTopOfStack(dispatchAction(st, a)));
    };
    s = cast(s, "u0");
    const veiled = boltTargets(s, "f0").includes("bears");
    s = cast(s, "u1", "bears");
    expect({ veiled, frogged: boltTargets(s, "f0").includes("bears") }).toEqual({ veiled: false, frogged: true });
  });
});

describe("the review's probed-correct rows (F5)", () => {
  it("⭐ hexproof from red stops a red ABILITY: the AI's Prodigal Pyromancer can target Skrelv, not the Bears", () => {
    const { s } = activate(table({ foes: [on("ai", "pyro", PYROMANCER)] }), "bears", "R");
    const targets = [...new Set(legalActionsForPlayer({ ...s, priorityHolder: "ai" }, "ai").filter((a) => a.kind === "activate-ability" && a.permanentId === "pyro").flatMap((a) => (a.targets || []).map((t) => t.id)))];
    expect({ bears: targets.includes("bears"), skrelv: targets.includes("skrelv") }).toEqual({ bears: false, skrelv: true });
  });
  it("⭐ a multicoloured blocker: red chosen, Burning-Tree Emissary (red and green) can't block the Bears; the green Elves can", () => {
    const { s } = activate(table({ foes: [on("ai", "emissary", EMISSARY), on("ai", "elves", ELVES)] }), "bears", "R");
    expect(blockersOf(s, "bears")).toEqual(["elves"]);
  });
  it("⭐ two grants stack: red, then Vitalize untaps Skrelv, then green — toxic 2 (2 damage, 2 poison), and neither the red Giant nor the green Elves can block", () => {
    const s0 = table({ pool: { W: 2, G: 1 } });
    const first = activate({ ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...VITALIZE, id: "u0" }] } } }, "bears", "R").s;
    const vit = legalActionsForPlayer(first, "user").find((x) => x.kind === "cast-spell" && x.cardId === "u0");
    expect(vit, "Vitalize is not offered").toBeTruthy();
    const untapped = finalizeStackResolution(resolveTopOfStack(dispatchAction(first, vit)));
    const { s } = activate(untapped, "bears", "G");
    const hit = resolveCombatDamage({ ...s, phase: "combat", step: "combat-damage", combat: { attackers: [{ permanentId: "bears", attackingPlayer: "user", defender: "ai" }], blockers: [] } });
    expect({ poison: hit.players.ai.poison ?? 0, life: hit.players.ai.life, blockers: blockersOf(s, "bears") }).toEqual({ poison: 2, life: 38, blockers: [] });
  });
});
