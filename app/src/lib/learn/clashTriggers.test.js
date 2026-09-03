/**
 * clashTriggers.test.js — STAGE ④-2 (2026-09-03): the CLASH trigger event (CR 701.22) — "Whenever you clash
 * and win, you may draw a card." (Sylvan Echoes). Both clashing players clashed, so each player's own
 * watchers fire with that player's own result; a "…and win" watcher fires only for the winner. Fired by the
 * clash applier after the clash ends. Entangling Trap / Rebellion of the Flamekin share the condition but
 * carry riders that stay parked (pinned).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveOptionalChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ECHOES = { id: "c-echoes", name: "Sylvan Echoes", type: "Enchantment", mana: "{1}{G}", keywords: [], oracle: "Whenever you clash and win, you may draw a card. (This ability triggers after the clash ends.)" };
const TRAP = { id: "c-trap", name: "Entangling Trap", type: "Enchantment", mana: "{1}{W}", keywords: [], oracle: "Whenever you clash, tap target creature an opponent controls. If you won, that creature doesn't untap during its controller's next untap step. (This ability triggers after the clash ends.)" };
const ELITE = { id: "c-elite", name: "Nath's Elite", type: "Creature — Elf Warrior", mana: "{4}{G}", power: 4, toughness: 4, keywords: [], oracle: "All creatures able to block this creature do so.\nWhen this creature enters, clash with an opponent. If you win, put a +1/+1 counter on this creature. (Each clashing player reveals the top card of their library, then puts that card on their choice of the top or bottom. A player wins if their card had a greater mana value.)" };
const mv = (id, cmc, mana) => ({ id, name: "Card " + id, type: "Creature — Bear", mana, mana_cost: mana, cmc, power: 1, toughness: 1, oracle: "" });

function board({ mine, theirs, echoesOn }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const echoes = (pid) => (echoesOn.includes(pid) ? [createPermanent({ id: "echoes-" + pid, card: { ...ECHOES, id: "c-echoes-" + pid }, controller: pid, summoningSick: false })] : []);
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, hand: [], library: mine, battlefield: [createPermanent({ id: "elite", card: ELITE, controller: "user" }), ...echoes("user")] },
      ai: { ...s0.players.ai, hand: [], library: theirs, battlefield: echoes("ai") },
    },
  };
}
/** Fire the Elite's ETB (the clash) and resolve it; the resolution's finalizer flushes the clash watchers onto the stack. */
function clashViaElite(s) {
  const elite = s.players.user.battlefield.find((p) => p.id === "elite");
  return resolveTopOfStack(flushTriggers(checkEnterTriggers(s, elite)));
}
/** The Echoes triggers the resolution flushed onto the stack (a stack object's source is { permanentId, cardId,
 *  name }) plus any still pending (a pending trigger's source is the permanent). */
const echoesOnStack = (s) => [
  ...(s.stack || []).filter((o) => o.kind === "triggered-ability" && o.source?.name === "Sylvan Echoes"),
  ...(s.pendingTriggers || []).filter((t) => t.source?.card?.name === "Sylvan Echoes"),
];

describe("the detector", () => {
  it("'you clash and win' → a win-only clash watcher; 'you clash' → the bare one", () => {
    expect(detectTriggers(ECHOES).some((d) => d.event === "clash" && d.winOnly === true)).toBe(true);
    expect(detectTriggers(TRAP).some((d) => d.event === "clash" && !d.winOnly)).toBe(true);
  });
});

describe("runtime", () => {
  it("⭐ the user wins the clash → the user's Echoes fires; taking the 'may' draws a card", () => {
    const out = clashViaElite(board({ mine: [mv("m3", 3, "{2}{G}"), mv("m0", 0, "{0}")], theirs: [mv("t1", 1, "{G}")], echoesOn: ["user"] }));
    // The clash watcher was enqueued mid-resolution and flushed onto the STACK by the resolution's finalizer.
    const echoesTriggers = echoesOnStack(out);
    expect(echoesTriggers).toHaveLength(1);
    expect(echoesTriggers[0].controller).toBe("user");
    const resolved = resolveTopOfStack(out);
    expect(resolved.pendingChoice?.kind).toBe("optional-effect");
    const drew = resolveOptionalChoice(resolved, true);
    expect(drew.players.user.hand).toHaveLength(1);
  });

  it("⛔ the user LOSES the clash → the user's win-only Echoes does not fire; the OPPONENT's Echoes does (they clashed and won)", () => {
    const out = clashViaElite(board({ mine: [mv("m1", 1, "{G}")], theirs: [mv("t3", 3, "{2}{G}")], echoesOn: ["user", "ai"] }));
    expect(echoesOnStack(out).map((t) => t.controller)).toEqual(["ai"]);
  });

  it("a tie → nobody won → no win-only watcher fires on either side", () => {
    const out = clashViaElite(board({ mine: [mv("m2", 2, "{1}{G}")], theirs: [mv("t2", 2, "{1}{G}")], echoesOn: ["user", "ai"] }));
    expect(echoesOnStack(out)).toHaveLength(0);
  });
});

describe("classification", () => {
  it("Sylvan Echoes is native; Entangling Trap (a rider on the target) stays parked", () => {
    expect(classifyCard(ECHOES)).toMatch(/^native/);
    expect(classifyCard(TRAP)).not.toMatch(/^native/);
  });
});
