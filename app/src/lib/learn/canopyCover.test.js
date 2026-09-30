/**
 * canopyCover.test.js — "Enchanted creature can't be the target of spells or abilities your opponents control." (Canopy Cover,
 * Shielding Plax — census rank 55 of the 09-06 plan's stage ③, 2026-09-30).
 *
 * Hexproof's targeting rule in all but name (CR 702.11b) — and NOT the keyword, so nothing that reads or pierces hexproof
 * touches it. It rides the ④-V inert `targetShield` op (Thrun's printed shield, thrunTargetShield.test.js) with no colour
 * exception, fixed to the host by the attached-bonus path, and is read at the single targetability seam
 * (spellEffects.canBeTargetedBy) where hexproof is read. "Your opponents" are the AURA controller's (CR 109.5), which matters
 * when it enchants another player's creature, so the shield carries its source's controller; a granted shield never shields
 * its source — the Aura itself stays targetable.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Targets come from legalActionsForPlayer's cast and activate offers.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { permanentTargetShields } from "./layers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CANOPY = { name: "Canopy Cover", type: "Enchantment — Aura", mana: "{1}{G}", keywords: ["Enchant"], colors: ["G"],
  oracle: "Enchant creature\nEnchanted creature can't be blocked except by creatures with flying or reach.\nEnchanted creature can't be the target of spells or abilities your opponents control." };
const PLAX = { name: "Shielding Plax", type: "Enchantment — Aura", mana: "{2}{G/U}", keywords: ["Enchant"], colors: ["G", "U"],
  oracle: "({G/U} can be paid with either {G} or {U}.)\nEnchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature can't be the target of spells or abilities your opponents control." };
const MURDER = { id: "h-murder", name: "Murder", type: "Instant", mana: "{1}{B}{B}", mana_cost: "{1}{B}{B}", cmc: 3, keywords: [], colors: ["B"], oracle: "Destroy target creature." };
const DISENCHANT = { id: "h-dis", name: "Disenchant", type: "Instant", mana: "{1}{W}", mana_cost: "{1}{W}", cmc: 2, keywords: [], colors: ["W"], oracle: "Destroy target artifact or enchantment." };
const GROWTH = { id: "h-gg", name: "Giant Growth", type: "Instant", mana: "{G}", mana_cost: "{G}", cmc: 1, keywords: [], colors: ["G"], oracle: "Target creature gets +3/+3 until end of turn." };
const SORCERER = { name: "Prodigal Sorcerer", type: "Creature — Human Wizard Sorcerer", mana: "{2}{U}", power: "1", toughness: "1", keywords: [], colors: ["U"],
  oracle: "{T}: This creature deals 1 damage to any target." };
const bear = (n) => ({ name: `Bear ${n}`, type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" });

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
const POOL = { W: 3, U: 3, B: 3, R: 3, G: 3, C: 3 };
// The user's two Bears (the first wears the Aura unless `aura` is null) vs the AI's Prodigal Sorcerer; `who` holds priority.
function board({ aura = CANOPY, auraOn = "b1", auraController = "user", aiHand = [], userHand = [], who = "ai", aiExtra = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const cover = aura ? perm("cover", aura, auraController) : null;
  let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: who, priorityHolder: who, consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand: userHand, manaPool: { ...POOL },
        battlefield: [perm("b1", bear(1), "user"), perm("b2", bear(2), "user"), ...(cover && auraController === "user" ? [cover] : [])] },
      ai: { ...s0.players.ai, hand: aiHand, manaPool: { ...POOL },
        battlefield: [perm("ps", SORCERER, "ai"), ...aiExtra, ...(cover && auraController === "ai" ? [cover] : [])] } } };
  if (cover) s = attachPermanent(s, { equipId: "cover", targetId: auraOn });
  return s;
}
const castTargets = (s, who, cardId) => legalActionsForPlayer(s, who).filter((a) => a.kind === "cast-spell" && a.cardId === cardId).map((a) => a.targets?.[0]?.id).sort();
const pingTargets = (s) => legalActionsForPlayer(s, "ai").filter((a) => a.kind === "activate-ability" && a.permanentId === "ps").map((a) => a.targets?.[0]?.id).sort();

describe("the parse + the tiers", () => {
  it("⭐ Canopy Cover and Shielding Plax classify native; the line is a colourless, opponents-only target shield on the host", () => {
    expect(classifyCard(CANOPY)).toMatch(/^native-/);
    expect(classifyCard(PLAX)).toMatch(/^native-/);
    expect(parseAttachedBonus(CANOPY)).toContainEqual(expect.objectContaining({ layer: 6, op: { layerOp: "targetShield", notColor: null, opponentsOnly: true } }));
  });

  it("⛔ a narrower or wider print is a different card and stays out (vacuity controls)", () => {
    const line = "Enchanted creature can't be the target of spells or abilities your opponents control.";
    expect(classifyCard({ ...CANOPY, oracle: CANOPY.oracle.replace(line, "Enchanted creature can't be the target of spells your opponents control.") })).not.toMatch(/^native-/);
    expect(classifyCard({ ...CANOPY, oracle: CANOPY.oracle.replace(line, "Enchanted creature can't be the target of spells.") })).not.toMatch(/^native-/);
  });

  it("the shield reads off the HOST with its source's controller — never off the Aura itself, and only while attached", () => {
    const s = board();
    expect(permanentTargetShields(s, "b1")).toEqual([{ notColor: null, opponentsOnly: true, sourceController: "user" }]);
    expect(permanentTargetShields(s, "b2")).toEqual([]);
    expect(permanentTargetShields(s, "cover")).toEqual([]);
    const loose = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === "cover" ? { ...p, attachedTo: null } : p)) } } };
    expect(permanentTargetShields(loose, "b1")).toEqual([]);
  });
});

describe("the seam — who may target the enchanted creature", () => {
  it("VACUITY CONTROL — with no Aura, the opponent's Murder and Prodigal Sorcerer reach both Bears", () => {
    const s = board({ aura: null, aiHand: [MURDER] });
    expect(castTargets(s, "ai", "h-murder")).toEqual(["b1", "b2", "ps"]);
    expect(pingTargets(s)).toEqual(expect.arrayContaining(["b1", "b2"]));
  });

  it("⭐ under Canopy Cover the opponent's spell and ability both miss the Bear — the other Bear and the Aura itself stay targetable", () => {
    const s = board({ aiHand: [MURDER, DISENCHANT] });
    const result = { murder: castTargets(s, "ai", "h-murder"), ping: pingTargets(s).filter((id) => id === "b1" || id === "b2"), disenchant: castTargets(s, "ai", "h-dis") };
    expect(result).toEqual({ murder: ["b2", "ps"], ping: ["b2"], disenchant: ["cover"] });
    console.log(`WITNESS canopyCoverSeam ${JSON.stringify(result)}`);
  });

  it("⭐ its controller may still target it: the user's Giant Growth reaches the enchanted Bear", () => {
    expect(castTargets(board({ userHand: [GROWTH], who: "user" }), "user", "h-gg")).toEqual(expect.arrayContaining(["b1", "b2"]));
  });

  it("⭐ 'your opponents' are the AURA controller's: the user's Canopy Cover on the AI's Ogre stops the AI targeting its own creature; the user still can", () => {
    const ogre = perm("ogre", { name: "Gray Ogre", type: "Creature — Ogre", mana: "{2}{R}", power: "2", toughness: "2", keywords: [], colors: ["R"], oracle: "" }, "ai");
    const aiTurn = board({ auraOn: "ogre", aiExtra: [ogre], aiHand: [GROWTH] });
    const userTurn = board({ auraOn: "ogre", aiExtra: [ogre], userHand: [MURDER], who: "user" });
    const result = { aiGrowth: castTargets(aiTurn, "ai", "h-gg").includes("ogre"), userMurder: castTargets(userTurn, "user", "h-murder").includes("ogre") };
    expect(result).toEqual({ aiGrowth: false, userMurder: true });
    console.log(`WITNESS canopyCoverOtherSide ${JSON.stringify(result)}`);
  });

  it("Shielding Plax shields the same way", () => {
    expect(castTargets(board({ aura: PLAX, aiHand: [MURDER] }), "ai", "h-murder")).toEqual(["b2", "ps"]);
  });
});

describe("Canopy Cover's other line, now that the card is native — the block gate", () => {
  it("⭐ only a flier or a reach creature may block the enchanted Bear; the unenchanted Bear is blockable by anything", () => {
    const blockers = [
      perm("ground", { name: "Runeclaw Bear", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" }, "ai"),
      perm("drake", { name: "Wind Drake", type: "Creature — Drake", mana: "{2}{U}", power: "2", toughness: "2", keywords: ["Flying"], colors: ["U"], oracle: "Flying" }, "ai"),
      perm("spider", { name: "Giant Spider", type: "Creature — Spider", mana: "{3}{G}", power: "2", toughness: "4", keywords: ["Reach"], colors: ["G"], oracle: "Reach (This creature can block creatures with flying.)" }, "ai"),
    ];
    const s0 = board({ who: "user", aiExtra: blockers });
    const s = { ...s0, phase: "combat", step: "declare-blockers", priorityHolder: "ai",
      combat: { attackers: ["b1", "b2"].map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } };
    const gate = (atk) => Object.fromEntries(["ground", "drake", "spider"].map((b) => [b, canBlockAttacker(s, b, atk, "ai")]));
    const result = { covered: gate("b1"), bare: gate("b2") };
    expect(result).toEqual({ covered: { ground: false, drake: true, spider: true }, bare: { ground: true, drake: true, spider: true } });
    console.log(`WITNESS canopyCoverBlocks ${JSON.stringify(result)}`);
  });
});
