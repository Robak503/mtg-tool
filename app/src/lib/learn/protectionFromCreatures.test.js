/**
 * protectionFromCreatures.test.js — SHELF-85 runbook Phase 2 · B7 (2026-09-04): Unquestioned Authority (Brago).
 *
 *   "Enchant creature / When this Aura enters, draw a card. / Enchanted creature has protection from creatures."
 *
 * The protection seam (CR 702.16) was COLOR-only. The first SOURCE-CLASS quality joins it end to end: the printed
 * reader (parseProtectionClasses — the same gains / as-long-as skips, whole-span "creatures" only), the Aura/Equipment
 * have-tail grant (addProtection `classes`; Holy / Spirit Mantle land on the same tail after their P/T peel), the
 * layer union (permanentProtectionClasses, printed ∪ granted), and enforcement at block (702.16f — no creature may
 * block it), combat damage (702.16e — prevented) and targeting (702.16b — an ability whose SOURCE is a creature, read
 * layer-aware off the flush's ctx.sourceId; the cast path threads no source permanent and reads false).
 * The printed carriers the keyword credit already counted (Beloved Chaplain, Commander Eesha, Teysa) are ENFORCED now.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createPermanent, createGameState, creaturePower, _resetIdsForTests } from "./gameState.js";
import { parseProtectionClasses } from "./protection.js";
import { permanentProtectionClasses } from "./layers.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AUTHORITY = { id: "c-ua", name: "Unquestioned Authority", type: "Enchantment — Aura", mana: "{2}{W}", cmc: 3, keywords: [],
  oracle: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature has protection from creatures." };
const HOLY = { id: "c-hm", name: "Holy Mantle", type: "Enchantment — Aura", mana: "{2}{W}{W}", cmc: 4, keywords: [],
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 and has protection from creatures." };
const SPIRIT = { id: "c-sm", name: "Spirit Mantle", type: "Enchantment — Aura", mana: "{1}{W}", cmc: 2, keywords: [],
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has protection from creatures." };
const CHAPLAIN = { id: "c-bc", name: "Beloved Chaplain", type: "Creature — Human Cleric", mana: "{1}{W}", cmc: 2, power: 1, toughness: 1, keywords: ["Protection"], oracle: "Protection from creatures" };

const creature = (name, power, toughness, controller, { colors = [], oracle = "", id = `${name}-perm` } = {}) =>
  createPermanent({ id, card: { id: `${name}-card`, name, power, toughness, type: "Creature", type_line: "Creature", colors, oracle }, controller });
const aura = (card, controller, attachedTo, id = `${card.name}-perm`) =>
  ({ ...createPermanent({ id, card: { ...card, type_line: card.type }, controller }), attachedTo });
const combatState = ({ userBf = [], aiBf = [] }, combat) => ({
  turn: 3, log: [],
  players: {
    user: { life: 40, poison: 0, battlefield: userBf, graveyard: [], commanderDamageFrom: {} },
    ai: { life: 40, poison: 0, battlefield: aiBf, graveyard: [], commanderDamageFrom: {} },
  },
  combat,
});
const permByName = (s, pid, name) => s.players[pid].battlefield.find((p) => p.card.name === name);

describe("the printed reader", () => {
  it("reads the whole-span 'creatures' quality and nothing filtered or temporary", () => {
    expect([...parseProtectionClasses(CHAPLAIN)]).toEqual(["creatures"]);
    expect([...parseProtectionClasses({ oracle: "Flying, protection from creatures" })]).toEqual(["creatures"]);
    expect(parseProtectionClasses({ oracle: "Creatures you control have protection from creatures with no names." }).size).toBe(0);
    expect(parseProtectionClasses({ oracle: "Human creatures you control have protection from creatures of the chosen type." }).size).toBe(0);
    expect(parseProtectionClasses({ oracle: "Target creature you control gains protection from creatures your opponents control until end of turn." }).size).toBe(0);
    expect(parseProtectionClasses({ oracle: "{W}: This creature gains protection from creatures until end of turn." }).size).toBe(0);
    // The 'gains' skip is the load-bearing gate when the grant ENDS the sentence (no duration tail to reject) — the
    // contract pin the mutation run asked for (2026-09-04: removing the skip survived on duration-tailed forms alone).
    expect(parseProtectionClasses({ oracle: "Whenever this creature attacks, it gains protection from creatures." }).size).toBe(0);
    expect(parseProtectionClasses({ oracle: "This creature has protection from creatures as long as you control an artifact." }).size).toBe(0);
    expect(parseProtectionClasses({ oracle: "Protection from red" }).size).toBe(0);
  });
});

describe("the granted quality (layer 6)", () => {
  it("Unquestioned Authority confers the class on the enchanted creature only; the Mantles add their P/T too", () => {
    const bear = creature("Bear", 2, 2, "user");
    const other = creature("Other", 2, 2, "user");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear, other, aura(AUTHORITY, "user", bear.id)] } } };
    expect(permanentProtectionClasses(s, bear.id).has("creatures")).toBe(true);
    expect(permanentProtectionClasses(s, other.id).has("creatures")).toBe(false);
    const s2 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura(HOLY, "user", bear.id)] } } };
    expect(permanentProtectionClasses(s2, bear.id).has("creatures")).toBe(true);
    expect(creaturePower(s2.players.user.battlefield[0], s2)).toBe(4);
    const s3 = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura(SPIRIT, "user", bear.id)] } } };
    expect(permanentProtectionClasses(s3, bear.id).has("creatures")).toBe(true);
    expect(creaturePower(s3.players.user.battlefield[0], s3)).toBe(3);
  });
});

describe("enforcement — block / combat damage / creature-sourced targeting", () => {
  it("an attacker with the class can't be blocked by ANY creature (CR 702.16f)", () => {
    const att = creature("Knight", 2, 2, "user");
    const blk = creature("Wall", 0, 4, "ai");
    const s = combatState({ userBf: [att, aura(AUTHORITY, "user", att.id)], aiBf: [blk] }, { attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(canBlockAttacker(s, blk.id, att.id, "ai")).toBe(false);
    // The printed form (Beloved Chaplain) is enforced the same way.
    const chap = createPermanent({ id: "chap", card: { ...CHAPLAIN, type_line: CHAPLAIN.type }, controller: "user" });
    const s2 = combatState({ userBf: [chap], aiBf: [blk] }, { attackers: [{ permanentId: "chap", attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(canBlockAttacker(s2, blk.id, "chap", "ai")).toBe(false);
    // …and a protected creature may still BLOCK.
    const s3 = combatState({ userBf: [creature("Ogre", 3, 3, "user")], aiBf: [chap] }, { attackers: [{ permanentId: "Ogre-perm", attackingPlayer: "user", defender: "ai" }], blockers: [] });
    expect(canBlockAttacker({ ...s3, players: { ...s3.players, ai: { ...s3.players.ai, battlefield: [{ ...chap, controller: "ai" }] } } }, "chap", "Ogre-perm", "ai")).toBe(true);
  });
  it("combat damage from a creature is prevented; the protected blocker still deals its own (CR 702.16e)", () => {
    const att = creature("Dragon", 3, 3, "user", { colors: ["R"] });
    const blk = creature("Paladin", 2, 4, "ai", { colors: ["W"] });
    const out = resolveCombatDamage(combatState({ userBf: [att], aiBf: [blk, aura(AUTHORITY, "ai", blk.id)] }, {
      attackers: [{ permanentId: att.id, attackingPlayer: "user", defender: "ai" }],
      blockers: [{ blockerId: blk.id, blockingPlayer: "ai", attackerId: att.id }],
    }));
    expect(permByName(out, "ai", "Paladin").damageMarked || 0).toBe(0);
    expect(permByName(out, "user", "Dragon").damageMarked).toBe(2);
  });
  it("an ability whose SOURCE is a creature can't target it; a non-creature source and the cast path still can", () => {
    const bear = creature("Bear", 2, 2, "user");
    const aiCreature = creature("Assassin", 1, 1, "ai");
    const aiEnchantment = createPermanent({ id: "ai-ench", card: { id: "c-ench", name: "Sinister Idol", type: "Enchantment", type_line: "Enchantment", oracle: "" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players,
      user: { ...s.players.user, battlefield: [bear, aura(AUTHORITY, "user", bear.id)] },
      ai: { ...s.players.ai, battlefield: [aiCreature, aiEnchantment] } } };
    const ids = (ctx) => enumerateTargets(s, "ai", { targetType: "creature" }, [], ctx).map((t) => t.id).sort();
    expect(ids({ sourceId: aiCreature.id })).toEqual([aiCreature.id]); // the Bear is refused to a creature's ability
    expect(ids({ sourceId: "ai-ench" })).toEqual([aiCreature.id, bear.id].sort()); // an enchantment's ability may target it
    expect(ids(null)).toEqual([aiCreature.id, bear.id].sort()); // the cast path (no source permanent) is unchanged
  });
});

describe("classifier", () => {
  it("the three Auras are native-aura; the printed carrier stays native-body (credited before, enforced now)", () => {
    expect(classifyCard(AUTHORITY)).toBe("native-aura");
    expect(classifyCard(HOLY)).toBe("native-aura");
    expect(classifyCard(SPIRIT)).toBe("native-aura");
    expect(classifyCard(CHAPLAIN)).toBe("native-body");
  });
  it("seen-to-fail: a FILTERED class on the Aura have-tail is not credited (whole-span 'creatures' only)", () => {
    const filtered = { ...AUTHORITY, id: "c-x", name: "Fixture Authority", oracle: "Enchant creature\nEnchanted creature has protection from creatures with no names." };
    expect(classifyCard(filtered)).not.toBe("native-aura");
    const bear = creature("Bear", 2, 2, "user");
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear, aura(filtered, "user", bear.id)] } } };
    expect(permanentProtectionClasses(s, bear.id).size).toBe(0);
  });
});
