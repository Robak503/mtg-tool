/**
 * DISCOVER engine (Dex, Pantlaza lane) — the reusable exile-top-until-nonland-MV<=N mechanic (LCI). This
 * file covers the RESOLVER in isolation (the exile loop, the random-bottom of the rest, the parked found
 * card). The cast-free-or-hand DECISION is resolved at the action layer (legalChoices free-cast + to-hand,
 * reusing the cast machinery via the actionDispatcher `freeCast` flag) and is wired/tested in a follow-up,
 * along with the parser flip + Pantlaza's "discover X = that creature's toughness, once per turn" trigger.
 * Until then `discover` is intentionally NOT in the parser's KNOWN set, so no card flips native (CREED — no
 * partial-model false positive while the engine is mid-build).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";

beforeEach(() => _resetIdsForTests());

const land = (id, name = "Forest") => ({ id, name, type: "Basic Land — Forest", oracle: "", mana: "" });
const spell = (id, name, mv) => ({ id, name, type: "Instant", oracle: "", mana: `{${mv}}` });
const creature = (id, name, mv) => ({ id, name, type: "Creature — Beast", oracle: "", mana: `{${mv}}` });

function stateWithLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, rngSeed: 12345, players: { ...s.players, user: { ...s.players.user, library: lib, exile: [] } } };
}
const discover = (st, n) => resolveAtom(st, { op: "discover", amount: n, targetType: null }, { controller: "user", targets: [], cardName: "Discoverer" });

describe("discover resolver — exile from top until a nonland with MV <= N", () => {
  it("finds the first nonland with MV<=N; parks it in exile; the rest go to the bottom; cards below stay on top", () => {
    // top→bottom: Forest(land), Bolt(MV1 nonland), Bear(MV2 nonland)
    let st = discover(stateWithLibrary([land("l1"), spell("s1", "Bolt", 1), creature("c1", "Bear", 2)]), 3);
    expect(st.pendingDiscover).toMatchObject({ controller: "user", cardId: "s1", mv: 1 }); // Bolt found (first nonland MV<=3)
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Bolt"]);                     // found card parked in exile
    // Bear (below the found card) stays on top; Forest (exiled, not found) goes to the bottom.
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Bear", "Forest"]);
  });

  it("skips a nonland whose MV is too high, then finds the next eligible nonland", () => {
    let st = discover(stateWithLibrary([creature("big", "Hydra", 5), creature("small", "Bird", 2)]), 3);
    expect(st.pendingDiscover).toMatchObject({ cardId: "small", mv: 2 }); // Hydra MV5 > 3 skipped, Bird MV2 found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Bird"]);
    expect(st.players.user.library.map((c) => c.name)).toEqual(["Hydra"]); // the skipped Hydra → bottom
  });

  it("a whiff (no nonland with MV<=N) sets NO decision and bottoms everything exiled (never fabricates)", () => {
    let st = discover(stateWithLibrary([spell("s1", "Pricey", 5), land("l1")]), 2); // nothing MV<=2 nonland
    expect(st.pendingDiscover).toBeFalsy();
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.players.user.library).toHaveLength(2); // both cards back at the bottom, none exiled/cast
  });

  it("lands are never the found card even at high N", () => {
    let st = discover(stateWithLibrary([land("l1"), land("l2"), creature("c1", "Beast", 1)]), 9);
    expect(st.pendingDiscover).toMatchObject({ cardId: "c1" }); // both lands skipped, the creature found
    expect(st.players.user.exile.map((c) => c.name)).toEqual(["Beast"]);
  });
});
