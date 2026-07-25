/**
 * TAP-TARGET-CREATURE — "tap target creature [restriction]" effects now parse HIGH.
 * Previously only the bare exact form "tap target creature." was modeled; all restriction
 * variants (an opponent controls, defending player controls, power/toughness/mana-value,
 * with/without flying) fell through to UNMODELED_MARKERS → LOW → Arbiter.
 *
 * Fix: parseExtendedAtom expanded from a bare exact-match to a broad regex covering the
 * standard controller and stat restrictions. creatureSatisfiesRestrictions extended with
 * toughness, manaValue, and hasKeyword restriction kinds so enumerateTargets enforces them.
 *
 * CREED: the $ anchor keeps "tap target creature, then return…" (Cyclopean Snare's bounce
 * rider) and "unless its controller pays…" (Vectis Dominator) LOW → no false positives.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Parser: restriction forms parse HIGH with correct atom shape ─────────────

describe("TAP-TARGET-CREATURE — parser", () => {
  it("bare 'tap target creature' → high, no restrictions", () => {
    const r = parseEffectClause("tap target creature.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [] }] });
  });

  it("'an opponent controls' → high, controller:opponent restriction", () => {
    const r = parseEffectClause("tap target creature an opponent controls.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }] });
  });

  it("'defending player controls' → high, controller:opponent restriction", () => {
    const r = parseEffectClause("tap target creature defending player controls.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }] });
  });

  it("'you don't control' → high, controller:opponent restriction", () => {
    const r = parseEffectClause("tap target creature you don't control.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }] });
  });

  it("'you control' → high, controller:you restriction", () => {
    const r = parseEffectClause("tap target creature you control.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }] });
  });

  it("'with power 3 or less' → high, power:<= restriction", () => {
    const r = parseEffectClause("tap target creature with power 3 or less.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 3 }] }] });
  });

  it("'with toughness 2 or less' → high, toughness:<= restriction (Errant Doomsayers)", () => {
    const r = parseEffectClause("tap target creature with toughness 2 or less.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "toughness", op: "<=", value: 2 }] }] });
  });

  it("'with mana value 2 or greater' → high, manaValue:>= restriction (Law-Rune Enforcer)", () => {
    const r = parseEffectClause("tap target creature with mana value 2 or greater.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "manaValue", op: ">=", value: 2 }] }] });
  });

  it("'without flying' → high, hasKeyword:flying:negate (Dromoka Dunecaster)", () => {
    const r = parseEffectClause("tap target creature without flying.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: true }] }] });
  });

  it("'with flying' → high, hasKeyword:flying (Storm Front)", () => {
    const r = parseEffectClause("tap target creature with flying.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "tap", targetType: "creature", restrictions: [{ kind: "hasKeyword", keyword: "flying", negate: false }] }] });
  });

  it("combined tap + no-untap rider now parses HIGH (census slice 10 — tap-creature-lockdown)", () => {
    // Was pinned LOW while the rider had no lane. splitClauses now folds the rider onto the tap sentence and
    // the atom carries noUntapNext; the FN boundary moved to CONDITIONAL riders, pinned in
    // tapCreatureLockdown.test.js (Guardian of Tazeem / Celestial Regulator stay LOW).
    const r = parseEffectClause(
      "tap target creature an opponent controls. that creature doesn't untap during its controller's next untap step.",
      "Instant"
    );
    expect(r.confidence).toBe("high");
    expect(r.atoms).toMatchObject([{ op: "tap", targetType: "creature", noUntapNext: true }]);
  });

  it("unless-conditional still LOW (Vectis Dominator)", () => {
    const r = parseEffectClause("{t}: tap target creature unless its controller pays 2 life.", "Instant");
    expect(r.confidence).toBe("low");
  });
});

// ─── atomTargetIntent ─────────────────────────────────────────────────────────

describe("TAP-TARGET-CREATURE — atomTargetIntent", () => {
  it("opponent restriction → 'enemy'", () => {
    const atom = { op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] };
    expect(atomTargetIntent(atom)).toBe("enemy");
  });

  it("no restriction → 'enemy' (default for tap)", () => {
    const atom = { op: "tap", targetType: "creature", restrictions: [] };
    expect(atomTargetIntent(atom)).toBe("enemy");
  });

  it("you-control restriction → 'own'", () => {
    const atom = { op: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] };
    expect(atomTargetIntent(atom)).toBe("own");
  });

  it("power restriction → 'enemy' (tapping opponent's weak creature)", () => {
    const atom = { op: "tap", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 3 }] };
    expect(atomTargetIntent(atom)).toBe("enemy");
  });
});

// ─── Coverage flips ───────────────────────────────────────────────────────────

describe("TAP-TARGET-CREATURE — coverage flips", () => {
  it("attack trigger (Fiend Binder style) → native-trigger", () => {
    expect(classifyCard({
      type: "Creature — Human Soldier",
      name: "Test Binder",
      mana: "{3}{W}",
      oracle: "Whenever this creature attacks, tap target creature defending player controls.",
    })).toBe("native-trigger");
  });

  it("ETB trigger → native-trigger (Heavy Infantry)", () => {
    expect(classifyCard({
      type: "Creature — Human Soldier",
      name: "Test Infantry",
      mana: "{3}{W}",
      oracle: "When this creature enters, tap target creature an opponent controls.",
    })).toBe("native-trigger");
  });

  it("Landfall trigger → native-trigger (Makindi Ox)", () => {
    expect(classifyCard({
      type: "Creature — Ox",
      name: "Test Ox",
      mana: "{2}{W}",
      oracle: "Landfall — Whenever a land you control enters, tap target creature an opponent controls.",
    })).toBe("native-trigger");
  });

  it("activated ability with power restriction → native-activated (Kor Line-Slinger)", () => {
    expect(classifyCard({
      type: "Creature — Kor Scout",
      name: "Test Scout",
      mana: "{1}{W}",
      oracle: "{T}: Tap target creature with power 3 or less.",
    })).toBe("native-activated");
  });

  it("activated ability without flying → native-activated (Dromoka Dunecaster)", () => {
    expect(classifyCard({
      type: "Creature — Human Soldier",
      name: "Test Dunecaster",
      mana: "{W}",
      oracle: "{1}{W}, {T}: Tap target creature without flying.",
    })).toBe("native-activated");
  });

  it("activated ability with flying → native-activated (Storm Front)", () => {
    expect(classifyCard({
      type: "Enchantment",
      name: "Test Storm",
      mana: "{G}",
      oracle: "{G}{G}: Tap target creature with flying.",
    })).toBe("native-activated");
  });

  it("activated toughness restriction → native-activated (Errant Doomsayers)", () => {
    expect(classifyCard({
      type: "Creature — Human Wizard",
      name: "Test Doomsayer",
      mana: "{1}{W}",
      oracle: "{T}: Tap target creature with toughness 2 or less.",
    })).toBe("native-activated");
  });

  it("activated mana-value restriction → native-activated (Law-Rune Enforcer)", () => {
    expect(classifyCard({
      type: "Creature — Human Soldier",
      name: "Test Enforcer",
      mana: "{W}",
      oracle: "{1}, {T}: Tap target creature with mana value 2 or greater.",
    })).toBe("native-activated");
  });

  it("combined tap + rider now flips native-trigger (Frost Lynx — census slice 10)", () => {
    expect(classifyCard({
      type: "Creature — Elemental Cat",
      name: "Test Lynx",
      mana: "{2}{U}",
      oracle: "When this creature enters, tap target creature an opponent controls. That creature doesn't untap during its controller's next untap step.",
    })).toBe("native-trigger");
  });
});

// ─── Engine: enumerateTargets respects restrictions ───────────────────────────

describe("TAP-TARGET-CREATURE — enumerateTargets restrictions", () => {
  function card(name, power, toughness) {
    return { id: `card-${name}`, name, type: "Creature", power, toughness, oracle: "", mana: "{2}", cmc: 2, keywords: [] };
  }
  function baseState() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main" };
  }
  function withBf(state, playerId, perms) {
    return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
  }

  it("controller:opponent → only AI creatures offered", () => {
    let s = baseState();
    s = withBf(s, "user", [createPermanent({ id: "p-mine", card: card("MyBear", 2, 2), controller: "user" })]);
    s = withBf(s, "ai", [createPermanent({ id: "p-opp", card: card("OppWolf", 2, 2), controller: "ai" })]);
    const targets = enumerateTargets(s, "user",
      { kind: "tap", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }, []);
    expect(targets.every(t => t.controller === "ai")).toBe(true);
    expect(targets.some(t => t.controller === "user")).toBe(false);
  });

  it("power restriction → only creatures with power <= 2 offered", () => {
    let s = baseState();
    s = withBf(s, "ai", [
      createPermanent({ id: "p-small", card: card("SmallWolf", 2, 2), controller: "ai" }),
      createPermanent({ id: "p-big", card: card("BigDragon", 5, 5), controller: "ai" }),
    ]);
    const targets = enumerateTargets(s, "user",
      { kind: "tap", targetType: "creature", restrictions: [{ kind: "power", op: "<=", value: 2 }] }, []);
    expect(targets.length).toBe(1);
    expect(targets[0].name).toBe("SmallWolf");
  });

  it("no restrictions → both user and AI creatures offered", () => {
    let s = baseState();
    s = withBf(s, "user", [createPermanent({ id: "p-mine", card: card("MyBear", 2, 2), controller: "user" })]);
    s = withBf(s, "ai", [createPermanent({ id: "p-opp", card: card("OppWolf", 2, 2), controller: "ai" })]);
    const targets = enumerateTargets(s, "user",
      { kind: "tap", targetType: "creature", restrictions: [] }, []);
    expect(targets.length).toBe(2);
  });
});
