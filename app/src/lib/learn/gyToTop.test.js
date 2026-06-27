/**
 * gyToTop.test.js — GY-TO-TOP: "put target <X> card from your graveyard on top of your library" (Reclaim,
 * Salvage, False Mourning; Haunted Crossroads activated; Bloodwater Entity / Dukhara Scavenger ETB). Reuses
 * the return-from-graveyard atom (same chosen-graveyard-card target + parseGraveyardFilter) with a
 * `toLibraryTop` flag → applyReturnFromGraveyard routes the card to the TOP of the library, not the hand.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

describe("gy-to-top — parser", () => {
  it("'put target card from your graveyard on top of your library' → return-from-graveyard + toLibraryTop", () => {
    const p = parseEffectClause("Put target card from your graveyard on top of your library.", "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", toLibraryTop: true }]);
  });
  it("a typed filter ('creature card') is preserved", () => {
    const p = parseEffectClause("Put target creature card from your graveyard on top of your library.", "Instant");
    expect(p.atoms[0]).toMatchObject({ op: "return-from-graveyard", cardFilter: "creature", toLibraryTop: true });
  });
});

describe("gy-to-top — resolver moves the card to the TOP of the library (not hand)", () => {
  it("the chosen graveyard card becomes library[0]; the graveyard no longer holds it; the hand is untouched", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const card = { id: "gc", name: "Lightning Bolt", type: "Instant", oracle: "" };
    const filler = { id: "lib0", name: "Forest", type: "Basic Land — Forest", oracle: "" };
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [card], library: [filler], hand: [] } } };
    const after = resolveAtom(s, { op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "any", toLibraryTop: true }, { controller: "user", targets: [{ type: "graveyardCard", id: "gc" }] });
    expect(after.players.user.library[0].id).toBe("gc");           // on TOP of library
    expect(after.players.user.library.map(c => c.id)).toEqual(["gc", "lib0"]);
    expect(after.players.user.graveyard.some(c => c.id === "gc")).toBe(false); // left the graveyard
    expect(after.players.user.hand.length).toBe(0);                // NOT to hand
  });
});

describe("gy-to-top — coverage flips", () => {
  const C = (name, oracle, type = "Sorcery") => ({ name, oracle, type, keywords: [], mana: "{G}" });
  it("spell + activated forms flip native", () => {
    expect(classifyCard(C("Reclaim", "Put target card from your graveyard on top of your library."))).toBe("native-spell");
    expect(classifyCard(C("Haunted Crossroads", "{B}: Put target creature card from your graveyard on top of your library.", "Enchantment"))).toBe("native-activated");
  });
});
