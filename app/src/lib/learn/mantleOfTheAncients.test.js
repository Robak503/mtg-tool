/**
 * mantleOfTheAncients.test.js — Mantle of the Ancients (shelf decks D41, 2026-10-01: Light-Paws Voltron).
 *
 *   "Enchant creature you control / When this Aura enters, return any number of target Aura and/or Equipment cards from your
 *    graveyard to the battlefield attached to enchanted creature. / Enchanted creature gets +1/+1 for each Aura and Equipment
 *    attached to it."
 *
 * The ETB is a targeted pick of any number (the subset machinery, largest first) of Aura and Equipment cards in your own
 * graveyard; each enters attached to the Mantle's host. An Aura its own Enchant line can't put on that host stays in the
 * graveyard (CR 303.4i). Stasis Cocoon ("Enchant artifact") pins that read: the state-based sweep would not remove it from a
 * Bear afterwards, so only the check at entry keeps it off. Nothing enters onto a host with protection from one of its
 * colours (CR 702.16c/d).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30 and 2026-10-01), except the synthetic clause that pins the fence.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { permanentHasKeyword, permanentPower, permanentProtectionColors, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MANTLE = { name: "Mantle of the Ancients", type: "Enchantment — Aura", mana: "{3}{W}{W}", keywords: ["Enchant"],
  oracle: "Enchant creature you control\nWhen this Aura enters, return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature.\nEnchanted creature gets +1/+1 for each Aura and Equipment attached to it." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const CRUSADER = { name: "Mirran Crusader", type: "Creature — Human Knight", mana: "{1}{W}{W}", power: "2", toughness: "2", keywords: ["Protection", "Double strike"],
  oracle: "Double strike, protection from black and from green" };
const RANCOR = { name: "Rancor", type: "Enchantment — Aura", mana: "{G}", keywords: ["Enchant"],
  oracle: "Enchant creature\nEnchanted creature gets +2/+0 and has trample.\nWhen this Aura is put into a graveyard from the battlefield, return it to its owner's hand." };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", keywords: ["Equip"], oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const FLAIL = { name: "Bloodthorn Flail", type: "Artifact — Equipment", mana: "{B}", keywords: ["Equip"], oracle: "Equipped creature gets +2/+1.\nEquip—Pay {3} or discard a card." };
const SWORD = { name: "Sword of Feast and Famine", type: "Artifact — Equipment", mana: "{3}", keywords: ["Equip"],
  oracle: "Equipped creature gets +2/+2 and has protection from black and from green.\nWhenever equipped creature deals combat damage to a player, that player discards a card and you untap all lands you control.\nEquip {2}" };
const STASIS_COCOON = { name: "Stasis Cocoon", type: "Enchantment — Aura", mana: "{1}{W}", keywords: ["Enchant"], oracle: "Enchant artifact\nEnchanted artifact can't attack or block, and its activated abilities can't be activated." };
const WILD_GROWTH = { name: "Wild Growth", type: "Enchantment — Aura", mana: "{G}", keywords: ["Enchant"], oracle: "Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}." };

function table(graveyard, host = BEARS) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [createPermanent({ id: "HOST", card: { ...host, id: "c-host" }, controller: "user", summoningSick: false })],
      hand: [{ ...MANTLE, id: "mantle" }], graveyard: graveyard.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, W: 5 } } } };
}
const failOnCrash = (n) => {
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
};
/** Cast the Mantle on HOST, resolve it, and put its ETB trigger on the stack with its targets chosen — stopping there. */
function mantleTriggerOnStack(s) {
  const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "mantle" && a.targets?.[0]?.id === "HOST");
  if (!cast) throw new Error("the Mantle is not offered on HOST");
  const n = flushTriggers(resolveTopOfStack(dispatchAction(s, cast)), { chooseTargets: chooseTriggerTargets });
  if (n.stack?.length !== 1 || n.pendingTriggers?.length) throw new Error(`expected exactly the ETB on the stack, got ${n.stack?.length} / ${n.pendingTriggers?.length}`);
  return failOnCrash(n);
}
/** Resolve everything still pending; fail loudly on a logged resolver crash. */
function settle(s) {
  let n = s, g = 0;
  while ((n.stack?.length || n.pendingTriggers?.length) && !n.pendingChoice && g++ < 30) n = n.stack?.length ? resolveTopOfStack(n) : flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  return failOnCrash(n);
}
const attachedTo = (s) => s.players.user.battlefield.filter((p) => p.attachedTo === "HOST").map((p) => p.card?.name).sort();
const graveyard = (s) => s.players.user.graveyard.map((c) => c.id).sort();
const size = (s) => [permanentPower(s, "HOST"), permanentToughness(s, "HOST")];

