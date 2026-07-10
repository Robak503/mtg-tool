/**
 * castProgramStrip.test.js — S1.1 (shelf run): the cast action's program must be built from
 * the cost-only-keyword-STRIPPED oracle. The unstripped parse returned a LOW/empty (truthy)
 * program for Convoke carriers, which short-circuited the dispatcher's stripped fallback via
 * `action.program ||` and no-opped resolution — Harmonized Crescendo logged spell-unresolved
 * ×3 in the Phase-0 live-fire DESPITE classifying native (the classic runtime-mismatch FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

// The real Harmonized Crescendo shape (oracle verbatim from the bundled index).
const HC = {
  id: "hc1",
  name: "Harmonized Crescendo",
  type: "Instant",
  mana: "{4}{U}{U}",
  cmc: 6,
  oracle: "Convoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nChoose a creature type. Draw a card for each permanent you control of that type.",
};

describe("S1.1 — cast programs parse the STRIPPED oracle (Convoke/Affinity runtime-mismatch)", () => {
  it("Harmonized Crescendo's cast action carries the HIGH body program (not the raw LOW parse)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [HC], manaPool: { W: 0, U: 6, B: 0, R: 0, G: 0, C: 0 } } },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hc1");
    expect(cast).toBeTruthy();
    expect(cast.program?.atoms?.length).toBeGreaterThan(0); // the raw parse gave [] — the bug
    expect(cast.program.atoms[0].op).toBe("draw");
  });

  it("resolves END-TO-END: draws per chosen-type permanent, ZERO spell-unresolved", () => {
    const sliver = (i) => createPermanent({ id: `sl${i}`, card: { id: `c${i}`, name: `Sliver ${i}`, type: "Creature — Sliver", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: {
          ...s.players.user, hand: [HC], battlefield: [sliver(1), sliver(2), sliver(3)],
          library: [{ id: "L1", name: "C1" }, { id: "L2", name: "C2" }, { id: "L3", name: "C3" }, { id: "L4", name: "C4" }],
          manaPool: { W: 0, U: 6, B: 0, R: 0, G: 0, C: 0 },
        },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hc1");
    const after = resolveTopOfStack(dispatchAction(s, cast));
    expect(after.log.filter((e) => e.kind === "spell-unresolved")).toHaveLength(0);
    expect(after.players.user.library).toHaveLength(1); // drew 3 (three Slivers on board)
  });
});
