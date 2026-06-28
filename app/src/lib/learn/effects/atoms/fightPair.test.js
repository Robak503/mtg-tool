/**
 * fightPair.test.js — the TWO-CHOSEN-TARGET fight subsystem (branch wave-fightpair).
 *
 * Covers the SPELL/activated forms where the FIGHTER (the dealer) is itself a chosen target, NOT the
 * source (the existing source-bound `fight` atom handles ETB/Enrage triggers; this handles Prey Upon /
 * Pounce / Ulvenwald Tracker / Aggressive Instinct / Rabid Bite):
 *   - applyFightPair          — both chosen creatures deal damage = power to each other, SIMULTANEOUSLY (CR 701.12a)
 *   - applyDamageTargetPower  — ONE-WAY: only the chosen fighter deals (Aggressive Instinct / Rabid Bite)
 * Verified: simultaneous two-way kill, one-sided survival, deathtouch both directions, power read AT
 * RESOLUTION, 0-power no-op, missing/illegal target clean no-op, distinctness (a creature can't fight
 * itself), and the PARSER classifies each named card's clause HIGH with the right op + dual-target spec.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { applyFightPair, applyDamageTargetPower } from "./combat.js";
import { parseEffectClause, parseEffectProgram, atomTargetIntent } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent, addCounter } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

function board(mine = [], theirs = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: mine },
      ai: { ...s.players.ai, battlefield: theirs },
    },
  };
}
const creature = (id, name, power, toughness, extra = {}, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Beast", power, toughness, ...extra }, controller, summoningSick: false });

// Role-tagged targets exactly as targeting.expandAtoms produces them: the controller's creature is the
// "fighter" (dealer), the enemy is the "target" (dealee). Both carry the same atomIndex (one atom).
const pairCtx = (fighterId, targetId, fighterCtl = "user", targetCtl = "ai") => ({
  controller: "user",
  targets: [
    ...(fighterId ? [{ type: "creature", id: fighterId, controller: fighterCtl, role: "fighter", atomIndex: 0 }] : []),
    ...(targetId ? [{ type: "creature", id: targetId, controller: targetCtl, role: "target", atomIndex: 0 }] : []),
  ],
});
const FIGHT_PAIR = { op: "fight-pair", targetType: "creature" };
const DMG_POWER = { op: "damage-target-power", targetType: "creature" };

const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);
const inGy = (s, pid, name) => s.players[pid].graveyard.some((c) => c.name === name);

describe("FIGHT-PAIR resolver — two CHOSEN creatures deal simultaneously (CR 701.12a)", () => {
  it("a 5/4 fighter vs a 3/3 target → both take damage; the 3/3 dies (5≥3), the 5/4 survives (3<4)", () => {
    const fighter = creature("f", "Apex", 5, 4, {}, "user");
    const tgt = creature("t", "Bear", 3, 3, {}, "ai");
    const s = applyFightPair(board([fighter], [tgt]), FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);
    expect(inGy(s, "ai", "Bear")).toBe(true);
    expect(onBf(s, "user", "f")).toBe(true);
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(3);
  });

  it("a 2/2 fighter vs a 2/2 target → BOTH die on one SBA pass (mutual lethality, simultaneous)", () => {
    const s = applyFightPair(board([creature("f", "Mauler", 2, 2, {}, "user")], [creature("t", "Ox", 2, 2, {}, "ai")]), FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "user", "f")).toBe(false);
    expect(onBf(s, "ai", "t")).toBe(false);
  });

  it("a 1/1 fighter vs a 5/5 target → only the fighter dies; its 1 still landed (CR 701.12c)", () => {
    const s = applyFightPair(board([creature("f", "Mouse", 1, 1, {}, "user")], [creature("t", "Giant", 5, 5, {}, "ai")]), FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "user", "f")).toBe(false);
    expect(onBf(s, "ai", "t")).toBe(true);
    expect(findPermanent(s, "t").permanent.damageMarked).toBe(1);
  });

  it("a deathtouch FIGHTER kills any-toughness target (1/1 DT vs 5/5 → the 5/5 dies)", () => {
    const s = applyFightPair(board([creature("f", "Adder", 1, 1, { keywords: ["Deathtouch"] }, "user")], [creature("t", "Giant", 5, 5, {}, "ai")]), FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);     // 1 deathtouch damage is lethal
    expect(onBf(s, "user", "f")).toBe(false);   // the 1/1 took 5 → also dead
  });

  it("a deathtouch TARGET kills the fighter (5/4 vs 1/1 DT → the 5/4 dies)", () => {
    const s = applyFightPair(board([creature("f", "Brute", 5, 4, {}, "user")], [creature("t", "Viper", 1, 1, { keywords: ["Deathtouch"] }, "ai")]), FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "user", "f")).toBe(false);
    expect(onBf(s, "ai", "t")).toBe(false);
  });

  it("power read AT RESOLUTION (buff the fighter with +1/+1 counters before resolving → higher damage)", () => {
    let s = board([creature("f", "Grower", 1, 4, {}, "user")], [creature("t", "Bear", 3, 3, {}, "ai")]);
    s = addCounter(s, { permanentId: "f", type: "+1/+1", amount: 3 }); // now a 4/7
    s = applyFightPair(s, FIGHT_PAIR, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);     // took 4 ≥ 3 → dead (printed-1 would have left it alive)
    expect(onBf(s, "user", "f")).toBe(true);    // 4/7 took 3 < 7 → survives
  });

  it("a missing target (left the battlefield) → clean no-op, no fabricated damage", () => {
    const s = applyFightPair(board([creature("f", "Loner", 4, 4, {}, "user")], []), FIGHT_PAIR, pairCtx("f", null));
    expect(onBf(s, "user", "f")).toBe(true);
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(0);
  });

  it("DISTINCTNESS — the same id for fighter and target never makes a creature fight itself (no-op)", () => {
    const fighter = creature("f", "Solo", 3, 3, {}, "user");
    // Malformed input: both roles point at the same permanent. The resolver drops the second → no fight.
    const s = applyFightPair(board([fighter], []), FIGHT_PAIR, {
      controller: "user",
      targets: [
        { type: "creature", id: "f", controller: "user", role: "fighter", atomIndex: 0 },
        { type: "creature", id: "f", controller: "user", role: "target", atomIndex: 0 },
      ],
    });
    expect(onBf(s, "user", "f")).toBe(true);
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(0);
  });
});

describe("DAMAGE-TARGET-POWER resolver — one-way, only the fighter deals (CR 119)", () => {
  it("a 5/4 fighter deals 5 to a 3/3 target → the 3/3 dies; the fighter takes NOTHING (one-way)", () => {
    const s = applyDamageTargetPower(board([creature("f", "Striker", 5, 4, {}, "user")], [creature("t", "Bear", 3, 3, {}, "ai")]), DMG_POWER, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);
    expect(onBf(s, "user", "f")).toBe(true);
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(0); // the dealer is NEVER dealt back to
  });

  it("a 2/2 fighter deals 2 to a 5/5 target → the 5/5 survives, the fighter is untouched", () => {
    const s = applyDamageTargetPower(board([creature("f", "Nibbler", 2, 2, {}, "user")], [creature("t", "Giant", 5, 5, {}, "ai")]), DMG_POWER, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(true);
    expect(findPermanent(s, "t").permanent.damageMarked).toBe(2);
    expect(onBf(s, "user", "f")).toBe(true);
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(0);
  });

  it("a deathtouch fighter makes any nonzero damage lethal (1/1 DT deals 1 to a 9/9 → it dies)", () => {
    const s = applyDamageTargetPower(board([creature("f", "Asp", 1, 1, { keywords: ["Deathtouch"] }, "user")], [creature("t", "Wurm", 9, 9, {}, "ai")]), DMG_POWER, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);
    expect(onBf(s, "user", "f")).toBe(true); // never dealt back to
  });

  it("a 0-power fighter deals nothing (clean no-op)", () => {
    const s = applyDamageTargetPower(board([creature("f", "Wall", 0, 4, {}, "user")], [creature("t", "Ox", 2, 2, {}, "ai")]), DMG_POWER, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(true);
    expect(findPermanent(s, "t").permanent.damageMarked).toBe(0);
  });

  it("a missing fighter/target → clean no-op", () => {
    const s = applyDamageTargetPower(board([], [creature("t", "Ox", 2, 2, {}, "ai")]), DMG_POWER, pairCtx(null, "t"));
    expect(onBf(s, "ai", "t")).toBe(true);
    expect(findPermanent(s, "t").permanent.damageMarked).toBe(0);
  });
});

describe("FIGHT-PAIR / DAMAGE-TARGET-POWER parser — the named cards classify HIGH", () => {
  it("Prey Upon / Pounce — 'Target creature you control fights target creature you don't control' → HIGH fight-pair", () => {
    const p = parseEffectClause("Target creature you control fights target creature you don't control.", "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "fight-pair", targetType: "creature", role: "target",
      restrictions: [{ kind: "controller", who: "opponent" }],
      secondaryTargetType: "creature", secondaryRole: "fighter",
      secondaryRestrictions: [{ kind: "controller", who: "you" }],
    });
  });

  it("Aggressive Instinct / Rabid Bite — 'deals damage equal to its power to target creature you don't control' → HIGH damage-target-power", () => {
    const p = parseEffectClause("Target creature you control deals damage equal to its power to target creature you don't control.", "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "damage-target-power", role: "target", secondaryRole: "fighter" });
  });

  it("the 'an opponent controls' wording is equivalent (Tenderize / Rocky Rebuke)", () => {
    const p = parseEffectClause("Target creature you control deals damage equal to its power to target creature an opponent controls.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "damage-target-power", restrictions: [{ kind: "controller", who: "opponent" }] });
  });

  it("Ulvenwald Tracker — 'Target creature you control fights another target creature' → HIGH fight-pair (distinct)", () => {
    const p = parseEffectClause("Target creature you control fights another target creature.", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight-pair", distinct: true, secondaryRestrictions: [{ kind: "controller", who: "you" }] });
  });

  it("Clash of Titans / Blood Feud — 'Target creature fights another target creature' (any-side) → HIGH fight-pair", () => {
    const p = parseEffectClause("Target creature fights another target creature.", "Sorcery");
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "fight-pair", distinct: true });
  });

  it("CREED — a RIDER ('or planeswalker', trample-excess) leaves the clause LOW (→ Arbiter)", () => {
    // Bite Down (creature OR planeswalker) and Ram Through (trample-excess) must NOT match — whole-clause `$`.
    expect(parseEffectClause("Target creature you control deals damage equal to its power to target creature or planeswalker you don't control.", "Instant").confidence).toBe("low");
    expect(parseEffectProgram({ type: "Instant", oracle: "Target creature you control deals damage equal to its power to target creature you don't control. If the creature you control has trample, excess damage is dealt to that creature's controller instead." }).confidence).toBe("low");
  });

  it("atomTargetIntent is 'ambiguous' for both ops — gates them OUT of the trigger flush + loyalty-AI (CREED)", () => {
    expect(atomTargetIntent({ op: "fight-pair", targetType: "creature" })).toBe("ambiguous");
    expect(atomTargetIntent({ op: "damage-target-power", targetType: "creature" })).toBe("ambiguous");
  });
});

// ─── End-to-end: the full cast path (legalChoices → dispatch → resolve) + the AI cast chooser ───
import { legalActionsForPlayer, filterActions } from "../../legalChoices.js";
import { dispatchAction } from "../../actionDispatcher.js";
import { resolveTopOfStack } from "../../gameEngine.js";
import { pickAction } from "../../opponentAI.js";

const spellCard = (id, name, oracle, type = "Sorcery") => ({ id, name, type, mana: "{1}{G}", cmc: 2, oracle });
function castState({ userHand = [], userBf = [], aiHand = [], aiBf = [], active = "user" } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0,
    players: {
      ...s.players,
      user: { ...s.players.user, hand: userHand, battlefield: userBf, manaPool: { ...s.players.user.manaPool, C: 8, G: 4 } },
      ai: { ...s.players.ai, hand: aiHand, battlefield: aiBf, manaPool: { ...s.players.ai.manaPool, C: 8, G: 4 } },
    },
  };
}

describe("FIGHT-PAIR — full cast path (the spell is genuinely PLAYABLE, not native-but-unplayable)", () => {
  it("Prey Upon: cast picks a (your-creature, enemy-creature) pair; the fight kills the enemy + your creature survives", () => {
    const s = castState({
      userHand: [spellCard("pu", "Prey Upon", "Target creature you control fights target creature you don't control.")],
      userBf: [creature("mine", "Big", 6, 6, {}, "user")],
      aiBf: [creature("foe", "Bear", 3, 3, {}, "ai")],
    });
    // legalChoices enumerates the two-target cast (fighter you control + enemy you don't); pick the one that
    // pairs OUR creature with the enemy and verify both roles are present + on the right sides.
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "pu" && a.targets?.some((t) => t.role === "fighter" && t.id === "mine") && a.targets?.some((t) => t.role === "target" && t.id === "foe"));
    expect(cast).toBeTruthy();
    let next = resolveTopOfStack(dispatchAction(s, cast));
    while (next.stack.length) next = resolveTopOfStack(next);
    expect(next.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false);   // 6 ≥ 3 → enemy dead
    expect(next.players.user.battlefield.some((p) => p.id === "mine")).toBe(true); // took 3 < 6 → survives
  });

  it("Rabid Bite (one-way): the cast deals the fighter's power to the enemy; the fighter is never hit back", () => {
    const s = castState({
      userHand: [spellCard("rb", "Rabid Bite", "Target creature you control deals damage equal to its power to target creature you don't control.")],
      userBf: [creature("mine", "Striker", 4, 2, {}, "user")],   // only 2 toughness — would DIE to a real fight
      aiBf: [creature("foe", "Bear", 3, 3, {}, "ai")],            // 3 power ≥ the striker's 2 toughness
    });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell")
      .find((a) => a.cardId === "rb" && a.targets?.some((t) => t.role === "target" && t.id === "foe"));
    expect(cast).toBeTruthy();
    let next = resolveTopOfStack(dispatchAction(s, cast));
    while (next.stack.length) next = resolveTopOfStack(next);
    expect(next.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false);   // 4 ≥ 3 → enemy dead
    expect(next.players.user.battlefield.some((p) => p.id === "mine")).toBe(true); // one-way → the 4/2 is UNHARMED
    expect(findPermanent(next, "mine").permanent.damageMarked).toBe(0);
  });

  it("AI casts a PROFITABLE fight (its big creature kills a smaller enemy and survives)", () => {
    const s = castState({
      active: "ai",                                                 // a sorcery is cast on the AI's own turn
      userBf: [creature("victim", "Wolf", 2, 2, {}, "user")],       // the AI's opponent's creature (to kill)
      aiHand: [spellCard("pu", "Prey Upon", "Target creature you control fights target creature you don't control.")],
      aiBf: [creature("aifighter", "Hydra", 5, 5, {}, "ai")],
    });
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).toBe("cast-spell");
    const fighterT = picked.targets.find((t) => t.role === "fighter");
    const targetT = picked.targets.find((t) => t.role === "target");
    expect(fighterT.id).toBe("aifighter");   // the AI fights with ITS OWN creature
    expect(targetT.id).toBe("victim");       // aimed at the opponent's creature
  });

  it("AI HOLDS a suicidal fight (its only fighter would die and not kill) — never a confidently-bad play", () => {
    const s = castState({
      active: "ai",
      userBf: [creature("victim", "Titan", 7, 7, {}, "user")],      // too big to kill + would kill our fighter
      aiHand: [spellCard("pu", "Prey Upon", "Target creature you control fights target creature you don't control.")],
      aiBf: [creature("aifighter", "Cub", 2, 2, {}, "ai")],
    });
    const picked = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(picked?.kind).not.toBe("cast-spell"); // held (pass) — a 2/2 into a 7/7 is suicide for no kill
  });
});
