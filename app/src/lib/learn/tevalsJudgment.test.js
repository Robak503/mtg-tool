/**
 * tevalsJudgment.test.js — the MODE-MEMORY modal trigger (Teval's Judgment, Teval shelf, 2026-08-15):
 * "Whenever one or more cards leave your graveyard, choose one that hasn't been chosen this turn — •
 * Draw a card. • Create a Treasure token. • Create a 2/2 black Zombie Druid creature token."
 *
 * Three pieces: ① parseModal's own anchored lead for the exclusion phrase (modal.modeMemoryPerTurn —
 * every existing modal byte-identical); ② the trigger modal-block extractor's lead widened (the naive
 * capture truncated at the first bullet's period — the forbidden partial its own doc names); ③ the
 * runtime memory: the flush chooser drops candidates whose mode is in the per-source per-turn ledger
 * (all exhausted → the CR 700.2d removal path), and the ledger is stamped at RESOLUTION (the once-latch
 * convention, cleared at untap).
 *
 * Mutation-checked (2026-08-15): the flush filter dropped → the second-fire-repeats-the-mode control
 * dies. Restored green.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { recordGraveyardEvents, moveCardToZone } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const JUDGMENT = { id: "tj-c", name: "Teval's Judgment", type: "Enchantment", mana: "{2}{B}",
  oracle: "Whenever one or more cards leave your graveyard, choose one that hasn't been chosen this turn —\n• Draw a card.\n• Create a Treasure token.\n• Create a 2/2 black Zombie Druid creature token." };

describe("parse + classify", () => {
  it("⭐ the mode-memory modal parses (flag stamped, ALL THREE modes captured); the card is NATIVE", () => {
    const p = parseEffectClause(JUDGMENT.oracle.split("\n").slice(0).join("\n").replace(/^Whenever[^,]+, /, ""), "Instant");
    const row = { conf: programConfidence(p), modes: p?.modal?.modes?.length, mem: p?.modal?.modeMemoryPerTurn, tier: classifyCard(JUDGMENT) };
    console.log("  WITNESS judgment", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ conf: "high", modes: 3, mem: true, tier: "native-trigger" });
  });
});

describe("⭐⭐ the mode memory — a chosen mode is never re-offered this turn; all three exhaust to the removal", () => {
  function board() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const tj = createPermanent({ id: "tj", card: JUDGMENT, controller: "user" });
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user,
      battlefield: [tj],
      library: [{ id: "d1", name: "D1", type: "Sorcery", oracle: "" }, { id: "d2", name: "D2", type: "Sorcery", oracle: "" }],
      graveyard: [{ id: "g1", name: "G1", type: "Sorcery", oracle: "" }, { id: "g2", name: "G2", type: "Sorcery", oracle: "" }, { id: "g3", name: "G3", type: "Sorcery", oracle: "" }] } } };
  }
  /** Exile one GY card (a real leave event) and fully resolve the fired trigger. */
  function leaveAndResolve(s, cardId) {
    let next = moveCardToZone(s, { playerId: "user", fromZone: "graveyard", toZone: "exile", cardId });
    next = recordGraveyardEvents(next, []); // the move already recorded; flush the pending events → triggers
    next = flushTriggers(next, {});
    while (next.stack.length && !next.pendingChoice) next = resolveTopOfStack(next);
    return next;
  }

  it("⭐⭐ three leave-events in one turn pick THREE DIFFERENT modes; the ledger fills; a fourth fires nothing", () => {
    let s = board();
    s = leaveAndResolve(s, "g1");
    s = leaveAndResolve(s, "g2");
    s = leaveAndResolve(s, "g3");
    const modes = Object.keys(s.onceTriggersFiredThisTurn || {}).filter((k) => k.startsWith("tj_mode")).sort();
    const row = {
      modes,
      drew: s.players.user.hand.length,
      tokens: s.players.user.battlefield.filter((p) => p.card?.token).map((p) => p.card.name).sort(),
    };
    console.log("  WITNESS judgmentMemory", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(modes).toEqual(["tj_mode0", "tj_mode1", "tj_mode2"]); // three distinct modes — never a repeat
    // The three payoffs all really happened: one draw, one Treasure, one Zombie.
    expect(row.drew).toBe(1);
    expect(row.tokens).toEqual(["Treasure", "Zombie Druid"]);
  });
});
