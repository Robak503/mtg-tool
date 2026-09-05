/**
 * TEFERI, HERO OF DOMINARIA — the POSITIONAL TUCK. SHELF-85 · Atraxa A4, 2026-09-05.
 * "−3: Put target nonland permanent into its owner's library third from the top."
 *
 * The tuck parser refused every "Nth from the top" on purpose while the zone mover knew only top (prepend) and bottom
 * (append). The mover now takes a library INDEX (0 = the top) beside its top flag, clamped to the library's length; the
 * tuck atom carries the placement and the parser reads the ordinal — second / third / fourth — on the same target
 * words the top/bottom form reads. Five targeted printings ride it; "historic" is not a tuck target word and parks.
 *
 * Mutation-checked: see the run ledger (docs-sk81).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { tuckClauseParser } from "./effects/atoms/zones.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TEFERI = { id: "c-thd", name: "Teferi, Hero of Dominaria", type: "Legendary Planeswalker — Teferi", mana: "{3}{W}{U}", loyalty: "4", keywords: [],
  oracle: "+1: Draw a card. At the beginning of the next end step, untap up to two lands.\n−3: Put target nonland permanent into its owner's library third from the top.\n−8: You get an emblem with \"Whenever you draw a card, exile target permanent an opponent controls.\"" };
const ROCK = { id: "c-rock", name: "Stone Rock", type: "Artifact", mana: "{1}", keywords: [], oracle: "" };
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `L${i}`, name: `Lib ${i}`, type: "Sorcery", oracle: "" }));

function board(libSize) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [{ ...createPermanent({ id: "tef", card: TEFERI, controller: "user" }), counters: { loyalty: 4 } }] },
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "rock", card: ROCK, controller: "ai" })], library: lib(libSize) } } };
}
function fireMinusThree(s) {
  // One action per legal target — Teferi himself is a legal nonland permanent too, so pick the one aimed at the rock.
  const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-loyalty" && a.permanentId === "tef" && a.costDelta === -3);
  expect(acts.map((a) => a.targets[0]?.id).sort()).toEqual(["rock", "tef"]);
  const act = acts.find((a) => a.targets[0]?.id === "rock");
  const resolved = resolveTopOfStack(dispatchAction(s, act));
  return { library: resolved.players.ai.library.map((c) => c.id), aiBattlefield: resolved.players.ai.battlefield.length, loyalty: resolved.players.user.battlefield.find((p) => p.id === "tef")?.counters?.loyalty };
}

describe("the parser — the ordinal placement on the same target words", () => {
  it("reads second/third/fourth; the top/bottom forms are unchanged; 'historic' and 'fifth' are refused", () => {
    const row = {
      teferi: tuckClauseParser("Put target nonland permanent into its owner's library third from the top"),
      chrono: tuckClauseParser("Put target creature into its owner's library second from the top"),
      top: tuckClauseParser("Put target creature on top of its owner's library"),
    };
    console.log("  WITNESS positionalTuck", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.teferi).toEqual({ op: "tuck", targetType: "nonlandPermanent", where: "fromTop", libraryIndex: 2 });
    expect(row.chrono).toEqual({ op: "tuck", targetType: "creature", where: "fromTop", libraryIndex: 1 });
    expect(row.top).toEqual({ op: "tuck", targetType: "creature", where: "top" });
    expect(tuckClauseParser("Put target nonland historic permanent into its owner's library fourth from the top")).toBeNull();
    expect(tuckClauseParser("Put target creature into its owner's library fifth from the top")).toBeNull();
  });

  it("classification — Teferi, Hero of Dominaria flips to native-planeswalker", () => {
    expect(classifyCard(TEFERI)).toBe("native-planeswalker");
  });
});

describe("the zone mover — a library index beside the top flag", () => {
  it("index 2 lands third from the top; a short library clamps to the bottom; no index still appends", () => {
    const s = board(5);
    const at2 = moveCardToZone(s, { playerId: "ai", fromZone: "battlefield", toZone: "library", cardId: "rock", libraryIndex: 2 });
    expect(at2.players.ai.library.map((c) => c.id)).toEqual(["L0", "L1", "c-rock", "L2", "L3", "L4"]);
    const short = moveCardToZone(board(1), { playerId: "ai", fromZone: "battlefield", toZone: "library", cardId: "rock", libraryIndex: 2 });
    expect(short.players.ai.library.map((c) => c.id)).toEqual(["L0", "c-rock"]);
    const bottom = moveCardToZone(board(2), { playerId: "ai", fromZone: "battlefield", toZone: "library", cardId: "rock" });
    expect(bottom.players.ai.library.map((c) => c.id)).toEqual(["L0", "L1", "c-rock"]);
  });
});

describe("RUNTIME — the −3 through the real loyalty lane", () => {
  it("the opponent's artifact goes third from the top of a five-card library; Teferi pays 3", () => {
    const r = fireMinusThree(board(5));
    console.log("  WITNESS teferiRuntime", JSON.stringify(r)); // vitest 4 needs --disable-console-intercept
    expect(r).toEqual({ library: ["L0", "L1", "c-rock", "L2", "L3", "L4"], aiBattlefield: 0, loyalty: 1 });
  });

  it("on a one-card library it goes to the bottom", () => {
    expect(fireMinusThree(board(1)).library).toEqual(["L0", "c-rock"]);
  });
});
