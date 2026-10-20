/**
 * A QUOTED SPAN INSIDE REMINDER TEXT — reminder text has no game function (CR 207.2, 207.2a), and `abilityClauses` drops it before
 * splitting a card into clauses. It dropped every character inside the parentheses EXCEPT a double quote: the quote test ran
 * first and appended the mark, so a reminder that quotes a token's ability — "(It's an artifact with \"{T}, Sacrifice this token:
 * Add one mana of any color.\")" — left a stray `""` on the clause before it. On a quoted-grant line that stray pair poisoned the
 * attached-bonus parse (the static half of the grant never applied) and the grant gates read it as residue:
 *   · Diamond Pick-Axe (EDHREC #1485) — "Equipped creature gets +1/+1 and has \"Whenever this creature attacks, create a Treasure
 *     token.\" (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")";
 *   · Sticky Fingers (#1859) — "Enchanted creature has menace and \"Whenever this creature deals combat damage to a player, create
 *     a Treasure token.\" (… The token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")".
 * Now a quote inside a reminder is tracked (so a ")" inside it does not close the reminder) but never kept.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { abilityClauses, parseAttachedBonus } from "./staticAbilityParser.js";
import { checkAttackTriggers, checkCombatDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { sacrificeCreatureEffect } from "./effects/atoms/removal.js";

beforeEach(() => _resetIdsForTests());

const DIAMOND_PICK_AXE = {"name":"Diamond Pick-Axe","type":"Artifact — Equipment","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":["Indestructible","Treasure","Equip"],"colors":["R"],"oracle":"Indestructible (Effects that say \"destroy\" don't destroy this Equipment.)\nEquipped creature gets +1/+1 and has \"Whenever this creature attacks, create a Treasure token.\" (It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nEquip {2}"}; // body-only on 0a65c51c
const STICKY_FINGERS = {"name":"Sticky Fingers","type":"Enchantment — Aura","mana":"{R}","cmc":1,"power":null,"toughness":null,"keywords":["Treasure","Enchant"],"colors":["R"],"oracle":"Enchant creature\nEnchanted creature has menace and \"Whenever this creature deals combat damage to a player, create a Treasure token.\" (It can't be blocked except by two or more creatures. The token is an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")\nWhen enchanted creature dies, draw a card."}; // body-only on 0a65c51c
const CURIOUS_INQUIRY = {"name":"Curious Inquiry","type":"Enchantment — Aura","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Investigate","Enchant"],"colors":["U"],"oracle":"Enchant creature\nEnchanted creature gets +1/+1 and has \"Whenever this creature deals combat damage to a player, investigate.\" (Create a Clue token. It's an artifact with \"{2}, Sacrifice this token: Draw a card.\")"}; // body-only on 0a65c51c
const CREEPING_CRYSTAL_COATING = {"name":"Creeping Crystal Coating","type":"Enchantment — Aura","mana":"{2}{G}","cmc":3,"power":null,"toughness":null,"keywords":["Food","Enchant","Flash"],"colors":["G"],"oracle":"Flash\nEnchant creature\nEnchanted creature gets +0/+3 and has \"Whenever this creature attacks, create a Food token.\" (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")"}; // body-only on 0a65c51c
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], colors: ["G"], oracle: "" };

const perm = (id, card, controller, over = {}) => ({ id, card: { id: `c-${id}`, ...card }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
// A Bears wearing `att` (an Equipment or an Aura), both directions linked; the opponent's battlefield is empty.
function worn(att, over = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const host = perm("host", BEARS, "user", { attachments: ["att"] });
  const gear = perm("att", att, "user", { attachedTo: "host" });
  return { ...s0, turn: 5, activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], ...over,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [host, gear], library: [{ id: "lib-1", name: "Island", type: "Basic Land — Island", oracle: "" }] } } };
}
const tokens = (s, name) => s.players.user.battlefield.filter((p) => p.card?.token && p.card?.name === name).length;
function resolveAll(s) {
  let t = flushTriggers(s);
  let g = 0;
  while ((t.stack || []).length && g++ < 20) t = flushTriggers(resolveTopOfStack(t));
  return t;
}

describe("abilityClauses", () => {
  it("⭐ a quoted span inside a reminder leaves nothing behind", () => {
    expect({
      axe: abilityClauses(DIAMOND_PICK_AXE.oracle),
      fingers: abilityClauses(STICKY_FINGERS.oracle),
    }).toEqual({
      axe: ["Indestructible", "Equipped creature gets +1/+1 and has \"Whenever this creature attacks, create a Treasure token.\"", "Equip {2}"],
      fingers: ["Enchant creature", "Enchanted creature has menace and \"Whenever this creature deals combat damage to a player, create a Treasure token.\"", "When enchanted creature dies, draw a card"],
    });
  });
  it("control: a quote outside a reminder is kept, and a reminder without quotes still goes", () => {
    expect(abilityClauses("Equipped creature has \"Whenever this creature attacks, surveil 2.\" (Look at the top two cards.)\nEquip {2}"))
      .toEqual(["Equipped creature has \"Whenever this creature attacks, surveil 2.\"", "Equip {2}"]);
  });
  it("a \")\" inside a quote inside a reminder does not close the reminder", () => {
    expect(abilityClauses("Flying (It has \"This (odd) thing.\" then more.)\nVigilance")).toEqual(["Flying", "Vigilance"]);
  });
});

describe("the cards", () => {
  it("⭐ Diamond Pick-Axe and Sticky Fingers play their whole text (and two twins)", () => {
    expect({
      axe: classifyCard(DIAMOND_PICK_AXE), fingers: classifyCard(STICKY_FINGERS),
      inquiry: classifyCard(CURIOUS_INQUIRY), coating: classifyCard(CREEPING_CRYSTAL_COATING),
    }).toEqual({ axe: "native-equipment", fingers: "native-trigger", inquiry: "native-trigger", coating: "native-aura" });
  });
  it("⭐ the attached bonus parses: +1/+1 (the Axe), menace (the Fingers), +0/+3 (the Coating)", () => {
    const ops = (card) => parseAttachedBonus(card).map((d) => d.op);
    expect({ axe: ops(DIAMOND_PICK_AXE), fingers: ops(STICKY_FINGERS), coating: ops(CREEPING_CRYSTAL_COATING) }).toEqual({
      axe: [{ layerOp: "ptModify", power: 1, toughness: 1 }],
      fingers: [{ layerOp: "addKeyword", keyword: "Menace" }],
      coating: [{ layerOp: "ptModify", power: 0, toughness: 3 }],
    });
  });
});

describe("Diamond Pick-Axe on the board", () => {
  it("⭐ the equipped Bears is 3/3 and its attack creates a Treasure", () => {
    const s0 = { ...worn(DIAMOND_PICK_AXE), phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const s = resolveAll(checkAttackTriggers(s0));
    expect({ pt: [permanentPower(s0, "host"), permanentToughness(s0, "host")], treasures: tokens(s, "Treasure") }).toEqual({ pt: [3, 3], treasures: 1 });
  });
});

describe("Sticky Fingers on the board", () => {
  it("⭐ the enchanted Bears has menace; its combat damage to a player creates a Treasure", () => {
    const s0 = { ...worn(STICKY_FINGERS), phase: "combat", step: "combat-damage" };
    const hit = [{ kind: "combat-damage-player", attackerId: "host", attackingPlayer: "user", defender: "ai", amount: 2 }];
    const s = resolveAll(checkCombatDamageTriggers(s0, hit));
    expect({ menace: permanentHasKeyword(s0, "host", "Menace"), pt: [permanentPower(s0, "host"), permanentToughness(s0, "host")], treasures: tokens(s, "Treasure") })
      .toEqual({ menace: true, pt: [2, 2], treasures: 1 });
  });
  it("when the enchanted creature dies its controller draws a card", () => {
    const s0 = { ...worn(STICKY_FINGERS), phase: "precombat-main", step: "main" };
    const s = resolveAll(sacrificeCreatureEffect(s0, "user", "host"));
    expect({ hand: s.players.user.hand.map((c) => c.id), fingers: s.players.user.graveyard.some((c) => c.name === "Sticky Fingers") }).toEqual({ hand: ["lib-1"], fingers: true });
  });
});

describe("Creeping Crystal Coating on the board", () => {
  it("the enchanted Bears is 2/5 and its attack creates a Food", () => {
    const s0 = { ...worn(CREEPING_CRYSTAL_COATING), phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "host", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
    const s = resolveAll(checkAttackTriggers(s0));
    expect({ pt: [permanentPower(s0, "host"), permanentToughness(s0, "host")], food: tokens(s, "Food") }).toEqual({ pt: [2, 5], food: 1 });
  });
});
