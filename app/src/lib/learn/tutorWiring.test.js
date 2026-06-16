/**
 * P3.2 wiring — a tutor spell + an ETB tutor trigger resolve end-to-end through the
 * live action / flush path: the engine auto-picks a LEGAL matching library card into
 * the caster's hand and shuffles. (The fetched card is hidden in the log — no leak.)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, createPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const lib = (id, name, type, mana = "") => ({ id, name, type, mana });

function mainState({ who = "user", hand = [], library = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: who, priorityHolder: who, consecutivePasses: 0,
    players: {
      ...s.players,
      [who]: { ...s.players[who], hand, library, manaPool: { ...s.players[who].manaPool, ...pool } },
    },
  };
}

const FABRICATE = { id: "fab", name: "Fabricate", type: "Sorcery", mana: "{2}{U}",
  oracle: "Search your library for an artifact card, reveal it, put it into your hand, then shuffle." };

describe("tutor spell — end to end", () => {
  it("casting a tutor auto-fetches the best matching card into hand and shuffles", () => {
    const state = mainState({
      hand: [FABRICATE], pool: { U: 1, C: 2 },
      library: [lib("l", "Forest", "Basic Land — Forest"), lib("a1", "Sol Ring", "Artifact", "{1}"), lib("a2", "Gilded Lotus", "Artifact", "{5}")],
    });
    const cast = filterActions(legalActionsForPlayer(state, "user"), "cast-spell").find(c => c.cardId === "fab");
    expect(cast).toBeTruthy();
    expect(cast.needsTargets).toBeFalsy(); // non-targeted (auto-pick at resolution)
    const resolved = resolveTopOfStack(dispatchAction(state, cast));
    expect(resolved.players.user.hand.map(c => c.name)).toContain("Gilded Lotus"); // highest-MV artifact
    expect(resolved.players.user.library.some(c => c.name === "Gilded Lotus")).toBe(false);
    expect(resolved.log.find(l => l.effect === "tutor")?.cardName).toBeUndefined(); // hidden
  });

  it("the AI will cast a tutor (value play, not held) and not stall", () => {
    const state = mainState({
      who: "ai", hand: [{ ...FABRICATE, id: "aifab" }], pool: { U: 1, C: 2 },
      library: [lib("a", "Sol Ring", "Artifact", "{1}")],
    });
    const picked = pickAction(state, "ai", legalActionsForPlayer(state, "ai"));
    expect(picked?.kind).toBe("cast-spell");
    expect(picked.cardId).toBe("aifab");
  });
});

describe("ETB tutor trigger — flush auto-resolves (non-targeted, harmless auto-pick)", () => {
  it("an ETB 'search for an artifact card' trigger routes natively and fetches to hand", () => {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const snake = createPermanent({ id: "perm-mage", card: { name: "Trophy Mage", type: "Creature — Wizard", oracle: "When Trophy Mage enters, search your library for an artifact card, reveal it, put it into your hand, then shuffle." }, controller: "user", summoningSick: true });
    const trigger = {
      event: "etb", source: { name: "Trophy Mage", permanentId: "perm-mage" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "search your library for an artifact card, reveal it, put it into your hand, then shuffle", interveningIf: null },
      context: {}, targets: [], payload: { resolver: "trigger.effect", params: { effect: null, controller: "user", targets: [], context: {} } },
    };
    let s = {
      ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
      players: { ...base.players, user: { ...base.players.user, battlefield: [snake], library: [{ id: "a", name: "Sol Ring", type: "Artifact", mana: "{1}" }] } },
      pendingTriggers: [trigger],
    };
    s = flushTriggers(s);
    const trig = s.stack.find(o => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program"); // routed natively (auto-pick is harmless)
    s = resolveTopOfStack(s);
    expect(s.players.user.hand.map(c => c.name)).toEqual(["Sol Ring"]);
  });
});
