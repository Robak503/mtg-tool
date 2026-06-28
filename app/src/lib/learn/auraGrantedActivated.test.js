/**
 * auraGrantedActivated.test.js — SUBSYSTEM 1 phase 1b: GRANTED-ACTIVATED ability runtime.
 *
 * An Aura that grants the enchanted CREATURE an activated ability ("Enchanted creature has \"{T}: This
 * creature deals 1 damage to any target.\"" — Hermetic Study; "\"{B}: This creature gets +1/+1…\"" —
 * Midnight Covenant) is now (a) classified native-activated and (b) actually ACTIVATABLE: legalChoices
 * enumerates the granted ability ON THE HOST (so tapSelf taps the host and "this creature"/"you" bind to
 * the host/its controller), and the existing dispatcher pays the cost + resolves the effect program.
 *
 * The granted ability text is parsed through the SAME parseActivatedAbilities path as a printed ability,
 * so cost / effect / `modeled` / target shape are identical — recognition (coverage) and runtime can't
 * drift. CREED boundaries proven here: all-or-nothing recognition (a rider keeps the card Arbiter), an
 * unmodeled granted effect (self-untap) stays Arbiter, summoning sickness gates a granted {T} ability.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const aura = (name, oracle) => ({ name, type: "Enchantment — Aura", mana: "{1}{B}", oracle });

// A host creature enchanted with `auraOracle`, plus optional extra permanents on the opponent's board.
function setup(auraOracle, { hostSick = false, aiBf = [], pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } = {}) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: hostSick });
  const a = createPermanent({ id: "aura", card: { name: "GrantAura", type: "Enchantment — Aura", oracle: auraOracle }, controller: "user" });
  a.attachedTo = "host";
  host.attachments = ["aura"];
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: {
      ...base.players,
      user: { ...base.players.user, battlefield: [host, a], manaPool: pool },
      ai: { ...base.players.ai, battlefield: aiBf },
    },
  };
}
const acts = (s) => legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability");
const enemy = (id = "enemy", p = 1, t = 1) => createPermanent({ id, card: { name: "Goblin", type: "Creature — Goblin", power: p, toughness: t, oracle: "" }, controller: "ai", summoningSick: false });

describe("GRANTED-ACTIVATED (1b) — recognition", () => {
  const N = (name, q) => classifyCard(aura(name, `Enchant creature\nEnchanted creature has "${q}"`));
  it("a clean granted modeled activated ability → native-activated", () => {
    expect(N("Midnight Covenant", "{B}: This creature gets +1/+1 until end of turn.")).toBe("native-activated");
    expect(N("Hermetic Study", "{T}: This creature deals 1 damage to any target.")).toBe("native-activated");
    expect(N("Sadistic Obsession", "{B}, {T}: Put a -1/-1 counter on target creature.")).toBe("native-activated");
    expect(N("Presence of Gond", "{T}: Create a 1/1 green Elf Warrior creature token.")).toBe("native-activated");
  });
  it("residue gate — a rider keeps the card Arbiter (all-or-nothing, CREED)", () => {
    // ETB-trigger rider (Dragon Mantle)
    expect(classifyCard(aura("Dragon Mantle", 'Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature has "{R}: This creature gets +1/+0 until end of turn."'))).toBe("body-only");
    // restriction rider (Compulsory Rest-style)
    expect(classifyCard(aura("Restful", 'Enchant creature\nEnchanted creature can\'t attack or block.\nEnchanted creature has "{B}: This creature gets +1/+1 until end of turn."'))).toBe("body-only");
    // return-to-hand rider (Hypervolt Grasp)
    expect(classifyCard(aura("Grasp", 'Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."\n{1}{U}: Return this Aura to its owner\'s hand.'))).toBe("body-only");
  });
  it("an UNMODELED granted effect stays Arbiter (FN-safe boundary)", () => {
    expect(N("Untapper", "{5}: Untap this creature.")).toBe("body-only");           // untap-self not a modeled effect
    expect(N("Variable", "{T}: This creature deals X damage to any target, where X is its power.")).toBe("body-only"); // X-effect
  });
});

describe("GRANTED-ACTIVATED (1b) — runtime: the host can activate the granted ability", () => {
  it("self-pump (Midnight Covenant): pays {B}, host 2/2 → 3/3", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{B}: This creature gets +1/+1 until end of turn."', { pool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } });
    const a = acts(s);
    expect(a).toHaveLength(1);
    expect(a[0].permanentId).toBe("host");
    let d = dispatchAction(s, a[0]);
    expect(d.players.user.manaPool.B).toBe(1);                 // paid {B}
    d = resolveTopOfStack(d);
    expect(permanentPower(d, "host")).toBe(3);
    expect(permanentToughness(d, "host")).toBe(3);
  });

  it("ping (Hermetic Study): taps the HOST, deals 1 to a target (kills a 1/1)", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."', { aiBf: [enemy()] });
    const atEnemy = acts(s).find((x) => x.targets?.[0]?.id === "enemy");
    expect(atEnemy).toMatchObject({ permanentId: "host", tapSelf: true });
    let d = dispatchAction(s, atEnemy);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);  // HOST tapped, not the aura
    d = resolveTopOfStack(d);
    expect(d.players.ai.battlefield.find((p) => p.id === "enemy")).toBeUndefined();
  });

  it("-1/-1 counter (Sadistic Obsession): {B},{T} puts a -1/-1 counter on a target creature", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{B}, {T}: Put a -1/-1 counter on target creature."', { aiBf: [enemy("enemy", 2, 2)], pool: { W: 0, U: 0, B: 3, R: 0, G: 0, C: 0 } });
    const atEnemy = acts(s).find((x) => x.targets?.[0]?.id === "enemy");
    expect(atEnemy).toBeTruthy();
    let d = dispatchAction(s, atEnemy);
    d = resolveTopOfStack(d);
    expect(permanentToughness(d, "enemy")).toBe(1);           // 2/2 with a -1/-1 counter → 1/1
  });

  it("gain life (Ephara's Radiance): the HOST's controller gains 3 life", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{1}{W}, {T}: You gain 3 life."', { pool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 1 } });
    const a = acts(s)[0];
    expect(a).toBeTruthy();
    const life0 = s.players.user.life;
    let d = dispatchAction(s, a);
    d = resolveTopOfStack(d);
    expect(d.players.user.life).toBe(life0 + 3);
  });

  it("create token (Presence of Gond): the controller gets a 1/1 token", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{T}: Create a 1/1 green Elf Warrior creature token."');
    const a = acts(s)[0];
    expect(a).toBeTruthy();
    const n0 = s.players.user.battlefield.length;
    let d = dispatchAction(s, a);
    d = resolveTopOfStack(d);
    expect(d.players.user.battlefield.length).toBe(n0 + 1);
  });

  it("summoning sickness gates the granted {T} ability (a freshly-enchanted host can't tap)", () => {
    const s = setup('Enchant creature\nEnchanted creature has "{T}: This creature deals 1 damage to any target."', { hostSick: true, aiBf: [enemy()] });
    expect(acts(s)).toHaveLength(0);
  });
});

// ─── EQUIPMENT host (subsystem 1 phase 1b, second slice) ────────────────────────

const equip = (name, oracle) => ({ name, type: "Artifact — Equipment", oracle });
// A host creature with an attached Equipment granting an activated ability.
function equipped(equipOracle, { aiBf = [], pool = { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } = {}) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const eq = createPermanent({ id: "eq", card: { name: "Equip", type: "Artifact — Equipment", oracle: equipOracle }, controller: "user" });
  eq.attachedTo = "host";
  host.attachments = ["eq"];
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...base.players, user: { ...base.players.user, battlefield: [host, eq], manaPool: pool }, ai: { ...base.players.ai, battlefield: aiBf } },
  };
}

describe("GRANTED-ACTIVATED (1b) — equipment host", () => {
  it("recognition: Equip + a modeled granted activated ability → native-equipment", () => {
    expect(classifyCard(equip("Bow of the Hunter", 'Equipped creature has "{T}: This creature deals 2 damage to any target."\nEquip {2}'))).toBe("native-equipment");
    expect(classifyCard(equip("Witches' Eye", 'Equipped creature has "{1}, {T}: Scry 1."\nEquip {1}'))).toBe("native-equipment");
  });
  it("recognition FN: a rider keeps the equipment Arbiter (Heavy Arbalest 'doesn\\'t untap')", () => {
    expect(classifyCard(equip("Heavy Arbalest", 'Equipped creature doesn\'t untap during its controller\'s untap step.\nEquipped creature has "{T}: This creature deals 2 damage to any target."\nEquip {4}'))).toBe("body-only");
  });
  it("runtime: the equipped creature activates the granted ability — taps the HOST, deals 2 (kills a 2/2)", () => {
    const s = equipped('Equipped creature has "{T}: This creature deals 2 damage to any target."\nEquip {2}', { aiBf: [enemy("enemy", 2, 2)] });
    const atEnemy = acts(s).find((x) => x.targets?.[0]?.id === "enemy");
    expect(atEnemy).toMatchObject({ permanentId: "host", tapSelf: true });
    let d = dispatchAction(s, atEnemy);
    expect(d.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);   // the HOST taps, not the equipment
    expect(d.players.user.battlefield.find((p) => p.id === "eq").tapped).toBeFalsy();
    d = resolveTopOfStack(d);
    expect(d.players.ai.battlefield.find((p) => p.id === "enemy")).toBeUndefined();
  });
});
