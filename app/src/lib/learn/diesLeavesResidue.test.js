/**
 * DIES / LEAVES-THE-BATTLEFIELD residue (BLITZ DI-1) — three scopes one notch outside the admitted grammar,
 * each with a payoff atom that already existed. The dies/leaves machinery was mature; these are the honest gaps.
 *
 *  (A) ENCHANTMENT PiG (CR 700.4) — "Whenever an enchantment you control is put into a graveyard from the
 *      battlefield, <effect>" (Wicked Visitor, Ashiok's Reaper, Knight of Doves, Savior of the Sleeping,
 *      Starfield Mystic). The ENCHANTMENT analog of the existing creature/artifact PiG scopes → the new
 *      enchantmentYouControlPiG scope (graveyard exit only, type-line substring + controller gate).
 *
 *  (B) CREATURE any-exit LEAVES (CR 603.6c) — "Whenever another creature you control leaves the battlefield,
 *      <effect>" (Ninth Bridge Patrol, Flaming Fist Officer). The CREATURE analog of Nadier's token-leaves →
 *      otherCreatureYouControlLeaves (fires on EVERY exit — death/sac/bounce/exile — with the "another" id-exclusion).
 *
 *  (C) ANOTHER-nontoken dies (CR 111.1) — "Whenever another nontoken creature you control dies, <effect>"
 *      (Sek'Kuar, Agent Venom, Grim Haruspex). The source-excluding mirror of the existing "a nontoken creature
 *      you control dies" carve-out → the existing otherCreatureYouControl scope + the pre-switch nontokenFilter
 *      gate (no new scope needed).
 *
 * CREED — dies/leaves dispatch is high-collateral: every runtime test proves the trigger fires for the RIGHT
 * exit exactly once and NOT on a wrong one (wrong type, a bounce on a PiG watcher, a token on a nontoken
 * watcher, the source's own exit on an "another" watcher, an opponent's exit on a "you control" watcher).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkDiesTriggers, checkLeavesTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const permObj = (card, controller, id, over = {}) => ({ id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over });
function stateWith(over = {}) {
  const base = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "combat-damage", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}

// ─── (A) ENCHANTMENT PiG ───────────────────────────────────────────────────────────────────────

describe("DI-1(A) enchantment-PiG — detection + classification (real oracle)", () => {
  it("Wicked Visitor → enchantmentYouControlPiG, native-trigger", () => {
    const card = { type: "Creature — Nightmare", name: "Wicked Visitor", mana: "{1}{B}", oracle: "Whenever an enchantment you control is put into a graveyard from the battlefield, each opponent loses 1 life." };
    expect(detectTriggers(card).map((t) => t.scope)).toEqual(["enchantmentYouControlPiG"]);
    expect(classifyCard(card)).toBe("native-trigger");
  });
  it("Ashiok's Reaper (draw) and Knight of Doves (token) both classify native-trigger", () => {
    const reaper = { type: "Creature — Nightmare", name: "Ashiok's Reaper", oracle: "Whenever an enchantment you control is put into a graveyard from the battlefield, draw a card." };
    const doves = { type: "Creature — Human Knight", name: "Knight of Doves", oracle: "Whenever an enchantment you control is put into a graveyard from the battlefield, create a 1/1 white Bird creature token with flying." };
    expect(classifyCard(reaper)).toBe("native-trigger");
    expect(classifyCard(doves)).toBe("native-trigger");
  });
  it("CREED: the 'another'/opponent/unscoped forms stay UNDETECTED", () => {
    expect(detectTriggers({ type: "Creature — X", name: "X", oracle: "Whenever an enchantment an opponent controls is put into a graveyard from the battlefield, draw a card." })).toHaveLength(0);
    expect(detectTriggers({ type: "Creature — X", name: "Y", oracle: "Whenever an enchantment is put into a graveyard from the battlefield, draw a card." })).toHaveLength(0);
  });
});

describe("DI-1(A) enchantment-PiG — engine fires for the right exit (CREED)", () => {
  const visitor = { id: "card-wv", name: "Wicked Visitor", type: "Creature — Nightmare", power: 1, toughness: 1, oracle: "Whenever an enchantment you control is put into a graveyard from the battlefield, each opponent loses 1 life." };
  const enchant = { id: "card-ench", name: "Test Aura", type: "Enchantment — Aura" };
  const bear = { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };

  it("an enchantment you control → graveyard fires the watcher exactly once", () => {
    let s = placePerms(stateWith(), [permObj(visitor, "user", "perm-wv"), permObj(enchant, "user", "perm-ench")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-ench" });
    s = checkLeavesTriggers(s);
    const fired = (s.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/each opponent loses 1 life/i);
  });
  it("CREED: a NONTOKEN creature → graveyard does NOT fire (wrong type)", () => {
    let s = placePerms(stateWith(), [permObj(visitor, "user", "perm-wv"), permObj(bear, "user", "perm-bear")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-bear" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: an enchantment BOUNCED to hand does NOT fire (PiG requires a graveyard exit)", () => {
    let s = placePerms(stateWith(), [permObj(visitor, "user", "perm-wv"), permObj(enchant, "user", "perm-ench")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "perm-ench" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: an OPPONENT's enchantment → graveyard does NOT fire (controller gate)", () => {
    let s = placePerms(stateWith(), [permObj(visitor, "user", "perm-wv"), permObj({ ...enchant, id: "card-ench2" }, "ai1", "perm-ench-opp")]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-ench-opp" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
});

// ─── (B) CREATURE any-exit LEAVES ────────────────────────────────────────────────────────────────

describe("DI-1(B) creature-leaves (any exit) — detection + classification (real oracle)", () => {
  it("Ninth Bridge Patrol → otherCreatureYouControlLeaves, native-trigger", () => {
    const card = { type: "Creature — Dwarf Soldier", name: "Ninth Bridge Patrol", oracle: "Whenever another creature you control leaves the battlefield, put a +1/+1 counter on this creature." };
    expect(detectTriggers(card).map((t) => t.scope)).toEqual(["otherCreatureYouControlLeaves"]);
    expect(classifyCard(card)).toBe("native-trigger");
  });
  it("CREED: the 'without dying' / self-or-another riders stay UNDETECTED (residue → Arbiter)", () => {
    // Imperial Cosmographer / Three Tree Scribe carry a "without dying" rider — the END-anchored matcher misses it.
    expect(detectTriggers({ type: "Creature — X", name: "X", oracle: "Whenever another creature you control leaves the battlefield without dying, put two +1/+1 counters on this creature." })).toHaveLength(0);
    // "this creature or another creature you control leaves the battlefield" (self-or-another) is not this scope.
    expect(detectTriggers({ type: "Creature — X", name: "Y", oracle: "Whenever this creature or another creature you control leaves the battlefield, draw a card." })).toHaveLength(0);
  });
});

describe("DI-1(B) creature-leaves — engine fires on EVERY exit (CREED)", () => {
  const patrol = { id: "card-nbp", name: "Ninth Bridge Patrol", type: "Creature — Dwarf Soldier", power: 1, toughness: 1, oracle: "Whenever another creature you control leaves the battlefield, put a +1/+1 counter on this creature." };
  const bear = { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };
  const relic = { id: "card-relic", name: "Relic", type: "Artifact" };

  it("another creature → graveyard fires the watcher exactly once", () => {
    let s = placePerms(stateWith(), [permObj(patrol, "user", "perm-nbp"), permObj(bear, "user", "perm-bear")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-bear" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.controller === "user")).toHaveLength(1);
  });
  it("another creature BOUNCED to hand ALSO fires (any exit, not just graveyard)", () => {
    let s = placePerms(stateWith(), [permObj(patrol, "user", "perm-nbp"), permObj(bear, "user", "perm-bear")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "perm-bear" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).filter((t) => t.controller === "user")).toHaveLength(1);
  });
  it("CREED: a non-creature (artifact) leaving does NOT fire (isCreaturePerm gate)", () => {
    let s = placePerms(stateWith(), [permObj(patrol, "user", "perm-nbp"), permObj(relic, "user", "perm-relic")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-relic" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: the source's OWN leave does NOT self-fire (the 'another' id-exclusion)", () => {
    let s = placePerms(stateWith(), [permObj(patrol, "user", "perm-nbp")]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-nbp" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: an OPPONENT's creature leaving does NOT fire (controller gate)", () => {
    let s = placePerms(stateWith(), [permObj(patrol, "user", "perm-nbp"), permObj({ ...bear, id: "card-bear2" }, "ai1", "perm-bear-opp")]);
    s = moveCardToZone(s, { playerId: "ai1", fromZone: "battlefield", toZone: "graveyard", cardId: "perm-bear-opp" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
});

// ─── (C) ANOTHER-nontoken dies ───────────────────────────────────────────────────────────────────

describe("DI-1(C) another-nontoken-dies — detection + classification (real oracle)", () => {
  it("Sek'Kuar → otherCreatureYouControl + nontokenFilter, native-trigger", () => {
    const card = { type: "Legendary Creature — Orc Shaman", name: "Sek'Kuar, Deathkeeper", oracle: "Whenever another nontoken creature you control dies, create a 3/1 black and red Graveborn creature token with haste." };
    const d = detectTriggers(card);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "dies", scope: "otherCreatureYouControl", nontokenFilter: true });
    expect(classifyCard(card)).toBe("native-trigger");
  });
  it("Agent Venom (Flash + Menace) and Grim Haruspex (Morph) classify native-trigger", () => {
    const venom = { type: "Legendary Creature — Symbiote Soldier Hero", name: "Agent Venom", oracle: "Flash\nMenace\nWhenever another nontoken creature you control dies, you draw a card and lose 1 life." };
    const haruspex = { type: "Creature — Human Wizard", name: "Grim Haruspex", oracle: "Morph {B}\nWhenever another nontoken creature you control dies, draw a card." };
    expect(classifyCard(venom)).toBe("native-trigger");
    expect(classifyCard(haruspex)).toBe("native-trigger");
  });
});

describe("DI-1(C) another-nontoken-dies — engine fires for the right death (CREED)", () => {
  const sekkuar = { id: "card-sek", name: "Sek'Kuar, Deathkeeper", type: "Legendary Creature — Orc Shaman", power: 2, toughness: 2, oracle: "Whenever another nontoken creature you control dies, create a 3/1 black and red Graveborn creature token with haste." };
  const bearCard = { id: "card-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 };

  it("another NONTOKEN creature you control dies → fires exactly once", () => {
    const s = placePerms(stateWith(), [permObj(sekkuar, "user", "perm-sek")]);
    const next = checkDiesTriggers(s, [{ id: "perm-bear", controller: "user", name: "Bear", card: bearCard, power: 2 }]);
    const fired = (next.pendingTriggers || []).filter((t) => t.controller === "user");
    expect(fired).toHaveLength(1);
    expect(fired[0].descriptor.effectClause).toMatch(/graveborn/i);
  });
  it("CREED: a TOKEN creature dying does NOT fire (nontokenFilter)", () => {
    const s = placePerms(stateWith(), [permObj(sekkuar, "user", "perm-sek")]);
    const next = checkDiesTriggers(s, [{ id: "perm-tok", controller: "user", name: "Graveborn", card: { ...bearCard, id: "card-tok", token: true }, power: 3 }]);
    expect((next.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: the source's OWN death does NOT fire (the 'another' exclusion)", () => {
    const s = placePerms(stateWith(), [permObj(sekkuar, "user", "perm-sek")]);
    const next = checkDiesTriggers(s, [{ id: "perm-sek", controller: "user", name: "Sek'Kuar, Deathkeeper", card: sekkuar, power: 2 }]);
    expect((next.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
  it("CREED: an OPPONENT's nontoken creature dying does NOT fire (controller gate)", () => {
    const s = placePerms(stateWith(), [permObj(sekkuar, "user", "perm-sek")]);
    const next = checkDiesTriggers(s, [{ id: "perm-bear", controller: "ai1", name: "Bear", card: bearCard, power: 2 }]);
    expect((next.pendingTriggers || []).some((t) => t.controller === "user")).toBe(false);
  });
});
