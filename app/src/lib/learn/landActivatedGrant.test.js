/**
 * landActivatedGrant.test.js — GRANTED-ACTIVATED auras on a LAND host (queue 2).
 *
 * The granted-activated aura subsystem (phase 1b) only recognized a CREATURE host. A land-enchanting Aura
 * that grants the land an activated ability — "Enchanted land has \"{T}: Create a 1/1 green Squirrel creature
 * token.\"" (Squirrel Nest), "\"{T}: This land deals 1 damage to any target.\"" (Barbed Field), "\"{T}:
 * Target player loses 3 life.\"" (Caustic Tar) — was body-only at BOTH layers (the GRANTED_ACTIVATED_LINE
 * runtime parser and the isNativeActivatedGrantAura coverage gate were creature-only). This wave extends both
 * to a land host: the runtime enumerates the granted ability ON THE LAND (which taps for its {T} cost with no
 * summoning-sickness gate) through the SAME parseActivatedAbilities/dispatch path a printed ability uses.
 *
 * CREED: all-or-nothing (the quoted body must be FULLY MODELED — a rider / unmodeled body → body-only →
 * Arbiter); a land-MANA grant ("{T}: Add …") stays native-mana-aura (phase 1a), never double-counted here.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const aura = (name, oracle) => ({ name, type: "Enchantment — Aura", mana: "{1}{B}", oracle });

// A land enchanted with `auraOracle`. `lib` seeds the user's library so draw works; `aiBf` the opponent board.
function landWith(auraOracle, { lib = [], aiBf = [], userLife = 20 } = {}) {
  const land = createPermanent({ id: "land", card: { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "user" });
  const a = createPermanent({ id: "aura", card: { name: "TestAura", type: "Enchantment — Aura", oracle: auraOracle }, controller: "user" });
  a.attachedTo = "land"; land.attachments = ["aura"];
  const base = createGameState({ userDeck: lib, aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [land, a], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 }, life: userLife }, ai: { ...base.players.ai, battlefield: aiBf, life: 20 } },
  };
}
const landActs = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "land");

describe("LAND-host granted-activated aura (queue 2) — recognition", () => {
  it("a clean land-host modeled grant → native-activated", () => {
    expect(classifyCard(aura("Squirrel Nest", 'Enchant land\nEnchanted land has "{T}: Create a 1/1 green Squirrel creature token."'))).toBe("native-activated");
    expect(classifyCard(aura("Caustic Tar", 'Enchant land\nEnchanted land has "{T}: Target player loses 3 life."'))).toBe("native-activated");
    expect(classifyCard(aura("Barbed Field", 'Enchant land\nEnchanted land has "{T}: This land deals 1 damage to any target."'))).toBe("native-activated");
    expect(classifyCard(aura("Underworld Connections", 'Enchant land\nEnchanted land has "{T}, Pay 1 life: Draw a card."'))).toBe("native-activated");
  });
  it("FN boundary — rider / unmodeled body / land-MANA grant are NOT native-activated (CREED)", () => {
    // ETB-trigger rider whose effect does NOT route natively → residue → Arbiter (the routable draw
    // rider graduated in BLITZ LA-1 — Dragon Mantle-class pins live in landAuraEtbRider.test.js)
    expect(classifyCard(aura("Rider", 'Enchant land\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nEnchanted land has "{T}: Create a 1/1 green Squirrel creature token."'))).toBe("body-only");
    // unmodeled granted body → no grant emitted → Arbiter
    expect(classifyCard(aura("Unmodeled", 'Enchant land\nEnchanted land has "{T}: Reveal the top three cards of your library and do something unmodeled."'))).toBe("body-only");
    // a land-MANA grant remains native-mana-aura (phase 1a), NOT native-activated
    expect(classifyCard(aura("Settlement", 'Enchant Land\nEnchanted land has "{T}: Add one mana of any color."'))).toBe("native-mana-aura");
  });
});

describe("LAND-host granted-activated aura (queue 2) — runtime: the LAND activates the granted ability", () => {
  it("token-maker (Squirrel Nest): the land taps + creates the token", () => {
    const s = landWith('Enchant land\nEnchanted land has "{T}: Create a 1/1 green Squirrel creature token."');
    const a = landActs(s);
    expect(a).toHaveLength(1);
    const n0 = s.players.user.battlefield.length;
    let d = dispatchAction(s, a[0]);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.length).toBe(n0 + 1);                                  // token created
    expect(d.players.user.battlefield.find((p) => p.id === "land").tapped).toBe(true);        // the LAND tapped
  });

  it("'this land' self-source damage (Barbed Field): the LAND deals 1 to a target, killing a 1/1", () => {
    const enemy = createPermanent({ id: "enemy", card: { name: "Enemy", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    const s = landWith('Enchant land\nEnchanted land has "{T}: This land deals 1 damage to any target."', { aiBf: [enemy] });
    const atEnemy = landActs(s).find((x) => x.targets?.some((t) => t.id === "enemy"));
    expect(atEnemy).toBeTruthy();
    let d = dispatchAction(s, atEnemy);
    d = resolveTopOfStack(d);
    expect(d.players.ai.battlefield.find((p) => p.id === "enemy")).toBeUndefined();           // "this land" bound → 1 dmg → dead
  });

  it("target player (Caustic Tar): offers both players; the chosen one loses 3 life", () => {
    const s = landWith('Enchant land\nEnchanted land has "{T}: Target player loses 3 life."');
    const atAi = landActs(s).find((x) => x.targets?.some((t) => t.id === "ai"));
    expect(atAi).toBeTruthy();
    let d = dispatchAction(s, atAi);
    d = resolveTopOfStack(d);
    expect(d.players.ai.life).toBe(17);
    expect(d.players.user.life).toBe(20);
  });

  it("pay-life cost (Underworld Connections): {T}, Pay 1 life: Draw — taps, pays 1 life, draws", () => {
    const s = landWith('Enchant land\nEnchanted land has "{T}, Pay 1 life: Draw a card."', { lib: [{ name: "Top", type: "Instant", oracle: "" }] });
    const a = landActs(s);
    expect(a).toHaveLength(1);
    const hand0 = s.players.user.hand.length;
    let d = dispatchAction(s, a[0]);
    d = resolveTopOfStack(d);
    expect(d.players.user.hand.length).toBe(hand0 + 1);                                        // drew
    expect(d.players.user.life).toBe(19);                                                      // paid 1 life
  });

  it("'this land' mass damage (Noxious Field): 1 to each creature and player", () => {
    const c1 = createPermanent({ id: "c1", card: { name: "Bear", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    const s = landWith('Enchant land\nEnchanted land has "{T}: This land deals 1 damage to each creature and each player."', { aiBf: [c1] });
    const a = landActs(s);
    expect(a).toHaveLength(1);
    let d = dispatchAction(s, a[0]);
    d = resolveTopOfStack(d);
    expect(d.players.ai.battlefield.find((p) => p.id === "c1")).toBeUndefined();               // 1/1 dies
    expect(d.players.user.life).toBe(19);
    expect(d.players.ai.life).toBe(19);
  });
});
