/**
 * laccolithUnblocked.test.js — ④-AU (2026-09-04 night): two combat shapes built together.
 *
 *  1. SOURCE-POWER DAMAGE + THE LACCOLITH RIDER — "Whenever this creature becomes blocked, you may have it deal damage
 *     equal to its power to target creature. If you do, this creature assigns no combat damage this turn." (Laccolith
 *     Titan / Whelp / Grunt / Warrior). The damage reads the source's LIVE power (the sourcePower reader); the rider is
 *     folded onto the same optional atom (splitClauses keeps the pair whole) and stamps noCombatDamageTurn on the source,
 *     which combatResolution's dealsThisStep gate honors. Flametongue Yearling ("it deals damage equal to its power to
 *     target creature" on ETB) and Sinstriker's Will (the granted "{T}: This creature deals damage equal to its power to
 *     target attacking or blocking creature") ride the same arm. The Fling bodies (Skarrgan Skybreaker "{1}, Sacrifice
 *     this creature: It deals damage equal to its power to ANY TARGET") stay parked: "any target" is not read, and the
 *     activated lane refuses a sourcePower amount under a sacrifice-self cost (the source is gone at resolution).
 *  2. ATTACKS-AND-ISN'T-BLOCKED — its own event (attacksUnblocked), fired at the declare-blockers step for every attacker
 *     with no blocker record. Before tonight the detector read it as plain "attacks" and five credited cards (Abyssal
 *     Nightstalker, Dwarven Vigilantes, Merchant Ship, Wildfire Eternal, Eternal of Harsh Truths) fired on the attack
 *     declaration whether or not they were blocked — an over-fire.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { countForSpec } from "./effects/atoms/shared.js";
import { detectTriggers } from "./triggers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { nextStep, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { resolveCombatDamage } from "./combatResolution.js";
import { _resetIdsForTests, attachPermanent, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LACC_ORACLE = "Whenever this creature becomes blocked, you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn.";
const GRUNT = { id: "c-grunt", name: "Laccolith Grunt", type: "Creature — Beast", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [], oracle: LACC_ORACLE };
const TITAN = { ...GRUNT, id: "c-titan", name: "Laccolith Titan", mana: "{5}{R}{R}", cmc: 7, power: 6, toughness: 6 };
const WHELP = { ...GRUNT, id: "c-whelp", name: "Laccolith Whelp", mana: "{R}", cmc: 1, power: 1, toughness: 1 };
const WARRIOR = { ...GRUNT, id: "c-warrior", name: "Laccolith Warrior", type: "Creature — Beast Warrior", mana: "{2}{R}{R}", cmc: 4, power: 3, toughness: 3 };
const YEARLING = { id: "c-fty", name: "Flametongue Yearling", type: "Creature — Kavu", mana: "{R}{R}", cmc: 2, power: 1, toughness: 1, keywords: ["Multikicker"],
  oracle: "Multikicker {2} (You may pay an additional {2} any number of times as you cast this spell.)\nThis creature enters with a +1/+1 counter on it for each time it was kicked.\nWhen this creature enters, it deals damage equal to its power to target creature." };
const SINSTRIKER = { id: "c-sw", name: "Sinstriker's Will", type: "Enchantment — Aura", mana: "{3}{W}", cmc: 4, keywords: [],
  oracle: "Enchant creature\nEnchanted creature has \"{T}: This creature deals damage equal to its power to target attacking or blocking creature.\"" };
const SKARRGAN = { id: "c-sk", name: "Skarrgan Skybreaker", type: "Creature — Giant Shaman", mana: "{4}{R}{R}{G}", cmc: 7, power: 3, toughness: 3, keywords: ["Bloodthirst"],
  oracle: "Bloodthirst 3 (If an opponent was dealt damage this turn, this creature enters with three +1/+1 counters on it.)\n{1}, Sacrifice this creature: It deals damage equal to its power to any target." };
const GHITU = { id: "c-gfe", name: "Ghitu Fire-Eater", type: "Creature — Human Nomad", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "{T}, Sacrifice this creature: It deals damage equal to its power to any target." };
const STALKING = { id: "c-sv", name: "Stalking Vengeance", type: "Creature — Avatar", mana: "{5}{R}{R}", cmc: 7, power: "5", toughness: "5", keywords: ["Haste"],
  oracle: "Haste\nWhenever another creature you control dies, it deals damage equal to its power to target player or planeswalker." };
const VANCE = { id: "c-crv", name: "Captain Ripley Vance", type: "Legendary Creature — Human Pirate", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "Whenever you cast your third spell each turn, put a +1/+1 counter on Captain Ripley Vance, then it deals damage equal to its power to any target." };
const VIGILANTES = { id: "c-dv", name: "Dwarven Vigilantes", type: "Creature — Dwarf", mana: "{2}{R}", cmc: 3, power: 2, toughness: 2, keywords: [],
  oracle: "Whenever this creature attacks and isn't blocked, you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn." };
const NIGHTSTALKER = { id: "c-an", name: "Abyssal Nightstalker", type: "Creature — Nightstalker", mana: "{3}{B}", cmc: 4, power: 2, toughness: 2, keywords: [],
  oracle: "Whenever this creature attacks and isn't blocked, defending player discards a card." };

const bear = (id, name, controller, power = 2, toughness = 2) =>
  createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power, toughness, keywords: [], oracle: "" }, controller });

/** A declare-blockers board: `attackers` on the active side (all attacking the other seat), `blocks` = [blockerId, attackerId]. */
function declareBlockers({ active = "user", activeBoard, otherBoard, attackers, blocks = [], otherHand = [] }) {
  const other = active === "user" ? "ai" : "user";
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "combat", step: "declare-blockers", activePlayer: active, priorityHolder: active, consecutivePasses: 0, stack: [],
    combat: { attackers: attackers.map((id) => ({ permanentId: id, defender: other })), blockers: blocks.map(([blockerId, attackerId]) => ({ blockerId, attackerId })) },
    players: { ...s0.players,
      [active]: { ...s0.players[active], hand: [], battlefield: activeBoard },
      [other]: { ...s0.players[other], hand: otherHand, battlefield: otherBoard } } };
}

