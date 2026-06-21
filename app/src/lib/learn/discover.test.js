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
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

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

describe("discover decision — the found card is cast FREE or put in hand (action layer)", () => {
  // A state mid-discover: the found card sits in exile + pendingDiscover is set. The decision is resolved
  // via legalChoices → dispatch (reusing the cast machinery: a freeCast cast-spell from exile, or to-hand).
  function midDiscover(found) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, exile: [found], manaPool: { ...s.players.user.manaPool } } },
      pendingDiscover: { controller: "user", cardId: found.id, mv: 2 },
    };
  }

  it("while a discover is pending, ONLY the two decisions are offered (cast-free + to-hand), nothing else", () => {
    const st = midDiscover(creature("f1", "Found Beast", 2));
    const acts = legalActionsForPlayer(st, "user");
    expect(acts.every(a => a.kind === "cast-spell" || a.kind === "discover-to-hand")).toBe(true);
    expect(filterActions(acts, "cast-spell").every(a => a.freeCast && a.fromZone === "exile")).toBe(true); // free, from exile
    expect(acts.some(a => a.kind === "discover-to-hand")).toBe(true);
    expect(legalActionsForPlayer(st, "ai")).toEqual([]); // no one else acts mid-resolution
  });

  it("casting the found creature FREE puts it on the stack with no mana paid → it enters the battlefield", () => {
    let st = midDiscover(creature("f1", "Found Beast", 2));
    const cast = filterActions(legalActionsForPlayer(st, "user"), "cast-spell")[0];
    st = dispatchAction(st, cast);
    expect(st.pendingDiscover).toBeFalsy();                                   // decision resolved
    expect(st.players.user.manaPool).toEqual({ W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }); // no mana paid
    expect(st.players.user.exile).toHaveLength(0);                            // left exile (now on the stack)
    st = resolveTopOfStack(st);                                               // the free-cast creature resolves
    expect(st.players.user.battlefield.some(p => p.card.name === "Found Beast")).toBe(true);
  });

  it("choosing put-in-hand moves the found card to hand and clears the decision (no cast)", () => {
    let st = midDiscover(spell("f1", "Found Bolt", 1));
    const toHand = legalActionsForPlayer(st, "user").find(a => a.kind === "discover-to-hand");
    st = dispatchAction(st, toHand);
    expect(st.pendingDiscover).toBeFalsy();
    expect(st.players.user.hand.map(c => c.name)).toEqual(["Found Bolt"]);
    expect(st.players.user.exile).toHaveLength(0);
    expect(st.stack).toHaveLength(0); // not cast
  });

  it("the AI resolves a pending discover (never stalls): casts a free body, never returns null", () => {
    const st = midDiscover(creature("f1", "Found Beast", 2));
    const picked = pickAction(st, "user", legalActionsForPlayer(st, "user"));
    expect(picked).toBeTruthy();
    expect(["cast-spell", "discover-to-hand"]).toContain(picked.kind);
  });
});

describe("discover — parser + coverage pins", () => {
  const atomsOf = (txt, ct = "Sorcery") => parseEffectClause(txt, ct)?.atoms;
  const isHigh = (txt, ct = "Sorcery") => programConfidence(parseEffectClause(txt, ct)) === "high";
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });

  it("parses the fixed 'Discover N' clause to a discover atom", () => {
    expect(atomsOf("Discover 5.")).toEqual([{ op: "discover", amount: 5, targetType: null }]);
    expect(atomsOf("Discover 3.")).toEqual([{ op: "discover", amount: 3, targetType: null }]);
  });

  it("Primordial Gnawer's dies-trigger 'discover 3' flips native-trigger (the engine resolves it)", () => {
    expect(classifyCard(C("Creature — Rat", "When this creature dies, discover 3.", "Primordial Gnawer"))).toBe("native-trigger");
  });

  it("CREED: count-scaled 'discover X', a discover-not-last sequence, and unmodeled riders stay LOW", () => {
    expect(isHigh("Discover 5. If the discovered card's mana value is less than 5, create a Treasure token.")).toBe(false); // Hit-the-Mother-Lode rider
    expect(isHigh("Discover 3, where X is that spell's mana value.")).toBe(false);                                          // count-scaled X (deferred)
    expect(isHigh("Discover 3. Draw a card.")).toBe(false); // discover-not-last → the decision resolves after the program (reorder guard)
    expect(classifyCard(C("Sorcery", "Up to three target creatures can't block this turn. Discover 4.", "Daring Discovery"))).toBe("arbiter-spell"); // unmodeled lead clause
  });
});
