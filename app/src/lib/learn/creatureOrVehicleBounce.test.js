/**
 * creatureOrVehicleBounce.test.js — CV-3: "return target creature or Vehicle to its owner's hand".
 * Bounce Off, Roadside Blowout.
 *
 * ⭐ THE THIRD AND LAST EASY LANE of a predicate CV-1 lit on removal and CV-2 on counters. Same story each
 * time: `creatureOrVehicle` and its enumeration path exist, and the lane's own matcher simply never emitted
 * the targetType. CR 301.7 is the reason the union is not redundant wording — an UNCREWED Vehicle is not a
 * creature, so the union reaches a permanent the bare noun cannot.
 *
 * ⛔ THE NOUN GROUP IS AN OPTIONAL SUFFIX (`creature( or vehicle)?`), NOT AN ALTERNATION OF THE WHOLE NOUN.
 * This matcher already carried two other optional groups (the BS-1 state qualifier and the controller
 * scope) and five printed forms run through it. Re-numbering its capture groups is the risk here, not the
 * union: `who` reads the scope group, and a wrong index would silently resolve every scope to the
 * "opponent" default. All five incumbent forms are asserted byte-identical below for exactly that reason.
 *
 * ⭐⭐ IGNITION IS PROVEN AT RESOLUTION, NOT AT PARSE. A targetType with no working resolver has been this
 * run's most repeated failure — a card classifies native, offers a target, and nothing happens. The row
 * below casts Bounce Off at an UNCREWED Vehicle and asserts it both LEAVES the battlefield and ARRIVES in
 * its owner's hand. Either half alone would miss a permanent that vanishes into nowhere.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the noun suffix removed -> both cards park (the anchored match fails).
 *   · `targetType` forced back to "creature" -> both cards STILL classify native while the uncrewed Vehicle
 *     silently leaves the offered pool. The tier cannot see this one; only the pool/resolution rows can.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BOUNCE_OFF = { id: "c-bo", name: "Bounce Off", type: "Instant", mana: "{1}{U}",
  oracle: "Return target creature or Vehicle to its owner's hand." };
const ROADSIDE_BLOWOUT = { id: "c-rb", name: "Roadside Blowout", type: "Sorcery", mana: "{2}{U}",
  oracle: "This spell costs {2} less to cast if it targets a permanent with mana value 1.\nReturn target creature or Vehicle an opponent controls to its owner's hand.\nDraw a card." };

describe("the carriers", () => {
  it("⭐ both flip native", () => {
    for (const c of [BOUNCE_OFF, ROADSIDE_BLOWOUT]) expect(classifyCard(c), c.name).toMatch(/^native/);
  });

  it("⭐⭐ the union parses — and all FIVE incumbent forms are byte-identical", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      union: p("return target creature or vehicle to its owner's hand"),
      unionScoped: p("return target creature or vehicle an opponent controls to its owner's hand"),
      // ⛔ THE REGRESSION GUARD — a capture-group renumber would silently push every scope to "opponent".
      bare: p("return target creature to its owner's hand"),
      another: p("return another target creature to its owner's hand"),
      scopedOpponent: p("return target creature an opponent controls to its owner's hand"),
      scopedYou: p("return target creature you control to its owner's hand"),
      tapped: p("return target tapped creature to its owner's hand"),
    };
    console.log("  WITNESS creatureOrVehicleBounce", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.union).toEqual([{ op: "bounce", targetType: "creatureOrVehicle" }]);
    expect(row.unionScoped).toEqual([{ op: "bounce", targetType: "creatureOrVehicle", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    expect(row.bare).toEqual([{ op: "bounce", targetType: "creature" }]);
    expect(row.another).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "notSource" }] }]);
    expect(row.scopedOpponent).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
    // ⛔ The row that catches a group renumber: this one must be "you", not the "opponent" default.
    expect(row.scopedYou).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }]);
    expect(row.tapped).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "tapped", value: true }] }]);
  });
});

describe("⭐⭐ ignition — resolved, not merely parsed", () => {
  it("⭐⭐ Bounce Off returns an UNCREWED Vehicle to its owner's hand", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players,
        user: { ...base.players.user, hand: [BOUNCE_OFF], manaPool: { ...base.players.user.manaPool, U: 4, C: 4 }, battlefield: [] },
        ai: { ...base.players.ai, battlefield: [createPermanent({ id: "veh", controller: "ai", summoningSick: false,
          card: { id: "c-veh", name: "Rig", type: "Artifact — Vehicle", power: 4, toughness: 3, oracle: "" } })] } } };
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "c-bo");
    expect(cast, "the Vehicle must be OFFERED as a target").toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, cast));
    // ⛔ BOTH halves. "Left the battlefield" alone would pass for a permanent that vanished into nowhere.
    const row = { stillOnBattlefield: !!findPermanent(after, "veh"), inOwnerHand: after.players.ai.hand.some((c) => c.name === "Rig") };
    console.log("  WITNESS bounceVehicleResolved", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stillOnBattlefield: false, inOwnerHand: true });
  });
});