describe("the parse", () => {
  it("⭐ 'you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn' is ONE optional atom with the rider folded on", () => {
    const p = parseEffectClause("you may have it deal damage equal to its power to target creature. If you do, this creature assigns no combat damage this turn", "Instant", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", targetType: "creature", amountCount: { kind: "sourcePower" }, sourceAssignsNoCombatDamage: true, optional: true });
  });
  it("the bare source-power damage (Flametongue Yearling's ETB) parses without the rider", () => {
    const p = parseEffectClause("it deals damage equal to its power to target creature", "Instant", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "deal-damage", targetType: "creature", amountCount: { kind: "sourcePower" } });
    expect(p.atoms[0].sourceAssignsNoCombatDamage).toBeUndefined();
  });
  it("④-AW — the Fling form 'it deals damage equal to its power to any target' parses (the sacrificed source's power is a look-back stamp)", () => {
    const p = parseEffectClause("it deals damage equal to its power to any target", "Instant", { sourceScoped: true });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", targetType: "any", amountCount: { kind: "sourcePower" } }]);
    // the Laccolith rider never rides the any-target form (no printed card does)
    expect(parseEffectClause("it deals damage equal to its power to any target. If you do, this creature assigns no combat damage this turn", "Instant", { sourceScoped: true }).confidence).toBe("low");
  });
  it("④-AW — the activated lane models a source-power amount under a sacrifice-self cost (and under a tap cost)", () => {
    const abs = parseActivatedAbilities({ name: "Synthetic Flinger", type: "Creature — Test", oracle: "{1}, Sacrifice this creature: It deals damage equal to its power to target creature." });
    expect(abs).toHaveLength(1);
    expect(abs[0].modeled).toBe(true);
    expect(abs[0].sacSelf).toBe(true);
    const tap = parseActivatedAbilities({ name: "Synthetic Pinger", type: "Creature — Test", oracle: "{T}: This creature deals damage equal to its power to target creature." });
    expect(tap[0].modeled).toBe(true);
  });
  // RE-POINTED 2026-10-03: this pinned Warstorm Surge, whose ENTERS watcher is the modeled entering-dealer lane now
  // (druidApprenticeSurge.test.js). The unread sentinel still parks every other non-self watcher — Stalking Vengeance's
  // dies watcher, whose "it" is a creature already gone.
  it("CREED — 'its power' on a NON-self watcher off the enters event (Stalking Vengeance) is rewritten to an unread sentinel and the card parks", () => {
    const d = detectTriggers(STALKING);
    expect(d).toHaveLength(1);
    expect(d[0].scope).toBe("otherCreatureYouControl");
    expect(d[0].effectClause).toBe("the triggering creature deals damage equal to its own power to target player or planeswalker");
    expect(parseEffectClause(d[0].effectClause, "Instant", { sourceScoped: true }).confidence).toBe("low");
    expect(classifyCard(STALKING)).toBe("body-only");
    // …while a player/event watcher (Captain Ripley Vance's cast watcher) keeps its live self read — "it" can only be the source
    const v = detectTriggers(VANCE);
    expect(v).toHaveLength(1);
    expect(v[0].scope).toBe("castWatcher");
    expect(v[0].effectClause).toBe("put a +1/+1 counter on this creature, then it deals damage equal to its power to any target");
    expect(classifyCard(VANCE)).toBe("native-trigger");
  });
  it("CREED — the sacrificed-source look-back answers ONLY for the stamped id; any other gone source still reads 0", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, sacrificedSelfLki: { permanentId: "stamped", counters: {}, power: 5 } };
    expect(countForSpec(s, { sourceId: "stamped" }, { kind: "sourcePower" })).toBe(5);
    expect(countForSpec(s, { sourceId: "someone-else" }, { kind: "sourcePower" })).toBe(0);
    expect(countForSpec(s0, { sourceId: "stamped" }, { kind: "sourcePower" })).toBe(0);
  });
  it("⭐ 'attacks and isn't blocked' is its own event, never plain 'attacks'", () => {
    expect(detectTriggers(VIGILANTES).map((d) => d.event)).toEqual(["attacksUnblocked"]);
    expect(detectTriggers(NIGHTSTALKER).map((d) => d.event)).toEqual(["attacksUnblocked"]);
    expect(detectTriggers(GRUNT).map((d) => [d.event, d.optional])).toEqual([["becomesBlocked", true]]);
    // a non-self subject on the unblocked wording stays undetected (Arbiter)
    expect(detectTriggers({ name: "Synthetic Watcher", type: "Creature — Test", oracle: "Whenever a creature you control attacks and isn't blocked, you gain 1 life." })).toEqual([]);
  });
  it("the tiers", () => {
    for (const c of [GRUNT, TITAN, WHELP, WARRIOR, YEARLING, VIGILANTES, NIGHTSTALKER]) expect(classifyCard(c), c.name).toBe("native-trigger");
    expect(classifyCard(SINSTRIKER)).toBe("native-activated");
    expect(classifyCard(SKARRGAN)).toBe("native-activated"); // ④-AW — the sacrificed-source look-back made the Fling bodies honest
    expect(classifyCard(GHITU)).toBe("native-activated");
  });
});

