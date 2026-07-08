/**
 * tokenCeasesToExist.test.js — CR 111.7 / 704.5d: a TOKEN that leaves the battlefield to ANY other zone
 * ceases to exist (a state-based action). moveCardToZone drops a token instead of adding it to the
 * destination (hand via bounce, graveyard via death, exile, library via tuck), so it never persists as a
 * castable card in hand or a body in a graveyard/exile. Its death / leave EVENTS still fire — dies-triggers
 * read the LKI `dead` list, not the graveyard — so a token's dies/LTB abilities resolve exactly as printed.
 *
 * Regression for a pre-existing engine-wide gap: every bounce / exile / tuck / sacrifice previously LEAKED
 * the token into a public zone, polluting self-play data.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, moveCardToZone, destroyLethalCreatures, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const tokenCreature = (id, name = "Beast") => createPermanent({ id, card: { id: `tok-${id}`, name, type: "Creature — Beast", power: 3, toughness: 3, token: true }, controller: "user", summoningSick: false });
const realCreature = (id, name = "Grizzly") => createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
const bf = (perms) => { const s = createGameState({ userDeck: [], aiDeck: [] }); return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms, hand: [], graveyard: [], exile: [] } } }; };

describe("token ceases to exist on leaving the battlefield (CR 111.7)", () => {
  it("BOUNCE — a token does not land in hand, and is off the battlefield", () => {
    const n = moveCardToZone(bf([tokenCreature("t")]), { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "t" });
    expect(n.players.user.hand.some((c) => c.name === "Beast")).toBe(false);       // vanished, not a castable card
    expect(n.players.user.battlefield.some((p) => p.id === "t")).toBe(false);      // gone from the battlefield
  });
  it("EXILE / TUCK — a token does not land in exile or the library", () => {
    const ex = moveCardToZone(bf([tokenCreature("t")]), { playerId: "user", fromZone: "battlefield", toZone: "exile", cardId: "t" });
    expect(ex.players.user.exile.some((c) => c.name === "Beast")).toBe(false);
    const lib = moveCardToZone(bf([tokenCreature("t")]), { playerId: "user", fromZone: "battlefield", toZone: "library", cardId: "t", toTop: true });
    expect(lib.players.user.library.some((c) => c.name === "Beast")).toBe(false);
  });
  it("DEATH — a token dies to the lethal SBA: NOT in the graveyard, but present in the `dead` list (so dies-triggers still fire)", () => {
    const s = bf([{ ...tokenCreature("t", "DToken"), damageMarked: 5 }]);
    const { state, dead } = destroyLethalCreatures(s);
    expect(state.players.user.graveyard.some((c) => c.name === "DToken")).toBe(false);   // ceased — not a graveyard body
    expect(state.players.user.battlefield.some((p) => p.id === "t")).toBe(false);        // gone
    expect(dead.some((d) => d.id === "t" || d.card?.name === "DToken")).toBe(true);       // its dies-triggers still fire from LKI
  });
  it("a REAL (non-token) card is unaffected — it moves to the destination normally", () => {
    const bounced = moveCardToZone(bf([realCreature("r")]), { playerId: "user", fromZone: "battlefield", toZone: "hand", cardId: "r" });
    expect(bounced.players.user.hand.some((c) => c.name === "Grizzly")).toBe(true);       // real card → hand
    const dead = destroyLethalCreatures(bf([{ ...realCreature("r"), damageMarked: 5 }])).state;
    expect(dead.players.user.graveyard.some((c) => c.name === "Grizzly")).toBe(true);      // real card → graveyard
  });
});
