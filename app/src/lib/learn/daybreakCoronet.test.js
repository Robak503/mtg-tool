/**
 * DAYBREAK CORONET — the "creature with another Aura attached to it" Enchant restriction. SHELF-85 · Light-Paws L6, 2026-09-05.
 * "Enchant creature with another Aura attached to it / Enchanted creature gets +3/+3 and has first strike, vigilance, and lifelink."
 *
 * The bonus parsed all along; the Enchant line's subject had no restriction reading, so the host spec was null and the cast
 * lane could not enumerate a host. One phrase in creatureEnchantRestrictions → the existing `enchanted` restriction kind
 * (an Aura attached, whoever controls it — the Winds of Rath predicate), which the cast-target enumeration already honours.
 *
 * Mutation-checked: see the run ledger (docs-sk110).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { auraEnchantHostSpec } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const CORONET = { id: "c-dc", name: "Daybreak Coronet", type: "Enchantment — Aura", mana: "{W}{W}", keywords: [],
  oracle: "Enchant creature with another Aura attached to it\nEnchanted creature gets +3/+3 and has first strike, vigilance, and lifelink." };

describe("the parser", () => {
  it("the Enchant line reads to a creature subject with the enchanted restriction; the card flips native", () => {
    const row = { spec: auraEnchantHostSpec(CORONET), tier: classifyCard(CORONET) };
    console.log("  WITNESS daybreakCoronet", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.spec).toEqual({ targetType: "creature", restrictions: [{ kind: "enchanted", value: true }] });
    expect(row.tier).toBe("native-aura");
  });
});

const bear = (id, controller) => createPermanent({ id, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });

describe("RUNTIME — the cast offers only hosts that already wear an Aura", () => {
  it("a bare creature (yours), a bare creature (theirs), and an Aura-wearing creature of theirs: only the wearer is a legal host", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const plains = (i) => createPermanent({ id: `pl${i}`, card: { id: `c-pl${i}`, name: "Plains", type: "Basic Land — Plains", oracle: "" }, controller: "user" });
    const wearer = { ...bear("wearer", "ai"), attachments: ["aura"] };
    const aura = { ...createPermanent({ id: "aura", card: { id: "c-aura", name: "Plain Aura", type: "Enchantment — Aura", mana: "{G}", keywords: [], oracle: "Enchant creature\nEnchanted creature gets +1/+1." }, controller: "ai" }), attachedTo: "wearer" };
    const s = { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [CORONET], battlefield: [plains(1), plains(2), bear("mine", "user")] }, ai: { ...s0.players.ai, battlefield: [bear("bare", "ai"), wearer, aura] } } };
    const hosts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "cast-spell" && x.cardId === "c-dc").map((x) => x.targets?.[0]?.id).sort();
    console.log("  WITNESS daybreakCoronetHosts", JSON.stringify(hosts)); // vitest 4 needs --disable-console-intercept
    expect(hosts).toEqual(["wearer"]);
  });
});
