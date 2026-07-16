/**
 * Integration tests for ACT-KW-GRANT — a creature's "{cost}: This creature gains <KEYWORD> until end of
 * turn" self keyword-grant activated ability (and the same shape on a trigger). The parser produces a
 * `{op:"pump", target:"self", grantKeywords}` atom; the existing pump resolver applies a layer-6 keyword
 * grant to the SOURCE (CR 113.7) for the turn, reusing the combat-trick grant path. The enforced
 * GRANTABLE_COMBAT_KEYWORDS allowlist is the false-positive guard.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function creature(name, oracle, over = {}) {
  return { id: `card-${name}`, name, type: "Creature — Human", power: 2, toughness: 2, oracle, ...over };
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}

describe("ACT-KW-GRANT — classification (the allowlist is the FP guard)", () => {
  it("native-activated: {cost}: this creature gains an ENFORCED keyword until EOT", () => {
    expect(classifyCard(creature("Goblin Balloon Brigade", "{R}: This creature gains flying until end of turn."))).toBe("native-activated");
    expect(classifyCard(creature("Narnam Cobra", "{G}: This creature gains deathtouch until end of turn.", { type: "Artifact Creature — Snake" }))).toBe("native-activated");
    expect(classifyCard(creature("Firehoof Cavalry", "{3}{R}: This creature gets +2/+0 and gains trample until end of turn."))).toBe("native-activated");
    expect(classifyCard(creature("X", "{R}: This creature gains menace until end of turn."))).toBe("native-activated");
  });
  it("NOT native: granting a keyword NOT in GRANTABLE_STATIC_KEYWORDS stays off the native path", () => {
    expect(classifyCard(creature("Y", "{R}: This creature gains shadow until end of turn."))).not.toBe("native-activated"); // shadow un-grantable (indestructible now IS — PUMP-STATIC-GRANT)
  });
  it("NOT native: an activation-limit trailer the engine can't enforce sinks the ability", () => {
    // "only once each turn" graduated in BLITZ ONCE-1 (ledger-enforced — pinned in
    // activateOncePerTurn.test.js); "only twice each turn" is still unenforced and holds this pin.
    expect(classifyCard(creature("Z", "{R}: This creature gains flying until end of turn. Activate this ability only twice each turn."))).not.toBe("native-activated");
  });
});

describe("ACT-KW-GRANT — activate + resolve grants the keyword to the SOURCE", () => {
  it("activating {R}: gains flying gives THIS creature flying (layer-6, was absent before)", () => {
    const guy = createPermanent({ id: "perm-g", card: creature("Goblin Balloon Brigade", "{R}: This creature gains flying until end of turn."), controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [guy]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...s.players.user.manaPool, R: 1 } } } };
    expect(permanentHasKeyword(s, "perm-g", "Flying")).toBe(false); // vanilla Human — no flying yet

    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-g");
    expect(act).toBeTruthy();
    const after = resolveTopOfStack(dispatchAction(s, act));
    expect(permanentHasKeyword(after, "perm-g", "Flying")).toBe(true); // granted to the source until cleanup
  });
});
