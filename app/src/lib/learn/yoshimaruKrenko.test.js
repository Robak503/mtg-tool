/**
 * yoshimaruKrenko.test.js — SHELF-85 runbook Phase 2 · H6 + H5 (2026-09-04): Yoshimaru, Ever Faithful and Krenko, Tin Street
 * Kingpin (Shalai and Hallar); five twins audited — Gimli of the Glittering Caves, Jacked Rabbit, Royal Talon Fighter Jet,
 * Rampant Rejuvenator, Big Mother Mouser.
 *
 * Yoshimaru: "Whenever another legendary permanent you control enters" — the another-<subtype> etb watcher's regex takes
 * ONE word; the supertype form rides the same otherSubtype scopes with a legendaryFilter (and a creature-only flag for
 * Gimli's "another legendary creature"), LISTED in the descriptor assembly and enforced at scopeMatches.
 *
 * Krenko: "put a +1/+1 counter on it, then create a number of 1/1 red Goblin creature tokens equal to Krenko's power" — a
 * possessive self-name rewrite anchored on exactly this grammar, a "this creature's power" count phrase (the sourcePower
 * kind), and the vanilla token parser's "a number of P/T … tokens equal to <count>" form.
 *
 * The two dies twins forced a LOOK-BACK: a self dies trigger that reads "this creature's power" (Rampant Rejuvenator) or
 * "the number of +1/+1 counters on this creature" (Big Mother Mouser) resolves after the creature is gone. Without the
 * dies context's dyingPower / dyingCounters both would have read 0 — a credited-but-hollow class caught by the flip-diff
 * audit, not by reasoning. Both are pinned end to end here.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkEnterTriggers, checkAttackTriggers, checkDiesTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const YOSHI = { id: "c-yoshi", name: "Yoshimaru, Ever Faithful", type: "Legendary Creature — Dog", mana: "{W}", keywords: ["Partner"], power: 1, toughness: 1,
  oracle: "Whenever another legendary permanent you control enters, put a +1/+1 counter on Yoshimaru.\nPartner (You can have two commanders if both have partner.)" };
const GIMLI = { id: "c-gimli", name: "Gimli of the Glittering Caves", type: "Legendary Creature — Dwarf Warrior", mana: "{2}{R}", keywords: ["Double strike"], power: 2, toughness: 2,
  oracle: "Double strike\nWhenever another legendary creature you control enters, put a +1/+1 counter on Gimli.\nWhenever Gimli deals combat damage to a player, create a Treasure token." };
const KRENKO = { id: "c-krenko", name: "Krenko, Tin Street Kingpin", type: "Legendary Creature — Goblin", mana: "{2}{R}", keywords: [], power: 1, toughness: 2,
  oracle: "Whenever Krenko attacks, put a +1/+1 counter on it, then create a number of 1/1 red Goblin creature tokens equal to Krenko's power." };
const RABBIT = { id: "c-rabbit", name: "Jacked Rabbit", type: "Creature — Rabbit Warrior", mana: "{X}{1}{W}", keywords: ["Ravenous"], power: 1, toughness: 1,
  oracle: "Ravenous (This creature enters with X +1/+1 counters on it. If X is 5 or more, draw a card when it enters.)\nWhenever this creature attacks, create a number of 1/1 white Rabbit creature tokens equal to this creature's power." };
const JET = { id: "c-jet", name: "Royal Talon Fighter Jet", type: "Artifact — Vehicle", mana: "{X}{W}{W}", keywords: ["Flying"], power: 3, toughness: 3,
  oracle: "Flying\nThis Vehicle enters with X +1/+1 counters on it.\nWhenever this Vehicle enters or attacks, create a number of 1/1 white Soldier creature tokens equal to the number of +1/+1 counters on it.\nCrew 2" };
const REJUV = { id: "c-rejuv", name: "Rampant Rejuvenator", type: "Creature — Plant Hydra", mana: "{3}{G}", keywords: [], power: 0, toughness: 0,
  oracle: "This creature enters with two +1/+1 counters on it.\nWhen this creature dies, search your library for up to X basic land cards, where X is this creature's power, put them onto the battlefield, then shuffle." };
const MOUSER = { id: "c-mouser", name: "Big Mother Mouser", type: "Artifact Creature — Robot", mana: "{4}", keywords: [], power: 0, toughness: 0,
  oracle: "This creature enters with two +1/+1 counters on it.\nWhenever this creature attacks, double the number of +1/+1 counters on it.\nWhen this creature dies, create a number of 1/1 colorless Robot artifact creature tokens equal to the number of +1/+1 counters on this creature." };
const LEG_ART = { id: "c-legart", name: "Sol Talisman", type: "Legendary Artifact", mana: "{1}", oracle: "" };
const PLAIN_ART = { id: "c-art", name: "Plain Rock", type: "Artifact", mana: "{1}", oracle: "" };
const LEG_CREATURE = { id: "c-legc", name: "Legend Bear", type: "Legendary Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const forestCard = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" });

const base = () => {
  let s = createGameState({ userDeck: [forestCard("f1"), forestCard("f2"), forestCard("f3"), forestCard("f4")], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6 };
};
const settle = (s) => { while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s); return s; };
const withPerms = (s, perms) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, ...perms] } } });
const enter = (s, perm) => settle(flushTriggers(checkEnterTriggers(withPerms(s, [perm]), perm)));
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
const tokensNamed = (s, name) => s.players.user.battlefield.filter((p) => p.card?.token && p.card?.name === name).length;

describe("parse", () => {
  it("Yoshimaru's watcher carries the legendary filter; Gimli's the creature-only flag; Krenko's effect rewrites and parses", () => {
    const y = detectTriggers(YOSHI);
    expect(y.map((t) => ({ event: t.event, scope: t.scope, leg: t.legendaryFilter, co: t.legendaryCreatureOnly }))).toEqual([{ event: "etb", scope: "otherSubtypeYouControl", leg: true, co: undefined }]);
    const g = detectTriggers(GIMLI).find((t) => t.event === "etb");
    expect(g.legendaryFilter).toBe(true);
    expect(g.legendaryCreatureOnly).toBe(true);
    const k = detectTriggers(KRENKO)[0];
    expect(k.event).toBe("attacks");
    expect(k.effectClause).toBe("put a +1/+1 counter on this creature, then create a number of 1/1 red Goblin creature tokens equal to this creature's power");
    const r = parseEffectClause(k.effectClause, "Creature");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, target: "self" }, { op: "create-token", power: 1, toughness: 1, descriptor: "red goblin", countFor: { kind: "sourcePower" }, targetType: null }]);
    // a possessive naming a DIFFERENT permanent is never rewritten
    expect(detectTriggers({ ...KRENKO, oracle: "Whenever Krenko attacks, put a +1/+1 counter on it, then create a number of 1/1 red Goblin creature tokens equal to Gimli's power." })[0].effectClause).toContain("Gimli's power");
  });
});

describe("runtime — Yoshimaru and Gimli", () => {
  it("a legendary artifact entering grows Yoshimaru; a plain artifact does not; Yoshimaru never grows itself", () => {
    let s = withPerms(base(), [createPermanent({ id: "Y", card: YOSHI, controller: "user" })]);
    s = enter(s, createPermanent({ id: "LA", card: LEG_ART, controller: "user" }));
    expect(counters(s, "Y")).toBe(1);
    s = enter(s, createPermanent({ id: "PA", card: PLAIN_ART, controller: "user" }));
    expect(counters(s, "Y")).toBe(1);
    let t = base();
    const y = createPermanent({ id: "Y2", card: YOSHI, controller: "user" });
    t = enter(t, y);
    expect(counters(t, "Y2")).toBe(0);
  });
  it("Gimli grows only for a legendary CREATURE — a legendary artifact does nothing", () => {
    let s = withPerms(base(), [createPermanent({ id: "G", card: GIMLI, controller: "user" })]);
    s = enter(s, createPermanent({ id: "LA", card: LEG_ART, controller: "user" }));
    expect(counters(s, "G")).toBe(0);
    s = enter(s, createPermanent({ id: "LC", card: LEG_CREATURE, controller: "user" }));
    expect(counters(s, "G")).toBe(1);
  });
});

describe("runtime — Krenko and the attack twins", () => {
  it("Krenko attacks: a counter first, then Goblins equal to the NEW power", () => {
    let s = withPerms(base(), [createPermanent({ id: "K", card: KRENKO, controller: "user", summoningSick: false })]);
    s = { ...s, phase: "combat", step: "declare-attackers", combat: { attackers: [{ permanentId: "K", target: "ai" }] } };
    s = settle(flushTriggers(checkAttackTriggers(s)));
    expect(counters(s, "K")).toBe(1);
    expect(tokensNamed(s, "Goblin")).toBe(2); // 1 printed + 1 counter = power 2
  });
});

describe("runtime — the dies look-backs (the twins that would have been hollow)", () => {
  it("Rampant Rejuvenator dying to damage fetches lands equal to the power it HAD (2 counters → 2 lands), not 0", () => {
    let s = base();
    const r = { ...createPermanent({ id: "R", card: REJUV, controller: "user" }), counters: { "+1/+1": 2 }, damageMarked: 2 };
    s = withPerms(s, [r]);
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.map((d) => d.id)).toEqual(["R"]);
    expect(lethal.dead[0].power).toBe(2);
    s = settle(flushTriggers(checkDiesTriggers(lethal.state, lethal.dead)));
    // the tutor pauses for the picks; the look-back set the cap: TWO picks allowed (X = the power it had), never 0
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    expect(s.pendingChoice.remaining).toBe(2);
    expect(s.pendingChoice.candidates.length).toBe(4);
    s = resolveTutorChoice(s, s.pendingChoice.candidates[0].id);
    expect(s.pendingChoice?.kind).toBe("tutor-search");
    expect(s.pendingChoice.remaining).toBe(1);
    s = settle(resolveTutorChoice(s, s.pendingChoice.candidates[0].id));
    expect(s.pendingChoice).toBeFalsy();
    expect(s.players.user.battlefield.filter((p) => /Forest/.test(p.card.name)).length).toBe(2);
    expect(s.players.user.library.length).toBe(2);
  });
  it("Big Mother Mouser dying makes Robots equal to the counters it HAD", () => {
    let s = base();
    const m = { ...createPermanent({ id: "M", card: MOUSER, controller: "user" }), counters: { "+1/+1": 3 }, damageMarked: 3 };
    s = withPerms(s, [m]);
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.map((d) => d.id)).toEqual(["M"]);
    s = settle(flushTriggers(checkDiesTriggers(lethal.state, lethal.dead)));
    expect(tokensNamed(s, "Robot")).toBe(3);
  });
});

describe("runtime — the self guard on the power look-back", () => {
  it("a watcher of ANOTHER creature's death that dies alongside it never borrows the dying creature's power", () => {
    // Hypothetical fixture: the watcher (power 1) reads "this creature's power"; a 5-power creature dies in the same wrath.
    // With both gone, the watcher's own power is unknowable here (FN-safe 0) — it must NOT read the other's dyingPower (5).
    const WATCHER = { id: "c-watch", name: "Watcher", type: "Creature — Bird", mana: "{1}{W}", keywords: [], power: 1, toughness: 1,
      oracle: "Whenever another creature you control dies, create a number of 1/1 white Bird creature tokens equal to this creature's power." };
    let s = base();
    const w = { ...createPermanent({ id: "W", card: WATCHER, controller: "user" }), damageMarked: 1 };
    const big = { ...createPermanent({ id: "B", card: { id: "c-big", name: "Big One", type: "Creature — Beast", oracle: "", power: 5, toughness: 5 }, controller: "user" }), damageMarked: 5 };
    s = withPerms(s, [w, big]);
    const lethal = destroyLethalCreatures(s);
    expect(lethal.dead.map((d) => d.id).sort()).toEqual(["B", "W"]);
    s = settle(flushTriggers(checkDiesTriggers(lethal.state, lethal.dead)));
    expect(tokensNamed(s, "Bird")).toBe(0);
  });
});

describe("classifier", () => {
  it("Yoshimaru, Krenko and the five twins are native-trigger", () => {
    for (const c of [YOSHI, KRENKO, GIMLI, RABBIT, JET, REJUV, MOUSER]) expect(classifyCard(c), c.name).toBe("native-trigger");
  });
});
