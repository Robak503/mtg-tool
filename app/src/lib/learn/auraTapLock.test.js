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
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

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
  // Real Narcolepsy: the upkeep tap is guarded by an intervening-if whose "tap it" pronoun effect doesn't
  // route (parses LOW), so the whole card stays body-only — UNLIKE the bare "tap enchanted creature" shape
  // (Curse of Chains) that BLITZ AU-3 credits native-trigger via isNativeOwnTriggeredAura.
  oracle: "Enchant creature\nAt the beginning of each upkeep, if enchanted creature is untapped, tap it." };

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
    // (Singing Bell Strike sat here as a near-miss until UT-1 modeled the granted untap escape —
    // it's pinned native-activated below; the unmodeled-clause intent is carried by Immobilizing
    // Ink's discard COST and Paralyze/Narcolepsy's triggers.)
    // The {4} upkeep untap offer is an unmodeled aura-own trigger.
    expect(classifyCard(PARALYZE)).toBe("body-only");
    // Real Narcolepsy: the upkeep tap's intervening-if "tap it" pronoun effect routes LOW → body-only. (The
    // bare "tap enchanted creature" upkeep shape — no intervening-if — is credited by AU-3; see Curse of
    // Chains in auraOwnTriggered.test.js.)
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

// ————————————————————————————— BLITZ UT-1: the untap-self escape valve —————————————————————————————
// "Untap this creature" (op:"untap", target:"self" — the pump/regenerate fixed self referent, resolved
// via ctx.sourceId). One anchor unlocks three families at once: the tap-lock escape grants
// ('Enchanted creature has "{6}: Untap this creature."' — Singing Bell Strike), printed activated
// untappers ({U}: Untap this creature — Morphling, Horseshoe Crab), and cast/ETB-watcher untap
// triggers (Thermo-Alchemist). CREED: a rider'd form stays LOW; an unmodeled COST keeps the card parked.

const IMMOBILIZING_INK = { id: "ink", name: "Immobilizing Ink", type: "Enchantment — Aura", mana: "{1}{U}",
  oracle: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nEnchanted creature has \"{1}, Discard a card: Untap this creature.\"" };
const HORSESHOE_CRAB = { id: "hc", name: "Horseshoe Crab", type: "Creature — Crab", mana: "{2}{U}",
  power: "1", toughness: "3", oracle: "{U}: Untap this creature." };

describe("UT-1 — parse + classify", () => {
  it("the bare self-untap parses; a rider'd form stays LOW (safe FN)", () => {
    expect(parseEffectClause("untap this creature").atoms).toEqual([{ op: "untap", target: "self" }]);
    // GRADUATED 2026-07-30 — the rider'd form is HIGH now. splitClauses breaks the " and ", and the
    // referent "it" binds to the SELF antecedent the untap just acted on (CR 608.2), rewriting to the
    // same {target:"self"} atom the explicit "this creature gains flying …" wording produces. The pin's
    // criterion was "the rider is unmodeled"; it no longer is. Re-pointed, not deleted.
    expect(parseEffectClause("untap this creature and it gains flying until end of turn").confidence).toBe("high");
    // Live negative: a rider whose KEYWORD is unmodeled still drops the whole clause (all-or-nothing).
    expect(parseEffectClause("untap this creature and it gains glorbulate until end of turn").confidence).toBe("low");
  });
  it("the escape-valve grant + printed untappers flip; Immobilizing Ink returns via DC-1's discard cost", () => {
    expect(classifyCard(SINGING_BELL_STRIKE)).toBe("native-activated");
    expect(classifyCard(HORSESHOE_CRAB)).toBe("native-activated");
    // (Immobilizing Ink sat here as the unmodeled-COST park until BLITZ DC-1's γ1h paid the discard —
    // the runtime charges it now, pinned end-to-end in discardCost.test.js. The cost boundary lives on
    // via a COUNT discard, still outside the vocabulary.)
    expect(classifyCard(IMMOBILIZING_INK)).toBe("native-activated");
    expect(classifyCard({ id: "ink2", name: "Two-Pitch Ink", type: "Enchantment — Aura", mana: "{1}{U}",
      oracle: "Enchant creature\nEnchanted creature doesn't untap during its controller's untap step.\nEnchanted creature has \"{1}, Discard two cards: Untap this creature.\"" })).toBe("body-only");
  });
});

describe("UT-1 — runtime: pay the granted cost, untap the locked host", () => {
  it("the Singing-Bell'd host is offered the granted {6}; dispatching it untaps the host (the lock only guards the untap STEP)", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const host = createPermanent({ id: "host", card: { id: "hb", name: "Host Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user", summoningSick: false });
    const aura = createPermanent({ id: "aura", card: SINGING_BELL_STRIKE, controller: "user", summoningSick: false });
    aura.attachedTo = "host"; host.attachments = ["aura"];
    host.tapped = true; // the ETB tap already resolved; the lock holds it through untap steps
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 4,
      players: { ...s.players, user: { ...s.players.user, battlefield: [host, aura], manaPool: { W: 0, U: 6, B: 0, R: 0, G: 0, C: 0 } } },
    };
    // Still locked at the untap step…
    expect(untapAll(s, { playerId: "user" }).players.user.battlefield.find((p) => p.id === "host").tapped).toBe(true);
    // …but the granted escape valve is offered on the HOST, and paying {6} untaps it.
    const offers = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "host");
    expect(offers.length).toBe(1);
    const paid = dispatchAction(s, offers[0]);       // pays {6} from the pool, puts the ability on the stack
    expect(paid.players.user.manaPool.U).toBe(0);
    const after = resolveTopOfStack(paid);           // the untap-self program resolves on the host
    expect(after.players.user.battlefield.find((p) => p.id === "host").tapped).toBe(false);
  });
});