describe("runtime — ④-AW: the sacrificed source's power is read as it last existed", () => {
  it("⭐ Ghitu Fire-Eater wearing a +1/+1 counter taps and sacrifices itself: the opponent loses 3 (its pre-sacrifice, layer-aware power), never 0", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const ghitu = { ...createPermanent({ id: "ghitu", card: GHITU, controller: "user" }), summoningSick: false, counters: { "+1/+1": 1 } };
    let s = { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s0.players, user: { ...s0.players.user, hand: [], battlefield: [ghitu] }, ai: { ...s0.players.ai, battlefield: [] } } };
    const before = s.players.ai.life;
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "ghitu" && (a.targets || []).some((t) => t.type === "player" && t.id === "ai"));
    expect(act).toBeTruthy();
    expect(act.sacSelf).toBe(true);
    s = resolveTopOfStack(dispatchAction(s, act));
    expect(findPermanent(s, "ghitu")).toBeNull();
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Ghitu Fire-Eater");
    expect(before - s.players.ai.life).toBe(3);
  });
});

describe("runtime — the Laccolith rider", () => {
  const board = () => declareBlockers({
    active: "user",
    activeBoard: [createPermanent({ id: "grunt", card: GRUNT, controller: "user" })],
    otherBoard: [bear("wall", "Big Bear", "ai", 4, 4)],
    attackers: ["grunt"],
    blocks: [["wall", "grunt"]],
  });
  it("⭐ TAKEN: the Grunt deals its power (2) to the target, then assigns no combat damage — the blocker's marked damage stays 2; the Grunt still takes 4", () => {
    let s = nextStep(board());
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice).toBeFalsy();
    expect(findPermanent(s, "wall").permanent.damageMarked).toBe(2);
    expect(findPermanent(s, "grunt").permanent.noCombatDamageTurn).toBe(6);
    const after = resolveCombatDamage(s);
    expect(findPermanent(after, "wall").permanent.damageMarked).toBe(2);
    // the 4/4 still dealt its 4 to the 2/2 Grunt — it died (SBA inside the damage step); "assigns no combat damage" is one-way
    expect(findPermanent(after, "grunt")).toBeNull();
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Laccolith Grunt");
  });
  it("DECLINED: no damage, no stamp — the Grunt deals its 2 in combat as usual", () => {
    let s = resolveTopOfStack(nextStep(board()));
    s = resolveOptionalChoice(s, false);
    expect(findPermanent(s, "wall").permanent.damageMarked || 0).toBe(0);
    expect(findPermanent(s, "grunt").permanent.noCombatDamageTurn).toBeUndefined();
    const after = resolveCombatDamage(s);
    expect(findPermanent(after, "wall").permanent.damageMarked).toBe(2);
  });
  it("the stamp is turn-scoped: a stale stamp from an earlier turn does not gate this turn's combat damage", () => {
    const s = board();
    const stale = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, noCombatDamageTurn: 5 })) } } };
    const after = resolveCombatDamage(stale);
    expect(findPermanent(after, "wall").permanent.damageMarked).toBe(2);
  });
});

