/**
 * SAC-TREASURE — cracking a one-shot mana source (Treasure / Gold) for mana IS a sacrifice (CR 701.21), so
 * it must fire "Whenever you sacrifice an artifact / a permanent" (Korvold, Mayhem Devil, Pitiless Plunderer).
 * Before this, the three mana-payment sites moved the cracked artifact to the graveyard WITHOUT firing
 * sacrifice triggers (a SAFE false-negative the TRIG-SACRIFICE 4b surfaced). This wires checkSacrificeTriggers
 * into all three. Pure gameplay-faithfulness — 0 coverage delta (the watcher cards are already native via
 * TRIG-SACRIFICE detection). A normal (non-sacrificing) land tap must NOT fire — no over-fire.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KORVOLD = () => ({ id: "card-korvold", name: "Korvold", type: "Legendary Creature — Dragon", power: 4, toughness: 4, oracle: "Whenever you sacrifice a permanent, draw a card." });
const ARTWATCH = () => ({ id: "card-aw", name: "Artifact Lookout", type: "Creature — Artificer", power: 1, toughness: 1, oracle: "Whenever you sacrifice an artifact, draw a card." });
const treasure = (id) => createPermanent({ id, card: { id: `card-${id}`, name: "Treasure", type: "Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." }, controller: "user", summoningSick: false });
const forest = (id) => createPermanent({ id, card: { id: `card-${id}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user", summoningSick: false });
const watcher = (id, c) => createPermanent({ id, card: c, controller: "user", summoningSick: false });

function board(userBf, library = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf, library } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const lib = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: "Card", type: "Instant" }));
const handIds = (s) => s.players.user.hand.map(c => c.id);

describe("SAC-TREASURE — cracking a Treasure for mana fires sacrifice triggers", () => {
  it("the explicit crack-for-mana action sacrifices the Treasure and fires BOTH a permanent- and an artifact-scope watcher", () => {
    let s = board([watcher("k", KORVOLD()), watcher("aw", ARTWATCH()), treasure("treas")], lib(4));
    s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "treas", color: "C", amount: 1, sacrifices: true });
    // the Treasure is gone (sacrificed, not just tapped)
    expect(s.players.user.battlefield.some(p => p.id === "treas")).toBe(false);
    s = resolveAll(flushTriggers(s));
    // Korvold ("a permanent") AND the artifact watcher BOTH fired — a Treasure is an artifact permanent
    expect(s.players.user.hand).toHaveLength(2);
    expect(handIds(s)).toEqual(expect.arrayContaining(["lib-0", "lib-1"]));
  });

  it("a creature-scope watcher does NOT fire on a Treasure crack (it's not a creature)", () => {
    const beastWatch = watcher("bw", { id: "card-bw", name: "Beast Whisperer Jr", type: "Creature", power: 1, toughness: 1, oracle: "Whenever you sacrifice a creature, draw a card." });
    let s = board([beastWatch, treasure("treas")], lib(2));
    s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "treas", color: "C", amount: 1, sacrifices: true });
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.hand).toHaveLength(0); // creature-scope must NOT fire on an artifact sac
  });

  it("tapping a normal land (no sacrifice) does NOT fire a sacrifice trigger — no over-fire", () => {
    let s = board([watcher("k", KORVOLD()), forest("f")], lib(2));
    s = dispatchAction(s, { kind: "tap-for-mana", playerId: "user", permanentId: "f", color: "G", amount: 1 }); // sacrifices: undefined → just taps
    expect(s.players.user.battlefield.some(p => p.id === "f")).toBe(true); // still on battlefield (tapped, not sac'd)
    s = resolveAll(flushTriggers(s));
    expect(s.players.user.hand).toHaveLength(0); // no sacrifice happened → Korvold silent
  });
});
