/**
 * hullbreakerHorror.test.js — Hullbreaker Horror (the play-weighted program, P·18, 2026-10-01: EDHREC rank #269; CR 700.2,
 * 603.3c, 701.6a).
 *
 *   "Flash
 *    This spell can't be countered.
 *    Whenever you cast a spell, choose up to one —
 *    • Return target spell you don't control to its owner's hand.
 *    • Return target nonland permanent to its owner's hand."
 *
 * Two pieces: the spell-only bounce (Venser's stack half, narrowed to another player's spell — not a counter, so an
 * uncounterable spell is a legal target) and "choose UP TO one" (parseModal's allowNone). The trigger's chooser aims each mode
 * at the enemy side; when no mode has a safe target, none is chosen and the ability is removed from the stack (CR 603.3c) —
 * never a bounce of your own permanent.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, parseEffectProgram } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { RESOLVER_KEYS } from "./resolvers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const HULLBREAKER = { name: "Hullbreaker Horror", type: "Creature — Kraken Horror", mana: "{5}{U}{U}", cmc: 7, colors: ["U"], power: "7", toughness: "8", keywords: ["Flash"],
  oracle: "Flash\nThis spell can't be countered.\nWhenever you cast a spell, choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand." };
const RITUAL = { name: "Dark Ritual", type: "Instant", mana: "{B}", cmc: 1, colors: ["B"], keywords: [], oracle: "Add {B}{B}{B}." };
const OGRE = { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", cmc: 3, colors: ["R"], power: "2", toughness: "2", keywords: [], oracle: "" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };
const TYRANT = { name: "Carnage Tyrant", type: "Creature — Dinosaur", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "7", toughness: "6", keywords: ["Hexproof", "Trample"],
  oracle: "This spell can't be countered.\nTrample, hexproof" };

/** An opponent's spell on the stack (the Sink into Stupor fixture shape): a sorcery, or a creature card as a permanent spell. */
function spellOnStack(id, card, controller = "ai") {
  return { id, kind: "spell", controller, owner: controller, targets: [], cost: null, source: { ...card, id: `card-${id}` },
    payload: card.type.includes("Creature")
      ? { resolver: RESOLVER_KEYS.PERMANENT_ETB, params: { card: { ...card, id: `card-${id}` }, controller } }
      : { resolver: RESOLVER_KEYS.EFFECT_PROGRAM, params: { program: parseEffectProgram({ type: "Sorcery", oracle: "Draw a card." }), controller, targets: [] } } };
}
const SORCERY = { name: "Divination", type: "Sorcery", mana: "{2}{U}", cmc: 3, colors: ["U"], keywords: [], oracle: "Draw two cards." };

/** The user holds priority with Hullbreaker in play and Dark Ritual in hand; `stack` and the opponent's board given. */
function table({ stack = [], theirs = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack,
    players: { ...g.players,
      user: { ...g.players.user, hand: [{ ...RITUAL, id: "dr" }], manaPool: { ...g.players.user.manaPool, B: 1 },
        battlefield: [createPermanent({ id: "p-hull", card: { ...HULLBREAKER, id: "hull" }, controller: "user", summoningSick: false })] },
      ai: { ...g.players.ai, battlefield: theirs.map(([id, c]) => createPermanent({ id: `p-${id}`, card: { ...c, id }, controller: "ai", summoningSick: false })) } } };
}
/** Cast Dark Ritual, put Hullbreaker's trigger on the stack, and resolve it (the Ritual stays below). */
function castAndTrigger(s) {
  const cast = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "dr"));
  const flushed = flushTriggers(cast, { chooseTargets: chooseTriggerTargets });
  const trigger = flushed.stack[flushed.stack.length - 1];
  const isTrigger = trigger?.kind !== "spell";
  return { flushed, trigger: isTrigger ? trigger : null, resolved: isTrigger ? resolveTopOfStack(flushed) : flushed };
}

