/**
 * auraRestrictionLock.test.js — BLITZ AU-2: the AURA restriction-lock residue on top of PA-1's
 * pacifism class. Two shapes flip whole-card native:
 *
 *   1. PUMP + RESTRICTION — "Enchanted creature gets +X/+Y and can't attack/block" (Cagemail /
 *      Maniacal Rage / Crippling Blight / Cast into Darkness / Undying Rage; the Equipment twin
 *      Copper Carapace; the Bestow twin Gnarled Scarhide). The pump is the proven layer-7c ptModify;
 *      the tail is the SAME cantAttack/cantBlock layer-6 grant PA-1 emits, enforced at the declare gates.
 *
 *   2. ARREST CLASS — "…can't attack or block, and its activated abilities can't be activated"
 *      (Arrest / Lawmage's Binding / Demotion) + the possessive-only "…creature's activated abilities
 *      can't be activated" (Stupefying Touch). The can't-activate tail is a layer-6 grant of the
 *      "activatedAbilitiesLocked" pseudo-keyword — the SAME keyword Koma mode 1 grants — enforced at
 *      BOTH activation chokepoints: legalChoices' stack-ability gate AND manaModel.manaSources (a mana
 *      ability IS an activated ability, CR 605.1a; added with this class so a locked mana-dork produces
 *      nothing). Every restriction scopes to the host and lifts the moment the Aura leaves.
 *
 * CREED FN-guarded: an Aura carrying an UNMODELED rider (an aura-own trigger, a return-cost activated
 * ability, a conditional pump) drops the whole bonus → body-only. Real oracle fixtures (bundled
 * Scryfall, verified 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseAttachedBonus } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { canBlockAttacker } from "./combatEvasion.js";
import { manaSources } from "./manaModel.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ── Real oracle fixtures ────────────────────────────────────────────────────────────────────────
const ARREST = { id: "arr", name: "Arrest", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated." };
const DEMOTION = { id: "dem", name: "Demotion", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature can't block, and its activated abilities can't be activated." };
const LAWMAGES = { id: "law", name: "Lawmage's Binding", type: "Enchantment — Aura", mana: "{1}{W}{U}",
  oracle: "Flash\nEnchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated." };
const STUPEFYING = { id: "stu", name: "Stupefying Touch", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nWhen this Aura enters, draw a card.\nEnchanted creature's activated abilities can't be activated." };
const CAGEMAIL = { id: "cag", name: "Cagemail", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 and can't attack." };
const MANIACAL = { id: "man", name: "Maniacal Rage", type: "Enchantment — Aura", mana: "{1}{R}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 and can't block." };
const CRIPPLING = { id: "cri", name: "Crippling Blight", type: "Enchantment — Aura", mana: "{B}",
  oracle: "Enchant creature\nEnchanted creature gets -1/-1 and can't block." };
const COPPER = { id: "cop", name: "Copper Carapace", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature gets +2/+2 and can't block.\nEquip {3}" };

// CREED FN-guards — an unmodeled rider parks the whole card
const ICE_CAGE = { id: "ice", name: "Ice Cage", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated.\nWhen enchanted creature becomes the target of a spell or ability, destroy this Aura." };
const KRASIS = { id: "kra", name: "Krasis Incubation", type: "Enchantment — Aura", mana: "{1}{G}{U}",
  oracle: "Enchant creature\nEnchanted creature can't attack or block, and its activated abilities can't be activated.\n{1}{G}{U}, Return this Aura to its owner's hand: Put two +1/+1 counters on enchanted creature." };
const DETAINMENT = { id: "det", name: "Detainment Spell", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature's activated abilities can't be activated.\n{1}{W}: Attach this Aura to target creature." };
const BONDS = { id: "bof", name: "Bonds of Faith", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +2/+2 as long as it's a Human. Otherwise, it can't attack or block." };

const kw = (ops) => ops.map((o) => o.op?.keyword).filter(Boolean).sort();

describe("AU-2 parse + classify", () => {
  it("Arrest → cantAttack + cantBlock + activatedAbilitiesLocked; flips native", () => {
    expect(kw(parseAttachedBonus(ARREST))).toEqual(["activatedAbilitiesLocked", "cantAttack", "cantBlock"]);
    expect(classifyCard(ARREST)).toBe("native-aura");
  });
  it("Demotion → cantBlock + activatedAbilitiesLocked (block-only lock); flips native", () => {
    expect(kw(parseAttachedBonus(DEMOTION))).toEqual(["activatedAbilitiesLocked", "cantBlock"]);
    expect(classifyCard(DEMOTION)).toBe("native-aura");
  });
  it("Lawmage's Binding (Flash self-keyword) → same three grants; flips native", () => {
    expect(kw(parseAttachedBonus(LAWMAGES))).toEqual(["activatedAbilitiesLocked", "cantAttack", "cantBlock"]);
    expect(classifyCard(LAWMAGES)).toBe("native-aura");
  });
  it("Stupefying Touch — possessive lock form + modeled ETB draw; flips native", () => {
    expect(kw(parseAttachedBonus(STUPEFYING))).toEqual(["activatedAbilitiesLocked"]);
    expect(classifyCard(STUPEFYING)).toBe("native-aura");
  });
  it("pump + restriction: Cagemail (+2/+2, cantAttack) / Maniacal Rage (+2/+2, cantBlock) flip native", () => {
    const cag = parseAttachedBonus(CAGEMAIL);
    expect(cag.some((o) => o.op.layerOp === "ptModify" && o.op.power === 2 && o.op.toughness === 2)).toBe(true);
    expect(kw(cag)).toEqual(["cantAttack"]);
    expect(classifyCard(CAGEMAIL)).toBe("native-aura");
    const man = parseAttachedBonus(MANIACAL);
    expect(kw(man)).toEqual(["cantBlock"]);
    expect(classifyCard(MANIACAL)).toBe("native-aura");
    expect(kw(parseAttachedBonus(CRIPPLING))).toEqual(["cantBlock"]);   // negative pump keeps the tail
    expect(classifyCard(CRIPPLING)).toBe("native-aura");
  });
  it("the Equipment twin (Copper Carapace) shares the pump-tail parser; flips native-equipment", () => {
    const ops = parseAttachedBonus(COPPER);
    expect(ops.some((o) => o.op.layerOp === "ptModify" && o.op.power === 2 && o.op.toughness === 2)).toBe(true);
    expect(kw(ops)).toEqual(["cantBlock"]);
    expect(classifyCard(COPPER)).toBe("native-equipment");
  });
});

describe("AU-2 CREED — an unmodeled rider parks the whole card (body-only)", () => {
  it("Ice Cage (aura-own targeting trigger) stays body-only", () => {
    expect(classifyCard(ICE_CAGE)).toBe("body-only");
  });
  it("Krasis Incubation (return-cost activated ability) stays body-only", () => {
    expect(classifyCard(KRASIS)).toBe("body-only");
  });
  it("Detainment Spell (aura-own attach ability) stays body-only", () => {
    expect(classifyCard(DETAINMENT)).toBe("body-only");
  });
  it("Bonds of Faith (conditional 'as long as'/Otherwise) stays body-only", () => {
    expect(parseAttachedBonus(BONDS)).toEqual([]);
    expect(classifyCard(BONDS)).toBe("body-only");
  });
});

// ── Runtime: every restriction is enforced through a real legality read, scoped to the host, and
//    lifts the instant the Aura detaches. A mana-dork with a stack ability is the fixture so all four
//    reads (attack / block / stack-activate / mana-activate) can be probed at once. ────────────────
describe("AU-2 runtime — Arrest locks attack/block/activate (stack + mana), scoped, lifting on detach", () => {
  const DORK = { id: "dk", name: "Test Dork", type: "Creature — Elf", power: "1", toughness: "1",
    oracle: "{T}: Add {G}.\n{T}: This creature deals 1 damage to any target." };
  function board(attached) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const dork = createPermanent({ id: "dork", card: DORK, controller: "user", summoningSick: false });
    const bystander = createPermanent({ id: "by", card: { name: "Bystander Dork", type: "Creature — Elf", power: "1", toughness: "1", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: ARREST, controller: "ai1", summoningSick: false });
    const atk = createPermanent({ id: "atk", card: { name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    if (attached) { aura.attachedTo = "dork"; dork.attachments = ["aura"]; }
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [dork, bystander] }, ai1: { ...s.players.ai1, battlefield: [aura, atk] } },
    };
  }
  const combatStep = (s, step) => ({ ...s, phase: "combat", step });
  const attackerOffered = (s, id) => legalActionsForPlayer(combatStep(s, "declare-attackers"), "user").some((a) => a.kind === "declare-attacker" && a.permanentId === id);
  const activateOffered = (s, id) => legalActionsForPlayer(s, "user").some((a) => a.kind === "activate-ability" && a.permanentId === id);
  const isManaSource = (s, id) => manaSources(s, "user").some((x) => x.permanentId === id);

  it("attached: the host can't attack, block, activate a stack ability, or tap for mana", () => {
    const s = board(true);
    expect(attackerOffered(s, "dork")).toBe(false);
    expect(canBlockAttacker(combatStep(s, "declare-blockers"), "dork", "atk", "user")).toBe(false);
    expect(activateOffered(s, "dork")).toBe(false);
    expect(isManaSource(s, "dork")).toBe(false);          // AU-2: mana-ability lock (CR 605.1a)
  });
  it("NO LEAK — a non-enchanted creature keeps all four (attack/block/activate/mana)", () => {
    const s = board(true);
    expect(attackerOffered(s, "by")).toBe(true);
    expect(canBlockAttacker(combatStep(s, "declare-blockers"), "by", "atk", "user")).toBe(true);
    expect(isManaSource(s, "by")).toBe(true);
  });
  it("detached: the same host regains attack, block, activate, and mana (the restriction lifts)", () => {
    const s = board(false);
    expect(attackerOffered(s, "dork")).toBe(true);
    expect(canBlockAttacker(combatStep(s, "declare-blockers"), "dork", "atk", "user")).toBe(true);
    expect(activateOffered(s, "dork")).toBe(true);
    expect(isManaSource(s, "dork")).toBe(true);
  });
});

describe("AU-2 runtime — pump + restriction both apply (Maniacal Rage: +2/+2 AND can't block)", () => {
  function board(attached) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bear = createPermanent({ id: "bear", card: { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: MANIACAL, controller: "ai1", summoningSick: false });
    const atk = createPermanent({ id: "atk", card: { name: "Raider", type: "Creature — Human", power: "3", toughness: "3", oracle: "" }, controller: "ai1", summoningSick: false });
    if (attached) { aura.attachedTo = "bear"; bear.attachments = ["aura"]; }
    return {
      ...s, phase: "combat", step: "declare-blockers", activePlayer: "ai1", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [bear] }, ai1: { ...s.players.ai1, battlefield: [aura, atk] } },
    };
  }
  it("the +2/+2 is live (4/4) while the same creature is barred from blocking", () => {
    const s = board(true);
    expect(permanentPower(s, "bear")).toBe(4);
    expect(permanentToughness(s, "bear")).toBe(4);
    expect(canBlockAttacker(s, "bear", "atk", "user")).toBe(false);
  });
  it("unattached, the bear is a vanilla 2/2 that can block", () => {
    const s = board(false);
    expect(permanentPower(s, "bear")).toBe(2);
    expect(canBlockAttacker(s, "bear", "atk", "user")).toBe(true);
  });
});
