/**
 * cycleSelfTrigger.test.js — "When you cycle this card, …" (CR 702.29 — shelf deck work, D6, 2026-09-30: Agonasaur Rex in
 * Jurassic Ramp, and the cycle-trigger family: Krosan Tusker, Titanoth Rex, Splendor Mare, Quakefoot Cyclops, the
 * Sojourners …).
 *
 * The trigger fires as the cycling ability is activated: actionDispatcher.applyCycle pays the cost (the card goes to the
 * graveyard), puts the draw on the stack, then fires checkCycleSelfTriggers and flushes — so the trigger sits ABOVE the
 * draw and resolves first ("do this before you draw"). Cycling is offered for such a card only when every printed
 * "When you cycle …" line is detected and routes natively (triggerRouting.cycleSelfTriggersModeled — the same two facts
 * the classifier holds the card to). Before this, cycling was refused outright for any card with a cycle trigger.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { checkAllStateBasedActions } from "./sba.js";
import { permanentHasKeyword, permanentPower, permanentToughness } from "./layers.js";
import { cycleSelfTriggersModeled } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AGONASAUR_REX = { name: "Agonasaur Rex", type: "Creature — Dinosaur", mana: "{3}{G}{G}", cmc: 5, colors: ["G"], power: "8", toughness: "8", keywords: ["Trample", "Cycling"],
  oracle: "Trample\nCycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, put two +1/+1 counters on up to one target creature or Vehicle. It gains trample and indestructible until end of turn." };
const KROSAN_TUSKER = { name: "Krosan Tusker", type: "Creature — Boar Beast", mana: "{5}{G}{G}", cmc: 7, colors: ["G"], power: "6", toughness: "5", keywords: ["Cycling"],
  oracle: "Cycling {2}{G} ({2}{G}, Discard this card: Draw a card.)\nWhen you cycle this card, you may search your library for a basic land card, reveal that card, put it into your hand, then shuffle. (Do this before you draw.)" };
const QUAKEFOOT = { name: "Quakefoot Cyclops", type: "Creature — Cyclops", mana: "{4}{R}", cmc: 5, colors: ["R"], power: "3", toughness: "3", keywords: ["Cycling"],
  oracle: "When this creature enters, up to two target creatures can't block this turn.\nCycling {1}{R} ({1}{R}, Discard this card: Draw a card.)\nWhen you cycle this card, target creature can't block this turn." };
const BANT_SOJOURNERS = { name: "Bant Sojourners", type: "Creature — Human Soldier", mana: "{1}{G}{W}{U}", cmc: 4, colors: ["G", "W", "U"], power: "2", toughness: "4", keywords: ["Cycling"],
  oracle: "When you cycle this card and when this creature dies, you may create a 1/1 white Soldier creature token.\nCycling {2}{W} ({2}{W}, Discard this card: Draw a card.)" };
const ESPER_SOJOURNERS = { name: "Esper Sojourners", type: "Artifact Creature — Vedalken Wizard", mana: "{W}{U}{B}", cmc: 3, colors: ["W", "U", "B"], power: "2", toughness: "3", keywords: ["Cycling"],
  oracle: "When you cycle this card and when this creature dies, you may tap or untap target permanent.\nCycling {2}{U} ({2}{U}, Discard this card: Draw a card.)" };
const COPTER = { name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", cmc: 2, colors: [], power: "3", toughness: "3", keywords: ["Flying", "Crew"],
  oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {R}.)" };
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {W}.)" };

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const lands = (card, n, pre = "l") => Array.from({ length: n }, (_, i) => perm(`${pre}${i}`, card));
function board({ hand, user = [], ai = [], library = [{ ...BEAR, id: "lib-top" }, { ...BEAR, id: "lib-2" }] }) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand: [{ ...hand, id: "h-card" }], battlefield: user, library },
      ai: { ...g.players.ai, battlefield: ai } } };
}
const cycleOffer = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cycle" && a.cardId === "h-card") || null;
/** Resolve the whole stack; a printed "you may" is taken, a tutor pause takes `pick`. */
const settle = (out, pick) => (out.pendingChoice?.kind === "optional-effect" ? resolveOptionalChoice(out, true) : resolveTutorChoice(out, pick));
function resolveAll(s, pick = null) {
  let out = s;
  for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice); i++) out = out.pendingChoice ? settle(out, pick) : resolveTopOfStack(out);
  return out;
}

