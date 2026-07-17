/**
 * ===== REVEAL-TOP-CONDITIONAL — the entersTapped battlefield-route + the scry/draw with-else family =====
 *
 * BLITZ RV-1. The parameterized TOP-CARD ROUTER (matchRevealTopConditional → applyRevealTopConditional) already
 * models the reveal-top-conditional siblings whose branches are put-onto-battlefield (untapped), put-into-hand,
 * put-into-graveyard, and draw. Thrasios, Triton Hero parked on the one missing branch: "put it onto the
 * battlefield TAPPED", plus a leading "Scry 1, then " prefix on the WITH-otherwise shape and an "otherwise,
 * draw a card" else. All three are near-misses on already-modeled machinery:
 *   - the tapped battlefield-route rides the SAME enterCardFromZone seam as the untapped route (ETB /
 *     permanent-enters / landfall fire), just entering the permanent already tapped;
 *   - "draw a card" is a REAL draw (applyDrawEffect — the count bumps, the opposite of put-into-hand);
 *   - the "Scry N, then " prefix prepends a real scry atom, returned as the {atoms} multi-atom shape exactly
 *     like the no-else rt2 branch (Llanowar Empath / Track Down).
 *
 * Reveal honesty: Thrasios says "REVEAL the top card" (public — CR 701.20a), so logging the revealed card's name
 * is correct (a private "look" would not be). CREED near-misses stay body-only: Hans Eriksson (tapped-AND-
 * attacking + fight rider), Enduring Renewal (a draw-replacement effect + a return trigger), Nadu, Winged Wisdom
 * (a "triggers only twice each turn" rider on a granted ability) all carry unmodeled residue → whole card parks.
 *
 * Real oracle text verified via cardIndex.lookupCard during authoring (bundled Scryfall), carried inline per
 * house style.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { applyRevealTopConditional } from "./library.js";
import { _resetIdsForTests, createGameState } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

// ── REAL oracle (cardIndex.lookupCard, bundled Scryfall) ──
const THRASIOS =
  "{4}: Scry 1, then reveal the top card of your library. If it's a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)";
const HANS =
  "Whenever Hans Eriksson attacks, reveal the top card of your library. If it's a creature card, put it onto the battlefield tapped and attacking defending player or a planeswalker they control. Otherwise, put that card into your hand. When you put a creature card onto the battlefield this way, it fights Hans Eriksson.";
const ENDURING_RENEWAL =
  "Play with your hand revealed.\nIf you would draw a card, reveal the top card of your library instead. If it's a creature card, put it into your graveyard. Otherwise, draw a card.\nWhenever a creature is put into your graveyard from the battlefield, return it to your hand.";
const NADU =
  "Flying\nCreatures you control have \"Whenever this creature becomes the target of a spell or ability, reveal the top card of your library. If it's a land card, put it onto the battlefield. Otherwise, put it into your hand. This ability triggers only twice each turn.\"";

describe("REVEAL-TOP-CONDITIONAL tapped — recognition + classification", () => {
  it("Thrasios's ability parses to [scry, router] with predicate=land, thenRoute=battlefield-tapped, elseRoute=draw", () => {
    const p = parseEffectClause(
      "scry 1, then reveal the top card of your library. if it's a land card, put it onto the battlefield tapped. otherwise, draw a card",
      "Creature",
      { hasX: false },
    );
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["scry", "reveal-top-conditional"]);
    expect(p.atoms[0]).toMatchObject({ op: "scry", amount: 1 });
    expect(p.atoms[1]).toMatchObject({ predicate: "land", thenRoute: "battlefield-tapped", elseRoute: "draw" });
  });

  it("the bare (no-scry) tapped/draw with-else shape parses to ONE router atom", () => {
    const p = parseEffectClause(
      "reveal the top card of your library. if it's a land card, put it onto the battlefield tapped. otherwise, draw a card",
      "Instant",
      { hasX: false },
    );
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "reveal-top-conditional", predicate: "land", thenRoute: "battlefield-tapped", elseRoute: "draw" });
  });

  it("Thrasios, Triton Hero flips native-activated (was body-only — the tapped route + scry/draw with-else were the only blockers)", () => {
    expect(classifyCard({ name: "Thrasios, Triton Hero", type: "Legendary Creature — Merfolk Wizard", oracle: THRASIOS })).toBe("native-activated");
  });

  it("CREED FN guards stay body-only (tapped-AND-attacking + fight; draw-replacement; 'twice each turn' granted rider)", () => {
    expect(classifyCard({ name: "Hans Eriksson", type: "Legendary Creature — Human Scout", oracle: HANS })).toBe("body-only");
    expect(classifyCard({ name: "Enduring Renewal", type: "Enchantment", oracle: ENDURING_RENEWAL })).toBe("body-only");
    expect(classifyCard({ name: "Nadu, Winged Wisdom", type: "Legendary Creature — Bird Wizard", oracle: NADU })).toBe("body-only");
  });

  it("CREED parser guard: Hans's 'onto the battlefield tapped AND attacking …' rider is unmodeled residue → LOW", () => {
    const p = parseEffectClause(
      "reveal the top card of your library. if it's a creature card, put it onto the battlefield tapped and attacking defending player or a planeswalker they control. otherwise, put that card into your hand",
      "Creature",
      { hasX: false },
    );
    expect(programConfidence(p)).toBe("low");
  });
});

// ── runtime helper: a single-player state with a stacked library (top = index 0) ──
function withLibrary(lib) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [], hand: [], graveyard: [], library: lib, cardsDrawnThisTurn: 0 },
    },
  };
}
const TAPPED_DRAW_ATOM = { op: "reveal-top-conditional", predicate: "land", thenRoute: "battlefield-tapped", elseRoute: "draw" };

describe("REVEAL-TOP-CONDITIONAL tapped — resolver runtime (applyRevealTopConditional)", () => {
  it("a LAND top → onto the battlefield TAPPED (removed from library, entered tapped), reveal logged publicly by name", () => {
    const forest = { id: "forest", name: "Forest", type: "Basic Land — Forest", oracle: "" };
    const filler = { id: "f", name: "F", type: "Instant" };
    const s = withLibrary([forest, filler]);
    const after = applyRevealTopConditional(s, TAPPED_DRAW_ATOM, { controller: "user" });
    const entered = after.players.user.battlefield.find((p) => p.card.id === "forest");
    expect(entered).toBeTruthy();
    expect(entered.tapped).toBe(true);                                 // "onto the battlefield TAPPED"
    expect(after.players.user.library.map((c) => c.id)).toEqual(["f"]); // top consumed
    expect(after.players.user.cardsDrawnThisTurn).toBe(0);             // the land path is NOT a draw
    const rec = after.log[after.log.length - 1];
    expect(rec).toMatchObject({ effect: "reveal-top-conditional", revealed: "Forest", toBattlefield: true, tapped: true });
  });

  it("a NON-LAND top → the ELSE branch is a REAL draw (the revealed card enters hand, count bumps), reveal logged by name", () => {
    const bolt = { id: "bolt", name: "Lightning Bolt", type: "Instant", oracle: "" };
    const filler = { id: "f", name: "F", type: "Instant" };
    const s = withLibrary([bolt, filler]);
    const after = applyRevealTopConditional(s, TAPPED_DRAW_ATOM, { controller: "user" });
    expect(after.players.user.battlefield).toHaveLength(0);            // nothing entered
    expect(after.players.user.hand.map((c) => c.id)).toEqual(["bolt"]); // the revealed top was drawn
    expect(after.players.user.cardsDrawnThisTurn).toBe(1);            // a genuine draw (CR 121.1)
    const rec = after.log[after.log.length - 1];
    expect(rec).toMatchObject({ effect: "reveal-top-conditional", revealed: "Lightning Bolt", drew: true });
  });

  it("EMPTY library → a clean no-op reveal of zero cards (nothing enters, nothing drawn)", () => {
    const s = withLibrary([]);
    const after = applyRevealTopConditional(s, TAPPED_DRAW_ATOM, { controller: "user" });
    expect(after.players.user.battlefield).toHaveLength(0);
    expect(after.players.user.hand).toHaveLength(0);
    expect(after.players.user.cardsDrawnThisTurn).toBe(0);
    expect(after.log[after.log.length - 1]).toMatchObject({ effect: "reveal-top-conditional", revealed: null });
  });
});
