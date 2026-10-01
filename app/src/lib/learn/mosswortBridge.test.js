/**
 * mosswortBridge.test.js — HIDEAWAY (CR 702.75) and Mosswort Bridge (the play-weighted program, P·10, 2026-10-01: EDHREC #194).
 *
 *   "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest
 *    on the bottom in a random order.)
 *    This land enters tapped.
 *    {T}: Add {G}.
 *    {G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or
 *    greater."
 *
 * detectTriggers synthesizes the keyword's ETB (exactly one printed "Hideaway N"); the look rides the impulse-dig pause with a
 * hideaway destination — the pick is exiled stamped `_hideawayOf`, the land is stamped `hideawayCardId` (the CR 607.2a link),
 * the rest go to the bottom at random, and exiling one is mandatory. The linked ability's "if …" rides the conditional rider
 * (checked as it resolves); a hidden nonland card is parked behind the discover decision (cast it free, or leave it exiled).
 * It is offered only while a hidden nonland card waits and the condition holds.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic keyword fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { detectTriggers, hideawayKeywordValue } from "./triggers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BRIDGE = { name: "Mosswort Bridge", type: "Land", mana: "", cmc: 0, colors: [], keywords: ["Hideaway"],
  oracle: "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {G}.\n{G}, {T}: You may play the exiled card without paying its mana cost if creatures you control have total power 10 or greater." };
const WURM = { name: "Craw Wurm", type: "Creature — Wurm", mana: "{4}{G}{G}", cmc: 6, colors: ["G"], power: "6", toughness: "4", keywords: [], oracle: "" };
const GIANT = { name: "Hill Giant", type: "Creature — Giant", mana: "{3}{R}", cmc: 4, colors: ["R"], power: "3", toughness: "3", keywords: [], oracle: "" };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };

const on = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
function table({ hand = [], battlefield = [], library = [], exile = [] } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...g.players, user: { ...g.players.user, hand, battlefield, library, exile, landsPlayedThisTurn: 0 } } };
}
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const lib = () => [["l-wurm", WURM], ["l-bears", BEARS], ["l-forest", FOREST], ["l-giant", GIANT], ["l-f2", FOREST], ["l-f3", FOREST]].map(([id, c]) => ({ ...c, id }));
const playBridge = () => {
  const s0 = table({ hand: [{ ...BRIDGE, id: "h-bridge" }], library: lib() });
  const play = legalActionsForPlayer(s0, "user").find((a) => a.kind === "play-land" && a.cardId === "h-bridge");
  return settle(dispatchAction(s0, play));
};
/** A Bridge already on the battlefield, untapped, its hidden card in exile; `power` creatures; a Forest for {G}. */
const armed = (creatures, hidden = WURM) => table({
  battlefield: [on("bridge", BRIDGE, { hideawayCardId: "x-hidden" }), on("forest", FOREST), ...creatures.map(([id, c]) => on(id, c))],
  exile: [{ ...hidden, id: "x-hidden", _hideawayOf: "bridge" }],
});
const playAbility = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "bridge" && !/Add \{G\}/.test(a.abilityText || ""));

describe("the card", () => {
  it("a covered land: one synthesized Hideaway 4 ETB, and the linked ability carries the formidable condition", () => {
    const play = parseActivatedAbilities(BRIDGE).find((a) => a.manaPips === "{G}");
    expect({ tier: classifyCard(BRIDGE), triggers: detectTriggers(BRIDGE).map((d) => d.sourceText), atoms: play?.program?.atoms }).toEqual({
      tier: "land", triggers: ["Hideaway 4"],
      atoms: [{ op: "hideaway-play", targetType: null, condition: "creatures you control have total power 10 or greater" }],
    });
  });

  it("fences (synthetic): two printed instances and a granted hideaway are not synthesized", () => {
    expect([hideawayKeywordValue("Hideaway 3, hideaway 3"), hideawayKeywordValue("Creatures you control have hideaway 4."), hideawayKeywordValue(BRIDGE.oracle)]).toEqual([0, 0, 4]);
  });
});