describe("the cards", () => {
  it("⭐ Agonasaur Rex reads native, and so do the family's modeled forms (including the Sojourners' cycle-or-dies compound)", () => {
    expect([AGONASAUR_REX, KROSAN_TUSKER, QUAKEFOOT, BANT_SOJOURNERS].map((c) => classifyCard(c))).toEqual(["native-trigger", "native-trigger", "native-trigger", "native-trigger"]);
  });
  it("an unmodeled cycle trigger keeps the card parked AND cycling unoffered — the trigger is never dropped", () => {
    expect({ esper: classifyCard(ESPER_SOJOURNERS), modeled: cycleSelfTriggersModeled(ESPER_SOJOURNERS) }).toEqual({ esper: "body-only", modeled: false });
    const s = board({ hand: ESPER_SOJOURNERS, user: lands(PLAINS, 3) });
    expect(cycleOffer(s)).toBe(null);
    const cycleOrDiscard = { ...AGONASAUR_REX, name: "Test Rex", oracle: AGONASAUR_REX.oracle.replace("When you cycle this card,", "When you cycle or discard this card,") };
    expect({ tier: classifyCard(cycleOrDiscard), modeled: cycleSelfTriggersModeled(cycleOrDiscard), offered: !!cycleOffer(board({ hand: cycleOrDiscard, user: lands(FOREST, 3) })) })
      .toEqual({ tier: "body-only", modeled: false, offered: false });
  });
});

