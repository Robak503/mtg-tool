/**
 * strive.test.js — ④-AS (2026-09-04 night): STRIVE (CR 702.106) + "ANY NUMBER OF target creatures". The Strive cycle —
 * Rouse the Mob, Blinding Flare, Aerial Formation, Phalanx Formation, Cruel Feeding, Desperate Stand, Ajani's Presence,
 * Colossal Heroics, Harness by Force — "This spell costs {N} more to cast for each target beyond the first" over an
 * "any number of target creatures" effect. parseEffectProgram peels the cost sentence and STAMPS it on the program as
 * `strivePerTarget`; the "any number" peel stamps minTargets:0 / maxTargets:99 / anyNumber on the creature atom; the
 * program-lane cast expansion charges base + N × (targets − 1) per chosen subset and offers only what the player can
 * fund. ⛔ Peeling without stamping would credit Rouse the Mob at {R} for any number of targets — mutation-proven.
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ROUSE = { id: "h-rm", name: "Rouse the Mob", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: ["Strive"],
  oracle: "Strive — This spell costs {2}{R} more to cast for each target beyond the first.\nAny number of target creatures each get +2/+0 and gain trample until end of turn." };
const FLARE = { id: "h-bf", name: "Blinding Flare", type: "Sorcery", mana: "{R}", mana_cost: "{R}", cmc: 1, keywords: ["Strive"],
  oracle: "Strive — This spell costs {R} more to cast for each target beyond the first.\nAny number of target creatures can't block this turn." };
const PHALANX = { id: "h-pf", name: "Phalanx Formation", type: "Instant", mana: "{2}{W}", mana_cost: "{2}{W}", cmc: 3, keywords: ["Strive"],
  oracle: "Strive — This spell costs {1}{W} more to cast for each target beyond the first.\nAny number of target creatures each gain double strike until end of turn." };

const bear = (id, name, controller) => createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });
function mainPhase(hand, pool, userPerms, aiPerms = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, hand, battlefield: userPerms, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...s0.players.ai, battlefield: aiPerms } } };
}
const castsOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const sizes = (casts) => casts.map((a) => (a.targets || []).length).sort();

describe("the parse", () => {
  it("⭐ the Strive sentence is peeled AND stamped; 'any number of target creatures' becomes an unbounded zero-or-more marker", () => {
    const p = parseEffectProgram(ROUSE);
    expect(p.confidence).toBe("high");
    expect(p.strivePerTarget).toBe("{2}{R}");
    expect(p.atoms).toEqual([{ op: "pump", targetType: "creature", ptDelta: { p: 2, t: 0 }, grantKeywords: ["Trample"], minTargets: 0, maxTargets: 99, anyNumber: true }]);
    expect(parseEffectClause("Any number of target creatures can't block this turn.", "Instant").atoms[0]).toMatchObject({ op: "cant-block", minTargets: 0, maxTargets: 99, anyNumber: true });
    expect(parseEffectClause("Any number of target creatures each gain double strike until end of turn.", "Instant").atoms[0]).toMatchObject({ op: "pump", grantKeywords: ["Double strike"], anyNumber: true });
    // a card WITHOUT a strive sentence carries no stamp
    expect(parseEffectProgram({ id: "x", name: "Plain", type: "Instant", mana: "{R}", cmc: 1, keywords: [], oracle: "Any number of target creatures can't block this turn." }).strivePerTarget).toBeUndefined();
  });
  it("the tiers", () => {
    expect(classifyCard(ROUSE)).toBe("native-spell");
    expect(classifyCard(FLARE)).toBe("native-spell");
    expect(classifyCard(PHALANX)).toBe("native-spell");
  });
});

describe("runtime — each extra target costs its Strive increment, and an unfundable subset is never offered", () => {
  it("⭐ Rouse the Mob with {R}{R} + {2} against three bears: 0 and 1 targets at {R}; 2 targets at {R}+{2}{R}; 3 targets is NOT offered", () => {
    const s = mainPhase([ROUSE], { R: 2, C: 2 }, [bear("a", "A", "user"), bear("b", "B", "user"), bear("c", "C", "user")]);
    const casts = castsOf(s, "h-rm");
    expect(sizes(casts)).toEqual([0, 1, 1, 1, 2, 2, 2]);
    const two = casts.find((a) => (a.targets || []).length === 2);
    expect(two.cost).toMatchObject({ R: 2, generic: 2 });
    const one = casts.find((a) => (a.targets || []).length === 1);
    expect(one.cost).toMatchObject({ R: 1, generic: 0 });
    const resolved = resolveTopOfStack(dispatchAction(s, two));
    for (const t of two.targets) {
      expect(permanentPower(resolved, t.id)).toBe(4);
      expect(permanentHasKeyword(resolved, t.id, "trample")).toBe(true);
    }
    const untouched = ["a", "b", "c"].find((id) => !two.targets.some((t) => t.id === id));
    expect(permanentPower(resolved, untouched)).toBe(2);
    expect(resolved.players.user.manaPool.R).toBe(0);
  });

  it("⭐ with only {R}, the same card offers the zero- and one-target casts and nothing wider", () => {
    const s = mainPhase([ROUSE], { R: 1 }, [bear("a", "A", "user"), bear("b", "B", "user")]);
    expect(sizes(castsOf(s, "h-rm"))).toEqual([0, 1, 1]);
  });

  it("⭐ Blinding Flare ({R} per extra target) with {R}{R}{R}: up to three targets, each paid", () => {
    const s = mainPhase([FLARE], { R: 3 }, [], [bear("x", "X", "ai"), bear("y", "Y", "ai"), bear("z", "Z", "ai")]);
    const casts = castsOf(s, "h-bf");
    expect(Math.max(...sizes(casts))).toBe(3);
    const three = casts.find((a) => (a.targets || []).length === 3);
    expect(three.cost).toMatchObject({ R: 3 });
    const resolved = resolveTopOfStack(dispatchAction(s, three));
    for (const id of ["x", "y", "z"]) expect(permanentHasKeyword(resolved, id, "cantBlock")).toBe(true);
  });
});
