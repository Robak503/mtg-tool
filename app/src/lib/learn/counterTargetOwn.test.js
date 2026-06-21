/**
 * COUNTER-TARGET-OWN — "put a +1/+1 counter on target creature you control" (Merfolk Skydiver,
 * Kujar Seedsculptor, Yotian Dissident, Odric's Outrider, Ornery Kudu, Channeler Initiate, …) and
 * the -1/-1 drawback form "put a -1/-1 counter on target creature you control" (Baleful Ammit ETB).
 *
 * The "you control" filter restricts the target set to the controller's own creatures — modeled as
 * targetType:"creatureYouControl" so that:
 *  - enumerateTargets only surfaces legal own-side targets (correctness gate)
 *  - atomTargetIntent always returns "own" regardless of counterType (so Baleful Ammit's -1/-1
 *    routes to an own creature instead of triggering the -1/-1 → "enemy" heuristic for bare form)
 *
 * CREED: bare "target creature" (opponent-enemy -1/-1) is unchanged; "you control" forms route
 * only to the controller's side in both the parser, the chooser, and the enumerator.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

// ─── Parser ──────────────────────────────────────────────────────────────────

describe("COUNTER-TARGET-OWN — parser", () => {
  it("parses '+1/+1 you control' → high, creatureYouControl", () => {
    const r = parseEffectClause("put a +1/+1 counter on target creature you control", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl" }] });
  });

  it("parses 'two +1/+1 you control' → amount 2", () => {
    const r = parseEffectClause("put two +1/+1 counters on target creature you control", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "+1/+1", amount: 2, targetType: "creatureYouControl" }] });
  });

  it("parses '-1/-1 you control' → creatureYouControl (Baleful Ammit form)", () => {
    const r = parseEffectClause("put a -1/-1 counter on target creature you control", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "creatureYouControl" }] });
  });

  it("bare 'target creature' still parses → targetType creature (unchanged)", () => {
    const r = parseEffectClause("put a +1/+1 counter on target creature", "Instant");
    expect(r.atoms[0].targetType).toBe("creature");
  });
});

// ─── atomTargetIntent ────────────────────────────────────────────────────────

describe("COUNTER-TARGET-OWN — atomTargetIntent", () => {
  it("+1/+1 creatureYouControl → own", () => {
    expect(atomTargetIntent({ op: "add-counter", counterType: "+1/+1", targetType: "creatureYouControl" })).toBe("own");
  });

  it("-1/-1 creatureYouControl → own (overrides counterType heuristic)", () => {
    expect(atomTargetIntent({ op: "add-counter", counterType: "-1/-1", targetType: "creatureYouControl" })).toBe("own");
  });

  it("+1/+1 bare creature → own (unchanged)", () => {
    expect(atomTargetIntent({ op: "add-counter", counterType: "+1/+1", targetType: "creature" })).toBe("own");
  });

  it("-1/-1 bare creature → enemy (unchanged)", () => {
    expect(atomTargetIntent({ op: "add-counter", counterType: "-1/-1", targetType: "creature" })).toBe("enemy");
  });
});

// ─── enumerateTargets ────────────────────────────────────────────────────────

describe("COUNTER-TARGET-OWN — enumerateTargets", () => {
  function stateWith() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const userBear = createPermanent({ id: "u1", card: { id: "cu1", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, controller: "user" });
    const aiGoblin = createPermanent({ id: "a1", card: { id: "ca1", name: "Goblin", type: "Creature — Goblin", oracle: "", power: 1, toughness: 1 }, controller: "ai" });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [userBear] },
        ai: { ...s.players.ai, battlefield: [aiGoblin] },
      },
    };
  }

  it("creatureYouControl only surfaces own creatures", () => {
    const state = stateWith();
    const targets = enumerateTargets(state, "user", { kind: "damage", targetType: "creatureYouControl" });
    expect(targets).toHaveLength(1);
    expect(targets[0].controller).toBe("user");
    expect(targets[0].name).toBe("Bear");
  });

  it("bare 'creature' surfaces both own and opponent (unchanged)", () => {
    const state = stateWith();
    const targets = enumerateTargets(state, "user", { kind: "damage", targetType: "creature" });
    expect(targets).toHaveLength(2);
  });
});

// ─── Coverage flips ───────────────────────────────────────────────────────────

describe("COUNTER-TARGET-OWN — coverage flips", () => {
  it("ETB trigger '+1/+1 on target creature you control' flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Merfolk Wizard",
      name: "Test Skydiver",
      mana: "{1}{U}",
      oracle: "When Test Skydiver enters, put a +1/+1 counter on target creature you control.",
    })).toBe("native-trigger");
  });

  it("ETB trigger 'two +1/+1 counters on target creature you control' flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Elf Druid",
      name: "Test Seedsculptor",
      mana: "{1}{G}",
      oracle: "When Test Seedsculptor enters, put two +1/+1 counters on target creature you control.",
    })).toBe("native-trigger");
  });

  it("Baleful-Ammit-style ETB '-1/-1 on target creature you control' flips native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Zombie Crocodile",
      name: "Test Ammit",
      mana: "{2}{B}",
      oracle: "When Test Ammit enters, put a -1/-1 counter on target creature you control.",
    })).toBe("native-trigger");
  });

  it("bare 'put a +1/+1 counter on target creature' (no you control) stays native-trigger (unchanged)", () => {
    expect(classifyCard({
      type: "Creature — Human Warrior",
      name: "Test Warrior",
      mana: "{1}{W}",
      oracle: "When Test Warrior enters, put a +1/+1 counter on target creature.",
    })).toBe("native-trigger");
  });
});

// ─── Engine ──────────────────────────────────────────────────────────────────

describe("COUNTER-TARGET-OWN — engine", () => {
  function stateWith({ userCreature = null } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const uBf = userCreature ? [createPermanent({ id: "uc1", card: { id: "cc1", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, controller: "user" })] : [];
    const aBf = [createPermanent({ id: "ac1", card: { id: "cca1", name: "Goblin", type: "Creature — Goblin", oracle: "", power: 1, toughness: 1 }, controller: "ai" })];
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: uBf },
        ai: { ...s.players.ai, battlefield: aBf },
      },
    };
  }

  it("+1/+1 counter placed on own creature, not opponent's", () => {
    const state = stateWith({ userCreature: true });
    const atom = { op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl" };
    const ctx = { controller: "user", targets: [{ type: "creature", id: "uc1", controller: "user" }] };
    const next = resolveAtom(state, atom, ctx);

    const ownCreature = next.players.user.battlefield[0];
    const aiGoblin = next.players.ai.battlefield[0];
    // Own creature gained the counter
    expect(ownCreature?.counters?.["+1/+1"] ?? 0).toBe(1);
    // Opponent's creature unchanged
    expect(aiGoblin?.counters?.["+1/+1"] ?? 0).toBe(0);
  });

  it("-1/-1 counter (Baleful Ammit form) placed on own creature", () => {
    const state = stateWith({ userCreature: true });
    const atom = { op: "add-counter", counterType: "-1/-1", amount: 1, targetType: "creatureYouControl" };
    const ctx = { controller: "user", targets: [{ type: "creature", id: "uc1", controller: "user" }] };
    const next = resolveAtom(state, atom, ctx);

    // Own creature may be dead after SBA (Bear 2/2 - -1/-1 → 1/1, still alive). Check opponent untouched.
    const aiGoblin = next.players.ai.battlefield[0];
    expect(aiGoblin?.counters?.["-1/-1"] ?? 0).toBe(0);
  });
});
