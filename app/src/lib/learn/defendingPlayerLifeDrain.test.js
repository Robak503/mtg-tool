/**
 * DEFENDING-PLAYER life drain (CR 509.1a — the attacked player) on ATTACKS triggers.
 *
 * "Whenever this creature attacks, defending player loses N life" (Silent Skimmer / Spiteful Returned /
 * Leeching Sliver) and the compound "…loses N life and you gain N life" (Agate-Blade Assassin / Campaign of
 * Vengeance / Brutal Hordechief). The loss half is a NEW who:"defendingPlayer" lose-life atom that reads
 * ctx.defenderId — the per-attacker defending player carried by triggers.checkAttackTriggers. The gain half is
 * the existing who:"controller" gain-life atom (resolves on any event). The combat-referent gate in
 * triggerRouting.js restricts the defendingPlayer referent to the ATTACKS event: a spell / non-attack trigger
 * leaves it unset → the clause would silently drop → kept on the Arbiter (a SAFE false-negative, CREED).
 *
 * Corpus flip-diff: +4 clean (Silent Skimmer, Leeching Sliver, Agate-Blade Assassin, Campaign of Vengeance),
 * 0 regressions. The other cards in the pattern (Spiteful Returned — Bestow + static; Brutal Hordechief —
 * a block-forcing activated ability; Fumulus — a sacrifice trigger) carry OTHER unmodeled abilities and
 * correctly STAY body-only (CREED — the whole-card gate, never an over-claim).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard, spellIsNative } from "./coverage.js";
import { passPriority, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const C = (type, oracle, over = {}) => ({ type, oracle, mana: "{2}", name: "X", power: "2", toughness: "2", ...over });
const atom0 = (clause) => parseEffectClause(clause, "Instant")?.atoms?.[0];
const conf = (clause) => { const p = parseEffectClause(clause, "Instant"); return p ? programConfidence(p) : "none"; };

// ───────────────────────── PARSE ─────────────────────────
describe("defendingPlayer life parse", () => {
  it("'defending player loses N life' → lose-life / defendingPlayer / non-targeted", () => {
    expect(atom0("defending player loses 2 life")).toMatchObject({ op: "lose-life", who: "defendingPlayer", amount: 2, targetType: null });
    expect(atom0("defending player loses 1 life")).toMatchObject({ op: "lose-life", who: "defendingPlayer", amount: 1, targetType: null });
  });

  it("'defending player gains N life' → gain-life / defendingPlayer / non-targeted", () => {
    expect(atom0("defending player gains 3 life")).toMatchObject({ op: "gain-life", who: "defendingPlayer", amount: 3, targetType: null });
  });

  it("the compound 'loses N and you gain N' parses HIGH as two atoms (defendingPlayer loss + controller gain)", () => {
    const p = parseEffectClause("defending player loses 1 life and you gain 1 life", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "lose-life", who: "defendingPlayer", amount: 1 });
    expect(p.atoms[1]).toMatchObject({ op: "gain-life", amount: 1 }); // who:"controller" (default)
  });

  it("CREED: a scaled / rider variant stays LOW → Arbiter (anchored, never half-resolved)", () => {
    // "equal to the number of …" is a scaled count this atom does not model (Generous Plunderer's attack rider).
    expect(conf("defending player loses life equal to the number of artifacts they control")).toBe("low");
    // an unmodeled rider clause past the loss leaves the whole program LOW.
    expect(conf("defending player loses 2 life, then exile the top card of their library")).toBe("low");
  });
});

// ───────────────────────── DETECTION + ROUTING ─────────────────────────
describe("defendingPlayer attacks-trigger detection + routing", () => {
  const trig = (oracle, type = "Creature — Bear") => detectTriggers({ name: "X", type, oracle, mana: "{2}" });

  it("detects the attacks trigger and routes it natively (self)", () => {
    const d = trig("Whenever this creature attacks, defending player loses 2 life.")[0];
    expect(d).toMatchObject({ event: "attacks", scope: "self" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("routes the compound loss+gain natively", () => {
    const d = trig("Whenever this creature attacks, defending player loses 1 life and you gain 1 life.")[0];
    expect(d).toMatchObject({ event: "attacks" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("CREED referent gate: the SAME defendingPlayer effect does NOT route on a non-attacks event", () => {
    // Manually pose a combat-damage descriptor carrying the defendingPlayer effect — the referent (ctx.defenderId)
    // is unset on combatDamageToPlayer, so the clause would silently drop → must NOT route.
    const fakeCdmg = { event: "combatDamageToPlayer", scope: "self", whose: "any", effectClause: "defending player loses 2 life" };
    expect(triggerRoutesNatively(fakeCdmg)).toBe(false);
    // And on an ETB / upkeep it likewise must not route.
    expect(triggerRoutesNatively({ event: "etb", scope: "self", whose: "any", effectClause: "defending player loses 2 life" })).toBe(false);
    expect(triggerRoutesNatively({ event: "upkeep", scope: "you", whose: "yours", effectClause: "defending player loses 2 life" })).toBe(false);
  });
});

// ───────────────────────── CLASSIFICATION (corpus flips) ─────────────────────────
describe("classifyCard — defendingPlayer flips", () => {
  // Real oracle text (Scryfall-verified) for the four corpus flips.
  it("Silent Skimmer (attacks → defender loses 2) → native-trigger", () => {
    expect(classifyCard(C("Creature — Eldrazi Drone", "Devoid (This card has no color.)\nFlying\nWhenever this creature attacks, defending player loses 2 life.", { power: "0", toughness: "4" }))).toBe("native-trigger");
  });
  it("Leeching Sliver (a Sliver you control attacks → defender loses 1) → native-trigger", () => {
    expect(classifyCard(C("Creature — Sliver", "Whenever a Sliver you control attacks, defending player loses 1 life.", { power: "1", toughness: "1" })))
      .toBe("native-trigger");
  });
  it("Agate-Blade Assassin (attacks → defender loses 1, you gain 1) → native-trigger", () => {
    expect(classifyCard(C("Creature — Lizard Assassin", "Whenever this creature attacks, defending player loses 1 life and you gain 1 life.", { power: "1", toughness: "3" })))
      .toBe("native-trigger");
  });
  it("Campaign of Vengeance (a creature you control attacks → defender loses 1, you gain 1) → native-trigger", () => {
    expect(classifyCard(C("Enchantment", "Whenever a creature you control attacks, defending player loses 1 life and you gain 1 life.", { power: null, toughness: null })))
      .toBe("native-trigger");
  });

  it("CREED: a card whose OTHER ability is unmodeled stays body-only (Brutal Hordechief's block-forcer)", () => {
    expect(classifyCard(C("Creature — Orc Warrior",
      "Whenever a creature you control attacks, defending player loses 1 life and you gain 1 life.\n{3}{R/W}{R/W}: Creatures your opponents control block this turn if able, and you choose how those creatures block.",
      { power: "3", toughness: "3" }))).toBe("body-only");
  });

  it("CREED: a SPELL carrying the defendingPlayer referent is NOT native (a spell never supplies ctx.defenderId)", () => {
    expect(spellIsNative(C("Sorcery", "Defending player loses 2 life."))).toBe(false);
  });
});

// ───────────────────────── RUNTIME (declare attack → trigger fires → effect) ─────────────────────────
function creature(name, oracle, extra = {}) {
  return { id: `card-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle, ...extra };
}
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}
const triggerOnStack = (state) => (state.stack || []).find((s) => s.kind === "triggered-ability");

describe("runtime: attacking fires the defendingPlayer drain on the RIGHT player", () => {
  it("declare attack → resolve → the DEFENDING player (not the attacker) loses 2 life", () => {
    const skimmer = permObj(creature("Skimmer", "Whenever Skimmer attacks, defending player loses 2 life.", { id: "card-s" }), "user", "perm-s", { tapped: true });
    const state = placePerms(
      stateWith({ phase: "combat", step: "declare-attackers", activePlayer: "user", combat: { attackers: [{ permanentId: "perm-s", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [skimmer],
    );
    // RE-POINTED (the attack-trigger timing fix, CR 508.1m / 508.2): the attack trigger fires when the declaration closes — the
    // active player's first pass of the declare attackers step — not at the declare-blockers step entry.
    const out = passPriority(state);
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.program.atoms[0]).toMatchObject({ op: "lose-life", who: "defendingPlayer" });
    // defender context threaded
    expect(trig.payload.params.context.defenderId).toBe("ai");
    const aiBefore = out.players.ai.life;
    const userBefore = out.players.user.life;
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.ai.life).toBe(aiBefore - 2); // the DEFENDER lost life
    expect(resolved.players.user.life).toBe(userBefore);  // the attacker's controller is untouched
  });

  it("compound: defender loses 1 AND the attacker's controller gains 1", () => {
    const assassin = permObj(creature("Assassin", "Whenever Assassin attacks, defending player loses 1 life and you gain 1 life.", { id: "card-a" }), "user", "perm-a", { tapped: true });
    const state = placePerms(
      stateWith({ phase: "combat", step: "declare-attackers", activePlayer: "user", combat: { attackers: [{ permanentId: "perm-a", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [assassin],
    );
    const out = passPriority(state); // RE-POINTED: the declaration closes at the active player's first pass (see above)
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    const ops = trig.payload.params.program.atoms.map((a) => a.op);
    expect(ops).toEqual(["lose-life", "gain-life"]);
    const aiBefore = out.players.ai.life;
    const userBefore = out.players.user.life;
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.ai.life).toBe(aiBefore - 1);
    expect(resolved.players.user.life).toBe(userBefore + 1);
  });

  it("checkAttackTriggers threads the per-attacker defender (multi-defender Commander shape)", () => {
    // Two attackers, two different defenders — each defendingPlayer trigger must carry ITS attacker's defender,
    // so in 4-player Commander the loss lands on the player THAT creature attacked (CR 509.1a), per attacker.
    const a1 = permObj(creature("A1", "Whenever A1 attacks, defending player loses 2 life.", { id: "card-a1" }), "user", "perm-a1", { tapped: true });
    const a2 = permObj(creature("A2", "Whenever A2 attacks, defending player loses 2 life.", { id: "card-a2" }), "user", "perm-a2", { tapped: true });
    let state = stateWith({ combat: { attackers: [
      { permanentId: "perm-a1", attackingPlayer: "user", defender: "ai" },
      { permanentId: "perm-a2", attackingPlayer: "user", defender: "ai2" },
    ], blockers: [] } });
    // add a third seat so both defenders are real players
    state = { ...state, turnOrder: ["user", "ai", "ai2"], players: { ...state.players, ai2: { ...state.players.ai, battlefield: [] } } };
    state = placePerms(state, [a1, a2]);
    const out = checkAttackTriggers(state);
    const defenders = out.pendingTriggers.map((t) => t.payload.params.context.defenderId).sort();
    expect(defenders).toEqual(["ai", "ai2"]);
  });
});
