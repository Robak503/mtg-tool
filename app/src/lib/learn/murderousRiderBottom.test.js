/**
 * murderousRiderBottom.test.js — "When this creature dies, put it on the bottom of its owner's library." (Murderous Rider // Swift
 * End, Fell Horseman // Deathly Ride — the 09-06 plan's stage ③, census row ㉔, 2026-09-30).
 *
 * The self-tuck the dies-trigger form of "shuffle it into its owner's library" already resolves (Angel of Fury, Worldspine
 * Wurm): the card is found in its owner's graveyard and moved to the library — here with `toBottom`, so it is appended (index 0
 * is the top) and nothing is shuffled. detectTriggers names the SELF dies trigger's "it" ("this creature"), and the arm takes
 * only that: a bare "it" in any other trigger is another object — The Cauldron of Eternity's and Zask's dying creature,
 * Neera's spell — and stays unparsed (a safe false negative).
 *
 * Real oracle fixtures (bundled Scryfall, index shape, probed 2026-09-30); the Rider is cast from hand and dies to lethal damage.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures, moveCardToZone } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkDiesTriggers, detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const RIDER = { id: "mur1", name: "Murderous Rider // Swift End", type: "Creature — Zombie Knight // Instant — Adventure", mana: "{1}{B}{B} // {1}{B}{B}", power: "2", toughness: "3",
  oracle: "Murderous Rider - Creature — Zombie Knight {1}{B}{B}\nLifelink\nWhen this creature dies, put it on the bottom of its owner's library.\n//\nSwift End - Instant — Adventure {1}{B}{B}\nDestroy target creature or planeswalker. You lose 2 life. (Then exile this card. You may cast the creature later from exile.)" };
const HORSEMAN = { id: "fell1", name: "Fell Horseman // Deathly Ride", type: "Creature — Zombie Knight // Sorcery — Adventure", mana: "{3}{B} // {1}{B}", power: "3", toughness: "3",
  oracle: "Fell Horseman - Creature — Zombie Knight {3}{B}\nWhen this creature dies, put it on the bottom of its owner's library.\n//\nDeathly Ride - Sorcery — Adventure {1}{B}\nReturn target creature card from your graveyard to your hand. (Then exile this card. You may cast the creature later from exile.)" };
const CAULDRON = { name: "The Cauldron of Eternity", type: "Legendary Artifact", mana: "{10}{B}{B}",
  oracle: "This spell costs {2} less to cast for each creature card in your graveyard.\nWhenever a creature you control dies, put it on the bottom of its owner's library.\n{2}{B}, {T}, Pay 2 life: Return target creature card from your graveyard to the battlefield. Activate only as a sorcery." };
const BEARS = { id: "c-bears", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };

const swamp = (id) => createPermanent({ id, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false });
const library = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib${i}`, name: `Library Card ${i}`, type: "Sorcery", oracle: "" }));
function game({ hand = [], battlefield = [], lib = library(6) } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, library: lib, graveyard: [] } } };
}
const settle = (s0) => { let s = flushTriggers(s0, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 6 && (s.stack || []).length; i++) s = flushTriggers(resolveTopOfStack(s), { chooseTargets: chooseTriggerTargets }); return s; };
// Cast the creature half from hand for real (three Swamps), then mark lethal damage and run the death path.
function castThenKill(card, cost = 3) {
  let s = game({ hand: [card], battlefield: Array.from({ length: cost }, (_, i) => swamp(`sw${i}`)) });
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === card.id && !a.adventure);
  expect(cast).toBeDefined();
  s = resolveTopOfStack(dispatchAction(s, cast));
  const perm = s.players.user.battlefield.find((p) => p.card.id === card.id);
  expect(perm).toBeDefined();
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === perm.id ? { ...p, damageMarked: 99 } : p)) } } };
  const lethal = destroyLethalCreatures(s);
  return checkDiesTriggers(lethal.state, lethal.dead);
}
const names = (zone) => (zone || []).map((c) => c.name);

describe("parse + classification", () => {
  it("Murderous Rider and Fell Horseman flip native; the self dies trigger's \"it\" is named for the self-tuck", () => {
    expect(classifyCard(RIDER)).toMatch(/^native-/);
    expect(classifyCard(HORSEMAN)).toMatch(/^native-/);
    const dies = detectTriggers(RIDER).find((d) => d.event === "dies");
    expect(dies.effectClause).toBe("put this creature on the bottom of its owner's library");
    expect(parseEffectClause(dies.effectClause).atoms).toEqual([{ op: "shuffle-self-into-library", toBottom: true, targetType: null }]);
  });

  it("⛔ a bare \"it\" is never the source: The Cauldron of Eternity's dying creature keeps it, and the bare clause parses to nothing", () => {
    const watcher = detectTriggers(CAULDRON).find((d) => d.event === "dies");
    expect(watcher.effectClause).toBe("put it on the bottom of its owner's library");
    expect(parseEffectClause("put it on the bottom of its owner's library").atoms || []).not.toContainEqual(expect.objectContaining({ op: "shuffle-self-into-library" }));
  });
});

describe("RUNTIME — the dead card goes to the BOTTOM of its owner's library, unshuffled", () => {
  it("VACUITY CONTROL — Grizzly Bears dies and stays in the graveyard", () => {
    const s0 = game({ battlefield: [{ ...createPermanent({ id: "b", card: BEARS, controller: "user", summoningSick: false }), damageMarked: 2 }] });
    const lethal = destroyLethalCreatures(s0);
    const s = settle(checkDiesTriggers(lethal.state, lethal.dead));
    expect(names(s.players.user.graveyard)).toEqual(["Grizzly Bears"]);
    expect(s.players.user.library).toHaveLength(6);
  });

  it("⭐ Murderous Rider, cast from hand, dies: it goes under the six library cards, in the same order", () => {
    const s = settle(castThenKill(RIDER));
    const out = { graveyard: names(s.players.user.graveyard), library: names(s.players.user.library) };
    expect(out).toEqual({ graveyard: [], library: [...names(library(6)), "Murderous Rider // Swift End"] }); // off the battlefield it is the whole adventure card again
    console.log(`WITNESS riderToBottom ${JSON.stringify({ graveyard: out.graveyard.length, bottom: out.library[out.library.length - 1], above: out.library.length - 1 })}`);
  });

  it("⭐ Fell Horseman does the same", () => {
    const s = settle(castThenKill(HORSEMAN, 4));
    expect(names(s.players.user.library)).toEqual([...names(library(6)), "Fell Horseman // Deathly Ride"]);
  });

  it("the card gone from the graveyard before the trigger resolves: nothing is moved (CR 608.2b)", () => {
    let s = flushTriggers(castThenKill(RIDER), { chooseTargets: chooseTriggerTargets });
    const card = s.players.user.graveyard.find((c) => c.id === "mur1");
    expect(card).toBeDefined();
    s = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId: "mur1" });
    for (let i = 0; i < 6 && (s.stack || []).length; i++) s = resolveTopOfStack(s);
    expect(names(s.players.user.library)).toEqual(names(library(6)));
    expect(names(s.players.user.exile)).toContain("Murderous Rider // Swift End");
  });
});
