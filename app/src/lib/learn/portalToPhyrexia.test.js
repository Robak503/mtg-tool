/**
 * portalToPhyrexia.test.js — the play-weighted program, #1066 Portal to Phyrexia.
 *
 *   "When this artifact enters, each opponent sacrifices three creatures of their choice.
 *    At the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control. It's a
 *    Phyrexian in addition to its other types."
 *
 * Two lines, two missing readers. The counted edict was read for "each player" (Barter in Blood, Blasphemous Edict — every
 * sacrificer chooses, APNAP, then they all go together, CR 101.4; a player with fewer gives up all of them, CR 701.21a) but not
 * for "each opponent". The upkeep reanimate was read (Debtors' Knell); its type rider was not. splitClauses now folds "It's a
 * <creature type> in addition to its other types." onto the reanimate, and the permanent gets a layer-4 subtype addition (CR
 * 613.1d — "in addition to its other types", CR 205.1b) for as long as it stays on the battlefield, added before its enters
 * triggers are checked. The type word must be a creature type (CR 205.3m).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). The cast is the offered legal action; the upkeep trigger fires through the real step path (runStepActions(advanceStep))
 * and resolves through the stack; every sacrifice pick is the engine's own auto-pick.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority, advanceStep, runStepActions, flushTriggers, chooseTriggerTargets, resolveTopOfStack } from "./gameEngine.js";
import { autoPickSacrificeCandidate, resolveSacrificeChoice } from "./effects/runProgram.js";
import { permanentTypes, permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const PORTAL = {"name":"Portal to Phyrexia","type":"Artifact","mana":"{9}","cmc":9,"keywords":[],"colors":[],"oracle":"When this artifact enters, each opponent sacrifices three creatures of their choice.\nAt the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control. It's a Phyrexian in addition to its other types."}; // body-only #1066
const DEBTORS = {"name":"Debtors' Knell","type":"Enchantment","mana":"{4}{W/B}{W/B}{W/B}","cmc":7,"keywords":[],"colors":["B","W"],"oracle":"({W/B} can be paid with either {W} or {B}.)\nAt the beginning of your upkeep, put target creature card from a graveyard onto the battlefield under your control."}; // native-trigger #7924
const BARTER = {"name":"Barter in Blood","type":"Sorcery","mana":"{2}{B}{B}","cmc":4,"keywords":[],"colors":["B"],"oracle":"Each player sacrifices two creatures of their choice."}; // native-spell #13333
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const SOL = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."}; // native-mana
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {C}.)"}; // land
// A synthetic Phyrexian lord — the reanimated creature's new type, read by a layer-7c anthem's subtype selector.
const PHYREXIAN_LORD = { name: "Test Phyrexian Lord", type: "Enchantment", mana: "{2}", cmc: 2, keywords: [], colors: [], oracle: "Phyrexian creatures you control get +1/+1." };

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const UPKEEP = "put target creature card from a graveyard onto the battlefield under your control. It's a Phyrexian in addition to its other types";

function settle(s) {
  const pc = s.pendingChoice;
  return pc?.kind === "sacrifice-choice" ? resolveSacrificeChoice(s, autoPickSacrificeCandidate(s, pc)) : null;
}
function resolveAll(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length || s.pendingChoice) && g++ < 300) {
    const settled = settle(s);
    if (settled) { s = settled; continue; }
    if (s.pendingChoice) break;
    s = passPriority(s);
  }
  return s;
}
function resolveTriggers(s) {
  let g = 0;
  while ((s.stack.length || s.pendingChoice) && g++ < 300) {
    const settled = settle(s);
    if (settled) { s = settled; continue; }
    if (s.pendingChoice) break;
    s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets });
  }
  return s;
}
const names = (list) => (list || []).map((c) => c.card?.name ?? c.name).sort();

describe("PARSE + CLASSIFICATION", () => {
  it("\"each opponent sacrifices three creatures of their choice\" → the counted edict over the opponents", () => {
    const p = parseEffectClause("each opponent sacrifices three creatures of their choice", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "sacrifice", who: "eachOpponent", what: "creature", count: 3 }]);
  });

  it("the upkeep reanimate with its type rider → ONE reanimate atom carrying the added creature type", () => {
    const p = parseEffectClause(UPKEEP, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true, addSubtype: "Phyrexian" }]);
  });

  it("both triggers route natively and Portal to Phyrexia classifies native", () => {
    const ds = detectTriggers(PORTAL);
    expect(ds.map((d) => d.event).sort()).toEqual(["etb", "upkeep"]);
    expect(ds.every((d) => triggerRoutesNatively(d))).toBe(true);
    expect(isNativeTier(classifyCard(PORTAL))).toBe(true);
  });

  it("control — Debtors' Knell and Barter in Blood parse and classify as before", () => {
    expect(parseEffectClause("put target creature card from a graveyard onto the battlefield under your control", "Instant").atoms)
      .toEqual([{ op: "reanimate", targetType: "graveyardCard", cardFilter: "creature", anyGraveyard: true }]);
    expect(parseEffectClause(BARTER.oracle, "Sorcery").atoms).toEqual([{ op: "sacrifice", who: "eachPlayer", what: "creature", count: 2 }]);
    expect([DEBTORS, BARTER].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
  });

  it("CREED — a word that is no creature type (\"an artifact\"), a colour beside the type, or a filtered count stays unread", () => {
    for (const clause of [
      UPKEEP.replace("a Phyrexian in addition to its other types", "an artifact in addition to its other types"),
      UPKEEP.replace("a Phyrexian in addition to its other types", "a black Zombie in addition to its other colors and types"),
      "each opponent sacrifices three creatures with flying",
    ]) expect([clause, programConfidence(parseEffectClause(clause, "Instant", { sourceScoped: true }))]).toEqual([clause, "low"]);
  });
});

describe("RUNTIME — the enters edict", () => {
  const castPortal = (ai) => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const players = { ...s0.players };
    for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [], life: 20 };
    players.user = { ...players.user, battlefield: Array.from({ length: 9 }, (_, i) => P(`w${i}`, WASTES, "user")), hand: [{ id: "portal", ...PORTAL }] };
    players.ai = { ...players.ai, battlefield: ai };
    const s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "portal");
    return resolveAll(dispatchAction(s, a));
  };

  it("⭐ Portal enters → the opponent with four creatures sacrifices three of its choice and keeps one; its Sol Ring is no creature", () => {
    const s = castPortal([P("g1", GIANT, "ai"), P("b1", BEARS, "ai"), P("b2", BEARS, "ai"), P("g2", GIANT, "ai"), P("sol", SOL, "ai")]);
    expect(names(s.players.ai.battlefield)).toEqual(["Hill Giant", "Sol Ring"]);
    expect(names(s.players.ai.graveyard)).toEqual(["Grizzly Bears", "Grizzly Bears", "Hill Giant"]);
  });

  it("an opponent with two creatures sacrifices both (as many as it can)", () => {
    const s = castPortal([P("g1", GIANT, "ai"), P("b1", BEARS, "ai")]);
    expect(s.players.ai.battlefield).toEqual([]);
  });

  it("each opponent: in a four-seat game every opponent sacrifices three, the controller none", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const players = { ...s0.players };
    for (const pid of Object.keys(players)) {
      players[pid] = { ...players[pid], battlefield: [P(`a-${pid}`, BEARS, pid), P(`b-${pid}`, BEARS, pid), P(`c-${pid}`, GIANT, pid), P(`d-${pid}`, GIANT, pid)], hand: [], graveyard: [], library: [] };
    }
    const portal = P("portal", PORTAL, "user");
    players.user = { ...players.user, battlefield: [...players.user.battlefield, portal] };
    let s = { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
    s = resolveTriggers(flushTriggers(checkEnterTriggers(s, portal), { chooseTargets: chooseTriggerTargets }));
    expect(Object.fromEntries(Object.keys(s.players).map((pid) => [pid, s.players[pid].battlefield.filter((p) => p.card.name !== "Portal to Phyrexia").length])))
      .toEqual(Object.fromEntries(Object.keys(s.players).map((pid) => [pid, pid === "user" ? 4 : 1])));
  });
});

describe("RUNTIME — the upkeep reanimate makes a Phyrexian", () => {
  function upkeep({ user = [], aiGy = [] }) {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const portal = P("portal", PORTAL, "user");
    let s = { ...s0, turn: 5, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [portal, ...user], graveyard: [] }, ai: { ...s0.players.ai, battlefield: [], graveyard: aiGy } } };
    s = runStepActions(advanceStep(s));
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    return resolveTriggers(s);
  }

  it("⭐ the opponent's Hill Giant comes back under the user's control, a Phyrexian Giant, still the opponent's card", () => {
    const s = upkeep({ aiGy: [{ id: "gc", ...GIANT }] });
    const giant = s.players.user.battlefield.find((p) => p.card.name === "Hill Giant");
    expect(giant?.owner).toBe("ai");
    expect(giant ? [...permanentTypes(s, giant.id).subtypes].sort() : null).toEqual(["Giant", "Phyrexian"]);
    expect(s.players.ai.graveyard).toEqual([]);
  });

  it("the new type counts at once: beside a \"Phyrexian creatures you control get +1/+1\" lord the Giant is 4/4", () => {
    const s = upkeep({ user: [P("lord", PHYREXIAN_LORD, "user")], aiGy: [{ id: "gc", ...GIANT }] });
    const giant = s.players.user.battlefield.find((p) => p.card.name === "Hill Giant");
    expect(giant ? permanentPower(s, giant.id) : null).toBe(4);
  });

  it("control — Debtors' Knell's reanimate adds no type", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...s0, turn: 5, phase: "beginning", step: "untap", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [P("knell", DEBTORS, "user")] }, ai: { ...s0.players.ai, graveyard: [{ id: "gc", ...GIANT }] } } };
    s = resolveTriggers(flushTriggers(runStepActions(advanceStep(s)), { chooseTargets: chooseTriggerTargets }));
    const giant = s.players.user.battlefield.find((p) => p.card.name === "Hill Giant");
    expect(permanentTypes(s, giant.id).subtypes).toEqual(["Giant"]);
  });
});
