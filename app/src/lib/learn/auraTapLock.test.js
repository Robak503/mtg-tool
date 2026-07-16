/**
 * auraTapLock.test.js — BLITZ PZ-1 (CR 302.6 / 611.2c): the Paralyze-class attached tap-lock
 * ("Enchanted creature doesn't untap during its controller's untap step") + the aura-own ETB tap
 * ("When this Aura enters, tap enchanted creature") riding the shared enterPermanent chokepoint.
 * The lock is CONTINUOUS (read off attachments each untap step — lifts the moment the Aura leaves),
 * unlike Junk Winder's one-shot doesNotUntapNext flag or stun counters.
 *
 * Also pins the PZ-1 HARDENING (the Bind-the-Monster catch): every clause that TOUCHES the enchanted
 * creature must be an explicitly-modeled shape or parse as a bonus clause — a pronoun follow-up
 * sentence the runtime glues into the trigger descriptor (routing it LOW) can no longer slip the
 * metric on the touch heuristic.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, untapAll, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { attachedNoUntapOf, parseAuraBonus } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const WATERKNOT = { id: "wk", name: "Waterknot", type: "Enchantment — Aura", mana: "{1}{U}{U}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step." };
const PARALYZING_GRASP = { id: "pg", name: "Paralyzing Grasp", type: "Enchantment — Aura", mana: "{2}{U}",
  oracle: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step." };
const MESMERIZING_DOSE = { id: "md", name: "Mesmerizing Dose", type: "Enchantment — Aura", mana: "{2}{U}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature, then proliferate.\nEnchanted creature doesn't untap during its controller's untap step." };
const COLOSSIFICATION = { id: "cl", name: "Colossification", type: "Enchantment — Aura", mana: "{5}{G}{G}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature gets +20/+20." };
const SQUIRES_DEVOTION = { id: "sd", name: "Squire's Devotion", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 and has lifelink.\nWhen this Aura enters, create a 1/1 white Vampire creature token with lifelink." };
// CREED near-misses — each carries one clause past the modeled frame:
const BIND_THE_MONSTER = { id: "btm", name: "Bind the Monster", type: "Enchantment — Aura", mana: "{U}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature. It deals damage to you equal to its power.\nEnchanted creature doesn't untap during its controller's untap step." };
const SINGING_BELL_STRIKE = { id: "sbs", name: "Singing Bell Strike", type: "Enchantment — Aura", mana: "{3}{U}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nEnchanted creature has \"{6}: Untap this creature.\"" };
const PARALYZE = { id: "pz", name: "Paralyze", type: "Enchantment — Aura", mana: "{B}",
  oracle: "Enchant creature\nWhen this Aura enters, tap enchanted creature.\nEnchanted creature doesn't untap during its controller's untap step.\nAt the beginning of the upkeep of enchanted creature's controller, that player may pay {4}. If the player does, untap the creature." };
const NARCOLEPSY = { id: "nc", name: "Narcolepsy", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nAt the beginning of each upkeep, tap enchanted creature." };

describe("reader + classify", () => {
  it("attachedNoUntapOf reads the printed lock line and nothing else", () => {
    expect(attachedNoUntapOf(WATERKNOT)).toBe(true);
    expect(attachedNoUntapOf(PARALYZING_GRASP)).toBe(true);
    expect(attachedNoUntapOf(COLOSSIFICATION)).toBe(false);
  });
  it("the tap-lock frames flip native-aura (ETB tap, pure lock, rider'd tap, trailing ETB)", () => {
    expect(classifyCard(WATERKNOT)).toBe("native-aura");
    expect(classifyCard(PARALYZING_GRASP)).toBe("native-aura");
    expect(classifyCard(MESMERIZING_DOSE)).toBe("native-aura"); // "then proliferate" routes natively
    expect(classifyCard(COLOSSIFICATION)).toBe("native-aura");
    expect(classifyCard(SQUIRES_DEVOTION)).toBe("native-aura"); // ETB as the LAST line — order-independent
    expect(parseAuraBonus(COLOSSIFICATION).length).toBeGreaterThan(0); // the +20/+20 survives the ETB line
  });
  it("CREED — one clause past the frame keeps the whole card body-only", () => {
    // The hardening catch: the pronoun follow-up sentence rides the runtime descriptor (routes LOW),
    // so the touch heuristic may NOT silently eat it.
    expect(classifyCard(BIND_THE_MONSTER)).toBe("body-only");
    // Unmodeled granted untap escape ("{6}: Untap this creature") — parks the card, never half-models it.
    expect(classifyCard(SINGING_BELL_STRIKE)).toBe("body-only");
    // The {4} upkeep untap offer is an unmodeled aura-own trigger.
    expect(classifyCard(PARALYZE)).toBe("body-only");
    // At-each-upkeep tap is NOT the modeled self-ETB shape.
    expect(classifyCard(NARCOLEPSY)).toBe("body-only");
  });
});

describe("runtime — the lock at the untap step", () => {
  function board() {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: true });
    const bystander = createPermanent({ id: "by", card: { id: "byc", name: "Bystander", type: "Creature — Soldier", power: "1", toughness: "1", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: PARALYZING_GRASP, controller: "user", summoningSick: false });
    aura.attachedTo = "host"; host.attachments = ["aura"];
    host.tapped = true; bystander.tapped = true;
    s = { ...s, turn: 3, players: { ...s.players, user: { ...s.players.user, battlefield: [host, bystander, aura] } } };
    return s;
  }

  it("the locked host stays tapped turn after turn (continuous, not one-shot); sickness still clears; the bystander untaps", () => {
    let s = untapAll(board(), { playerId: "user" });
    const host1 = s.players.user.battlefield.find((p) => p.id === "host");
    expect(host1.tapped).toBe(true);
    expect(host1.summoningSick).toBe(false); // non-tap flags reset like every skip branch
    expect(s.players.user.battlefield.find((p) => p.id === "by").tapped).toBe(false);
    s = untapAll(s, { playerId: "user" }); // next turn: STILL locked (unlike doesNotUntapNext)
    expect(s.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);
  });

  it("the lock lifts the moment the Aura leaves; the skipped untap never records a became-untapped event", () => {
    let s = board();
    const locked = untapAll(s, { playerId: "user" });
    expect((locked.pendingUntapEvents || []).some((e) => e.id === "host")).toBe(false); // Mesmeric Orb honesty
    expect((locked.pendingUntapEvents || []).some((e) => e.id === "by")).toBe(true);
    // Aura leaves (host keeps the stale attachment id — findPermanent returns nothing for it).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "aura") } } };
    const freed = untapAll(s, { playerId: "user" });
    expect(freed.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(false);
  });
});

describe("runtime — the ETB tap fires through the shared enter chokepoint", () => {
  it("entering (attached to a creature) enqueues the tap-enchanted ETB trigger", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [host] } } };
    const after = enterPermanent(s, WATERKNOT, "user", { attachTo: "host" });
    const etb = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb");
    expect(etb.length).toBe(1);
    expect(etb[0].descriptor.effectClause).toMatch(/tap enchanted creature/i);
  });
});
