/**
 * FINALE OF DEVASTATION ({X}{G}{G}, Sorcery) — the X-tutor-to-battlefield across LIBRARY-AND/OR-GRAVEYARD
 * plus the conditional (X>=10) team-pump-haste rider:
 *
 *   "Search your library and/or graveyard for a creature card with mana value X or less and put it onto the
 *    battlefield. If you search your library this way, shuffle. If X is 10 or more, creatures you control get
 *    +X/+X and gain haste until end of turn."
 *
 * Two atoms:
 *   1. tutor  { destination:"battlefield", filter:{groups:[["creature"]], mvCapX:true}, sourceZones:["library","graveyard"] }
 *      — the candidate pool is the UNION of the caster's library + graveyard; each candidate is tagged with
 *        its zone so resolveTutorChoice enters the chosen creature from the RIGHT zone. MV cap = the chosen X
 *        (mvCapX, bound at cast). The library is always searched → the CR-701.19e shuffle always runs (the
 *        separate "If you search your library this way, shuffle." reminder is stripped in splitClauses).
 *   2. pump   { scope:"youControl", amountX:true, condX:{min:10}, grantKeywords:["Haste"] }
 *      — a team +X/+X + Haste GATED on X>=10; applyPumpEffect no-ops the entire pump (no continuous effects,
 *        no grants) when the chosen X < 10, exactly as printed.
 *
 * CREED near-misses: a graveyard-only search, a FIXED-MV cap (that's the to-HAND path), and a non-team /
 * non-+X/+X conditional pump all stay non-native (→ Arbiter). A partial model of either half is a forbidden FP.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const FINALE = {
  name: "Finale of Devastation",
  type: "Sorcery",
  mana: "{X}{G}{G}",
  oracle:
    "Search your library and/or graveyard for a creature card with mana value X or less and put it onto the battlefield. If you search your library this way, shuffle. If X is 10 or more, creatures you control get +X/+X and gain haste until end of turn.",
};

const cr = (id, name, p, t, ctrl) =>
  createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Beast", power: p, toughness: t, oracle: "" }, controller: ctrl, summoningSick: false });

// a creature CARD (not a permanent) for the library/graveyard, with a mana_cost so tutorManaValue reads its MV
const creatureCard = (id, name, cmc) => ({ id, name, type: "Creature — Beast", mana_cost: `{${cmc}}`, cmc, oracle: "" });

function board({ user = [], userLib = [], userGrave = [], turn = 1 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, turn,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, library: userLib, graveyard: userGrave },
    },
  };
}

const atomsOf = (txt) => parseEffectClause(txt, "Sorcery", { hasX: true })?.atoms;
const isHighX = (txt) => programConfidence(parseEffectClause(txt, "Sorcery", { hasX: true })) === "high";

describe("Finale of Devastation — parse + classify", () => {
  it("classifies native-spell and emits the tutor(library∪graveyard, MV-capped-by-X, →battlefield) + condX team-pump-haste", () => {
    expect(classifyCard(FINALE)).toBe("native-spell");
    const p = parseEffectProgram(FINALE);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([
      {
        op: "tutor",
        filter: { groups: [["creature"]], mvCapX: true },
        filterLabel: "creature card with mana value X or less",
        destination: "battlefield",
        entersTapped: false,
        sourceZones: ["library", "graveyard"],
        targetType: null,
      },
      {
        op: "pump",
        scope: "youControl",
        amountX: true,
        condX: { min: 10 },
        grantKeywords: ["Haste"],
        targetType: null,
      },
    ]);
  });
});

describe("Finale of Devastation — tutor RUNTIME (library ∪ graveyard, MV cap = chosen X)", () => {
  it("fetches a creature FROM THE LIBRARY onto the battlefield; MV cap = X, then shuffles", () => {
    const tutorAtom = atomsOf(FINALE.oracle)[0];
    // X=3: a MV-2 creature in the library is a legal fetch; a MV-5 one is over the cap.
    let s = board({ userLib: [creatureCard("libA", "Cheap", 2), creatureCard("libB", "Pricey", 5)] });
    s = ATOM_RESOLVERS.tutor(s, tutorAtom, { controller: "user", targets: [], xValue: 3, cardName: "Finale of Devastation" });
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield", sourceZones: ["library", "graveyard"] });
    // only the MV<=3 candidate is offered
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["libA"]);
    expect(s.pendingChoice.candidates[0].zone).toBe("library");
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    expect(s.players.user.battlefield.some((pm) => pm.card.name === "Cheap")).toBe(true); // entered the battlefield
    expect(s.players.user.library.some((c) => c.id === "libA")).toBe(false);              // left the library
    expect(s.pendingChoice).toBeFalsy();                                                  // choice settled
  });

  it("fetches a creature FROM THE GRAVEYARD onto the battlefield (the /or graveyard half)", () => {
    const tutorAtom = atomsOf(FINALE.oracle)[0];
    // library empty of legal fetches; the ONLY MV<=X creature is in the graveyard → it must be fetchable.
    let s = board({ userLib: [], userGrave: [creatureCard("gyA", "Fallen", 4)] });
    s = ATOM_RESOLVERS.tutor(s, tutorAtom, { controller: "user", targets: [], xValue: 6, cardName: "Finale of Devastation" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["gyA"]);
    expect(s.pendingChoice.candidates[0].zone).toBe("graveyard");
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    expect(s.players.user.battlefield.some((pm) => pm.card.name === "Fallen")).toBe(true); // entered from the graveyard
    expect(s.players.user.graveyard.some((c) => c.id === "gyA")).toBe(false);              // left the graveyard
  });

  it("offers candidates from BOTH zones at once (union pool)", () => {
    const tutorAtom = atomsOf(FINALE.oracle)[0];
    let s = board({ userLib: [creatureCard("libA", "InDeck", 3)], userGrave: [creatureCard("gyA", "InYard", 3)] });
    s = ATOM_RESOLVERS.tutor(s, tutorAtom, { controller: "user", targets: [], xValue: 4, cardName: "Finale of Devastation" });
    expect(s.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["gyA", "libA"]);
  });
});

describe("Finale of Devastation — condX team-pump-haste RUNTIME", () => {
  const pumpAtom = { op: "pump", scope: "youControl", amountX: true, condX: { min: 10 }, grantKeywords: ["Haste"], targetType: null };

  it("X=10: your creatures get +10/+10 and Haste; opponents untouched", () => {
    let s = board({ user: [cr("a", "Mine", 2, 2, "user")] });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [cr("en", "Enemy", 3, 3, "ai")] } } };
    s = ATOM_RESOLVERS.pump(s, pumpAtom, { controller: "user", xValue: 10 });
    expect([permanentPower(s, "a"), permanentToughness(s, "a")]).toEqual([12, 12]);
    expect(permanentHasKeyword(s, "a", "Haste")).toBe(true);
    expect([permanentPower(s, "en"), permanentToughness(s, "en")]).toEqual([3, 3]); // opponent unbuffed
    expect(permanentHasKeyword(s, "en", "Haste")).toBe(false);
  });

  it("X=9 (below threshold): the pump is a total no-op — no +X/+X, no Haste", () => {
    let s = board({ user: [cr("a", "Mine", 2, 2, "user")] });
    s = ATOM_RESOLVERS.pump(s, pumpAtom, { controller: "user", xValue: 9 });
    expect([permanentPower(s, "a"), permanentToughness(s, "a")]).toEqual([2, 2]); // unchanged
    expect(permanentHasKeyword(s, "a", "Haste")).toBe(false);
  });

  it("X=15 (well above): +15/+15 and Haste", () => {
    let s = board({ user: [cr("a", "Mine", 1, 1, "user")] });
    s = ATOM_RESOLVERS.pump(s, pumpAtom, { controller: "user", xValue: 15 });
    expect([permanentPower(s, "a"), permanentToughness(s, "a")]).toEqual([16, 16]);
    expect(permanentHasKeyword(s, "a", "Haste")).toBe(true);
  });
});

describe("Finale of Devastation — CREED near-misses stay non-native", () => {
  it("a FIXED-MV battlefield tutor across library/graveyard is NOT this shape (no printed card; the MV cap must be X)", () => {
    // 'with mana value 3 or less' → a fixed cap, not the chosen X → the bfxg anchor requires 'x or less'.
    expect(isHighX("Search your library and/or graveyard for a creature card with mana value 3 or less and put it onto the battlefield.")).toBe(false);
  });

  it("a GRAVEYARD-ONLY search-to-battlefield is NOT the bfxg shape (→ Arbiter)", () => {
    expect(isHighX("Search your graveyard for a creature card with mana value X or less and put it onto the battlefield.")).toBe(false);
  });

  it("the condX rider stays low when the payoff is NOT a +X/+X team pump (destroy-all payoff → Arbiter)", () => {
    // mirrors parser.test.js MUST_DROP_TO_LOW — a non-pump conditional payoff must not flip.
    expect(isHighX("If X is 10 or more, destroy all other creatures.")).toBe(false);
  });

  it("the condX rider stays low when the P/T is FIXED (not +X/+X)", () => {
    // a fixed +2/+2 isn't the chosen-X pump; the condX anchor requires the literal "+x/+x" → LOW.
    expect(isHighX("If X is 10 or more, creatures you control get +2/+2 and gain haste until end of turn.")).toBe(false);
    expect(atomsOf("If X is 10 or more, creatures you control get +2/+2 and gain haste until end of turn.")).toEqual([]);
  });

  it("the condX rider stays low with an un-grantable keyword", () => {
    expect(isHighX("If X is 10 or more, creatures you control get +x/+x and gain foobar until end of turn.")).toBe(false);
    expect(atomsOf("If X is 10 or more, creatures you control get +x/+x and gain foobar until end of turn.")).toEqual([]);
  });
});
