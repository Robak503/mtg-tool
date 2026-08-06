/**
 * KOGLA, THE TITAN APE — two seams needed to flip the whole card to native (native-mixed):
 *
 *   (block 1) ATTACK TRIGGER — "Whenever Kogla attacks, destroy target artifact or enchantment defending
 *     player controls." A DEFENDING-PLAYER-scoped destroy (CR 509.1a — the attacked player). The destroy atom
 *     carries a controller restriction who:"defendingPlayer" (the enumerator scopes the pool to ctx.defenderId,
 *     threaded from an attacks trigger by triggers.checkAttackTriggers) AND an atom-level who:"defendingPlayer"
 *     so the combat-referent gate (triggerRouting.combatDamageReferentSatisfied) pins it to the ATTACKS event.
 *     On any other event ctx.defenderId is unset → the pool is empty → the trigger drops no-target (SAFE, CREED);
 *     in multiplayer the pool is EXACTLY the defending player's permanents, never "any opponent's".
 *
 *   (block 2) ACTIVATED ABILITY — "{1}{G}: Return target Human you control to its owner's hand. Kogla gains
 *     indestructible until end of turn." A SUBTYPE-scoped, you-control creature bounce (Human) + a self
 *     indestructible grant. The self-name "Kogla" normalizes to "this creature" (parseActivatedAbilities'
 *     normalizeSelfName), so the pump half already parsed; the new seam is the subtype-creature bounce.
 *
 * Corpus flip-diff: +2 (Kogla → native-mixed; Spectral Shepherd → native-activated, its "{1}{U}: Return
 * target Spirit you control to its owner's hand" bounce), 0 regressions.
 *
 * CREED near-misses: a non-curated subtype ("Dragon"), an opponent-scoped / unscoped subtype bounce, a
 * bare-creature "defending player controls" destroy, and the destroy on a NON-attacks event all stay LOW /
 * non-native — a partial model is a forbidden FP.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { expandCastChoices } from "./effects/targeting.js";
import { classifyCard } from "./coverage.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const conf = (clause) => { const p = parseEffectClause(clause, "Instant"); return p ? programConfidence(p) : "none"; };
const atom0 = (clause) => parseEffectClause(clause, "Instant")?.atoms?.[0];

// The real Scryfall oracle text (verified).
const KOGLA_ORACLE =
  "When Kogla enters, it fights up to one target creature you don't control.\n" +
  "Whenever Kogla attacks, destroy target artifact or enchantment defending player controls.\n" +
  "{1}{G}: Return target Human you control to its owner's hand. Kogla gains indestructible until end of turn.";

// ───────────────────────── PARSE ─────────────────────────
describe("Kogla parse — the two new seams", () => {
  it("block 1: 'destroy target artifact or enchantment defending player controls' → destroy / defendingPlayer scope", () => {
    expect(atom0("destroy target artifact or enchantment defending player controls")).toMatchObject({
      op: "destroy",
      targetType: "artifactOrEnchantment",
      who: "defendingPlayer",
      restrictions: [{ kind: "controller", who: "defendingPlayer" }],
    });
    expect(conf("destroy target artifact or enchantment defending player controls")).toBe("high");
  });

  it("block 2: 'Return target Human you control to its owner's hand' → bounce/creature + subtype + you-control", () => {
    expect(atom0("Return target Human you control to its owner's hand")).toMatchObject({
      op: "bounce",
      targetType: "creature",
      restrictions: [{ kind: "subtype", subtype: "Human" }, { kind: "controller", who: "you" }],
    });
  });

  it("block 2 compound: the whole activated effect (bounce + self indestructible) parses HIGH", () => {
    const p = parseEffectClause("Return target Human you control to its owner's hand. This creature gains indestructible until end of turn.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["bounce", "pump"]);
  });

  it("the activated ability parses `modeled` off the real card (self-name 'Kogla' → 'this creature')", () => {
    const abilities = parseActivatedAbilities({ name: "Kogla, the Titan Ape", type: "Legendary Creature — Ape", oracle: KOGLA_ORACLE });
    expect(abilities).toHaveLength(1);
    expect(abilities[0].modeled).toBe(true);
    expect(abilities[0].program.atoms.map((a) => a.op)).toEqual(["bounce", "pump"]);
  });

  it("CREED: non-curated subtype / mis-scoped / unscoped bounce & bare-creature destroy all stay LOW", () => {
    expect(conf("Return target Dragon you control to its owner's hand")).toBe("low");        // non-curated subtype
    expect(conf("Return target Human an opponent controls to its owner's hand")).toBe("low"); // opponent scope unmatched
    expect(conf("Return target Human to its owner's hand")).toBe("low");                      // no control scope
    // ⚠️ THE FOURTH LINE HERE ASSERTED `destroy target creature defending player controls` STAYS LOW,
    // reason given: "creature not in destroy typelist". That was true of the PERMANENT lane's type map and
    // is no longer the whole story — DP-TGT taught parseCreatureTargetRestrictions the defending-player
    // scope, so the clause now parses through the CREATURE lane to an atom structurally identical to its
    // already-shipped opponent sibling: {op:"destroy", targetType:"creature",
    // restrictions:[{controller/defendingPlayer}]}. That is correct, not an over-reach — the restriction
    // evaluator has always read this referent and fails closed without it.
    // ⛔ WHAT KEEPS IT HONEST IS THE ROUTING GATE, and this atom is exactly why that gate had to change:
    // it carries the referent in its RESTRICTIONS, not in atom.who, so the old check could not see it.
    // Asserted positively here rather than deleted, because the parse is the evidence.
    expect(conf("destroy target creature defending player controls")).toBe("high");
  });
});

// ───────────────────────── DETECTION + ROUTING ─────────────────────────
describe("Kogla attacks-trigger detection + routing (defendingPlayer destroy)", () => {
  const trig = (oracle) => detectTriggers({ name: "Kogla, the Titan Ape", type: "Legendary Creature — Ape", oracle, mana: "{3}{G}{G}" });

  it("detects the attacks trigger and routes it natively", () => {
    const d = trig("Whenever Kogla attacks, destroy target artifact or enchantment defending player controls.")
      .find((t) => t.event === "attacks");
    expect(d).toBeTruthy();
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("CREED referent gate: the SAME destroy does NOT route on a non-attacks event (defenderId unset → clause would drop)", () => {
    const clause = "destroy target artifact or enchantment defending player controls";
    expect(triggerRoutesNatively({ event: "etb", scope: "self", whose: "any", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "combatDamageToPlayer", scope: "self", whose: "any", effectClause: clause })).toBe(false);
    expect(triggerRoutesNatively({ event: "attacks", scope: "self", whose: "any", effectClause: clause })).toBe(true);
  });
});

// ───────────────────────── CLASSIFICATION (corpus flips) ─────────────────────────
describe("classifyCard — Kogla flips whole-card to native-mixed", () => {
  it("Kogla, the Titan Ape → native-mixed (ETB fight + attacks destroy + activated bounce/indestructible)", () => {
    expect(classifyCard({ name: "Kogla, the Titan Ape", type: "Creature — Legendary Ape", oracle: KOGLA_ORACLE, mana: "{3}{G}{G}", power: "7", toughness: "6" }))
      .toBe("native-mixed");
  });

  it("sibling: Spectral Shepherd (Flying + '{1}{U}: Return target Spirit you control …') → native-activated", () => {
    expect(classifyCard({ name: "Spectral Shepherd", type: "Creature — Spirit", oracle: "Flying\n{1}{U}: Return target Spirit you control to its owner's hand.", mana: "{2}{U}", power: "1", toughness: "3" }))
      .toBe("native-activated");
  });

  it("CREED: a non-curated-subtype bounce ability keeps the card body-only", () => {
    // "Return target Dragon you control …" is not in the curated allowlist → the activated ability is unmodeled.
    expect(classifyCard({ name: "Fake Drake Herder", type: "Creature — Human Wizard", oracle: "{1}{U}: Return target Dragon you control to its owner's hand.", mana: "{2}{U}", power: "2", toughness: "2" }))
      .toBe("body-only");
  });
});

// ───────────────────────── RUNTIME ─────────────────────────
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

describe("runtime: Kogla's attacks trigger destroys the DEFENDING player's artifact/enchantment", () => {
  it("declare attack → resolve → the defending player's enchantment is destroyed", () => {
    const kogla = permObj(
      { id: "card-k", name: "Kogla, the Titan Ape", type: "Legendary Creature — Ape", power: 7, toughness: 6,
        oracle: "Whenever Kogla attacks, destroy target artifact or enchantment defending player controls." },
      "user", "perm-k", { tapped: true },
    );
    const enemyEnch = permObj({ id: "c-e", name: "Enemy Aura", type: "Enchantment", type_line: "Enchantment" }, "ai", "perm-e");
    const state = placePerms(
      stateWith({ phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "perm-k", attackingPlayer: "user", defender: "ai" }], blockers: [] } }),
      [kogla, enemyEnch],
    );
    const out = runStepActions(state);
    const trig = triggerOnStack(out);
    expect(trig).toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.context.defenderId).toBe("ai");
    expect(trig.targets.map((t) => t.id)).toEqual(["perm-e"]);
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.ai.battlefield.some((p) => p.id === "perm-e")).toBe(false); // destroyed
  });

  it("multiplayer CREED: only the DEFENDING opponent's permanent is a legal target, never another opponent's", () => {
    const prog = parseEffectClause("destroy target artifact or enchantment defending player controls", "Instant");
    const perm = (id, controller, tl) => permObj({ id: `c-${id}`, name: id, type: tl, type_line: tl }, controller, id);
    const state = {
      players: {
        user: { battlefield: [] },
        ai: { battlefield: [perm("e-ai", "ai", "Enchantment")] },
        ai2: { battlefield: [perm("a-ai2", "ai2", "Artifact")] }, // a NON-defending opponent's artifact
      },
      stack: [], combat: {},
    };
    // defenderId=ai → only ai's enchantment; ai2's artifact is NOT offered.
    const withDefender = expandCastChoices(state, "user", prog, [], { defenderId: "ai" });
    expect(withDefender.map((c) => c.targets.map((t) => t.id))).toEqual([["e-ai"]]);
    // No defenderId (a spell / non-attack path) → empty → the trigger drops no-target (SAFE, never mis-scoped).
    expect(expandCastChoices(state, "user", prog)).toEqual([]);
  });
});

describe("runtime: Kogla's activated bounce offers only OWN Humans", () => {
  it("only the controller's own Human is a legal bounce target (never opponent's, never own non-Human)", () => {
    const prog = parseEffectClause("Return target Human you control to its owner's hand", "Instant");
    const perm = (id, controller, tl) => permObj({ id: `c-${id}`, name: id, type: tl, type_line: tl }, controller, id);
    const state = {
      players: {
        user: { battlefield: [perm("h-user", "user", "Creature — Human"), perm("b-user", "user", "Creature — Beast")] },
        ai: { battlefield: [perm("h-ai", "ai", "Creature — Human")] },
      },
      stack: [], combat: {},
    };
    const combos = expandCastChoices(state, "user", prog);
    expect(combos.map((c) => c.targets.map((t) => t.id))).toEqual([["h-user"]]);
  });
});