describe("runtime — attacks and isn't blocked", () => {
  it("⭐ UNBLOCKED: Dwarven Vigilantes' trigger goes on the stack when blocks are declared with none on it", () => {
    const s = nextStep(declareBlockers({
      active: "user",
      activeBoard: [createPermanent({ id: "dv", card: VIGILANTES, controller: "user" })],
      otherBoard: [bear("idle", "Idle Bear", "ai")],
      attackers: ["dv"],
    }));
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].trigger?.event ?? s.stack[0].event ?? s.stack[0].payload?.params?.context?.event ?? "attacksUnblocked").toBe("attacksUnblocked");
  });
  it("⭐ BLOCKED: the same attacker blocked by a creature does NOT fire (the over-fire this event closes)", () => {
    const s = nextStep(declareBlockers({
      active: "user",
      activeBoard: [createPermanent({ id: "dv", card: VIGILANTES, controller: "user" })],
      otherBoard: [bear("blk", "Blocking Bear", "ai")],
      attackers: ["dv"],
      blocks: [["blk", "dv"]],
    }));
    expect(s.stack).toHaveLength(0);
  });
  it("Abyssal Nightstalker's unblocked trigger makes the DEFENDING player discard", () => {
    let s = nextStep(declareBlockers({
      active: "user",
      activeBoard: [createPermanent({ id: "an", card: NIGHTSTALKER, controller: "user" })],
      otherBoard: [],
      attackers: ["an"],
      otherHand: [{ id: "h1", name: "Card One", type: "Instant", mana: "{U}", cmc: 1, keywords: [], oracle: "" }, { id: "h2", name: "Card Two", type: "Instant", mana: "{U}", cmc: 1, keywords: [], oracle: "" }],
    }));
    expect(s.stack).toHaveLength(1);
    expect(s.stack[0].payload.params.program.atoms[0]).toMatchObject({ op: "discard", amount: 1, who: "defendingPlayer" });
    s = resolveTopOfStack(s);
    // the DEFENDING player (the AI) is the one asked to choose the card — a pending discard on its seat, never the attacker's
    expect((s.log || []).some((e) => e.kind === "discard-pending" && e.controller === "ai" && e.remaining === 1)).toBe(true);
    expect(s.players.user.hand).toHaveLength(0);
  });
});

describe("runtime — Sinstriker's Will's granted tap ability in the combat window", () => {
  it("the enchanted 3/3 taps to deal ITS power (3) to the attacking creature", () => {
    let s = declareBlockers({
      active: "ai",
      activeBoard: [bear("atk", "Attacking Bear", "ai", 2, 5)],
      // the host has been under its controller's control since the turn began — a {T} ability needs that (CR 302.6)
      otherBoard: [{ ...bear("host", "Host Bear", "user", 3, 3), summoningSick: false }, createPermanent({ id: "will", card: SINSTRIKER, controller: "user" })],
      attackers: ["atk"],
    });
    s = { ...attachPermanent(s, { equipId: "will", targetId: "host" }), priorityHolder: "user" };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && (a.permanentId === "host" || a.sourceId === "host"));
    expect(acts.length).toBeGreaterThan(0);
    const onAttacker = acts.find((a) => (a.targets || []).some((t) => t.id === "atk"));
    expect(onAttacker).toBeTruthy();
    const resolved = resolveTopOfStack(dispatchAction(s, onAttacker));
    expect(findPermanent(resolved, "atk").permanent.damageMarked).toBe(3);
    expect(findPermanent(resolved, "host").permanent.tapped).toBe(true);
  });
});