describe("hideaway — the look and the hide", () => {
  it("played as the land drop: look at the top four, the pick is exiled and linked, the other three go to the bottom (WITNESS)", () => {
    const s = playBridge();
    if (s.pendingChoice?.kind !== "impulse-dig") throw new Error("no hideaway look");
    const looked = s.pendingChoice.candidates.map((c) => c.id);
    const after = resolveImpulseDigChoice(s, "l-wurm");
    const bridge = after.players.user.battlefield.find((p) => p.card?.name === "Mosswort Bridge");
    const witness = { looked, exiled: after.players.user.exile.map((c) => [c.id, c._hideawayOf === bridge.id]), linked: bridge.hideawayCardId,
      top: after.players.user.library.slice(0, 2).map((c) => c.id), bottom: after.players.user.library.slice(2).map((c) => c.id).sort() };
    console.log(`WITNESS hideawayLook ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ looked: ["l-wurm", "l-bears", "l-forest", "l-giant"], exiled: [["l-wurm", true]], linked: "l-wurm",
      top: ["l-f2", "l-f3"], bottom: ["l-bears", "l-forest", "l-giant"] });
  });

  it("exiling one is mandatory: a pick that names no candidate hides the first looked-at card", () => {
    const after = resolveImpulseDigChoice(playBridge(), null);
    expect([after.players.user.exile.map((c) => c.id), after.players.user.battlefield.find((p) => p.card?.name === "Mosswort Bridge")?.hideawayCardId]).toEqual([["l-wurm"], "l-wurm"]);
  });
});

describe("the linked ability", () => {
  it("twelve power: {G}, {T} parks the free cast; the hidden Wurm is cast from exile for nothing (WITNESS)", () => {
    const s0 = armed([["w1", WURM], ["w2", WURM]]);
    const act = playAbility(s0);
    if (!act) throw new Error("the hideaway play is not offered");
    const s1 = settle(dispatchAction(s0, act));
    const free = legalActionsForPlayer(s1, "user").find((a) => a.kind === "cast-spell" && a.cardId === "x-hidden");
    let s2 = dispatchAction(s1, free);
    while (s2.stack.length && !s2.pendingChoice) s2 = resolveTopOfStack(s2);
    s2 = finalizeStackResolution(s2);
    const witness = { parked: s1.pendingDiscover, fromExile: free?.fromZone, wurmsOnBattlefield: s2.players.user.battlefield.filter((p) => p.card?.name === "Craw Wurm").length, exile: s2.players.user.exile.length };
    console.log(`WITNESS hideawayPlay ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ parked: { controller: "user", cardId: "x-hidden", mv: null, declineTo: "exile" }, fromExile: "exile", wurmsOnBattlefield: 3, exile: 0 });
  });

  it("⛔ nine power is not ten: the ability is not offered", () => {
    expect(playAbility(armed([["w1", WURM], ["g1", GIANT]]))).toBeUndefined();
  });

  it("⛔ a hidden land is not offered (playing it would be a land play no lane grants yet)", () => {
    expect(playAbility(armed([["w1", WURM], ["w2", WURM]], FOREST))).toBeUndefined();
  });

  it("⛔ the condition is checked again as it resolves: a Wurm leaving in response leaves six power — nothing is parked (CR 608.2c)", () => {
    const s0 = armed([["w1", WURM], ["w2", WURM]]);
    const activated = dispatchAction(s0, playAbility(s0));
    const shrunk = { ...activated, players: { ...activated.players, user: { ...activated.players.user, battlefield: activated.players.user.battlefield.filter((p) => p.id !== "w2") } } };
    expect(settle(shrunk).pendingDiscover).toBeUndefined();
  });

  it("⛔ the resolver refuses a hidden land even past the offer gate (the hidden card swapped for a Forest before it resolves)", () => {
    const s0 = armed([["w1", WURM], ["w2", WURM]]);
    const activated = dispatchAction(s0, playAbility(s0));
    const swapped = { ...activated, players: { ...activated.players, user: { ...activated.players.user, exile: [{ ...FOREST, id: "x-hidden", _hideawayOf: "bridge" }] } } };
    expect(settle(swapped).pendingDiscover).toBeUndefined();
  });

  it("the other two carriers the flip-diff names: Windbrisk Heights (three attackers) and Clive's Hideaway (four legends) offer exactly at their conditions", () => {
    const HEIGHTS = { name: "Windbrisk Heights", type: "Land", mana: "", cmc: 0, colors: [], keywords: ["Hideaway"],
      oracle: "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nThis land enters tapped.\n{T}: Add {W}.\n{W}, {T}: You may play the exiled card without paying its mana cost if you attacked with three or more creatures this turn." };
    const CLIVE = { name: "Clive's Hideaway", type: "Land — Town", mana: "", cmc: 0, colors: [], keywords: ["Hideaway"],
      oracle: "Hideaway 4 (When this land enters, look at the top four cards of your library, exile one face down, then put the rest on the bottom in a random order.)\n{T}: Add {C}.\n{2}, {T}: You may play the exiled card without paying its mana cost if you control four or more legendary creatures." };
    const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {W}.)" };
    const LEGEND = { name: "Isamaru, Hound of Konda", type: "Legendary Creature — Dog", mana: "{W}", cmc: 1, colors: ["W"], power: "2", toughness: "2", keywords: [], oracle: "" };
    const board = (land, lands, creatures) => table({
      battlefield: [on("bridge", land, { hideawayCardId: "x-hidden" }), ...lands.map(([id, c]) => on(id, c)), ...creatures],
      exile: [{ ...WURM, id: "x-hidden", _hideawayOf: "bridge" }],
    });
    const attackers = (n) => Array.from({ length: n }, (_, i) => on(`a${i}`, BEARS, { attackedThisTurn: true }));
    const legends = (n) => Array.from({ length: n }, (_, i) => on(`leg${i}`, { ...LEGEND, name: `${LEGEND.name} ${i}` }));
    expect({
      heights3: !!playAbility(board(HEIGHTS, [["p1", PLAINS]], attackers(3))),
      heights2: !!playAbility(board(HEIGHTS, [["p1", PLAINS]], attackers(2))),
      clive4: !!playAbility(board(CLIVE, [["f1", FOREST], ["f2", FOREST]], legends(4))),
      clive3: !!playAbility(board(CLIVE, [["f1", FOREST], ["f2", FOREST]], legends(3))),
      tiers: [classifyCard(HEIGHTS), classifyCard(CLIVE)],
    }).toEqual({ heights3: true, heights2: false, clive4: true, clive3: false, tiers: ["land", "land"] });
  });

  it("declining leaves the card in exile", () => {
    const s0 = armed([["w1", WURM], ["w2", WURM]]);
    const s1 = settle(dispatchAction(s0, playAbility(s0)));
    const leave = legalActionsForPlayer(s1, "user").find((a) => a.kind === "discover-to-hand" && a.cardId === "x-hidden");
    const s2 = dispatchAction(s1, leave);
    expect([s2.pendingDiscover, s2.players.user.exile.map((c) => c.id), s2.players.user.hand.length]).toEqual([undefined, ["x-hidden"], 0]);
  });
});
