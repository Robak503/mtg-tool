/**
 * forceAttack.test.js — FORCE-ATTACK-1 (CR 508.1a / 802): "Creatures your opponents control attack this
 * turn if able." (Bident of Thassa's {1}{U},{T} activated ability).
 *
 * The mechanic ships as three pieces, all validated here:
 *   (1) PARSE — the force-attack clause parses HIGH to the `force-attack` atom (parseEffectClause), and every
 *       near-miss referent (targeted / filtered / different directive) stays LOW → Arbiter (CREED — never
 *       widen or narrow the printed "your opponents control" scope).
 *   (2) RESOLVE — applyForceAttack stamps a turn-scoped `forcedToAttackTurn[opponentId] = state.turn` for each
 *       opponent of the activator, self-expiring the moment the turn advances.
 *   (3) ENFORCE — opponentAI.pickAttackPlan force-declares EVERY able attacker for a seat under an active force
 *       this turn, even the racer's unprofitable ones (a REQUIREMENT, not a restriction, CR 508.1a).
 *
 * Recognition without enforcement would over-permit the illegal "don't attack", so all three ship together —
 * and classifyCard now flips Bident of Thassa to a native tier (native-mixed: the combat-damage may-draw
 * trigger + this activated ability, both modeled).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { pickAttackPlan } from "./opponentAI.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BIDENT_ORACLE =
  "Whenever a creature you control deals combat damage to a player, you may draw a card.\n{1}{U}, {T}: Creatures your opponents control attack this turn if able.";

describe("FORCE-ATTACK-1 — parse", () => {
  it("the force-attack clause parses HIGH to the force-attack atom", () => {
    const p = parseEffectClause("Creatures your opponents control attack this turn if able.", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "force-attack", who: "opponents", targetType: null }]);
  });

  it("CREED near-misses stay LOW (→ Arbiter) — never a widened/narrowed referent", () => {
    for (const near of [
      "Creatures target opponent controls attack this turn if able.",       // targeted referent (a different, chosen scope)
      "Nonblue creatures your opponents control attack this turn if able.",  // filtered subject
      "Creatures your opponents control can't block this turn.",            // a different directive entirely
      "Creatures your opponents control attack this turn if able and can't block.", // rider
    ]) {
      expect(programConfidence(parseEffectClause(near, "Instant"))).toBe("low");
    }
  });
});

describe("FORCE-ATTACK-1 — resolve (applyForceAttack stamps a turn-scoped latch)", () => {
  it("stamps forcedToAttackTurn for every opponent of the activator, and self-expires next turn", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const state = { ...g, turn: 5 };
    const atom = { op: "force-attack", who: "opponents", targetType: null };
    const after = resolveAtom(state, atom, { controller: "user" });
    // "user"'s only opponent is "ai" → forced this turn; the activator itself is never stamped.
    expect(after.forcedToAttackTurn).toEqual({ ai: 5 });
    // Self-expires: the enforcement compares === state.turn, so on turn 6 the stamp no longer matches.
    expect(after.forcedToAttackTurn.ai === after.turn).toBe(true);
    expect(after.forcedToAttackTurn.ai === 6).toBe(false);
  });

  it("a removed/eliminated activator is a clean no-op (no stamp, no throw)", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const after = resolveAtom(g, { op: "force-attack", who: "opponents", targetType: null }, { controller: "ghost" });
    expect(after.forcedToAttackTurn).toBeUndefined();
  });
});

describe("FORCE-ATTACK-1 — enforcement in pickAttackPlan", () => {
  // "ai" (the seat declaring attackers) has an unprofitable 1/1 into a 3/3 blocker: the racer holds it back.
  // A force-attack on "ai" this turn (activated by "user", ai's opponent) must force it to attack anyway.
  function board({ forced = false } = {}) {
    const atk = createPermanent({ id: "atk", card: { name: "Goblin", type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" }, controller: "ai", summoningSick: false });
    const blk = createPermanent({ id: "blk", card: { name: "Ogre", type: "Creature — Ogre", power: 3, toughness: 3, oracle: "" }, controller: "user", summoningSick: false });
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...g, activePlayer: "ai", priorityHolder: "ai", phase: "combat", step: "declare-attackers", turn: 3,
      players: { ...g.players, ai: { ...g.players.ai, battlefield: [atk], life: 20 }, user: { ...g.players.user, battlefield: [blk], life: 20 } },
    };
    return forced ? { ...s, forcedToAttackTurn: { ai: 3 } } : s;
  }
  const planFor = (s) => pickAttackPlan(s, "ai", legalActionsForPlayer(s, "ai").filter((a) => a.kind === "declare-attacker"));

  it("force-declares an unprofitable attacker when the seat is under an active force this turn", () => {
    expect(planFor(board({ forced: true })).some((a) => a.permanentId === "atk")).toBe(true);
  });

  it("isolates the force-include: the same unprofitable 1/1 is held back with no force", () => {
    expect(planFor(board({ forced: false })).some((a) => a.permanentId === "atk")).toBe(false);
  });

  it("a STALE force (a prior turn's stamp) does NOT apply — the racer holds back", () => {
    const s = board({ forced: false });
    s.forcedToAttackTurn = { ai: 2 };   // stamped turn 2; it's turn 3 now → expired
    expect(planFor(s).some((a) => a.permanentId === "atk")).toBe(false);
  });

  it("a SUMMONING-SICK creature is not force-declared (it isn't 'able' → not in the eligible set)", () => {
    const s = board({ forced: true });
    s.players.ai.battlefield[0].summoningSick = true;
    expect(planFor(s).some((a) => a.permanentId === "atk")).toBe(false);
  });
});

describe("FORCE-ATTACK-1 — classification flip (Bident of Thassa)", () => {
  it("Bident of Thassa flips to a native tier (native-mixed: modeled trigger + modeled activated ability)", () => {
    const bident = { name: "Bident of Thassa", type: "Legendary Enchantment Artifact", mana: "{2}{U}{U}", oracle: BIDENT_ORACLE };
    expect(classifyCard(bident)).toBe("native-mixed");
  });

  it("CREED boundary: swap the modeled activated ability for an unmodeled scope → body-only (whole card parks)", () => {
    const nearMiss = {
      name: "Faux Bident", type: "Legendary Enchantment Artifact", mana: "{2}{U}{U}",
      oracle: "Whenever a creature you control deals combat damage to a player, you may draw a card.\n{1}{U}, {T}: Creatures target opponent controls attack this turn if able.",
    };
    expect(classifyCard(nearMiss)).toBe("body-only");
  });
});
