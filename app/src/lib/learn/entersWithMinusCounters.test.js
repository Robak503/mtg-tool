/**
 * entersWithMinusCounters.test.js — "This creature enters with N −1/−1 counters on it." (CR 614.1c):
 * Bloodied Ghost, Wickerbough Elder, Deity of Scars, Etched Monstrosity, and ~30 more carriers.
 *
 * ⭐ FOUND BY SPLITTING THE SHAPE BY TIER, and the split could not be starker:
 *   · "enters with N **+1/+1** counters"  →  **28 native**
 *   · "enters with N **−1/−1** counters"  →  **0 native, 35 parked**
 * The SIGN was the entire difference. One character of oracle text separated a fully-modelled family from
 * one the engine had never read.
 *
 * ⓘ PURE IGNITION — the runtime was already finished. ptPrimitive.counterPtDelta reads
 * `counters["-1/-1"]` and SUBTRACTS it, so the layer engine has always priced these correctly, and the
 * resolver already writes arbitrary counter kinds at ETB. Only the parse step was missing.
 *
 * ⛔ NOT ROUTED THROUGH applyCounterDoubling, and that is a deliberate refusal rather than an omission.
 * The plus twin one line above DOES call it (Doubling Season). Inheriting that call here would have
 * doubled a DRAWBACK the card prints — making Etched Monstrosity enter with ten −1/−1 counters instead of
 * five, i.e. strictly worse than printed, from a permanent its controller played to help them. Whether this
 * engine's doubler profile should double −1/−1 counters is a real and separately measurable question;
 * silently inheriting the call would have answered it by accident. Fail-closed: the printed number, exactly.
 *
 * ⛔ The same conditional/variable guard as the plus twin. Canker Abomination ("for each creature that
 * opponent controls") and Patched Plaything ("if you cast it from your hand") carry a VARIABLE count this
 * does not model; guessing one would put the wrong body on the battlefield, so they park.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * parser helper stubbed to 0 -> the carriers park AND the runtime drive shows a full-size body; the
 * resolver write removed -> the card is credited native while entering at printed size (the exact
 * metric-over-claims-runtime split this file guards).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { entersWithMinusCounters } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLOODIED_GHOST = { id: "c-bg", name: "Bloodied Ghost", type: "Creature — Spirit", mana: "{2}{W}",
  power: "3", toughness: "3", oracle: "Flying\nThis creature enters with a -1/-1 counter on it." };
const ETCHED_MONSTROSITY = { id: "c-em", name: "Etched Monstrosity", type: "Artifact Creature — Golem",
  mana: "{5}", power: "10", toughness: "10",
  oracle: "This creature enters with five -1/-1 counters on it.\n{W}{U}{B}{R}{G}, Remove five -1/-1 counters from this creature: Target player draws three cards." };
const CANKER_ABOMINATION = { id: "c-ca", name: "Canker Abomination", type: "Creature — Phyrexian Horror",
  mana: "{1}{B}{G}", power: "5", toughness: "5",
  oracle: "As this creature enters, choose an opponent.\nThis creature enters with a -1/-1 counter on it for each creature that player controls." };

describe("the sign-flipped twin parses, and the carriers flip", () => {
  it("⭐ the printed count is read, and the carriers go native", () => {
    expect(entersWithMinusCounters(BLOODIED_GHOST)).toBe(1);
    expect(entersWithMinusCounters(ETCHED_MONSTROSITY)).toBe(5);
    expect(classifyCard(BLOODIED_GHOST)).toBe("native-body");
    expect(classifyCard(ETCHED_MONSTROSITY)).toBe("native-activated");
  });

  it("⛔ a VARIABLE count still parks — guessing it would put the wrong body on the battlefield", () => {
    expect(entersWithMinusCounters(CANKER_ABOMINATION)).toBe(0);
    expect(classifyCard(CANKER_ABOMINATION)).toBe("body-only");
  });
});

describe("⭐ LAW 6 — driven through the real enterPermanent: these arrive SMALLER", () => {
  const enter = (card) => {
    const r = enterPermanent(createGameState({ userDeck: [], aiDeck: [] }), card, "user");
    const st = r?.state || r;
    const bf = st.players.user.battlefield;
    return { st, p: bf[bf.length - 1] };
  };

  it("⭐ printed size minus the counters, at the moment it enters", () => {
    const rows = [];
    for (const [card, printed, n] of [[BLOODIED_GHOST, "3/3", 1], [ETCHED_MONSTROSITY, "10/10", 5]]) {
      const { st, p } = enter(card);
      rows.push({ name: card.name, printed, counters: p.counters?.["-1/-1"] ?? 0,
        derived: `${permanentPower(st, p.id)}/${permanentToughness(st, p.id)}`, expected: n });
    }
    console.log("  WITNESS", JSON.stringify(rows)); // printed so a broken harness can't read as a clean negative
    expect(rows).toEqual([
      { name: "Bloodied Ghost", printed: "3/3", counters: 1, derived: "2/2", expected: 1 },
      // ⭐ FIVE counters, not ten. This row is what pins the deliberate refusal to run the count through
      // applyCounterDoubling — doubling a printed DRAWBACK would make the card strictly worse than printed.
      { name: "Etched Monstrosity", printed: "10/10", counters: 5, derived: "5/5", expected: 5 },
    ]);
  });

  it("⛔ the variable-count carrier enters at PRINTED size — no fabricated counters", () => {
    const { st, p } = enter(CANKER_ABOMINATION);
    expect(p.counters?.["-1/-1"] ?? 0).toBe(0);
    expect(`${permanentPower(st, p.id)}/${permanentToughness(st, p.id)}`).toBe("5/5");
  });
});
