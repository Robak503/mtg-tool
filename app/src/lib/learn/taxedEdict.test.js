/**
 * taxedEdict.test.js — "When this creature enters, each opponent sacrifices a permanent of their choice unless they pay
 * {N}." (Rishadan Cutpurse {1}, Rishadan Footpad {2}, Rishadan Brigand {3} — the 09-06 plan's stage ③, 2026-09-30).
 *
 * Both halves already existed: the edict ("each opponent sacrifices a permanent of their choice" parsed HIGH — its own
 * comment named the Rishadan pirates as carriers) and the taxed-payment pause (Rhystic Study's "unless that player pays",
 * Phyrexian Tyranny's life loss). What was missing was the composition: the tax as a pause, the EDICT as its decline
 * payoff. matchTaxedEdict delegates the edict clause to sacrificeEdictClauseParser, so the pool vocabulary is the plain
 * edict's; resolveTaxedPaymentChoice runs that parsed atom for exactly the payer, and a sacrifice pick that pauses carries
 * the trigger's resume (the sacrifice chain fires it once, when it settles).
 *
 * ⛔ The AI keeps its mana when it has nothing to lose: with no permanent in the pool, declining costs nothing.
 * ⛔ "each PLAYER … unless they pay" (the controller would pay too) and an {X} tax stay unparsed.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveTaxedPaymentChoice, autoPickTaxedPayment, resolveSacrificeChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const CUTPURSE = { id: "cut-c", name: "Rishadan Cutpurse", type: "Creature — Human Pirate", mana: "{2}{U}", power: 1, toughness: 1,
  oracle: "When this creature enters, each opponent sacrifices a permanent of their choice unless they pay {1}." };
const FOOTPAD = { id: "foot-c", name: "Rishadan Footpad", type: "Creature — Human Pirate", mana: "{3}{U}", power: 2, toughness: 2,
  oracle: "When this creature enters, each opponent sacrifices a permanent of their choice unless they pay {2}." };
const BRIGAND = { id: "brig-c", name: "Rishadan Brigand", type: "Creature — Human Pirate", mana: "{4}{U}", power: 3, toughness: 2,
  oracle: "Flying\nWhen this creature enters, each opponent sacrifices a permanent of their choice unless they pay {3}.\nThis creature can block only creatures with flying." };
const BEAR = (id) => ({ id: `${id}-c`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" });
const ISLAND = (id) => ({ id: `${id}-c`, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" });

function mainState({ user = {}, ai = {}, active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, ...user, manaPool: { ...s.players.user.manaPool, ...(user.manaPool || {}) } },
      ai: { ...s.players.ai, ...ai, manaPool: { ...s.players.ai.manaPool, ...(ai.manaPool || {}) } },
    },
  };
}
const perm = (card, id, controller) => createPermanent({ id, card, controller, summoningSick: false });

// `caster` casts `card`, it resolves, and its ETB trigger resolves → the tax pause for the other seat.
function castAndReachTax(card, { caster = "user", payerBoard = [], payerMana = {} } = {}) {
  const payer = caster === "user" ? "ai" : "user";
  let s = mainState({
    [caster]: { hand: [card], manaPool: { U: 1, C: 9 } },
    [payer]: { battlefield: payerBoard, manaPool: payerMana },
    active: caster,
  });
  const cast = legalActionsForPlayer(s, caster).find((a) => a.kind === "cast-spell" && a.cardId === card.id);
  expect(cast).toBeTruthy();
  s = dispatchAction(s, cast);
  s = resolveTopOfStack(s); // the creature enters; its ETB trigger goes on the stack
  expect(s.stack.some((o) => o.kind === "triggered-ability")).toBe(true);
  s = resolveTopOfStack(s); // the trigger resolves → the tax pause
  return { s, payer };
}

describe("the three carriers classify native, through the existing edict + taxed-payment machinery", () => {
  it("Rishadan Cutpurse, Footpad, Brigand → native-trigger", () => {
    for (const c of [CUTPURSE, FOOTPAD, BRIGAND]) expect(classifyCard(c)).toBe("native-trigger");
  });

  it("the sentence parses to ONE taxed-edict atom wrapping the plain edict", () => {
    const p = parseEffectClause("each opponent sacrifices a permanent of their choice unless they pay {2}");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "taxed-edict", cost: { kind: "mana", mana: { generic: 2 } },
      edict: { op: "sacrifice", who: "eachOpponent", what: "permanent" } });
  });

  it("⛔ 'each PLAYER … unless they pay' and an {X} tax stay unparsed", () => {
    expect(parseEffectClause("each player sacrifices a permanent of their choice unless they pay {1}").confidence).toBe("low");
    expect(parseEffectClause("each opponent sacrifices a permanent of their choice unless they pay {X}").confidence).toBe("low");
  });
});

describe("RUNTIME — the opponent pays, or sacrifices", () => {
  it("the pause is the taxed-payment choice, aimed at the opponent, with the edict as the decline", () => {
    const { s, payer } = castAndReachTax(CUTPURSE, { payerBoard: [perm(BEAR("b1"), "p-b1", "ai")] });
    expect(s.pendingChoice).toMatchObject({ kind: "taxed-payment", payer, controller: payer, beneficiary: "user", declinePayoff: "edict" });
  });

  it("PAY: the AI can afford {1} → pays, keeps its permanent", () => {
    const { s } = castAndReachTax(CUTPURSE, { payerBoard: [perm(BEAR("b1"), "p-b1", "ai")], payerMana: { C: 1 } });
    expect(autoPickTaxedPayment(s, s.pendingChoice)).toBe(true);
    const out = resolveTaxedPaymentChoice(s, true);
    expect(out.players.ai.battlefield.map((p) => p.id)).toEqual(["p-b1"]);
    expect(out.players.ai.manaPool.C).toBe(0);
  });

  it("DECLINE with ONE permanent: it is sacrificed (forced — no pick)", () => {
    const { s } = castAndReachTax(CUTPURSE, { payerBoard: [perm(BEAR("b1"), "p-b1", "ai")] });
    expect(autoPickTaxedPayment(s, s.pendingChoice)).toBe(false); // nothing to pay with
    const out = resolveTaxedPaymentChoice(s, false);
    expect(out.players.ai.battlefield).toHaveLength(0);
    expect(out.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    console.log(`WITNESS taxedEdictForced ${JSON.stringify({ aiBoard: out.players.ai.battlefield.length, aiGraveyard: out.players.ai.graveyard.map((c) => c.name) })}`);
  });

  it("DECLINE with TWO permanents: the PAYER picks — a human payer's sacrifice pick, the land kept, the Bears given up", () => {
    const { s } = castAndReachTax(FOOTPAD, { caster: "ai", payerBoard: [perm(BEAR("b1"), "p-b1", "user"), perm(ISLAND("i1"), "p-i1", "user")] });
    expect(s.pendingChoice).toMatchObject({ kind: "taxed-payment", controller: "user", declinePayoff: "edict" });
    const picking = resolveTaxedPaymentChoice(s, false);
    expect(picking.pendingChoice?.controller).toBe("user"); // the sacrificer chooses
    const out = resolveSacrificeChoice(picking, "p-b1");
    expect(out.players.user.battlefield.map((p) => p.id)).toEqual(["p-i1"]);
    expect(out.players.user.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    console.log(`WITNESS taxedEdictPick ${JSON.stringify({ kept: out.players.user.battlefield.map((p) => p.card.name), sacrificed: out.players.user.graveyard.map((c) => c.name) })}`);
  });

  it("the CARRY CONTRACT: a trigger's resume rides onto the payer's pick and fires ONCE, after the pick settles", () => {
    // Driven directly: no printed card puts an atom AFTER a taxed edict (the matcher is whole-oracle), so a lost carry would
    // be invisible at the card level. This hands the pause the resume runProgram records mid-program — [taxed edict, gain
    // 3 life], stopped at atom 1 — and proves the gain waits for the pick, then lands exactly once.
    const { s } = castAndReachTax(FOOTPAD, { caster: "ai", payerBoard: [perm(BEAR("b1"), "p-b1", "user"), perm(ISLAND("i1"), "p-i1", "user")] });
    const program = { version: 1, source: "parser", confidence: "high", structure: "sequence", modal: null, xSpell: false, unparsedTail: null,
      atoms: [{ op: "taxed-edict", cost: s.pendingChoice.cost, edict: s.pendingChoice.declineEdict, targetType: null }, { op: "gain-life", amount: 3, targetType: null }] };
    const paused = { ...s, pendingChoice: { ...s.pendingChoice, resume: { program, nextAtomIndex: 1, controller: "ai", targets: [], cardName: "Carry Probe" } } };
    const lifeBefore = paused.players.ai.life;
    const picking = resolveTaxedPaymentChoice(paused, false);
    expect(picking.pendingChoice?.resume?.nextAtomIndex).toBe(1); // carried onto the sacrifice pick
    expect(picking.players.ai.life).toBe(lifeBefore); // the rest of the program waits for the pick
    const out = resolveSacrificeChoice(picking, "p-b1");
    expect(out.players.ai.life).toBe(lifeBefore + 3); // exactly once
  });

  it("⛔ the AI keeps its mana when it has nothing to lose — declining an empty board costs nothing", () => {
    const { s } = castAndReachTax(BRIGAND, { payerMana: { C: 3 } });
    expect(autoPickTaxedPayment(s, s.pendingChoice)).toBe(false);
    const out = resolveTaxedPaymentChoice(s, false);
    expect(out.players.ai.manaPool.C).toBe(3);
    expect(out.players.ai.battlefield).toHaveLength(0);
  });
});
