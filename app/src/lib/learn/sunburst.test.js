/**
 * sunburst.test.js — SUNBURST (CR 702.43a): "This permanent enters with a +1/+1 counter on it for each COLOR
 * of mana spent to cast it." Solarion, Suncrusher, Skyreach Manta, Suntouched Myr, Etched Oracle, Baton of
 * Courage.
 *
 * ⭐⭐ A MISSING QUESTION, AND THE ANSWER WAS ALREADY IN HAND AND THROWN AWAY. Sunburst (and converge) ask
 * "how many colours did you spend?" — and `planPayment` returns `spend: {W,U,B,R,G,C}`, the exact per-colour
 * tally `commitPaymentPlan` then deducts. Nothing recorded it. The build is three links: count it off the
 * plan at cast, thread it onto the spell's params beside `castFromZone`, stamp it on the entering permanent.
 *
 * ⛔⛔ THE PIN DRIVES THE REAL CAST PATH — dispatchAction, a real mana pool, a real payment — and NOT a
 * hand-stamped permanent. The property under test is that the number SURVIVES from payment to ETB across
 * three files; a fixture with `colorsSpent` set by hand would pass while the wiring was broken and prove
 * nothing. This is the pin the wake report's seam-map demanded in advance.
 *
 * ⛔ THE COUNTER KIND IS READ FROM THE TYPE LINE, never assumed. CR 702.43a: +1/+1 counters if it's a
 * creature, CHARGE counters otherwise. Baton of Courage is the non-creature artifact that proves it — a flat
 * "+1/+1" would have mis-modelled it silently, since it would still have entered with the right NUMBER.
 *
 * ⛔ C IS NOT A COLOUR (CR 105.1). Paying a generic cost with colourless mana adds nothing to the count, and
 * a spell paid entirely in colourless enters with ZERO counters — which is what the card says.
 *
 * ⓘ 50 cards print sunburst/converge; 6 flip here. The rest park on their EFFECTS (Spinal Parasite and
 * Sawtooth Thresher on their remove-counter abilities) — the colour count no longer holds them.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * count dropped from params -> the witness shows zero counters after a three-colour cast; C included as a
 * colour -> a colourless-funded cast wrongly gains a counter; the kind forced to "+1/+1" -> Baton of Courage
 * gets the wrong counter type.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseManaCost } from "./legalChoices.js";
import { sunburstCounterKind } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MYR = { id: "sb1", name: "Suntouched Myr", type: "Artifact Creature — Myr", mana: "{3}", power: "2", toughness: "2",
  oracle: "Sunburst (This creature enters with a +1/+1 counter on it for each color of mana spent to cast it.)" };
const BATON = { id: "sb2", name: "Baton of Courage", type: "Artifact", mana: "{3}",
  oracle: "Flash\nSunburst (This artifact enters with a charge counter on it for each color of mana spent to cast it.)\nRemove a charge counter from this artifact: Target creature gets +1/+1 until end of turn." };

describe("the counter KIND comes from the type line", () => {
  it("⭐ creature → +1/+1, non-creature artifact → charge (CR 702.43a)", () => {
    expect(sunburstCounterKind(MYR)).toBe("+1/+1");
    expect(sunburstCounterKind(BATON)).toBe("charge");
  });

  it("⛔ a card without the keyword is not sunburst", () => {
    expect(sunburstCounterKind({ name: "Bear", type: "Creature — Bear", oracle: "" })).toBeNull();
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(MYR)).toBe("native-body");
    expect(classifyCard(BATON)).toBe("native-activated");
  });
});

describe("⭐⭐ LAW 6 — the colour count survives PAYMENT → ETB through the real cast path", () => {
  /** Cast `card` for {3} out of the given pool, then resolve it, and return the entered permanent. */
  function castAndResolve(card, pool) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const start = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [card], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } } } };
    const cast = dispatchAction(start, { kind: "cast-spell", playerId: "user", cardId: card.id, name: card.name, cost: parseManaCost("{3}"), cmc: 3 });
    const resolved = resolveTopOfStack(cast);
    const s = resolved.state || resolved;
    return (s.players.user.battlefield || []).find((p) => p.card?.id === card.id);
  }

  it("⭐⭐ three colours spent → three counters; colourless-only → none", () => {
    const three = castAndResolve(MYR, { W: 1, U: 1, B: 1 });
    const colourless = castAndResolve(MYR, { C: 3 });
    const two = castAndResolve(MYR, { R: 2, G: 1 });
    const row = {
      threeColours: three?.counters?.["+1/+1"] ?? 0,
      colourlessOnly: colourless?.counters?.["+1/+1"] ?? 0,
      // ⛔ TWO colours, three mana — the count is DISTINCT COLOURS, not mana spent.
      twoColoursThreeMana: two?.counters?.["+1/+1"] ?? 0,
    };
    console.log("  WITNESS sunburst", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ threeColours: 3, colourlessOnly: 0, twoColoursThreeMana: 2 });
  });

  it("⭐⭐ a non-creature artifact gets CHARGE counters, not +1/+1", () => {
    const baton = castAndResolve(BATON, { W: 1, U: 1, B: 1 });
    const row = { charge: baton?.counters?.charge ?? 0, plusOne: baton?.counters?.["+1/+1"] ?? 0 };
    console.log("  WITNESS sunburstCharge", JSON.stringify(row));
    expect(row).toEqual({ charge: 3, plusOne: 0 });
  });
});
