/**
 * countScaledTargetPump.test.js — CP-1: "target creature gets ±N/±N until end of turn FOR EACH <count>".
 * Primal Bellow, Might of the Masses, Hunger of the Nim, Confront the Unknown, Defile, Irradiate,
 * Friendly Neighborhood.
 *
 * ⭐⭐ FOURTEENTH "BUILT ENGINE, PARTIAL IGNITION" OF THIS RUN. Everything needed already existed:
 * `parseCountSource` models every count these cards use — INCLUDING subtypes ("for each Forest you control"
 * → {subtype:"Forest"}, "for each Clue you control" → {subtype:"Clue"}) — and `applyPumpEffect` already
 * resolves `ptDeltaCount` off the board at resolution (CR 608.2h). The SELF wording had a matcher; the
 * chosen-TARGET wording did not, so the whole family parked one line from working.
 *
 * ⭐ IT ADMITS TWO THINGS THE SELF FORM REFUSES, and both are printed on real cards:
 *   · ASYMMETRIC — the self matcher requires m[1] === m[2], so "+1/+0 for each artifact you control"
 *     (Hunger of the Nim) never matched it. Here the ZERO pip marks the stat that does NOT scale, via the
 *     `ptDeltaCountSlot` the "where x is" matcher already used.
 *   · NEGATIVE — Defile and Irradiate are "-1/-1 for each", and the lethal SBA in applyPumpEffect already
 *     covers a debuff to zero toughness.
 *
 * ⛔ TWO DIFFERENT NON-ZERO PIPS PARK. "+2/+1 for each …" would need two independent per-values and there is
 * no field for that; emitting a single `per` would silently scale one stat wrongly. Refused, not
 * approximated — and pinned below, because the approximation is the tempting mistake here.
 *
 * Mutation-checked (2026-08-06, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the matcher removed -> all seven park.
 *   · `ptDeltaCountSlot` forced null -> Hunger of the Nim PARKS (arbiter-spell), which is BETTER than the
 *     predicted symptom and worth recording: the slot and the two-different-pips guard share a condition,
 *     so losing the slot trips the guard rather than shipping a +1/+1-per-artifact pump. Predicted "still
 *     native, toughness scales too"; measured a clean refusal. The guard covers the seam twice.
 *   · the CLAMP reverted to `Math.max(0, count * per)` -> Defile resolves as a NO-OP. A 2/2 with a Swamp
 *     out stays 2/2 while the card classifies native. This is the mutation that matters most here: it was
 *     the SHIPPED behaviour for 19 printed cards until this slice, and no classification test could see it.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-06).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const PRIMAL_BELLOW = { id: "c-pb", name: "Primal Bellow", type: "Instant", mana: "{G}",
  oracle: "Target creature gets +1/+1 until end of turn for each Forest you control." };
const HUNGER_OF_THE_NIM = { id: "c-hn", name: "Hunger of the Nim", type: "Sorcery", mana: "{1}{B}",
  oracle: "Target creature gets +1/+0 until end of turn for each artifact you control." };
const MIGHT_OF_THE_MASSES = { id: "c-mm", name: "Might of the Masses", type: "Instant", mana: "{G}",
  oracle: "Target creature gets +1/+1 until end of turn for each creature you control." };
const DEFILE = { id: "c-df", name: "Defile", type: "Instant", mana: "{B}",
  oracle: "Target creature gets -1/-1 until end of turn for each Swamp you control." };

describe("the carriers", () => {
  it("⭐ all four flip native — subtype, card-type, asymmetric and negative counts", () => {
    for (const c of [PRIMAL_BELLOW, HUNGER_OF_THE_NIM, MIGHT_OF_THE_MASSES, DEFILE]) {
      expect(classifyCard(c), c.name).toMatch(/^native/);
    }
  });

  it("⭐⭐ the parsed atoms — and the shapes that must still PARK", () => {
    const p = (c) => parseEffectClause(c, "Instant", { sourceScoped: true })?.atoms;
    const row = {
      subtype: p("target creature gets +1/+1 until end of turn for each forest you control"),
      asymmetric: p("target creature gets +1/+0 until end of turn for each artifact you control"),
      // ⛔ THE TWO REFUSALS. Different non-zero pips cannot be expressed by one `per`; an unmodeled count
      // word must not be guessed at.
      twoDifferentPips: p("target creature gets +2/+1 until end of turn for each creature you control"),
      unmodeledCount: p("target creature gets +1/+1 until end of turn for each zzzq you control"),
      // ⛔ REGRESSION GUARDS — the self form and the plain fixed pump both ran through this file already.
      selfForm: p("this creature gets +1/+1 until end of turn for each creature you control"),
      fixedPump: p("target creature gets +2/+2 until end of turn"),
    };
    console.log("  WITNESS countScaledPumpParsed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.subtype).toEqual([{ op: "pump", targetType: "creature",
      ptDeltaCount: { kind: "permanentsYouControl", subtype: "Forest", per: 1 } }]);
    expect(row.asymmetric).toEqual([{ op: "pump", targetType: "creature",
      ptDeltaCount: { kind: "permanentsYouControl", cardType: "artifact", per: 1 }, ptDeltaCountSlot: "p" }]);
    expect(row.twoDifferentPips).toEqual([]);
    expect(row.unmodeledCount).toEqual([]);
    expect(row.selfForm).toEqual([{ op: "pump", target: "self",
      ptDeltaCount: { kind: "permanentsYouControl", cardType: "creature", per: 1 } }]);
    expect(row.fixedPump).toEqual([{ op: "pump", ptDelta: { p: 2, t: 2 }, targetType: "creature", duration: "endOfTurn" }]);
  });
});

describe("⭐⭐ runtime — the count actually SCALES, and the zero pip actually stays zero", () => {
  function cast(spell, extraLands) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type) => createPermanent({ id, controller: "user", summoningSick: false,
      card: { id: `c-${id}`, name: id, type, oracle: "", ...(type.includes("Creature") ? { power: 2, toughness: 2 } : {}) } });
    const bf = [mk("BEAR", "Creature — Bear"), ...extraLands];
    const s = { ...base, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...base.players, user: { ...base.players.user, hand: [spell],
        manaPool: { ...base.players.user.manaPool, G: 6, B: 6, C: 6 }, battlefield: bf } } };
    const act = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === spell.id);
    expect(act, `${spell.name} must be castable at the Bear`).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, act));
    return { p: permanentPower(after, "BEAR"), t: permanentToughness(after, "BEAR") };
  }
  const land = (id, type) => createPermanent({ id, controller: "user", summoningSick: false,
    card: { id: `c-${id}`, name: id, type, oracle: "" } });
  const artifact = (id) => createPermanent({ id, controller: "user", summoningSick: false,
    card: { id: `c-${id}`, name: id, type: "Artifact", oracle: "" } });

  it("⭐⭐ Primal Bellow scales with FOREST count — and counts only Forests", () => {
    // ⛔ THE ISLAND IS THE ASSERTION. A count that ignored the subtype would read 3 lands, not 2 Forests,
    // and a 2/2 would come out 5/5 instead of 4/4 — a difference no classification test can see.
    const row = {
      twoForests: cast(PRIMAL_BELLOW, [land("F1", "Land — Forest"), land("F2", "Land — Forest"), land("I1", "Land — Island")]),
      noForests: cast(PRIMAL_BELLOW, [land("I1", "Land — Island")]),
    };
    console.log("  WITNESS primalBellowRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ twoForests: { p: 4, t: 4 }, noForests: { p: 2, t: 2 } });
  });

  it("⭐⭐ Hunger of the Nim scales POWER ONLY — the zero pip must not scale", () => {
    // ⛔ THIS IS THE ptDeltaCountSlot PIN. Without it a 2/2 comes out 5/5 instead of 5/2, and the card
    // still classifies native the whole time.
    const row = { threeArtifacts: cast(HUNGER_OF_THE_NIM, [artifact("A1"), artifact("A2"), artifact("A3")]) };
    console.log("  WITNESS hungerRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ threeArtifacts: { p: 5, t: 2 } });
  });

  it("⭐ Defile debuffs by the SWAMP count (the negative direction)", () => {
    expect(cast(DEFILE, [land("S1", "Land — Swamp")])).toEqual({ p: 1, t: 1 });
  });
});
