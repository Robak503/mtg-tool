/**
 * realityChip.test.js — The Reality Chip (shelf decks D34, 2026-09-30: Kellan of the West 85 → 86).
 *
 *   "You may look at the top card of your library any time.
 *    As long as The Reality Chip is attached to a creature, you may play lands and cast spells from the top of your library.
 *    Reconfigure {2}{U}"
 *
 * The permission is Future Sight's { playFromTop } marker carrying attachedGated: playFromTopPermission re-reads the Chip's
 * attachedTo at every offer, so the Chip grants nothing while it is a creature on its own. An Equipment on a non-creature is
 * unattached by the state-based action (CR 704.5n), so attached means attached to a creature whenever the player can act.
 * The Equipment residue loop also asks the static grammar about a clause in its self-normalized form ("this creature"),
 * which is how parseStaticAbilities hands the same line over at runtime.
 *
 * Found on the way: the reconfigure attach offered the Chip as its own target. An Equipment can't equip itself (CR 301.5c)
 * and reconfigure attaches to ANOTHER creature (CR 702.151a); the self-attach paid {2}{U} and the state-based action
 * unattached it at once.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { checkAllStateBasedActions } from "./sba.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CHIP = { name: "The Reality Chip", type: "Legendary Artifact Creature — Equipment Jellyfish", mana: "{1}{U}", power: "0", toughness: "4", keywords: ["Reconfigure"],
  oracle: "You may look at the top card of your library any time.\nAs long as The Reality Chip is attached to a creature, you may play lands and cast spells from the top of your library.\nReconfigure {2}{U} ({2}{U}: Attach to target creature you control; or unattach from a creature. Reconfigure only as a sorcery. While attached, this isn't a creature.)" };
const FUTURE_SIGHT = { name: "Future Sight", type: "Enchantment", mana: "{2}{U}{U}{U}", keywords: [], oracle: "Play with the top card of your library revealed.\nYou may play lands and cast spells from the top of your library." };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", keywords: [], oracle: "Draw two cards." };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", keywords: [], oracle: "({T}: Add {U}.)" };
const FILLER = { name: "Wastes", type: "Basic Land", mana: "", keywords: [], oracle: "({T}: Add {C}.)" };

function table() {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  // Divination on top draws the two Wastes under it, which leaves the Island on top for the land half.
  const library = [{ ...DIVINATION, id: "div" }, { ...FILLER, id: "w0" }, { ...FILLER, id: "w1" }, { ...ISLAND, id: "isl" }, { ...FILLER, id: "w2" }, { ...FILLER, id: "w3" }];
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, library, landsPlayedThisTurn: 0, manaPool: { ...g.players.user.manaPool, U: 6 },
      battlefield: [createPermanent({ id: "CHIP", card: { ...CHIP, id: "c-chip" }, controller: "user", summoningSick: false }), createPermanent({ id: "BEAR", card: { ...BEAR, id: "c-bear" }, controller: "user", summoningSick: false })] } } };
}
/** Resolve the stack, putting any triggers that fire onto it — and fail loudly if a resolver crashed (logged, not thrown). */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const acts = (s) => legalActionsForPlayer(s, "user");
const fromLibrary = (s) => acts(s).filter((a) => a.fromZone === "library").map((a) => `${a.kind}:${a.cardId}`);
const reconfigureTargets = (s) => acts(s).filter((a) => a.kind === "activate-ability" && a.permanentId === "CHIP" && a.isEquipAbility).map((a) => a.targets[0].id);
const chip = (s) => s.players.user.battlefield.find((p) => p.id === "CHIP");
const attach = (s) => settle(dispatchAction(s, acts(s).find((a) => a.kind === "activate-ability" && a.permanentId === "CHIP" && a.targets?.[0]?.id === "BEAR")));

describe("the card", () => {
  it("reads native-equipment; its permission is attach-gated, and Future Sight's bare one is not", () => {
    expect({
      tier: classifyCard(CHIP),
      chip: parseStaticAbilities(CHIP),
      futureSight: parseStaticAbilities(FUTURE_SIGHT).filter((d) => d.playFromTop),
    }).toEqual({
      tier: "native-equipment",
      chip: [{ inertInfo: true }, { playFromTop: { lands: true, spellFilter: "any", attachedGated: true } }],
      futureSight: [{ playFromTop: { lands: true, spellFilter: "any" } }],
    });
  });

  it("fence (synthetic): the attach-gated CREATURE-spells form is not this arm and parks", () => {
    expect(parseStaticAbilities({ name: "X", type: "Artifact — Equipment", oracle: "As long as this Equipment is attached to a creature, you may cast creature spells from the top of your library." }))
      .toEqual([]);
  });
});

describe("in play", () => {
  it("unattached, the Chip grants nothing — and it is never offered as its own reconfigure target", () => {
    const s = table();
    expect({ fromLibrary: fromLibrary(s), reconfigureTargets: reconfigureTargets(s), creature: permanentIsCreature(s, "CHIP") })
      .toEqual({ fromLibrary: [], reconfigureTargets: ["BEAR"], creature: true });
  });

  it("reconfigured onto the Bear: the top card casts from the library, then the land under it plays from there", () => {
    let s = attach(table());
    const attached = { attachedTo: chip(s).attachedTo, creature: permanentIsCreature(s, "CHIP"), offers: fromLibrary(s) };
    s = settle(dispatchAction(s, acts(s).find((a) => a.kind === "cast-spell" && a.cardId === "div")));
    const afterCast = { hand: s.players.user.hand.map((c) => c.id), graveyard: s.players.user.graveyard.map((c) => c.id), offers: fromLibrary(s) };
    s = dispatchAction(s, acts(s).find((a) => a.kind === "play-land" && a.cardId === "isl"));
    const witness = { attached, afterCast, islandOnBattlefield: s.players.user.battlefield.some((p) => p.card?.id === "isl" || p.id === "isl"), libraryTop: s.players.user.library[0]?.id };
    console.log(`WITNESS realityChip ${JSON.stringify(witness)}`);
    expect(witness).toEqual({
      attached: { attachedTo: "BEAR", creature: false, offers: ["cast-spell:div"] },
      afterCast: { hand: ["w0", "w1"], graveyard: ["div"], offers: ["play-land:isl"] },
      islandOnBattlefield: true,
      libraryTop: "w2",
    });
  });

  it("when the Bear leaves, the state-based action unattaches the Chip and the permission goes with it", () => {
    let s = attach(table());
    expect(fromLibrary(s)).toEqual(["cast-spell:div"]);
    s = checkAllStateBasedActions(moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "BEAR" }));
    expect({ attachedTo: chip(s).attachedTo ?? null, creature: permanentIsCreature(s, "CHIP"), fromLibrary: fromLibrary(s) }).toEqual({ attachedTo: null, creature: true, fromLibrary: [] });
  });
});