describe("the card", () => {
  it("reads native-aura; the ETB is the any-number Aura/Equipment graveyard pick", () => {
    expect({ tier: classifyCard(MANTLE), atoms: parseEffectClause("return any number of target Aura and/or Equipment cards from your graveyard to the battlefield attached to enchanted creature", "Enchantment").atoms })
      .toEqual({ tier: "native-aura", atoms: [{ op: "return-attached-from-graveyard", targetType: "graveyardCard", cardFilter: { anyOf: [{ subtype: "Aura" }, { subtype: "Equipment" }] }, minTargets: 0, maxTargets: 99, anyNumber: true }] });
  });

  it("fence (synthetic): a different destination parks", () => {
    expect(parseEffectClause("Return any number of target Aura and/or Equipment cards from your graveyard to your hand.", "Enchantment")?.confidence ?? "low").toBe("low");
  });
});

describe("in play", () => {
  it("returns Rancor and Bonesplitter onto the Bear, leaves the Enchant-land and Enchant-artifact Auras and the creature card behind (WITNESS)", () => {
    const s = settle(mantleTriggerOnStack(table([["rancor", RANCOR], ["bones", BONESPLITTER], ["growth", WILD_GROWTH], ["cocoon", STASIS_COCOON], ["bear2", BEARS]])));
    const witness = { attached: attachedTo(s), graveyard: graveyard(s), size: size(s), trample: permanentHasKeyword(s, "HOST", "Trample") };
    console.log(`WITNESS mantleOfTheAncients ${JSON.stringify(witness)}`);
    // 2/2 + Mantle (+3/+3: three attached) + Rancor (+2/+0) + Bonesplitter (+2/+0) = 9/5.
    expect(witness).toEqual({ attached: ["Bonesplitter", "Mantle of the Ancients", "Rancor"], graveyard: ["bear2", "cocoon", "growth"], size: [9, 5], trample: true });
  });

  it("with nothing to return, the Mantle alone counts itself: a 3/3", () => {
    const s = settle(mantleTriggerOnStack(table([["bear2", BEARS]])));
    expect({ attached: attachedTo(s), size: size(s) }).toEqual({ attached: ["Mantle of the Ancients"], size: [3, 3] });
  });

  it("protection keeps the green Aura and the black Equipment off Mirran Crusader (CR 702.16c/d)", () => {
    const s = settle(mantleTriggerOnStack(table([["rancor", RANCOR], ["flail", FLAIL], ["bones", BONESPLITTER]], CRUSADER)));
    // 2/2 + Mantle (+2/+2: two attached) + Bonesplitter (+2/+0) = 6/4.
    expect({ attached: attachedTo(s), graveyard: graveyard(s), size: size(s) }).toEqual({ attached: ["Bonesplitter", "Mantle of the Ancients"], graveyard: ["flail", "rancor"], size: [6, 4] });
  });

  it("Equipment enters first: a returning Sword's protection from green keeps Rancor in the graveyard", () => {
    const s = settle(mantleTriggerOnStack(table([["rancor", RANCOR], ["sword", SWORD]])));
    // 2/2 + Mantle (+2/+2: two attached) + the Sword (+2/+2) = 6/6, with protection from black and from green.
    expect({ attached: attachedTo(s), graveyard: graveyard(s), size: size(s), protection: [...permanentProtectionColors(s, "HOST")].sort() })
      .toEqual({ attached: ["Mantle of the Ancients", "Sword of Feast and Famine"], graveyard: ["rancor"], size: [6, 6], protection: ["B", "G"] });
  });

  it("a target that left the graveyard before resolution is not returned (CR 608.2b)", () => {
    const onStack = mantleTriggerOnStack(table([["rancor", RANCOR], ["bones", BONESPLITTER]]));
    const s = settle(moveCardToZone(onStack, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId: "bones" }));
    expect({ attached: attachedTo(s), exile: s.players.user.exile.map((c) => c.id) }).toEqual({ attached: ["Mantle of the Ancients", "Rancor"], exile: ["bones"] });
  });

  it("with the Mantle gone before its trigger resolves, nothing returns", () => {
    const onStack = mantleTriggerOnStack(table([["rancor", RANCOR], ["bones", BONESPLITTER]]));
    const mantleId = onStack.players.user.battlefield.find((p) => p.card?.name === "Mantle of the Ancients").id;
    const s = settle(moveCardToZone(onStack, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: mantleId }));
    expect({ attached: attachedTo(s), graveyard: graveyard(s) }).toEqual({ attached: [], graveyard: ["bones", "mantle", "rancor"] });
  });
});
