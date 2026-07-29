/**
 * layerOneCopy.test.js — LAYER 1: a permanent BECOMES A COPY of another (CR 613.1a / 707.9).
 *
 * Layers 1–3 were explicit no-op pass-throughs in deriveCharacteristics, so nothing could ever change what
 * a permanent fundamentally IS. 34 corpus cards print "becomes a copy of … until end of turn" and the
 * clause is the SOLE blocker on nine of them — including two Did you say Dragons? shelf cards, Sarkhan,
 * Soul Aflame and Scion of the Ur-Dragon.
 *
 * ⛔ THIS FILE IS THE RUNTIME ASSERTION, AND IT COMES BEFORE ANY TIER CREDIT. The BLOCKED list records
 * ATTACHED-UNBLOCKABLE: a grant that measured GAINED 4 · LOST 0 · RETIERED 0 on the tier diff while the
 * keyword was never actually on the creature. A copy effect that classifies native while the permanent's
 * characteristics never change is that same failure. Ask the board, not the diff — so this increment ships
 * the layer and its board assertions, and credits no card.
 *
 * WHAT LAYER 1 MEANS HERE: the effect replaces the permanent's COPIABLE VALUES (what its printed card would
 * be), and every later layer applies on top of the NEW base (CR 613.1a). The implementation is therefore a
 * card substitution ahead of the printed-value readers, with layers 4–7 untouched.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { addContinuousEffect, deriveCharacteristics } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BEAR = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const DRAGON = { id: "drg", name: "Shivan Dragon", type: "Creature — Dragon", mana: "{4}{R}{R}", power: 5, toughness: 5, oracle: "Flying" };

function boardWith(perm) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
}
const bear = (over = {}) => createPermanent({ id: "p1", card: BEAR, controller: "user", ...over });
const copyEffect = (targetId, card, extra = {}) => ({
  layer: 1, op: "copy", copiableCard: card, affects: { mode: "self", permanentId: targetId },
  duration: { kind: "endOfTurn" }, ...extra,
});

describe("⭐ the permanent's characteristics actually change", () => {
  it("CONTROL — with no copy effect the Bear is a 2/2 Bear", () => {
    const c = deriveCharacteristics(boardWith(bear()), "p1");
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.subtypes).toContain("Bear");
    expect(c.copiableValues).toBeNull();
  });

  it("⭐ becoming a copy of a Shivan Dragon makes it a 5/5 Dragon with flying", () => {
    const { state } = addContinuousEffect(boardWith(bear()), copyEffect("p1", DRAGON));
    const c = deriveCharacteristics(state, "p1");
    expect([c.power, c.toughness]).toEqual([5, 5]);
    expect(c.subtypes).toContain("Dragon");
    expect(c.subtypes).not.toContain("Bear");
    expect(c.keywords.has("flying")).toBe(true);
    expect(c.copiableValues).toMatchObject({ name: "Shivan Dragon" });
  });
});

describe("⛔ CR 707.2 — COUNTERS ARE NOT COPIABLE and must survive", () => {
  it("⭐ a Bear with two +1/+1 counters that copies a 1/1 is a 3/3, not a 1/1", () => {
    // Counters live on the PERMANENT, not the card, so substituting only the card keeps them. Rebuilding
    // the permanent instead would have silently eaten them — and the card would read as printed.
    const ONE_ONE = { id: "x", name: "Mouse", type: "Creature — Mouse", mana: "{W}", power: 1, toughness: 1, oracle: "" };
    // createPermanent drops `counters` from its opts bag, so set it on the built permanent the way the
    // counter-placement path does — a fixture that quietly has NO counters would pass this test for the
    // wrong reason (1/1 copied, 1/1 read).
    const withCounters = bear();
    withCounters.counters = { "+1/+1": 2 };
    const { state } = addContinuousEffect(boardWith(withCounters), copyEffect("p1", ONE_ONE));
    const c = deriveCharacteristics(state, "p1");
    expect([c.power, c.toughness]).toEqual([3, 3]);
    expect(c.subtypes).toContain("Mouse");
  });
});

describe("⛔ CR 613.7b — the LATEST copy wins", () => {
  it("two copy effects resolve in timestamp order", () => {
    let s = boardWith(bear());
    ({ state: s } = addContinuousEffect(s, copyEffect("p1", DRAGON, { timestamp: 1 })));
    const MOUSE = { id: "m", name: "Mouse", type: "Creature — Mouse", mana: "{W}", power: 1, toughness: 1, oracle: "" };
    ({ state: s } = addContinuousEffect(s, copyEffect("p1", MOUSE, { timestamp: 2 })));
    const c = deriveCharacteristics(s, "p1");
    expect([c.power, c.toughness]).toEqual([1, 1]);
    expect(c.subtypes).toContain("Mouse");
  });

  it("and the order is by TIMESTAMP, not insertion order", () => {
    // Inserted newest-first; the older timestamp must still lose.
    let s = boardWith(bear());
    ({ state: s } = addContinuousEffect(s, copyEffect("p1", DRAGON, { timestamp: 9 })));
    const MOUSE = { id: "m", name: "Mouse", type: "Creature — Mouse", mana: "{W}", power: 1, toughness: 1, oracle: "" };
    ({ state: s } = addContinuousEffect(s, copyEffect("p1", MOUSE, { timestamp: 2 })));
    const c = deriveCharacteristics(s, "p1");
    expect([c.power, c.toughness]).toEqual([5, 5]); // the Dragon, timestamp 9
  });
});

describe("⛔ scope — the effect touches only its target", () => {
  it("a bystander is unaffected", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const two = {
      ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
        bear(), createPermanent({ id: "p2", card: BEAR, controller: "user" }),
      ] } },
    };
    const { state } = addContinuousEffect(two, copyEffect("p1", DRAGON));
    expect(deriveCharacteristics(state, "p1").power).toBe(5);
    expect(deriveCharacteristics(state, "p2").power).toBe(2); // still a Bear
  });

  it("⛔ an effect with no copiableCard is ignored, never a blank body", () => {
    // A malformed record must leave the permanent printed rather than deriving a 0/0 that dies to the SBA.
    const { state } = addContinuousEffect(boardWith(bear()), { layer: 1, op: "copy", affects: { mode: "self", permanentId: "p1" }, duration: { kind: "endOfTurn" } });
    const c = deriveCharacteristics(state, "p1");
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.copiableValues).toBeNull();
  });
});
