/**
 * ENDURANCE — a chosen player's graveyard to the bottom of their library in a random order. SHELF-85 · Phase 3 (four decks), 2026-09-05.
 * "Flash / Reach / When this creature enters, up to one target player puts all the cards from their graveyard on the bottom
 * of their library in a random order. / Evoke—Exile a green card from your hand."
 *
 * One atom: a chosen player (optional — "up to one"), their WHOLE graveyard moved to the BOTTOM of their library in a
 * seeded random order. Not a shuffle: the library above the moved cards is untouched (a known top card stays known). The
 * atom's intent is ENEMY, so the trigger chooser aims it at an opponent. The order comes from the state's seeded RNG —
 * the same seed yields the same order (determinism-critical, never Math.random).
 *
 * Mutation-checked: see the run ledger (docs-sk112).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ENDURANCE = { id: "c-end", name: "Endurance", type: "Creature — Elemental Incarnation", mana: "{1}{G}{G}", power: "3", toughness: "4", keywords: ["Flash", "Reach", "Evoke"],
  oracle: "Flash\nReach\nWhen this creature enters, up to one target player puts all the cards from their graveyard on the bottom of their library in a random order.\nEvoke—Exile a green card from your hand." };
const CLAUSE = "up to one target player puts all the cards from their graveyard on the bottom of their library in a random order";

describe("the parser", () => {
  it("the ETB is detected; the clause reads to the optional player-targeted bottom atom with enemy intent; Endurance flips native", () => {
    const p = parseEffectClause(CLAUSE, "Creature");
    const row = { etb: detectTriggers(ENDURANCE).some((t) => t.event === "etb"), conf: programConfidence(p), atom: p.atoms[0], intent: atomTargetIntent(p.atoms[0]), tier: classifyCard(ENDURANCE) };
    console.log("  WITNESS endurance", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.etb).toBe(true);
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "gy-to-library-bottom", targetType: "player", maxTargets: 1, minTargets: 0 });
    expect(row.intent).toBe("enemy");
    expect(row.tier).toBe("native-trigger");
  });
});

const card = (id, name, type = "Instant") => ({ id, name, type, mana: "{U}", keywords: [], oracle: "" });
const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
function enter(aiGraveyard, seed = 7) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const end = createPermanent({ id: "end", card: ENDURANCE, controller: "user", summoningSick: true });
  let s = { ...s0, rngSeed: seed, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user",
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [end], graveyard: [card("ug1", "User Yard 1")], library: [card("ul1", "User Lib 1")] },
      ai: { ...s0.players.ai, graveyard: aiGraveyard, library: [card("top", "Known Top"), card("mid", "Middle")] } } };
  s = checkEnterTriggers(s, end);
  const pending = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "end").length;
  return { pending, out: resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets })) };
}

describe("RUNTIME — the trigger aims at the opponent, empties their graveyard onto the bottom of their library, and leaves the top untouched", () => {
  it("three cards in the opponent's graveyard: all three land on the BOTTOM of their library, the known top stays on top, the controller's own yard is untouched", () => {
    const { pending, out } = enter([card("g1", "Yard 1"), card("g2", "Yard 2"), card("g3", "Yard 3")]);
    const lib = out.players.ai.library.map((c) => c.id);
    const row = { pending, aiGy: out.players.ai.graveyard.length, libLen: lib.length, top: lib[0], second: lib[1], bottomSet: lib.slice(2).sort(), userGy: out.players.user.graveyard.length, log: (out.log || []).filter((e) => e.effect === "gy-to-library-bottom").map((e) => [e.player, e.moved]) };
    console.log("  WITNESS enduranceRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: 1, aiGy: 0, libLen: 5, top: "top", second: "mid", bottomSet: ["g1", "g2", "g3"], userGy: 1, log: [["ai", 3]] });
  });

  it("the order is seeded: the same seed gives the same bottom order, a different seed can differ, and the seed advances", () => {
    const a = enter([card("g1", "Y1"), card("g2", "Y2"), card("g3", "Y3"), card("g4", "Y4")], 7).out;
    const b = enter([card("g1", "Y1"), card("g2", "Y2"), card("g3", "Y3"), card("g4", "Y4")], 7).out;
    const row = { same: a.players.ai.library.map((c) => c.id).join(",") === b.players.ai.library.map((c) => c.id).join(","), seedAdvanced: a.rngSeed !== 7 };
    console.log("  WITNESS enduranceSeed", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ same: true, seedAdvanced: true });
  });

  it("an empty opponent graveyard: the trigger resolves as a logged no-op — the library is untouched", () => {
    const { out } = enter([]);
    const row = { lib: out.players.ai.library.map((c) => c.id), log: (out.log || []).filter((e) => e.effect === "gy-to-library-bottom").map((e) => e.moved) };
    console.log("  WITNESS enduranceEmpty", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ lib: ["top", "mid"], log: [0] });
  });
});
