/**
 * ===== TREASURE-MAKER ===== dynamic-count + tapped named artifact tokens (Wave 1).
 *
 * The fixed-count named-token factory (Treasure/Clue/Food/Gold) already shipped. This slice adds:
 *   - a "tapped" rider (Generous Plunderer's "a tapped Treasure token") — enters tapped, NOT a mana
 *     source until it untaps;
 *   - DYNAMIC counts resolved AT RESOLUTION (CR 608.2g), never baked at parse:
 *       countFor   — a board count via countForSpec: "X = artifacts and enchantments your opponents
 *                    control" (Dockside Extortionist, who:"opponents", summed over the pod) and
 *                    "for each artifact that player controls" (Cavern-Hoard Dragon, who:"target" = the
 *                    damaged player);
 *       countContext — a trigger-context number: "that many" = ctx.combatDamageAmount (Old Gnawbone).
 *
 * CREED: a 0 dynamic count mints ZERO tokens (CR 107.3 — a clean no-op, never forced to 1). The count
 * reads state AT RESOLUTION — a board mutated between parse and resolve counts correctly (proved below).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom } from "../effectAtoms.js";
import { parseEffectProgram, programConfidence } from "../parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../gameState.js";
import { checkCombatDamageTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";
import { manaSources } from "../../manaModel.js";

beforeEach(() => _resetIdsForTests());

// A bare 2P/4P state with full control over each seat's battlefield + life.
function stateWith(over = {}) {
  if (over.mode === "commander") {
    const s = createGameState({ userDeck: [], opponentDecks: [[], [], []], mode: "commander" });
    return {
      ...s, activePlayer: "user",
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: over.user || [], life: 40 },
        ai1: { ...s.players.ai1, battlefield: over.ai1 || [], life: 40 },
        ai2: { ...s.players.ai2, battlefield: over.ai2 || [], life: 40 },
        ai3: { ...s.players.ai3, battlefield: over.ai3 || [], life: 40 },
      },
    };
  }
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], life: 40 },
      ai: { ...s.players.ai, battlefield: over.ai || [], life: 40 },
    },
  };
}

// A non-token permanent of an arbitrary type line (an artifact / enchantment to be counted).
let permN = 0;
const perm = (type, controller) =>
  createPermanent({ id: `p${permN++}`, card: { id: `c-${permN}`, name: `${type}-${permN}`, type }, controller, summoningSick: false });

const treasures = (s, pid = "user") => s.players[pid].battlefield.filter((p) => /Treasure/.test(p.card.type));

describe("TREASURE-MAKER — tapped Treasure (Generous Plunderer)", () => {
  it("a tapped Treasure enters tapped and is NOT a mana source until it untaps", () => {
    let s = stateWith();
    s = resolveAtom(s, { op: "create-named-token", token: "treasure", count: 1, tapped: true }, { controller: "user", targets: [] });
    const ts = treasures(s);
    expect(ts).toHaveLength(1);
    expect(ts[0].tapped).toBe(true);
    // A tapped Treasure can't tap-for-mana (manaSources skips perm.tapped + the ability requires {T}).
    expect(manaSources(s, "user").some((src) => src.permanentId === ts[0].id)).toBe(false);
  });

  it("an UNtapped Treasure (default) IS a mana source — proves tapped is the only difference", () => {
    let s = stateWith();
    s = resolveAtom(s, { op: "create-named-token", token: "treasure", count: 1 }, { controller: "user", targets: [] });
    const ts = treasures(s);
    expect(ts[0].tapped).toBe(false);
    expect(manaSources(s, "user").some((src) => src.permanentId === ts[0].id)).toBe(true);
  });

  it("parses 'Create a tapped Treasure token' to tapped:true, high confidence", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: "Create a tapped Treasure token." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-named-token", token: "treasure", count: 1, tapped: true });
  });
});

describe("TREASURE-MAKER — opponent-scoped X count (Dockside Extortionist)", () => {
  const DOCKSIDE = "Create X Treasure tokens, where X is the number of artifacts and enchantments your opponents control.";

  it("parses to a countFor with who:opponents over artifact+enchantment", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: DOCKSIDE });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "create-named-token", token: "treasure",
      countFor: { kind: "permanentsYouControl", cardTypes: ["artifact", "enchantment"], who: "opponents" },
    });
  });

  it("count reads the board AT RESOLUTION — mutating between parse and resolve changes the count", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: DOCKSIDE }).atoms[0];
    // Parse-time board: opponent has 2 artifacts + 1 enchantment = 3.
    let s = stateWith({ ai: [perm("Artifact", "ai"), perm("Artifact", "ai"), perm("Enchantment", "ai")], user: [perm("Artifact", "user")] });
    // Mutate AFTER parse, BEFORE resolve: opponent gains a 4th countable (an Artifact Creature counts ONCE).
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, perm("Artifact Creature — Golem", "ai")] } } };
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    // 4 opponent artifacts/enchantments → 4 Treasures (the controller's own artifact is NOT counted).
    expect(treasures(s)).toHaveLength(4);
  });

  it("sums across ALL opponents in a 4P pod (your opponentS control)", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: DOCKSIDE }).atoms[0];
    const s0 = stateWith({
      mode: "commander",
      user: [perm("Artifact", "user"), perm("Enchantment", "user")], // controller's own — never counted
      ai1: [perm("Artifact", "ai1")],
      ai2: [perm("Enchantment", "ai2"), perm("Artifact", "ai2")],
      ai3: [perm("Creature — Bear", "ai3")], // not an artifact/enchantment → 0
    });
    const s = resolveAtom(s0, atom, { controller: "user", targets: [] });
    expect(treasures(s)).toHaveLength(3); // 1 + 2 + 0 across the pod
  });

  it("0-count mints ZERO tokens (no forced 1) when no opponent controls a countable", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: DOCKSIDE }).atoms[0];
    let s = stateWith({ ai: [perm("Creature — Bear", "ai")], user: [perm("Artifact", "user")] });
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(treasures(s)).toHaveLength(0);
  });
});

describe("TREASURE-MAKER — for-each target-controlled count (Cavern-Hoard Dragon)", () => {
  const CAVERN = "Create a Treasure token for each artifact that player controls.";

  it("parses to a countFor with who:target over artifacts", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: CAVERN });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({
      op: "create-named-token", token: "treasure",
      countFor: { kind: "permanentsYouControl", cardType: "artifact", who: "target" },
    });
  });

  it("counts the DAMAGED player's artifacts (ctx.damagedPlayerId on a combat-damage trigger)", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: CAVERN }).atoms[0];
    // The damaged opponent controls 3 artifacts; the controller's own artifacts are irrelevant.
    let s = stateWith({ ai: [perm("Artifact", "ai"), perm("Artifact", "ai"), perm("Artifact — Equipment", "ai"), perm("Creature — Bear", "ai")], user: [perm("Artifact", "user")] });
    s = resolveAtom(s, atom, { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(treasures(s)).toHaveLength(3);
  });

  it("counts the explicit SPELL target player when one is present (target wins over damaged)", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: CAVERN }).atoms[0];
    let s = stateWith({ ai: [perm("Artifact", "ai"), perm("Artifact", "ai")] });
    s = resolveAtom(s, atom, { controller: "user", targets: [{ type: "player", id: "ai" }] });
    expect(treasures(s)).toHaveLength(2);
  });

  it("0-count → 0 tokens when the damaged player controls no artifacts", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: CAVERN }).atoms[0];
    let s = stateWith({ ai: [perm("Creature — Bear", "ai")] });
    s = resolveAtom(s, atom, { controller: "user", targets: [], damagedPlayerId: "ai" });
    expect(treasures(s)).toHaveLength(0);
  });
});

describe("TREASURE-MAKER — 'that many' = combat damage amount (Old Gnawbone)", () => {
  const GNAWBONE = "Create that many Treasure tokens.";

  it("parses to countContext:combatDamageAmount", () => {
    const p = parseEffectProgram({ type: "Instant", oracle: GNAWBONE });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "create-named-token", token: "treasure", countContext: "combatDamageAmount" });
  });

  it("mints N Treasures equal to ctx.combatDamageAmount", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: GNAWBONE }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [], combatDamageAmount: 5 });
    expect(treasures(s)).toHaveLength(5);
  });

  it("0 combat damage → 0 tokens (no forced 1); absent context → 0", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: GNAWBONE }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [], combatDamageAmount: 0 });
    expect(treasures(s)).toHaveLength(0);
    s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [] }); // no combatDamageAmount at all
    expect(treasures(s)).toHaveLength(0);
  });

  it("END-TO-END: Old Gnawbone dealing N combat damage mints N Treasures via the real trigger flush", () => {
    // The full path: combat-damage trigger (carries combatDamageAmount) → flush → EFFECT_PROGRAM → resolver.
    const gnaw = createPermanent({
      id: "gnaw",
      card: { id: "c-gnaw", name: "Old Gnawbone", type: "Legendary Creature — Dragon", power: 7, toughness: 5,
        oracle: "Flying\nWhenever a creature you control deals combat damage to a player, create that many Treasure tokens." },
      controller: "user", summoningSick: false,
    });
    let s = stateWith({ user: [gnaw] });
    s = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId: "gnaw", attackingPlayer: "user", defender: "ai", amount: 7 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    let g = 0;
    while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s);
    expect(treasures(s).filter((p) => p.id !== "gnaw")).toHaveLength(7);
  });
});

describe("TREASURE-MAKER — REGRESSION: fixed-count + dies/etb still HIGH and correct", () => {
  it("Pitiless Plunderer style dies-trigger (create a Treasure) parses HIGH", () => {
    // The trigger detector reads the WHOLE card; the EFFECT clause is what the parser models.
    const p = parseEffectProgram({ type: "Instant", oracle: "Create a Treasure token." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toEqual({ op: "create-named-token", token: "treasure", count: 1, targetType: null });
  });

  it("Brazen Freebooter ETB (create a Treasure token) — fixed count = 1, mints exactly one untapped", () => {
    let s = stateWith();
    s = resolveAtom(s, { op: "create-named-token", token: "treasure", count: 1 }, { controller: "user", targets: [] });
    const ts = treasures(s);
    expect(ts).toHaveLength(1);
    expect(ts[0].tapped).toBe(false);
  });

  it("fixed count of three still mints three (spelled count path unaffected)", () => {
    const atom = parseEffectProgram({ type: "Instant", oracle: "Create three Treasure tokens." }).atoms[0];
    let s = stateWith();
    s = resolveAtom(s, atom, { controller: "user", targets: [] });
    expect(treasures(s)).toHaveLength(3);
  });
});
