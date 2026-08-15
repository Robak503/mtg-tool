/**
 * bloodghast.test.js — the GY-FUNCTIONING landfall self-return (Bloodghast, Teval shelf, 2026-08-15):
 * "Landfall — Whenever a land you control enters, you may return this card from your graveyard to the
 * battlefield." The Radroach/aura sentinel discipline, extended to the landfall event: the descriptor is
 * stamped functionsFromGraveyard, checkLandfallTriggers grows the GRAVEYARD scan (sourceCardId threads
 * the exact card) and its battlefield loop EXCLUDES the flag, and the marker resolves via
 * applyGySelfReturnBattlefield (a real enterCardFromZone ETB).
 *
 * Mutation-checked (2026-08-15): the graveyard scan removed from checkLandfallTriggers → the
 * return-on-landfall witness dies (no trigger fires). Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkLandfallTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BLOODGHAST = { id: "bg-c", name: "Bloodghast", type: "Creature — Vampire Spirit", power: "2", toughness: "1", mana: "{B}{B}",
  oracle: "This creature can't block.\nThis creature has haste as long as an opponent has 10 or less life.\nLandfall — Whenever a land you control enters, you may return this card from your graveyard to the battlefield." };

function landDrop(gy, battlefield = []) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const land = createPermanent({ id: "ld", card: { id: "ld-c", name: "Swamp", type: "Basic Land — Swamp", oracle: "" }, controller: "user" });
  let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [...battlefield, land], graveyard: gy } } };
  s = checkLandfallTriggers(s, land);
  s = flushTriggers(s, {});
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
}

describe("BLOODGHAST — classify + the runtime loop", () => {
  it("⭐ Bloodghast classifies NATIVE-MIXED (the landfall GY self-return was the last blocker)", () => {
    const row = { tier: classifyCard(BLOODGHAST) };
    console.log("  WITNESS bloodghast", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.tier).toBe("native-mixed");
  });

  it("⭐⭐ a land enters with Bloodghast in the graveyard → it RETURNS to the battlefield (a real ETB)", () => {
    const out = landDrop([BLOODGHAST]);
    const row = {
      onBattlefield: out.players.user.battlefield.some((p) => p.card?.id === "bg-c"),
      inGraveyard: out.players.user.graveyard.some((c) => c.id === "bg-c"),
    };
    console.log("  WITNESS bloodghastReturn", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ onBattlefield: true, inGraveyard: false });
  });

  it("the battlefield EXCLUSION holds: Bloodghast already on the battlefield fires nothing on a land drop", () => {
    const bgPerm = createPermanent({ id: "bg", card: BLOODGHAST, controller: "user" });
    const out = landDrop([], [bgPerm]);
    // exactly one Bloodghast permanent — no phantom trigger, no duplicate
    expect(out.players.user.battlefield.filter((p) => p.card?.name === "Bloodghast")).toHaveLength(1);
    expect(out.pendingTriggers || []).toHaveLength(0);
  });
});
