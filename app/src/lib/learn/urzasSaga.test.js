/**
 * urzasSaga.test.js — Urza's Saga (the play-weighted program, P·4, 2026-10-01: EDHREC rank #120).
 *
 *   "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)
 *    I — This Saga gains "{T}: Add {C}."
 *    II — This Saga gains "{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for
 *         each artifact you control.'"
 *    III — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle."
 *
 * Three pieces, on the existing Saga machinery (CR 714): a self-grant with no duration — the effect lasts until the end of
 * the game (CR 611.2a) and the fixed id ends with the object (CR 400.7) — through the layer-6 addAbility vehicle the group
 * grants already light up (a mana spec, then an activated body, which makes P·3's Construct); the PRINTED mana cost tutor
 * (CR 202.1 — an artifact land has no mana cost and Chalice of the Void's is {X}{X}, though both have mana value 0); and the
 * land gate asking the Saga gate, since a Saga land's whole text is its chapter list.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-10-01), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { manaProduction } from "./manaModel.js";

beforeEach(() => _resetIdsForTests());

const SAGA = { name: "Urza's Saga", type: "Enchantment Land — Urza's Saga", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga gains \"{T}: Add {C}.\"\nII — This Saga gains \"{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for each artifact you control.'\"\nIII — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle." };
const SOL_RING = { name: "Sol Ring", type: "Artifact", mana: "{1}", cmc: 1, colors: [], keywords: [], oracle: "{T}: Add {C}{C}." };
const ORNITHOPTER = { name: "Ornithopter", type: "Artifact Creature — Thopter", mana: "{0}", cmc: 0, colors: [], power: "0", toughness: "2", keywords: ["Flying"], oracle: "Flying" };
const CITADEL = { name: "Darksteel Citadel", type: "Artifact Land", mana: "", cmc: 0, colors: [], keywords: ["Indestructible"], oracle: "Indestructible\n{T}: Add {C}." };
const CHALICE = { name: "Chalice of the Void", type: "Artifact", mana: "{X}{X}", cmc: 0, colors: [], keywords: [],
  oracle: "This artifact enters with X charge counters on it.\nWhenever a player casts a spell with mana value equal to the number of charge counters on this artifact, counter that spell." };
const MIND_STONE = { name: "Mind Stone", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [], oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const FILLER = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {U}.)" };
const DOUBLING_SEASON = { name: "Doubling Season", type: "Enchantment", mana: "{4}{G}", cmc: 5, colors: ["G"], keywords: [],
  oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." };

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const library = [["fill1", FILLER], ["fill2", FILLER], ["sol", SOL_RING], ["thopter", ORNITHOPTER], ["citadel", CITADEL], ["chalice", CHALICE], ["mind", MIND_STONE]];
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, hand: [{ ...SAGA, id: "saga" }, { ...SOL_RING, id: "hand-sol" }], landsPlayedThisTurn: 0,
      library: library.map(([id, c]) => ({ ...c, id })) } } };
}
/** Resolve the stack and any pending triggers; stop at a pending choice. */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const sagaPerm = (s) => s.players.user.battlefield.find((p) => p.card?.name === "Urza's Saga");
/** The user's next draw step (adds a lore counter and puts the crossed chapter on the stack), settled, back in a main phase. */
function nextDrawStep(s) {
  const drawn = runStepActions({ ...s, activePlayer: "user", priorityHolder: "user", phase: "beginning", step: "draw", players: { ...s.players, user: { ...s.players.user, landsPlayedThisTurn: 0 } } });
  return settle({ ...drawn, phase: "precombat-main", step: "main", priorityHolder: "user", consecutivePasses: 0 });
}
/** Play the Saga as the land drop and let chapter I resolve. */
function played() {
  const s0 = table();
  const play = legalActionsForPlayer(s0, "user").find((a) => a.kind === "play-land" && a.cardId === "saga");
  if (!play) throw new Error("Urza's Saga is not offered as the land drop");
  return settle(flushTriggers(dispatchAction(s0, play), { chooseTargets: chooseTriggerTargets }));
}

