/**
 * earthbendUntapReferent.test.js — "earthbend N, then untap THAT LAND" (Avatar Kyoshi, Earthbender).
 *
 * `earthbend N` animates a land the controller owns; the tail then untaps the land it just animated. "That
 * land" is a MID-RESOLUTION REFERENT, so the earthbend atom stamps `state.earthbendLandId` and the follow-up
 * atom reads it — the same value-capture the corpus already uses for Yuriko's `revealedCardMV` and
 * roll-d20's `diceResult`.
 *
 * ⭐⭐ WHY THIS IS MATCHED AS A COMPOUND AND NOT AS A CLAUSE — the load-bearing decision. The corpus prints
 * "untap that land" on FOUR cards and THREE of them mean a DIFFERENT land:
 *
 *     Fabled Passage   — the land it just FETCHED
 *     Land Aid '04     — the land it just SEARCHED for
 *     Tiller Engine    — the land that just ENTERED
 *     Avatar Kyoshi    — the land the earthbend just ANIMATED   ← the only one this arm may claim
 *
 * A bare "untap that land" clause parser would bind all four to the earthbend stamp and untap the wrong
 * permanent — a referent bound to the wrong object, which is the FP class this project keeps finding. So the
 * arm only fires on the earthbend-adjacent compound, and the bare clause stays unparsed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const parse = (s) => parseEffectClause(s, "Creature", { hasX: false });

function runOn(atoms, { landTapped = true } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const land = { ...createPermanent({ id: "F1", card: { id: "F1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" }), tapped: landTapped };
  let st = {
    ...s,
    players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "k", card: { id: "k", name: "Kyoshi", type: "Legendary Creature — Avatar", power: 5, toughness: 5, oracle: "" }, controller: "user" }), land] } },
  };
  const ctx = { controller: "user", targets: [], cardName: "Kyoshi", xValue: null, sourceId: "k" };
  for (const a of atoms) {
    const after = resolveAtom(st, a, ctx);
    if (after == null) return null;
    st = after;
  }
  return st;
}

describe("parsing — the compound, and ONLY the compound", () => {
  it("\"earthbend 8, then untap that land\" → two atoms", () => {
    const p = parse("earthbend 8, then untap that land");
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["earthbend", "untap-earthbent-land"]);
  });

  it("⭐ THE LOAD-BEARING REFUSAL — a BARE \"untap that land\" does not parse", () => {
    // Fabled Passage / Land Aid '04 / Tiller Engine all print this phrase meaning a different land.
    expect(parse("untap that land").confidence).toBe("low");
  });

  it("plain earthbend is unchanged", () => {
    expect(parse("earthbend 8").atoms.map((a) => a.op)).toEqual(["earthbend"]);
  });

  it("Avatar Kyoshi, Earthbender classifies native", () => {
    expect(classifyCard({
      name: "Avatar Kyoshi, Earthbender", type: "Legendary Creature — Avatar", mana: "{4}{G}{G}", power: 6, toughness: 6,
      oracle: "At the beginning of combat on your turn, earthbend 8, then untap that land.",
    })).toMatch(/^native/);
  });
});

describe("⭐ RUNTIME — the stamp binds the right land", () => {
  it("a TAPPED land is animated, gains the counters, and ends UNTAPPED", () => {
    const st = runOn(parse("earthbend 8, then untap that land").atoms);
    const land = st.players.user.battlefield.find((p) => p.id === "F1");
    expect(land.tapped).toBe(false);
    expect(land.counters["+1/+1"]).toBe(8);
    expect(st.earthbendLandId).toBe("F1");
  });

  it("⭐ CREED — the untap atom alone, with NO stamp, is a clean no-op", () => {
    // The referent is absent, so nothing is chosen and nothing is untapped — never a fabricated untap.
    const st = runOn([{ op: "untap-earthbent-land", targetType: null }]);
    expect(st.players.user.battlefield.find((p) => p.id === "F1").tapped).toBe(true);
  });

  it("⭐ CREED — a stamp pointing at a permanent that is gone is a clean no-op", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const st = { ...s, earthbendLandId: "GONE", players: { ...s.players, user: { ...s.players.user, battlefield: [] } } };
    const after = resolveAtom(st, { op: "untap-earthbent-land", targetType: null }, { controller: "user", targets: [], sourceId: "k" });
    expect(after).toBe(st);
  });
});