describe("⭐ the real cycle", () => {
  it("⭐ Agonasaur Rex: offered, the trigger above the draw — two counters, trample and indestructible on your Bear, then the draw", () => {
    const s = board({ hand: AGONASAUR_REX, user: [perm("b1", BEAR), ...lands(FOREST, 3)] });
    const offer = cycleOffer(s);
    const cast = dispatchAction(s, offer);
    const top = cast.stack[cast.stack.length - 1];
    const triggerAboveDraw = cast.stack.length === 2 && /Agonasaur Rex/.test(String(top.source?.name || "")) && /cycling/.test(String(cast.stack[0].source?.name || ""));
    const afterTrigger = resolveTopOfStack(cast);
    const bearMid = { pt: `${permanentPower(afterTrigger, "b1")}/${permanentToughness(afterTrigger, "b1")}`, handMid: afterTrigger.players.user.hand.map((c) => c.id) };
    const out = resolveAll(afterTrigger);
    const row = { offered: !!offer, triggerAboveDraw, bears: bearMid.pt, handBeforeDraw: bearMid.handMid.length,
      trample: permanentHasKeyword(out, "b1", "trample"), indestructible: permanentHasKeyword(out, "b1", "indestructible"),
      drew: out.players.user.hand.map((c) => c.id), rexInGraveyard: out.players.user.graveyard.some((c) => c.id === "h-card") };
    console.log(`WITNESS agonasaurCycle ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: true, triggerAboveDraw: true, bears: "4/4", handBeforeDraw: 0, trample: true, indestructible: true, drew: ["lib-top"], rexInGraveyard: true });
  });
  it("up to one creature OR VEHICLE: with only an uncrewed Vehicle, the counters land on it", () => {
    const out = resolveAll(dispatchAction(board({ hand: AGONASAUR_REX, user: [perm("cop", COPTER), ...lands(FOREST, 3)] }), cycleOffer(board({ hand: AGONASAUR_REX, user: [perm("cop", COPTER), ...lands(FOREST, 3)] }))));
    const copter = out.players.user.battlefield.find((p) => p.id === "cop");
    expect({ counters: copter.counters?.["+1/+1"] ?? 0, indestructible: permanentHasKeyword(out, "cop", "indestructible") }).toEqual({ counters: 2, indestructible: true });
  });
  it("an uncrewed Vehicle is not a creature (CR 301.7): counters on it don't fire a 'counters on a creature' watcher; on a creature they do", () => {
    const TERRASYMBIOSIS = { name: "Terrasymbiosis", type: "Enchantment", mana: "{2}{G}", cmc: 3, colors: ["G"], keywords: [],
      oracle: "Whenever you put one or more +1/+1 counters on a creature you control, you may draw that many cards. Do this only once each turn." };
    const fires = (target) => {
      const s = board({ hand: AGONASAUR_REX, user: [perm("terra", TERRASYMBIOSIS), target, ...lands(FOREST, 3)] });
      const t = resolveTopOfStack(dispatchAction(s, cycleOffer(s)));   // the cycle trigger resolves; its watchers flush
      return (t.pendingTriggers || []).some((x) => x.event === "countersPlaced") || (t.stack || []).some((o) => o.source?.name === "Terrasymbiosis")
        || t.pendingChoice?.sourceName === "Terrasymbiosis";
    };
    expect({ vehicle: fires(perm("cop", COPTER)), creature: fires(perm("b1", BEAR)) }).toEqual({ vehicle: false, creature: true });
  });
  it("with nothing to target, the draw still happens (the target is optional)", () => {
    const out = resolveAll(dispatchAction(board({ hand: AGONASAUR_REX, user: lands(FOREST, 3) }), cycleOffer(board({ hand: AGONASAUR_REX, user: lands(FOREST, 3) }))));
    expect(out.players.user.hand.map((c) => c.id)).toEqual(["lib-top"]);
  });
  it("Krosan Tusker: the land is found BEFORE the draw", () => {
    const s = board({ hand: KROSAN_TUSKER, user: lands(FOREST, 3), library: [{ ...BEAR, id: "lib-top" }, { ...FOREST, id: "lib-forest" }, { ...BEAR, id: "lib-3" }] });
    let out = dispatchAction(s, cycleOffer(s));
    out = resolveTopOfStack(out);                                        // the trigger — "you may" pauses first
    expect(out.pendingChoice?.kind).toBe("optional-effect");
    out = resolveOptionalChoice(out, true);                              // take it — the search pauses on its pick
    out = resolveTutorChoice(out, "lib-forest");
    const handBeforeDraw = out.players.user.hand.map((c) => c.id);
    out = resolveAll(out);
    expect({ handBeforeDraw, handAfter: out.players.user.hand.length, forestInHand: out.players.user.hand.some((c) => c.id === "lib-forest") })
      .toEqual({ handBeforeDraw: ["lib-forest"], handAfter: 2, forestInHand: true });
  });
  it("Quakefoot Cyclops: an OPPONENT's creature can't block this turn", () => {
    const s = board({ hand: QUAKEFOOT, user: lands(MOUNTAIN, 2), ai: [perm("o1", BEAR, "ai")] });
    const out = resolveAll(dispatchAction(s, cycleOffer(s)));
    // The declaration honours it: the user attacks this turn and the Bear is not offered as a blocker — offered before.
    const attacked = (st) => ({ ...st, phase: "combat", step: "declare-blockers", activePlayer: "user", priorityHolder: "ai", stack: [],
      combat: { attackers: [{ permanentId: "u-atk", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: { ...st.players, user: { ...st.players.user, battlefield: [...st.players.user.battlefield, perm("u-atk", BEAR)] } } });
    const canBlock = (st) => legalActionsForPlayer(attacked(st), "ai").some((a) => a.kind === "declare-blocker" && a.permanentId === "o1");
    expect({ keyword: permanentHasKeyword(out, "o1", "cantBlock"), before: canBlock(s), after: canBlock(out) }).toEqual({ keyword: true, before: true, after: false });
  });
  it("Bant Sojourners: a Soldier on cycling — and, the compound's other half, a Soldier when it dies", () => {
    const s = board({ hand: BANT_SOJOURNERS, user: lands(PLAINS, 3) });
    const cycled = resolveAll(flushTriggers(dispatchAction(s, cycleOffer(s)), { chooseTargets: chooseTriggerTargets }));
    const soldiers = (st) => st.players.user.battlefield.filter((p) => /Soldier/.test(String(p.card?.type || p.card?.name || "")) && p.card?.token).length;
    // The other half: lethal damage marked, the real SBA destroys it and fires its dies watchers.
    const g = board({ hand: BEAR, user: [{ ...perm("bs", BANT_SOJOURNERS), damageMarked: 4 }] });
    const died = resolveAll(flushTriggers(checkAllStateBasedActions(g), { chooseTargets: chooseTriggerTargets }));
    expect({ onCycle: soldiers(cycled), onDeath: soldiers(died) }).toEqual({ onCycle: 1, onDeath: 1 });
  });
});