describe("the card", () => {
  it("reads as a covered land; its three chapters parse", () => {
    const S = (c) => parseEffectClause(c, "Enchantment").atoms;
    expect({
      tier: classifyCard(SAGA),
      one: S("This Saga gains \"{T}: Add {C}.\""),
      three: S("Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle."),
    }).toEqual({
      tier: "land",
      one: [{ op: "self-grant", grantKind: "mana", spec: { colors: ["C"], amount: 1 }, targetType: null }],
      three: [{ op: "tutor", filter: { groups: [["artifact"]], manaCostIn: ["{0}", "{1}"] }, filterLabel: "artifact card with mana cost {0} or {1}", destination: "battlefield", entersTapped: false, targetType: null }],
    });
  });

  it("fences (synthetic): an unmodeled granted body stays unread; another permanent's self-grant is not this Saga's", () => {
    const conf = (c) => parseEffectClause(c, "Enchantment")?.confidence ?? "low";
    expect([conf("This Saga gains \"{T}: Exchange control of target creature and this Saga.\""), conf("This land gains \"{T}: Add {C}.\"")]).toEqual(["low", "low"]);
  });

  it("a Saga's chapters are never its own mana — nor its lore reminder, nor an unplayed back face's text (index-shaped fixtures)", () => {
    const SONG = { name: "Song of Freyalise", type: "Enchantment — Saga", mana: "{1}{G}",
      oracle: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Until your next turn, creatures you control gain \"{T}: Add one mana of any color.\"\nIII — Put a +1/+1 counter on each creature you control. Those creatures gain vigilance, trample, and indestructible until end of turn." };
    const WELCOME = { name: "Welcome to . . . // Jurassic Park", type: "Enchantment — Saga // Legendary Land", mana: "{1}{G}{G}",
      oracle: "Welcome to . . . - Enchantment — Saga {1}{G}{G}\n(As this Saga enters and after your draw step, add a lore counter.)\nI — For each opponent, up to one target noncreature artifact they control becomes a 0/4 Wall artifact creature with defender for as long as you control this Saga.\nII — Create a 3/3 green Dinosaur creature token with trample. It gains haste until end of turn.\nIII — Destroy all Walls. Exile this Saga, then return it to the battlefield transformed under your control.\n//\nJurassic Park - Legendary Land \n(Transforms from Welcome to ....)\nEach Dinosaur card in your graveyard has escape. The escape cost is equal to the card's mana cost plus exile three other cards from your graveyard. (You may cast cards from your graveyard for their escape cost.)\n{T}: Add {G} for each Dinosaur you control." };
    expect([SAGA, SONG, WELCOME, FILLER].map((c) => manaProduction({ ...c }))).toEqual([null, null, null, { colors: ["U"], amount: 1 }]);
  });
});

describe("in play", () => {
  it("chapter I: played as the land drop with one lore counter, it gains \"{T}: Add {C}.\" — the only source that pays for Sol Ring", () => {
    const s = played();
    expect({ lore: sagaPerm(s).counters?.lore, solRingOffered: legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "hand-sol") })
      .toEqual({ lore: 1, solRingOffered: true });
  });

  it("⛔ chapter I countered (a Stifle): no grant, so no mana — the quoted \"{T}: Add {C}.\" is the chapter's, not the Saga's (CR 714.2b)", () => {
    const s0 = table();
    const saga = { ...createPermanent({ id: "saga-p", card: { ...SAGA, id: "saga" }, controller: "user", summoningSick: false }), counters: { lore: 1 }, sagaFinal: 3 };
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, hand: [{ ...SOL_RING, id: "hand-sol" }], battlefield: [saga] } } };
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.cardId === "hand-sol")).toBe(false);
  });

  it("chapter II: after the next draw step it can make a Construct — {2}, {T}", () => {
    const s1 = nextDrawStep(played());
    const withMana = { ...s1, players: { ...s1.players, user: { ...s1.players.user, manaPool: { ...s1.players.user.manaPool, C: 2 } } } };
    const act = legalActionsForPlayer(withMana, "user").find((a) => a.kind === "activate-ability" && a.permanentId === sagaPerm(withMana).id);
    if (!act) throw new Error("the Construct ability is not offered");
    const s2 = settle(dispatchAction(withMana, act));
    const constructs = s2.players.user.battlefield.filter((p) => /Construct/.test(String(p.card?.type || "")));
    expect({ lore: sagaPerm(s1).counters?.lore, constructs: constructs.length, sagaTapped: !!sagaPerm(s2).tapped }).toEqual({ lore: 2, constructs: 1, sagaTapped: true });
  });

  it("under Doubling Season the land drop enters with two lore counters and fires chapters I and II at once (CR 122.6)", () => {
    const s0 = table();
    const withSeason = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [createPermanent({ id: "DS", card: { ...DOUBLING_SEASON, id: "c-ds" }, controller: "user", summoningSick: false })] } } };
    const play = legalActionsForPlayer(withSeason, "user").find((a) => a.kind === "play-land" && a.cardId === "saga");
    const s = settle(flushTriggers(dispatchAction(withSeason, play), { chooseTargets: chooseTriggerTargets }));
    const withMana = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, C: 2 } } } };
    expect({ lore: sagaPerm(s).counters?.lore, constructAbility: legalActionsForPlayer(withMana, "user").some((a) => a.kind === "activate-ability" && a.permanentId === sagaPerm(s).id) })
      .toEqual({ lore: 2, constructAbility: true });
  });

  it("chapter III: only the printed {0} / {1} artifacts are offered (WITNESS), the pick enters, and the Saga is sacrificed", () => {
    const s3 = nextDrawStep(nextDrawStep(played()));
    if (s3.pendingChoice?.kind !== "tutor-search") throw new Error("chapter III did not open a search");
    const offered = s3.pendingChoice.candidates.map((c) => c.id).sort();
    const s4 = finalizeStackResolution(settle(resolveTutorChoice(s3, "sol")));
    const witness = { offered, solOnBattlefield: s4.players.user.battlefield.some((p) => p.card?.name === "Sol Ring"), sagaGone: !sagaPerm(s4), sagaInGraveyard: s4.players.user.graveyard.some((c) => c.name === "Urza's Saga") };
    console.log(`WITNESS urzasSaga ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ offered: ["sol", "thopter"], solOnBattlefield: true, sagaGone: true, sagaInGraveyard: true });
  });
});
