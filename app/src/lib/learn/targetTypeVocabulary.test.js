/**
 * targetTypeVocabulary.test.js — the closed targetType vocabulary (targetTypes.js) and the programConfidence gate that holds
 * every program to it (effects/programQueries.atomTargetSlotsKnown).
 *
 * THE TRAP IT CLOSES. A trigger payoff can carry a REFERENT targetType: a recipient synthesized from the trigger's context
 * (defendingPlayer, damagedPlayer, discardingPlayer, attackedDefender), never a chosen target. One missing from
 * NON_CHOSEN_TARGET_TYPES read as a chosen target the enumerator had no pool for, so the classifier credited the card native
 * while the trigger flush found no candidates, logged trigger-removed-no-target and dealt nothing. It shipped or nearly
 * shipped three times (eachOpponentCreature, discardingPlayer, attackedDefender), and the classification tests stayed green
 * every time. Now a target slot must name a type in one of the two sets, or programConfidence reads the program LOW, and the
 * classifier and the flush (and the cast and activation offers, and the resolver) all ask programConfidence.
 *
 * Pinned here:
 *  1. the CHOSEN set is the enumerator's: every entry is offered a target through the function the flush enumerates with
 *     (effects/targeting.expandCastChoices) on a full board, while an unregistered type gets nothing on the same board;
 *  2. the gate: a slot naming an unregistered type reads LOW — an atom's own targetType, a two-target atom's
 *     secondaryTargetType, one mode of a modal spell, an optional payment's payoff — and the real program it was cut from
 *     reads HIGH;
 *  3. the live referent families are registered, read off real cards.
 * referentRegistrationTrap.test.js drives the trap itself on a board, with a referent taken out of the registry.
 *
 * Real oracle fixtures (bundled Scryfall, copied 2026-10-16).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { CHOSEN_TARGET_TYPES, NON_CHOSEN_TARGET_TYPES, isKnownTargetType, isNonChosenTargetType } from "./targetTypes.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause, parseEffectProgram, programConfidence } from "./effects/parser.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const HELLRIDER = { name: "Hellrider", type: "Creature — Devil", mana: "{2}{R}{R}", power: "3", toughness: "3", keywords: ["Haste"],
  oracle: "Haste\nWhenever a creature you control attacks, this creature deals 1 damage to the player or planeswalker it's attacking." };
const PERFORATOR = { name: "Falkenrath Perforator", type: "Creature — Vampire", mana: "{1}{R}", power: "2", toughness: "1", keywords: [],
  oracle: "Whenever this creature attacks, it deals 1 damage to defending player." };
const MEGRIM = { name: "Megrim", type: "Enchantment", mana: "{2}{B}", keywords: [],
  oracle: "Whenever an opponent discards a card, this enchantment deals 2 damage to that player." };
const SWORD = { name: "Sword of War and Peace", type: "Artifact — Equipment", mana: "{3}", keywords: ["Equip"],
  oracle: "Equipped creature gets +2/+2 and has protection from red and from white.\nWhenever equipped creature deals combat damage to a player, this Equipment deals damage to that player equal to the number of cards in their hand and you gain 1 life for each card in your hand.\nEquip {2}" };
const KOLAGHANS_COMMAND = { name: "Kolaghan's Command", type: "Instant", mana: "{1}{B}{R}", keywords: [],
  oracle: "Choose two —\n• Return target creature card from your graveyard to your hand.\n• Target player discards a card.\n• Destroy target artifact.\n• Kolaghan's Command deals 2 damage to any target." };
const PREY_UPON = { name: "Prey Upon", type: "Sorcery", mana: "{G}", keywords: ["Fight"],
  oracle: "Target creature you control fights target creature you don't control. (Each deals damage equal to its power to the other.)" };
const VEINWITCH_COVEN = { name: "Veinwitch Coven", type: "Creature — Vampire Warlock", mana: "{2}{B}", power: "3", toughness: "3", keywords: ["Menace"],
  oracle: "Menace\nWhenever you gain life, you may pay {B}. If you do, return target creature card from your graveyard to your hand." };

// The board furniture: one object per pool family the enumerator has (type lines from the index).
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
const BONESPLITTER = { name: "Bonesplitter", type: "Artifact — Equipment", mana: "{1}", oracle: "Equipped creature gets +2/+0.\nEquip {1}" };
const COPTER = { name: "Smuggler's Copter", type: "Artifact — Vehicle", mana: "{2}", power: "3", toughness: "3",
  oracle: "Flying\nWhenever this Vehicle attacks or blocks, you may draw a card. If you do, discard a card.\nCrew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const ANTHEM = { name: "Glorious Anthem", type: "Enchantment", mana: "{1}{W}{W}", oracle: "Creatures you control get +1/+1." };
const TOWER = { name: "Command Tower", type: "Land", mana: "", oracle: "{T}: Add one mana of any color in your commander's color identity." };
const basic = (name, sym) => ({ name, type: `Basic Land — ${name}`, mana: "", oracle: `({T}: Add {${sym}}.)` });
const JACE = { name: "Jace Beleren", type: "Legendary Planeswalker — Jace", mana: "{1}{U}{U}", loyalty: "3",
  oracle: "+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards." };

function fullBoard() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
  const mine = [
    perm("u-bear", BEARS, "user"), perm("u-bone", BONESPLITTER, "user"), perm("u-copter", COPTER, "user"), perm("u-anthem", ANTHEM, "user"),
    perm("u-tower", TOWER, "user"), perm("u-forest", basic("Forest", "G"), "user"), perm("u-island", basic("Island", "U"), "user"),
    perm("u-swamp", basic("Swamp", "B"), "user"), perm("u-mountain", basic("Mountain", "R"), "user"), perm("u-plains", basic("Plains", "W"), "user"),
  ];
  const theirs = [perm("a-bear", BEARS, "ai"), { ...perm("a-jace", JACE, "ai"), counters: { loyalty: 3 } }];
  return {
    ...s, activePlayer: "user", priorityHolder: "user",
    stack: [
      createStackObject({ id: "stk-spell", kind: "spell", source: { ...PREY_UPON, id: "c-spell" }, controller: "ai" }),
      createStackObject({ id: "stk-trig", kind: "triggered-ability", source: { ...HELLRIDER, id: "c-trig" }, controller: "user" }),
    ],
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine, graveyard: [{ ...BEARS, id: "g-bear" }] },
      ai: { ...s.players.ai, battlefield: theirs },
    },
  };
}
const oneAtom = (targetType) => ({ structure: "sequence", atoms: [{ op: "deal-damage", amount: 1, targetType }] });

describe("the vocabulary", () => {
  it("partitions: no target type is both non-chosen and chosen, and nothing outside the two is known", () => {
    expect([...CHOSEN_TARGET_TYPES].filter((tt) => NON_CHOSEN_TARGET_TYPES.has(tt))).toEqual([]);
    expect([isKnownTargetType("attackedDefender"), isKnownTargetType("any"), isKnownTargetType("unregisteredTargetType"), isKnownTargetType(null)])
      .toEqual([true, true, false, false]);
  });

  it("⭐ every CHOSEN type is a pool: the flush's enumeration offers each one a target on a full board", () => {
    const board = fullBoard();
    const offered = Object.fromEntries([...CHOSEN_TARGET_TYPES].map((tt) => [tt, expandCastChoices(board, "user", oneAtom(tt))]));
    const noPool = Object.entries(offered)
      .filter(([, choices]) => !(choices.length > 0 && choices.every((c) => c.targets.length === 1 && c.targets[0].atomIndex === 0)))
      .map(([tt]) => tt);
    expect(noPool).toEqual([]);
    console.log(`WITNESS pools ${JSON.stringify(Object.fromEntries(Object.entries(offered).map(([tt, c]) => [tt, c.length])))}`);
  });

  it("VACUITY CONTROL — the same board offers an unregistered type nothing (the hole the gate closes)", () => {
    expect(expandCastChoices(fullBoard(), "user", oneAtom("unregisteredTargetType"))).toEqual([]);
  });

  it("every NON-CHOSEN type is one cast with no chosen target", () => {
    const board = fullBoard();
    const odd = [...NON_CHOSEN_TARGET_TYPES].filter((tt) => JSON.stringify(expandCastChoices(board, "user", oneAtom(tt))) !== JSON.stringify([{ targets: [] }]));
    expect(odd).toEqual([]);
  });
});

describe("programConfidence reads a target slot outside the vocabulary as LOW", () => {
  const unregistered = (atom, field) => ({ ...atom, [field]: "unregisteredTargetType" });

  it("an atom's own targetType — Hellrider's damage with its referent swapped for an unregistered one", () => {
    const p = parseEffectClause("this creature deals 1 damage to the player or planeswalker it's attacking");
    expect(programConfidence(p)).toBe("high");
    expect(programConfidence({ ...p, atoms: [unregistered(p.atoms[0], "targetType")] })).toBe("low");
  });

  it("a two-target atom's secondaryTargetType (Prey Upon's fighter)", () => {
    const p = parseEffectProgram(PREY_UPON);
    expect(programConfidence(p)).toBe("high");
    expect(programConfidence({ ...p, atoms: [unregistered(p.atoms[0], "secondaryTargetType")] })).toBe("low");
  });

  it("one mode of a modal spell (Kolaghan's Command's damage mode)", () => {
    const p = parseEffectProgram(KOLAGHANS_COMMAND);
    expect(programConfidence(p)).toBe("high");
    const modes = p.modal.modes.map((m, i) => (i === 3 ? { ...m, atoms: [unregistered(m.atoms[0], "targetType")] } : m));
    expect(programConfidence({ ...p, modal: { ...p.modal, modes } })).toBe("low");
  });

  it("an optional payment's payoff — the slot the enumerator reads through targetingAtomOf (Veinwitch Coven)", () => {
    const p = parseEffectClause(detectTriggers(VEINWITCH_COVEN)[0].effectClause, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    const wrapper = p.atoms[0];
    expect(programConfidence({ ...p, atoms: [unregistered(wrapper, "targetType")] })).toBe("low");
    const payoff = unregistered(wrapper.effectAtoms[0], "secondaryTargetType");
    expect(programConfidence({ ...p, atoms: [{ ...wrapper, effectAtoms: [payoff] }] })).toBe("low");
  });
});

describe("the live referent families are registered", () => {
  it("⭐ each referent payoff is non-chosen, reads HIGH, routes natively, and its card is native", () => {
    const status = (tt) => (isNonChosenTargetType(tt) ? "non-chosen" : isKnownTargetType(tt) ? "chosen" : "UNREGISTERED");
    const rows = [HELLRIDER, PERFORATOR, MEGRIM, SWORD].map((card) => {
      const [d] = detectTriggers(card);
      const p = parseEffectClause(d.effectClause, "Instant", { sourceScoped: true });
      return {
        card: card.name,
        targetTypes: (p.atoms || []).map((a) => a.targetType).filter(Boolean).map((tt) => `${tt}: ${status(tt)}`),
        confidence: programConfidence(p),
        routes: triggerRoutesNatively(d),
        tier: classifyCard(card),
      };
    });
    expect(rows).toEqual([
      { card: "Hellrider", targetTypes: ["attackedDefender: non-chosen"], confidence: "high", routes: true, tier: "native-trigger" },
      { card: "Falkenrath Perforator", targetTypes: ["defendingPlayer: non-chosen"], confidence: "high", routes: true, tier: "native-trigger" },
      { card: "Megrim", targetTypes: ["discardingPlayer: non-chosen"], confidence: "high", routes: true, tier: "native-trigger" },
      { card: "Sword of War and Peace", targetTypes: ["damagedPlayer: non-chosen"], confidence: "high", routes: true, tier: "native-equipment" },
    ]);
  });
});
