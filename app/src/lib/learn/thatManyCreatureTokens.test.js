/**
 * thatManyCreatureTokens.test.js — the play-weighted program (2026-10-18): "create that many <P/T> … creature tokens" where
 * "that many" is the damage just dealt — Lathril, Blade of the Elves (EDHREC #2007) "Whenever Lathril deals combat damage to a
 * player, create that many 1/1 green Elf Warrior creature tokens." and the twins (Living Hive, Elsha, Threefold Master, Tervigon,
 * Hornet Nest "Whenever this creature is dealt damage, …"), plus the named-token arm's "tapped" (Prosperous Bandit "create that
 * many tapped Treasure tokens").
 *
 * The count is the existing combat-damage magnitude (ctx.combatDamageAmount — the Old Gnawbone Treasure arm's count, which the
 * dealt-damage event threads as its alias, triggers.checkDealtDamageTriggers). triggerRouting.combatDamageReferentSatisfied
 * keeps it to the events that set it: any other "that many" (Rabble Rousing's attackers, a spell's sacrificed creatures) stays
 * unread on both trees.
 *
 * Bundled ruling witnessed (rulings.json): Hornet Nest (2014-07-18) "Hornet Nest's triggered ability will trigger even if it's
 * dealt lethal damage. For example, if it's dealt 7 damage, its ability will trigger and you'll put seven Insect creature tokens
 * onto the battlefield."
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read 2026-10-18).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createTokenClauseParser, createNamedTokenClauseParser } from "./effects/atoms/tokens.js";
import { checkCombatDamageTriggers, checkDealtDamageTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { permanentHasKeyword } from "./layers.js";
import { createGameState, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LATHRIL = { id: "c-lath", name: "Lathril, Blade of the Elves", type: "Legendary Creature — Elf Noble", mana: "{2}{B}{G}", power: 2, toughness: 3, keywords: ["Menace"],
  oracle: "Menace (This creature can't be blocked except by two or more creatures.)\nWhenever Lathril deals combat damage to a player, create that many 1/1 green Elf Warrior creature tokens.\n{T}, Tap ten untapped Elves you control: Each opponent loses 10 life and you gain 10 life." };
const LIVING_HIVE = { id: "c-hive", name: "Living Hive", type: "Creature — Elemental Insect", mana: "{6}{G}{G}", power: 6, toughness: 6, keywords: ["Trample"],
  oracle: "Trample\nWhenever this creature deals combat damage to a player, create that many 1/1 green Insect creature tokens." };
const ELSHA = { id: "c-elsha", name: "Elsha, Threefold Master", type: "Legendary Creature — Djinn Monk", mana: "{U}{R}{W}", power: 1, toughness: 1, keywords: ["Prowess", "Trample"],
  oracle: "Trample\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)\nWhenever Elsha deals combat damage to a player, create that many 1/1 white Monk creature tokens with prowess." };
const PROSPEROUS_BANDIT = { id: "c-pb", name: "Prosperous Bandit", type: "Creature — Raccoon Rogue", mana: "{2}{R}", power: 2, toughness: 2, keywords: ["Offspring", "First strike", "Treasure"],
  oracle: "Offspring {1} (You may pay an additional {1} as you cast this spell. If you do, when this creature enters, create a 1/1 token copy of it.)\nFirst strike\nWhenever this creature deals combat damage to a player, create that many tapped Treasure tokens." };
const HORNET_NEST = { id: "c-nest", name: "Hornet Nest", type: "Creature — Insect", mana: "{2}{G}", power: 0, toughness: 2, keywords: ["Defender"],
  oracle: "Defender (This creature can't attack.)\nWhenever this creature is dealt damage, create that many 1/1 green Insect creature tokens with flying and deathtouch. (Any amount of damage a creature with deathtouch deals to a creature is enough to destroy it.)" };
// CREED controls — "that many" on an event that sets no damage amount, and on a spell.
const RABBLE_ROUSING = { id: "c-rr", name: "Rabble Rousing", type: "Enchantment", mana: "{4}{W}", keywords: ["Hideaway"],
  oracle: "Hideaway 5 (When this enchantment enters, look at the top five cards of your library, exile one face down, then put the rest on the bottom in a random order.)\nWhenever you attack with one or more creatures, create that many 1/1 green and white Citizen creature tokens. Then if you control ten or more creatures, you may play the exiled card without paying its mana cost." };
const HELLION_ERUPTION = { id: "c-he", name: "Hellion Eruption", type: "Sorcery", mana: "{5}{R}", keywords: [],
  oracle: "Sacrifice all creatures you control, then create that many 4/4 red Hellion creature tokens." };
const CRYPTCALLER_CHARIOT_LINE = "Whenever you discard one or more cards, create that many tapped 2/2 black Zombie creature tokens.";

const put = (card, id, controller = "user", over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
function board(mine) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, players: { ...b.players, user: { ...b.players.user, battlefield: mine } } };
}
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let g = 0;
  while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
  return s;
}
const tokensNamed = (s, re) => (s.players.user.battlefield || []).filter((p) => p.card?.token && re.test(String(p.card.name || p.card.type || "")));
const hit = (attackerId, amount) => [{ kind: "combat-damage-player", attackerId, attackingPlayer: "user", defender: "ai", amount }];

describe("classifier — the whole cards", () => {
  it("Lathril, Living Hive, Elsha, Prosperous Bandit and Hornet Nest are native", () => {
    for (const c of [LATHRIL, LIVING_HIVE, ELSHA, PROSPEROUS_BANDIT, HORNET_NEST]) expect([c.name, classifyCard(c)]).toEqual([c.name, expect.stringMatching(/^native-/)]);
  });
  it("CREED controls: Rabble Rousing's attackers and Hellion Eruption's sacrificed creatures are no damage amount", () => {
    expect(classifyCard(RABBLE_ROUSING)).toBe("body-only");
    expect(classifyCard(HELLION_ERUPTION)).toBe("arbiter-spell");
    expect(classifyCard({ id: "c-cc", name: "Probe Chariot", type: "Artifact", mana: "{4}", keywords: [], oracle: CRYPTCALLER_CHARIOT_LINE })).toBe("body-only");
  });
});

describe("parser — 'that many' is the damage amount", () => {
  it("the creature-token arm and the named arm's tapped Treasure", () => {
    expect(createTokenClauseParser("create that many 1/1 green Elf Warrior creature tokens")).toMatchObject({ op: "create-token", countContext: "combatDamageAmount", power: 1, toughness: 1, descriptor: "green elf warrior" });
    expect(createTokenClauseParser("create that many 1/1 white Monk creature tokens with prowess")).toMatchObject({ op: "create-token", countContext: "combatDamageAmount", tokenOracle: "Prowess" });
    expect(createNamedTokenClauseParser("create that many tapped Treasure tokens")).toMatchObject({ op: "create-named-token", token: "treasure", countContext: "combatDamageAmount", tapped: true });
  });
});

describe("runtime — the tokens are the damage dealt", () => {
  it("Lathril connects for 3 → three 1/1 green Elf Warriors", () => {
    const s = resolveAll(checkCombatDamageTriggers(board([put(LATHRIL, "LA")]), hit("LA", 3)));
    const elves = tokensNamed(s, /Elf Warrior/);
    expect(elves).toHaveLength(3);
    expect(elves.every((p) => Number(p.card.power) === 1 && Number(p.card.toughness) === 1)).toBe(true);
  });
  it("Elsha's Monks carry prowess", () => {
    const s = resolveAll(checkCombatDamageTriggers(board([put(ELSHA, "EL")]), hit("EL", 2)));
    const monks = tokensNamed(s, /Monk/);
    expect(monks).toHaveLength(2);
    expect(monks.every((p) => permanentHasKeyword(s, p.id, "Prowess"))).toBe(true);
  });
  it("Prosperous Bandit connects for 2 → two TAPPED Treasures", () => {
    const s = resolveAll(checkCombatDamageTriggers(board([put(PROSPEROUS_BANDIT, "PB")]), hit("PB", 2)));
    const treasures = tokensNamed(s, /Treasure/);
    expect(treasures).toHaveLength(2);
    expect(treasures.every((p) => p.tapped)).toBe(true);
  });
  it("Hornet Nest dealt 7 lethal damage still makes seven flying, deathtouch Insects (the ruling)", () => {
    let s = board([put(HORNET_NEST, "HN", "user", { damageMarked: 7 })]);
    s = checkDealtDamageTriggers(s, [{ creatureId: "HN", amount: 7 }]);
    s = destroyLethalCreatures(s).state;
    expect(s.players.user.battlefield.find((p) => p.id === "HN")).toBeUndefined();
    s = resolveAll(s);
    const insects = tokensNamed(s, /Insect/);
    expect(insects).toHaveLength(7);
    expect(insects.every((p) => permanentHasKeyword(s, p.id, "Flying") && permanentHasKeyword(s, p.id, "Deathtouch"))).toBe(true);
  });
});