describe("the card", () => {
  it("both modes parse; \"up to one\" lets the trigger choose none; the card is native-mixed", () => {
    const p = parseEffectClause("choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand.", "trigger");
    expect({ conf: p.confidence, allowNone: p.modal?.allowNone, modes: p.modal?.modes.map((m) => m.atoms), tier: classifyCard(HULLBREAKER) }).toEqual({
      conf: "high", allowNone: true, tier: "native-mixed", modes: [
        [{ op: "bounce-spell-or-permanent", targetType: "spell", notCounter: true, spellController: "opponent" }],
        [{ op: "bounce", targetType: "nonlandPermanent", restrictions: [] }],
      ] });
  });
});

describe("in play", () => {
  it("an opponent's spell on the stack goes back to their hand (WITNESS)", () => {
    const { resolved } = castAndTrigger(table({ stack: [spellOnStack("div", SORCERY)], theirs: [["ogre", OGRE]] }));
    const witness = { stack: resolved.stack.map((o) => o.source?.name || o.kind), aiHand: resolved.players.ai.hand.map((c) => c.name), ogre: resolved.players.ai.battlefield.some((p) => p.card?.name === "Gray Ogre") };
    console.log(`WITNESS hullbreakerHorror ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ stack: ["Dark Ritual"], aiHand: ["Divination"], ogre: true });
  });

  it("no opponent spell: their nonland permanent goes back instead", () => {
    const { resolved } = castAndTrigger(table({ theirs: [["ogre", OGRE], ["isl", ISLAND]] }));
    expect({ aiHand: resolved.players.ai.hand.map((c) => c.name), aiBoard: resolved.players.ai.battlefield.map((p) => p.card?.name) })
      .toEqual({ aiHand: ["Gray Ogre"], aiBoard: ["Island"] });
  });

  it("⛔ nothing of theirs to bounce: no mode is chosen and the trigger is removed — Hullbreaker itself stays (CR 603.3c)", () => {
    const { flushed, trigger, resolved } = castAndTrigger(table({ theirs: [["isl", ISLAND]] }));
    expect({ trigger, stack: flushed.stack.map((o) => o.source?.name || o.kind), mine: resolved.players.user.battlefield.map((p) => p.card?.name) })
      .toEqual({ trigger: null, stack: ["Dark Ritual"], mine: ["Hullbreaker Horror"] });
  });

  it("an uncounterable spell is still bounced — returning it to hand isn't countering it (CR 701.6a)", () => {
    const { resolved } = castAndTrigger(table({ stack: [spellOnStack("tyrant", TYRANT)] }));
    expect({ stack: resolved.stack.map((o) => o.source?.name), aiHand: resolved.players.ai.hand.map((c) => c.name) })
      .toEqual({ stack: ["Dark Ritual"], aiHand: ["Carnage Tyrant"] });
  });

  it("⛔ the spell mode's legal targets are other players' spells only — never yours (the enumeration, not just the chooser)", () => {
    const s = table({ stack: [spellOnStack("theirs", SORCERY), spellOnStack("mine", SORCERY, "user")] });
    const p = parseEffectClause("choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Return target nonland permanent to its owner's hand.", "trigger");
    const spellMode = expandCastChoices(s, "user", p, [], { sourceId: "p-hull" }).filter((c) => c.chosenMode === 0);
    expect(spellMode.map((c) => c.targets.map((t) => t.id))).toEqual([["theirs"]]);
  });

  it("⛔ your own spell on the stack is never the target", () => {
    const { resolved } = castAndTrigger(table({ stack: [spellOnStack("mine", SORCERY, "user")] }));
    expect({ stack: resolved.stack.map((o) => o.source?.name).sort(), hand: resolved.players.user.hand.map((c) => c.name) })
      .toEqual({ stack: ["Dark Ritual", "Divination"], hand: [] });
  });
});
