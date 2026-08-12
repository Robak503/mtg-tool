/**
 * sacUnlessSacrifice.test.js — SAC-UNLESS-SACRIFICE: "sacrifice this creature unless you sacrifice
 * <a land | two lands | an enchantment>". Bog Elemental, Cosmic Larva, Endless Wurm.
 *
 * The THIRD cost kind on the sac-unless-pay seam (mana → discard → sacrifice), found by drilling the
 * upkeep-sac-unless census row the Masticore slice left behind. The alternation in the matcher IS the
 * allowlist — only the three measured victim forms are admitted, so "a creature"/"three lands" park.
 *
 * ⭐ ONE EVALUATOR: the victim pool is sacrificePoolMatch — the SAME word-anchored edict predicate —
 * used by BOTH the auto-pick (can I pay?) and the settle (charge it), so offer and payment cannot
 * disagree about payability. An Artifact Land pays a land cost through it for free.
 *
 * ⛔ A COST IS ALL-OR-NOTHING (CR 601.2h analog): "sacrifice two lands" with ONE land pays NOTHING —
 * the land STAYS and the source sacrifices. A partial charge (one land taken AND the Larva dies)
 * would be strictly worse than either printed outcome.
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the sacrifice arm removed from the MATCHER -> all three carriers park.
 *   · the sacrifice arm removed from the SETTLE only -> pay chosen with a land on board, paid stays
 *     false, Bog Elemental DIES WITH ITS RENT PAID — the free-spell inversion. The tier cannot see
 *     it; only the runtime row can.
 *   · the sacrifice arm removed from the AUTO-PICK only -> both insufficiency rows die: canAfford's
 *     empty-mana fallthrough answers "pay" against a bare board. NOTE the failure is the auto-pick's
 *     ANSWER — the board outcome converges here because THIS settle re-checks the pool (unlike the
 *     Masticore discard case, where the settle arm didn't exist yet and the disagreement killed).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { autoPickSacUnlessPay, resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BOG_ELEMENTAL = { id: "c-bg", name: "Bog Elemental", type: "Creature — Elemental", mana: "{3}{B}{B}", power: "5", toughness: "4",
  oracle: "Protection from white\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice a land." };
const COSMIC_LARVA = { id: "c-cl", name: "Cosmic Larva", type: "Creature — Beast", mana: "{1}{R}{R}", power: "7", toughness: "6",
  oracle: "Trample\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice two lands." };
const ENDLESS_WURM = { id: "c-ew", name: "Endless Wurm", type: "Creature — Wurm", mana: "{3}{G}{G}", power: "9", toughness: "9",
  oracle: "Trample\nAt the beginning of your upkeep, sacrifice this creature unless you sacrifice an enchantment." };

describe("the carriers", () => {
  it("⭐ the trio flips native", () => {
    for (const c of [BOG_ELEMENTAL, COSMIC_LARVA, ENDLESS_WURM]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the matcher — three measured forms, and the incumbents byte-identical", () => {
    const p = (s) => matchUpkeepSacUnlessPay(s)?.atom?.cost || null;
    const row = {
      aLand: p("Sacrifice this creature unless you sacrifice a land."),
      twoLands: p("Sacrifice this creature unless you sacrifice two lands."),
      anEnchantment: p("Sacrifice this creature unless you sacrifice an enchantment."),
      mana: p("Sacrifice this creature unless you pay {2}."),
      discard: p("Sacrifice this creature unless you discard a card."),
      aCreature: p("Sacrifice this creature unless you sacrifice a creature."),   // no carrier → parked
      threeLands: p("Sacrifice this creature unless you sacrifice three lands."), // no carrier → parked
    };
    console.log("  WITNESS sacUnlessSacrificeParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.aLand).toEqual({ kind: "sacrifice", type: "land", count: 1 });
    expect(row.twoLands).toEqual({ kind: "sacrifice", type: "land", count: 2 });
    expect(row.anEnchantment).toEqual({ kind: "sacrifice", type: "enchantment", count: 1 });
    expect(row.mana?.kind).toBe("mana");
    expect(row.discard).toEqual({ kind: "discard", count: 1 });
    expect(row.aCreature).toBeNull();
    expect(row.threeLands).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — both outcomes of the choice, run to completion", () => {
  function pausedState(source, cost, extras = []) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "SRC", controller: "user", summoningSick: false, card: source });
    const board = [perm, ...extras.map((e, i) => createPermanent({ id: e.pid || `X${i}`, controller: "user", summoningSick: false, card: e }))];
    return { ...s, phase: "upkeep", step: "upkeep", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, hand: [], battlefield: board } },
      pendingChoice: { kind: "sac-unless-pay", controller: "user", cost, sourceId: "SRC", sourceName: source.name } };
  }
  const SWAMP = (pid) => ({ pid, id: "card-" + pid, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" });
  const SEAL = { pid: "SEAL", id: "card-SEAL", name: "Seal of Doom", type: "Enchantment", oracle: "Sacrifice this enchantment: Destroy target nonblack creature." };
  const LAND_COST = { kind: "sacrifice", type: "land", count: 1 };
  const TWO_LANDS = { kind: "sacrifice", type: "land", count: 2 };

  it("⭐⭐ a land on board: auto-pick says PAY, the settle sacrifices the LAND, Bog Elemental LIVES", () => {
    const s = pausedState(BOG_ELEMENTAL, LAND_COST, [SWAMP("L1")]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      landOnBoard: after.players.user.battlefield.some((p) => p.id === "L1"),
      landInGraveyard: after.players.user.graveyard.some((c) => c.id === "card-L1"),
    };
    console.log("  WITNESS bogElementalPays", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: true, landOnBoard: false, landInGraveyard: true });
  });

  it("⭐⭐ NO land: auto-pick says CANNOT PAY, the settle sacrifices the source", () => {
    const s = pausedState(BOG_ELEMENTAL, LAND_COST, []);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, false);
    expect(after.players.user.battlefield.some((p) => p.id === "SRC")).toBe(false);
  });

  it("⛔ ALL-OR-NOTHING: two-lands cost with ONE land pays NOTHING — the land stays, the Larva dies", () => {
    // A partial charge (the land taken AND the source sacrificed) is worse than either printed outcome.
    const s = pausedState(COSMIC_LARVA, TWO_LANDS, [SWAMP("L1")]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, true); // a stale "pay" answer must not half-charge
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      landOnBoard: after.players.user.battlefield.some((p) => p.id === "L1"),
    };
    console.log("  WITNESS cosmicLarvaAllOrNothing", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: false, landOnBoard: true });
  });

  it("⭐ two lands: BOTH are charged and the Larva lives", () => {
    const s = pausedState(COSMIC_LARVA, TWO_LANDS, [SWAMP("L1"), SWAMP("L2")]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      landsLeft: after.players.user.battlefield.filter((p) => /\bLand\b/.test(p.card?.type || "")).length,
      landsInGraveyard: after.players.user.graveyard.filter((c) => /\bLand\b/.test(c.type || "")).length,
    };
    console.log("  WITNESS cosmicLarvaPaysTwo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: true, landsLeft: 0, landsInGraveyard: 2 });
  });

  it("⭐ POOL HONESTY: Endless Wurm's enchantment cost takes the Seal, never the Swamp beside it", () => {
    const s = pausedState(ENDLESS_WURM, { kind: "sacrifice", type: "enchantment", count: 1 }, [SWAMP("L1"), SEAL]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      swampOnBoard: after.players.user.battlefield.some((p) => p.id === "L1"),
      sealInGraveyard: after.players.user.graveyard.some((c) => c.id === "card-SEAL"),
    };
    console.log("  WITNESS endlessWurmPoolHonesty", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: true, swampOnBoard: true, sealInGraveyard: true });
  });
});
