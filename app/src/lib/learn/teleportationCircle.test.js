/**
 * teleportationCircle.test.js — SHELF-85 runbook Phase 2 · B6 (2026-09-04): Teleportation Circle (Brago).
 *
 *   "At the beginning of your end step, exile up to one target artifact or creature you control, then return that
 *    card to the battlefield under its owner's control."
 *
 * The blink family read creature / nonland-permanent / the Ghostly Flicker triple; the own-side ARTIFACT-OR-CREATURE
 * union is new (an enumerator branch in spellEffects beside the triple, the same targeting gate), with "up to one" on
 * the up-to-one subset path and the bare form (Escape Protocol / Against All Odds) mandatory. The clause splitter's
 * keep-whole guard — which stops ", then" severing the exile from its return — admits the form. The end-step trigger
 * existed. Against All Odds ("Choose one or both") graduates with it: this blink + a modeled reanimation.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { detectTriggers, checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CIRCLE = { id: "c-tc", name: "Teleportation Circle", type: "Enchantment", mana: "{3}{W}", cmc: 4, keywords: [],
  oracle: "At the beginning of your end step, exile up to one target artifact or creature you control, then return that card to the battlefield under its owner's control." };
const ODDS = { id: "c-aao", name: "Against All Odds", type: "Sorcery", mana: "{3}{W}", cmc: 4, keywords: [],
  oracle: "Choose one or both —\n• Exile target artifact or creature you control, then return it to the battlefield under its owner's control.\n• Return target artifact or creature card with mana value 3 or less from your graveyard to the battlefield." };
const WALL = { id: "card-wall", name: "Wall of Omens", type: "Creature — Wall", mana: "{1}{W}", cmc: 2, power: 0, toughness: 4, oracle: "Defender\nWhen this creature enters, draw a card." };
const RING = { id: "card-ring", name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, oracle: "{T}: Add {C}{C}." };
const plains = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Plains", type: "Basic Land — Plains", oracle: "{T}: Add {W}." }, controller: ctrl });

function board(ctrl, perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "ending", step: "end", activePlayer: ctrl, priorityHolder: ctrl, consecutivePasses: 0, turn: 5,
    players: { ...s.players, [ctrl]: { ...s.players[ctrl], battlefield: [createPermanent({ id: "TC", card: CIRCLE, controller: ctrl }), plains("P1", ctrl), ...perms], library: [{ id: "lib-1", name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }], hand: [] } } };
}
function fireEndStep(s) {
  s = checkStepTriggers(s, "endStep");
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  return s;
}
const resolveAll = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };

describe("parse", () => {
  it("the end-step trigger carries the up-to-one artifact-or-creature blink", () => {
    const d = detectTriggers(CIRCLE);
    expect(d.map((x) => x.event)).toEqual(["endStep"]);
    const r = parseEffectClause(d[0].effectClause, "Enchantment");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "blink", targetType: "artifactOrCreatureYouControl", restrictions: [], returnTo: "owner", maxTargets: 1, minTargets: 0 }]);
  });
  it("the bare form is one mandatory target; the splitter keeps both sentences whole", () => {
    const bare = "Exile target artifact or creature you control, then return it to the battlefield under its owner's control.";
    expect(parseEffectClause(bare, "Sorcery").atoms).toEqual([{ op: "blink", targetType: "artifactOrCreatureYouControl", restrictions: [], returnTo: "owner" }]);
    expect(splitClauses(bare)).toEqual([bare.replace(/\.$/, "")]); // kept whole (the splitter drops the terminal period)
    expect(splitClauses("Exile up to one target artifact or creature you control, then return that card to the battlefield under its owner's control.")).toHaveLength(1);
  });
  it("seen-to-fail: an artifact-or-creature blink that returns under YOUR control is its own form; an enchantment union parks", () => {
    expect(parseEffectClause("Exile target artifact or creature you control, then return it to the battlefield under your control.", "Sorcery").atoms[0]?.returnTo).toBe("controller");
    expect(parseEffectClause("Exile target artifact or enchantment you control, then return it to the battlefield under its owner's control.", "Sorcery").atoms).toEqual([]);
  });
});

describe("runtime — the end step blinks one of your artifacts or creatures", () => {
  it("a tapped Wall of Omens leaves and returns untapped as a NEW object, and its ETB draws again", () => {
    let s = board("user", [createPermanent({ id: "WALL", card: WALL, controller: "user", tapped: true })]);
    s = fireEndStep(s);
    const trig = s.stack.find((o) => o.kind === "triggered-ability");
    expect(trig).toBeTruthy();
    expect(trig.targets.map((t) => t.id)).toEqual(["WALL"]); // never the Plains
    s = resolveAll(s);
    expect(s.players.user.battlefield.some((p) => p.id === "WALL")).toBe(false);
    const back = s.players.user.battlefield.find((p) => p.card?.name === "Wall of Omens");
    expect(back).toBeTruthy();
    expect(back.tapped).toBeFalsy();
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(1); // the re-entry ETB drew
  });
  it("a tapped Sol Ring is a legal target and comes back untapped", () => {
    let s = board("user", [createPermanent({ id: "RING", card: RING, controller: "user", tapped: true })]);
    s = fireEndStep(s);
    expect(s.stack.find((o) => o.kind === "triggered-ability").targets.map((t) => t.id)).toEqual(["RING"]);
    s = resolveAll(s);
    const back = s.players.user.battlefield.find((p) => p.card?.name === "Sol Ring");
    expect(back).toBeTruthy();
    expect(back.id).not.toBe("RING");
    expect(back.tapped).toBeFalsy();
  });
  it("with only lands to offer, the up-to-one trigger resolves with no target and nothing moves", () => {
    let s = board("user", []);
    s = fireEndStep(s);
    s = resolveAll(s);
    expect(s.players.user.battlefield.map((p) => p.id).sort()).toEqual(["P1", "TC"]);
  });
  it("the AI seat's own end step runs the same blink", () => {
    let s = board("ai", [createPermanent({ id: "AWALL", card: { ...WALL, id: "card-awall" }, controller: "ai", tapped: true })]);
    s = fireEndStep(s);
    expect(s.stack.find((o) => o.kind === "triggered-ability").targets.map((t) => t.id)).toEqual(["AWALL"]);
    s = resolveAll(s);
    expect(s.players.ai.battlefield.find((p) => p.card?.name === "Wall of Omens").tapped).toBeFalsy();
  });
});

describe("classifier", () => {
  it("Teleportation Circle is native-trigger; Against All Odds (choose one or both) is a native spell", () => {
    expect(classifyCard(CIRCLE)).toBe("native-trigger");
    expect(classifyCard(ODDS)).toBe("native-spell");
  });
});
