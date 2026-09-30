/**
 * anyGraveyardReanimate.test.js — "At the beginning of your upkeep, put target creature card from a graveyard onto the battlefield
 * under your control." (Debtors' Knell — census rank 61 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * The clause parsed HIGH all along (the reanimate atom, anyGraveyard). The TRIGGER parked because atomTargetIntent called a
 * reanimate from any graveyard "ambiguous": the one-value intent model couldn't prove a side for the flush chooser. There is
 * no side to prove — the card enters under the CONTROLLER's control whichever graveyard it leaves, so every legal pick helps
 * its controller. The intent is now "any": the chooser's side filter lets it through (it filters only enemy / own /
 * ambiguous), the resolvability gates refuse only "ambiguous". Which card is best is the policy evaluator's question.
 *
 * Virtue of Persistence prints the same line but stays parked for a different reason: the Adventure lane only models a
 * CREATURE half (adventure.parseAdventureCard), so the enchantment Adventures fall to the spell classifier — banked.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). The trigger fires through the real step path
 * (runStepActions(advanceStep(…)) into the upkeep) and resolves through the stack.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { advanceStep, chooseTriggerTargets, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent, programTriggerTargetsResolvable } from "./effects/programQueries.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const KNELL = { id: "c-knell", name: "Debtors' Knell", type: "Enchantment", mana: "{4}{W/B}{W/B}{W/B}", keywords: [],
  oracle: "({W/B} can be paid with either {W} or {B}.)\nAt the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control." };
const CLAUSE = "put target creature card from a graveyard onto the battlefield under your control";
const TENEB = { id: "c-teneb", name: "Teneb, the Harvester", type: "Legendary Creature — Dragon", mana: "{3}{W}{B}{G}", power: "6", toughness: "6", keywords: ["Flying"],
  oracle: "Flying\nWhenever Teneb deals combat damage to a player, you may pay {2}{B}. If you do, put target creature card from a graveyard onto the battlefield under your control." };
const card = (id, name, type, extra = {}) => ({ id, name, type, mana: "{1}{G}", keywords: [], oracle: "", ...extra });
const BEARS = (id) => card(id, "Grizzly Bears", "Creature — Bear", { power: "2", toughness: "2" });
const LIONS = (id) => card(id, "Savannah Lions", "Creature — Cat", { mana: "{W}", power: "2", toughness: "1" });
const PLAINS = (id) => card(id, "Plains", "Basic Land — Plains", { mana: "", oracle: "({T}: Add {W}.)" });

// The user's untap step, Debtors' Knell on the user's battlefield; graveyards as given.
function board({ userGy = [], aiGy = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const knell = createPermanent({ id: "knell", card: KNELL, controller: "user", summoningSick: false });
  return { ...s, turn: 5, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, battlefield: [knell], graveyard: userGy }, ai: { ...s.players.ai, graveyard: aiGy } } };
}
// Into the upkeep the way the game loop goes (the step's actions queue the trigger), then flush and resolve.
function upkeep(s0) {
  let s = runStepActions(advanceStep(s0));
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  for (let i = 0; i < 8 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  return s;
}
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();

describe("the intent + the tier", () => {
  it("⭐ a reanimate from ANY graveyard reads 'any' — resolvable — and Debtors' Knell classifies native", () => {
    const program = parseEffectClause(CLAUSE, "Instant");
    expect(atomTargetIntent(program.atoms[0])).toBe("any");
    expect(programTriggerTargetsResolvable(program)).toBe(true);
    expect(classifyCard(KNELL)).toBe("native-trigger");
  });
  it("⛔ from an OPPONENT's graveyard keeps its old answer (ambiguous); from YOUR graveyard stays own", () => {
    expect(atomTargetIntent({ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", opponentGraveyard: true })).toBe("ambiguous");
    expect(atomTargetIntent({ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature" })).toBe("own");
  });
});

describe("RUNTIME — the upkeep trigger, through the step path and the stack", () => {
  it("⭐ the opponent's Grizzly Bears comes back under YOUR control (and stays the AI's card — owner stamped)", () => {
    const out = upkeep(board({ aiGy: [BEARS("gb")] }));
    const bears = out.players.user.battlefield.find((p) => p.card?.name === "Grizzly Bears");
    const result = { step: out.step, userBattlefield: names(out.players.user.battlefield), aiGraveyard: names(out.players.ai.graveyard), owner: bears?.owner ?? null };
    expect(result).toEqual({ step: "upkeep", userBattlefield: ["Debtors' Knell", "Grizzly Bears"], aiGraveyard: [], owner: "ai" });
    console.log(`WITNESS knellCrossGraveyard ${JSON.stringify(result)}`);
  });
  it("from your own graveyard just the same", () => {
    const out = upkeep(board({ userGy: [LIONS("sl")] }));
    expect({ bf: names(out.players.user.battlefield), gy: names(out.players.user.graveyard) }).toEqual({ bf: ["Debtors' Knell", "Savannah Lions"], gy: [] });
  });
  it("⭐ Teneb, the Harvester — the unplanned flip (\"you may pay {2}{B}. If you do, put target creature card from a graveyard …\"): combat damage, pay, and the opponent's Bears is yours; decline and it stays put", () => {
    // The optional-mana-payment wrapper delegates its intent to the payoff (programQueries), so it inherits "any".
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const teneb = createPermanent({ id: "teneb", card: TENEB, controller: "user", summoningSick: false });
    const s = { ...s0, turn: 5, phase: "combat", step: "combat-damage", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      combat: { attackers: [{ permanentId: "teneb", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [teneb], manaPool: { W: 0, U: 0, B: 1, R: 0, G: 0, C: 2 } }, ai: { ...s0.players.ai, graveyard: [BEARS("gb")] } } };
    let st = flushTriggers(resolveCombatDamage(s, { firstStrikeStep: false }), { chooseTargets: chooseTriggerTargets });
    for (let i = 0; i < 8 && (st.stack || []).length && !st.pendingChoice; i++) st = resolveTopOfStack(st);
    expect(st.pendingChoice?.kind).toBe("optional-mana-payment");
    const settleAll = (x) => { let y = x; for (let i = 0; i < 8 && (y.stack || []).length && !y.pendingChoice; i++) y = resolveTopOfStack(y); return y; };
    const paid = settleAll(resolveOptionalManaPaymentChoice(st, true));
    const declined = settleAll(resolveOptionalManaPaymentChoice(st, false));
    const result = { aiLife: st.players.ai.life, paid: { bf: names(paid.players.user.battlefield), pool: paid.players.user.manaPool.B + paid.players.user.manaPool.C },
      declined: { bf: names(declined.players.user.battlefield), aiGraveyard: names(declined.players.ai.graveyard) } };
    expect(result).toEqual({ aiLife: s.players.ai.life - 6, paid: { bf: ["Grizzly Bears", "Teneb, the Harvester"], pool: 0 },
      declined: { bf: ["Teneb, the Harvester"], aiGraveyard: ["Grizzly Bears"] } });
    console.log(`WITNESS tenebPays ${JSON.stringify(result)}`);
  });
  it("VACUITY CONTROLS — no creature card in any graveyard: nothing enters (a Plains in the yard is not a target)", () => {
    const empty = upkeep(board());
    const landOnly = upkeep(board({ aiGy: [PLAINS("pl")] }));
    expect({ empty: names(empty.players.user.battlefield), landOnly: names(landOnly.players.user.battlefield), plains: names(landOnly.players.ai.graveyard) })
      .toEqual({ empty: ["Debtors' Knell"], landOnly: ["Debtors' Knell"], plains: ["Plains"] });
  });
});
