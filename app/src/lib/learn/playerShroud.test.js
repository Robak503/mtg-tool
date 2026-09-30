/**
 * playerShroud.test.js — "You have shroud." (the 09-06 plan's stage ③ · 48, 2026-09-30 — Ivory Mask, True Believer), and the
 * Curse offer that skipped player targetability altogether.
 *
 * CR 702.18 — shroud: "can't be the target of spells or abilities." For a PLAYER it is ABSOLUTE — unlike hexproof (CR 702.11d,
 * opponents only), the player can't target themself either. It rides player hexproof's shape: an inert layer-6 op
 * (`playerShroud`) whose one reader, layers.playerHasShroud, feeds the ONE player-targetability predicate
 * (spellEffects.playerTargetableBy) that target enumeration uses.
 *
 * Found scoping it: the "Enchant player" Aura offer (Fraying Sanity, the Curses — legalChoices) offered EVERY living player,
 * with no targetability check at all, so a Curse could be cast at an opponent behind Leyline of Sanctity or Teferi's
 * Protection. An Aura spell targets (CR 303.4a); the offer now reads the same predicate.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, grantTeferiShield } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const IVORY_MASK = { name: "Ivory Mask", type: "Enchantment", mana: "{2}{W}{W}", cmc: 4, colors: ["W"], keywords: [],
  oracle: "You have shroud. (You can't be the target of spells or abilities.)" };
const TRUE_BELIEVER = { name: "True Believer", type: "Creature — Human Cleric", mana: "{W}{W}", cmc: 2, colors: ["W"], power: "2", toughness: "2", keywords: [],
  oracle: "You have shroud. (You can't be the target of spells or abilities.)" };
const LEYLINE_OF_SANCTITY = { name: "Leyline of Sanctity", type: "Enchantment", mana: "{2}{W}{W}", cmc: 4, colors: ["W"], keywords: [],
  oracle: "If this card is in your opening hand, you may begin the game with it on the battlefield.\nYou have hexproof. (You can't be the target of spells or abilities your opponents control.)" };
const ANCESTRAL_RECALL = { id: "ar", name: "Ancestral Recall", type: "Instant", mana: "{U}", mana_cost: "{U}", cmc: 1, colors: ["U"], keywords: [],
  oracle: "Target player draws three cards." };
const LAVA_SPIKE = { id: "ls", name: "Lava Spike", type: "Sorcery — Arcane", mana: "{R}", mana_cost: "{R}", cmc: 1, colors: ["R"], keywords: [],
  oracle: "Lava Spike deals 3 damage to target player or planeswalker." };
const FRAYING_SANITY = { id: "fs", name: "Fraying Sanity", type: "Enchantment — Aura Curse", mana: "{2}{U}", mana_cost: "{2}{U}", cmc: 3, colors: ["U"], keywords: ["Enchant", "Mill"],
  oracle: "Enchant player\nAt the beginning of each end step, enchanted player mills X cards, where X is the number of cards put into their graveyard from anywhere this turn." };

// Two seats: `user` and `ai`. `userPerms` / `aiPerms` are card fixtures put onto each battlefield.
function board({ userPerms = [], aiPerms = [], userHand = [], aiHand = [], active = "user", pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  const bf = (cards, ctl) => cards.map((c, i) => createPermanent({ id: `${ctl}-${i}`, card: { ...c, id: `c-${ctl}-${i}` }, controller: ctl, summoningSick: false }));
  const mana = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool };
  return { ...g, turn: 4, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, battlefield: bf(userPerms, "user"), hand: userHand, manaPool: active === "user" ? mana : g.players.user.manaPool },
      ai: { ...g.players.ai, battlefield: bf(aiPerms, "ai"), hand: aiHand, manaPool: active === "ai" ? mana : g.players.ai.manaPool } } };
}
// "target player" — the broadest player-target enumeration.
const playerTargets = (s, caster) => enumerateTargets(s, caster, { kind: "discard", targetType: "player" }, []).filter((t) => t.type === "player").map((t) => t.id).sort();
const castTargets = (s, caster, cardId) => legalActionsForPlayer(s, caster).filter((a) => a.kind === "cast-spell" && a.cardId === cardId)
  .flatMap((a) => (a.targets || []).filter((t) => t.type === "player").map((t) => t.id)).sort();

describe("the clause", () => {
  it("⭐ \"You have shroud.\" is one inert player-scoped op, and Ivory Mask and True Believer read native", () => {
    expect(parseStaticAbilities(IVORY_MASK)).toEqual([{ layer: 6, op: { layerOp: "playerShroud" }, affects: { mode: "self" }, duration: { kind: "permanent" } }]);
    expect([IVORY_MASK, TRUE_BELIEVER].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
  });
  it("whole-clause anchored — a conditional grant is not this", () => {
    expect(parseStaticAbilities({ name: "Probe", type: "Enchantment", mana: "{W}", oracle: "You have shroud as long as you control a Cleric." })).toEqual([]);
  });
});

describe("⭐ the real target-enumeration seam", () => {
  it("⭐ SHROUD IS ABSOLUTE — nobody targets the True Believer player, the player included; Leyline's hexproof still lets you target yourself", () => {
    const shroud = board({ userPerms: [TRUE_BELIEVER] });
    const hexproof = board({ userPerms: [LEYLINE_OF_SANCTITY] });
    const row = {
      shroud: { opponentSees: playerTargets(shroud, "ai"), userSees: playerTargets(shroud, "user") },
      hexproof: { opponentSees: playerTargets(hexproof, "ai"), userSees: playerTargets(hexproof, "user") },
    };
    console.log(`WITNESS playerShroud ${JSON.stringify(row)}`);
    expect(row).toEqual({ shroud: { opponentSees: ["ai"], userSees: ["ai"] }, hexproof: { opponentSees: ["ai"], userSees: ["ai", "user"] } });
  });
  it("it lifts when the permanent leaves, and it follows the CONTROLLER (the AI's True Believer shrouds the AI, not you)", () => {
    expect(playerTargets(board({}), "ai")).toEqual(["ai", "user"]);
    expect(playerTargets(board({ aiPerms: [TRUE_BELIEVER] }), "user")).toEqual(["user"]);
  });
  it("⭐ through a real cast offer: Ancestral Recall can't aim at its shrouded caster; Lava Spike can't aim at the shrouded player", () => {
    const recall = castTargets(board({ userPerms: [TRUE_BELIEVER], userHand: [ANCESTRAL_RECALL], pool: { U: 1 } }), "user", "ar");
    const spike = castTargets(board({ userPerms: [IVORY_MASK], aiHand: [LAVA_SPIKE], active: "ai", pool: { R: 1 } }), "ai", "ls");
    expect({ recall, spike }).toEqual({ recall: ["ai"], spike: ["ai"] });
  });
});

describe("⭐ the Curse offer reads the same predicate (it offered every living player before)", () => {
  const curseTargets = (userPerms, shield = false) => {
    let s = board({ userPerms, aiHand: [FRAYING_SANITY], active: "ai", pool: { U: 1, C: 2 } });
    if (shield) s = grantTeferiShield(s, "user");
    return castTargets(s, "ai", "fs");
  };
  it("VACUITY CONTROL — nothing protecting the user: Fraying Sanity may enchant either player", () => {
    expect(curseTargets([])).toEqual(["ai", "user"]);
  });
  it("⭐ Leyline of Sanctity, True Believer and Teferi's Protection each keep the Curse off the user", () => {
    const row = { leyline: curseTargets([LEYLINE_OF_SANCTITY]), trueBeliever: curseTargets([TRUE_BELIEVER]), teferi: curseTargets([], true) };
    console.log(`WITNESS curseOffer ${JSON.stringify(row)}`);
    expect(row).toEqual({ leyline: ["ai"], trueBeliever: ["ai"], teferi: ["ai"] });
  });
});
