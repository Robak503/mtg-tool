/**
 * sacUnlessReturnLand.test.js — SAC-UNLESS-RETURN-LAND: "sacrifice this creature unless you return
 * <an untapped Island | a land> you control to its owner's hand". Waterspout Djinn, Living Tsunami.
 *
 * The FOURTH cost kind on the sac-unless-pay seam (mana → discard → sacrifice → return-land), closing
 * the upkeep-sac-unless census row's last coherent sub-group. Allowlist-by-alternation again: only the
 * two measured victim forms are admitted ("an untapped Mountain" has no carrier and parks).
 *
 * ⛔ THE UNTAPPED GATE IS THE LOAD-BEARING CONSTRAINT: the Djinn cannot pay with a tapped Island —
 * paying anyway is a FREE KEEP (the free-spell inversion on the pool axis rather than the arm axis).
 * The gate lives in the ONE shared predicate (returnLandPoolMatch) used by auto-pick AND settle.
 *
 * ⭐ The return is a BOUNCE, not a death: moveCardToZone battlefield → hand under the controller-as-
 * owner proxy applyZoneMove established, and NO dies/sacrifice watchers fire (CR 700.4 — dies means
 * to the graveyard). Victim policy: prefer a TAPPED land when the cost allows one (least mana access
 * lost — strictly dominant, unlike the sacrifice arm's fungible pools).
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the return-land arm removed from the MATCHER -> both carriers park.
 *   · the untapped gate dropped from the POOL PREDICATE -> the tapped-Island Djinn row pays a cost the
 *     card forbids — the free keep. The tier cannot see it; only the runtime row can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { matchUpkeepSacUnlessPay } from "./effects/templateMatchers.js";
import { autoPickSacUnlessPay, resolveSacUnlessPayChoice } from "./effects/runProgram.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WATERSPOUT_DJINN = { id: "c-wd", name: "Waterspout Djinn", type: "Creature — Djinn", mana: "{2}{U}{U}", power: "4", toughness: "4",
  oracle: "Flying\nAt the beginning of your upkeep, sacrifice this creature unless you return an untapped Island you control to its owner's hand." };
const LIVING_TSUNAMI = { id: "c-lt", name: "Living Tsunami", type: "Creature — Elemental", mana: "{2}{U}{U}", power: "4", toughness: "4",
  oracle: "Flying\nAt the beginning of your upkeep, sacrifice this creature unless you return a land you control to its owner's hand." };

describe("the carriers", () => {
  it("⭐ the pair flips native", () => {
    for (const c of [WATERSPOUT_DJINN, LIVING_TSUNAMI]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐ the matcher — two measured forms, and the incumbents byte-identical", () => {
    const p = (s) => matchUpkeepSacUnlessPay(s)?.atom?.cost || null;
    const row = {
      untappedIsland: p("Sacrifice this creature unless you return an untapped Island you control to its owner's hand."),
      aLand: p("Sacrifice this creature unless you return a land you control to its owner's hand."),
      mana: p("Sacrifice this creature unless you pay {2}."),
      sacrifice: p("Sacrifice this creature unless you sacrifice a land."),
      untappedMountain: p("Sacrifice this creature unless you return an untapped Mountain you control to its owner's hand."), // no carrier → parked
    };
    console.log("  WITNESS sacUnlessReturnLandParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.untappedIsland).toEqual({ kind: "return-land", subtype: "Island", untapped: true });
    expect(row.aLand).toEqual({ kind: "return-land", subtype: null, untapped: false });
    expect(row.mana?.kind).toBe("mana");
    expect(row.sacrifice).toEqual({ kind: "sacrifice", type: "land", count: 1 });
    // GRADUATED 2026-09-03 (LANDS-11): the four other untapped basic types joined "island" for the Karoos (Dormant
    // Volcano wants a Mountain); the refusal moves to a non-basic subtype, which still has no carrier and still parks.
    expect(row.untappedMountain).toEqual({ kind: "return-land", subtype: "Mountain", untapped: true });
    expect(p("Sacrifice this creature unless you return an untapped Desert you control to its owner's hand.")).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — both outcomes of the choice, run to completion", () => {
  function pausedState(source, cost, extras = []) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const perm = createPermanent({ id: "SRC", controller: "user", summoningSick: false, card: source });
    const board = [perm, ...extras.map((e) => createPermanent({ id: e.pid, controller: "user", tapped: !!e.tapped, summoningSick: false, card: e.card }))];
    return { ...s, phase: "upkeep", step: "upkeep", activePlayer: "user", priorityHolder: "user", turn: 3,
      players: { ...s.players, user: { ...s.players.user, hand: [], battlefield: board } },
      pendingChoice: { kind: "sac-unless-pay", controller: "user", cost, sourceId: "SRC", sourceName: source.name } };
  }
  const ISLAND = (pid, tapped) => ({ pid, tapped, card: { id: "card-" + pid, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" } });
  const MOUNTAIN = (pid, tapped) => ({ pid, tapped, card: { id: "card-" + pid, name: "Mountain", type: "Basic Land — Mountain", oracle: "({T}: Add {R}.)" } });
  const DJINN_COST = { kind: "return-land", subtype: "Island", untapped: true };
  const TSUNAMI_COST = { kind: "return-land", subtype: null, untapped: false };

  it("⭐⭐ an untapped Island: auto-pick says PAY, the settle bounces it to HAND, the Djinn LIVES", () => {
    const s = pausedState(WATERSPOUT_DJINN, DJINN_COST, [ISLAND("L1", false)]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      islandOnBoard: after.players.user.battlefield.some((p) => p.id === "L1"),
      islandInHand: after.players.user.hand.some((c) => c.id === "card-L1"),
      islandInGraveyard: after.players.user.graveyard.some((c) => c.id === "card-L1"),
    };
    console.log("  WITNESS djinnPays", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: true, islandOnBoard: false, islandInHand: true, islandInGraveyard: false });
  });

  it("⛔⛔ THE UNTAPPED GATE: only a TAPPED Island on board — the Djinn cannot pay and sacrifices", () => {
    const s = pausedState(WATERSPOUT_DJINN, DJINN_COST, [ISLAND("L1", true)]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, true); // a stale "pay" answer must not fake the payment
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      islandOnBoard: after.players.user.battlefield.some((p) => p.id === "L1"),
    };
    console.log("  WITNESS djinnUntappedGate", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: false, islandOnBoard: true });
  });

  it("⭐ SUBTYPE HONESTY: an untapped Mountain does not pay an Island cost", () => {
    const s = pausedState(WATERSPOUT_DJINN, DJINN_COST, [MOUNTAIN("L1", false)]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, false);
    expect(after.players.user.battlefield.some((p) => p.id === "SRC")).toBe(false);
  });

  it("⭐ the Tsunami pays with ANY land — and PREFERS the tapped one (least mana access lost)", () => {
    const s = pausedState(LIVING_TSUNAMI, TSUNAMI_COST, [ISLAND("L1", false), MOUNTAIN("L2", true)]);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(true);
    const after = resolveSacUnlessPayChoice(s, true);
    const row = {
      sourceAlive: after.players.user.battlefield.some((p) => p.id === "SRC"),
      untappedIslandStays: after.players.user.battlefield.some((p) => p.id === "L1"),
      tappedMountainInHand: after.players.user.hand.some((c) => c.id === "card-L2"),
    };
    console.log("  WITNESS tsunamiPrefersTapped", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sourceAlive: true, untappedIslandStays: true, tappedMountainInHand: true });
  });

  it("⭐ a bare board: auto-pick says CANNOT PAY, the settle sacrifices the source", () => {
    const s = pausedState(LIVING_TSUNAMI, TSUNAMI_COST, []);
    expect(autoPickSacUnlessPay(s, s.pendingChoice)).toBe(false);
    const after = resolveSacUnlessPayChoice(s, false);
    expect(after.players.user.battlefield.some((p) => p.id === "SRC")).toBe(false);
  });
});
