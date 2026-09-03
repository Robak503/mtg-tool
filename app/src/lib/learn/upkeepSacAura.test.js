/**
 * upkeepSacAura.test.js — CORPUS ④-L (2026-09-03 night): "At the beginning of your upkeep, sacrifice this AURA unless
 * you pay {cost}." — Melancholy / Thirst (tap-lock Auras with an upkeep tax) and Binding Grasp (a control Aura with an
 * upkeep tax, whose bonus survives since ④-K). The whole pay-or-sacrifice mechanism existed (creatures, enchantments,
 * permanents); the noun allowlist simply lacked "aura", so the Aura-templated print of the same sentence parked.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { checkStepTriggers, detectTriggers } from "./triggers.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, attachPermanent, findPermanent } from "./gameState.js";
import { permanentPower } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const MELANCHOLY = { id: "c-mel", name: "Melancholy", type: "Enchantment — Aura", mana: "{2}{B}", cmc: 3, keywords: [],
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of your upkeep, sacrifice this Aura unless you pay {B}." };
const THIRST = { id: "c-thirst", name: "Thirst", type: "Enchantment — Aura", mana: "{1}{U}", cmc: 2, keywords: [],
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of your upkeep, sacrifice this Aura unless you pay {U}." };
const BINDING_GRASP = { id: "c-bg", name: "Binding Grasp", type: "Enchantment — Aura", mana: "{3}{U}", cmc: 4, keywords: [],
  oracle: "Enchant creature\nAt the beginning of your upkeep, sacrifice this Aura unless you pay {1}{U}.\nYou control enchanted creature.\nEnchanted creature gets +0/+1." };
const SERRA_BESTIARY = { id: "c-sb", name: "Serra Bestiary", type: "Enchantment — Aura", mana: "{W}{W}", cmc: 2, keywords: [],
  oracle: "Enchant creature\nAt the beginning of your upkeep, sacrifice this Aura unless you pay {W}{W}.\nEnchanted creature can't attack or block, and its activated abilities with {T} in their costs can't be activated." };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" };

const controllerOf = (s, id) => findPermanent(s, id)?.controller ?? "GONE";

function attached(auraCard, pool) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const s = { ...s0, turn: 6, activePlayer: "user", priorityHolder: "user", phase: "upkeep", step: "upkeep",
    players: { ...s0.players,
      user: { ...s0.players.user, graveyard: [], battlefield: [createPermanent({ id: "A", card: auraCard, controller: "user" })], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, battlefield: [createPermanent({ id: "H", card: BEAR, controller: "ai", summoningSick: false })] } } };
  return attachPermanent(s, { equipId: "A", targetId: "H" });
}

describe("the parse + the tiers", () => {
  it("⭐ the matcher takes the Aura noun (and still refuses an unknown one)", () => {
    expect(matchUpkeepSacUnlessPay("sacrifice this Aura unless you pay {B}")).toMatchObject({ atom: { op: "sac-unless-pay", cost: { kind: "mana" } } });
    expect(matchUpkeepSacUnlessPay("sacrifice this widget unless you pay {B}")).toBeNull();
    const d = detectTriggers(MELANCHOLY).find((x) => x.event === "upkeep");
    expect(d).toMatchObject({ scope: "you" });
  });
  it("⭐ Melancholy, Thirst and Binding Grasp are native (an Aura with its own trigger sits on the trigger tier); Serra Bestiary stays parked on its restriction line", () => {
    expect(classifyCard(MELANCHOLY)).toBe("native-trigger");
    expect(classifyCard(THIRST)).toBe("native-trigger");
    expect(classifyCard(BINDING_GRASP)).toBe("native-trigger");
    expect(classifyCard(SERRA_BESTIARY)).not.toMatch(/^native/);
  });
});

describe("runtime — the Aura's OWN upkeep, pay or lose it", () => {
  const fireUpkeep = (s) => {
    const fired = flushTriggers(checkStepTriggers(s, "upkeep"));
    expect(fired.stack.map((o) => o.kind)).toEqual(["triggered-ability"]);
    const paused = resolveTopOfStack(fired);
    expect(paused.pendingChoice?.kind).toBe("sac-unless-pay");
    return paused;
  };
  it("⭐ Melancholy — PAY {B}: the Aura stays attached and the pool is charged", () => {
    const s = resolveSacUnlessPayChoice(fireUpkeep(attached(MELANCHOLY, { B: 1 })), true);
    expect(s.players.user.manaPool.B).toBe(0);
    expect(findPermanent(s, "A")?.permanent?.attachedTo).toBe("H");
  });
  it("⭐ Melancholy — DECLINE: the Aura is sacrificed and the Bear is free of it", () => {
    const s = resolveSacUnlessPayChoice(fireUpkeep(attached(MELANCHOLY, { B: 1 })), false);
    expect(s.players.user.manaPool.B).toBe(1);
    expect(findPermanent(s, "A")).toBeFalsy();
    expect(s.players.user.graveyard.some((c) => c.name === "Melancholy")).toBe(true);
    expect(findPermanent(s, "H").permanent.attachments || []).toEqual([]);
  });
  it("⭐ Binding Grasp — DECLINE sends the stolen Bear HOME (the control revert rides the sacrifice); PAY keeps it a 2/3 of ours", () => {
    const kept = resolveSacUnlessPayChoice(fireUpkeep(attached(BINDING_GRASP, { U: 2, C: 1 })), true);
    expect(controllerOf(kept, "H")).toBe("user");
    expect(permanentPower(kept, "H")).toBe(2);
    expect(findPermanent(kept, "H").permanent.card.toughness).toBe(2);
    const lost = resolveSacUnlessPayChoice(fireUpkeep(attached(BINDING_GRASP, { U: 2, C: 1 })), false);
    expect(controllerOf(lost, "H")).toBe("ai");
    expect(findPermanent(lost, "A")).toBeFalsy();
  });
  it("⛔ it is the AURA CONTROLLER's upkeep, not the host's — the AI's upkeep is silent", () => {
    const s = { ...attached(MELANCHOLY, { B: 1 }), activePlayer: "ai" };
    expect((checkStepTriggers(s, "upkeep").pendingTriggers || []).length).toBe(0);
  });
  it("⭐ Vapor Snare (the return-a-land cost, already modeled) — native, and DECLINE sends the stolen Bear home", () => {
    const VAPOR_SNARE = { id: "c-vs", name: "Vapor Snare", type: "Enchantment — Aura", mana: "{4}{U}", cmc: 5, keywords: [],
      oracle: "Enchant creature\nYou control enchanted creature.\nAt the beginning of your upkeep, sacrifice this Aura unless you return a land you control to its owner's hand." };
    expect(classifyCard(VAPOR_SNARE)).toBe("native-trigger");
    const before = attached(VAPOR_SNARE, {});
    expect(controllerOf(before, "H")).toBe("user");
    const lost = resolveSacUnlessPayChoice(fireUpkeep(before), false);
    expect(controllerOf(lost, "H")).toBe("ai");
    expect(findPermanent(lost, "A")).toBeFalsy();
  });
});
