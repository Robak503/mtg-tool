/**
 * switchPt.test.js — SWITCH-PT: "switch [target / this / the triggering] creature's power and toughness
 * until end of turn" (Transmutation, About Face, Twisted Image; the {T}/activated forms — Dwarven
 * Thaumaturgist, Crag Puca).
 *
 * A new `switch-pt` atom: a layer-7 sublayer-7d endOfTurn continuous effect. layers.computeDerivedPT ALREADY
 * swaps power⇄toughness for every 7d effect, so the atom just records the marker; it wears off at cleanup
 * (CR 514.2). splitClauses keeps "power and toughness" whole (the internal " and " is not an effect boundary).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence, parseEffectProgram } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness, expireContinuousEffects } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── 1. Parser ────────────────────────────────────────────────────────────────────
describe("switch-pt — parser (the 3 referents; 'power and toughness' kept whole)", () => {
  it("'switch target creature's power and toughness until end of turn' → switch-pt / creature, HIGH", () => {
    const p = parseEffectClause("switch target creature's power and toughness until end of turn", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "switch-pt", targetType: "creature" }]);
  });
  it("'this creature' → target:self; 'the triggering creature' → target:thatCreature", () => {
    expect(parseEffectClause("switch this creature's power and toughness until end of turn", "Instant").atoms)
      .toEqual([{ op: "switch-pt", target: "self" }]);
    expect(parseEffectClause("switch the triggering creature's power and toughness until end of turn", "Instant").atoms)
      .toEqual([{ op: "switch-pt", target: "thatCreature" }]);
  });
  it("the trailing 'and' is NOT split (a +draw rider rides along — Twisted Image)", () => {
    const p = parseEffectProgram({ type: "Instant", mana: "{U}", oracle: "Switch target creature's power and toughness until end of turn.\nDraw a card." });
    expect(p.atoms).toEqual([{ op: "switch-pt", targetType: "creature" }, { op: "draw", amount: 1, targetType: null }]);
  });
});

// ─── 2. Resolver — the layer-7d swap ───────────────────────────────────────────────
describe("switch-pt — resolver swaps P/T via layer 7d, wears off at cleanup", () => {
  function state(power, toughness) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const c = createPermanent({ id: "c", card: { id: "cc", name: "Wall", type: "Creature — Wall", power, toughness, oracle: "" }, controller: "user", summoningSick: false });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [c] } } };
  }
  it("a 1/4 becomes 4/1 after the switch", () => {
    let s = state(1, 4);
    expect([permanentPower(s, "c"), permanentToughness(s, "c")]).toEqual([1, 4]);
    s = resolveAtom(s, { op: "switch-pt", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "c" }] });
    expect([permanentPower(s, "c"), permanentToughness(s, "c")]).toEqual([4, 1]);
  });
  it("the swap is endOfTurn — it expires at cleanup (CR 514.2)", () => {
    let s = state(0, 3);
    s = resolveAtom(s, { op: "switch-pt", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "c" }] });
    expect([permanentPower(s, "c"), permanentToughness(s, "c")]).toEqual([3, 0]);
    s = expireContinuousEffects(s, { atCleanupOfTurn: s.turn });
    expect([permanentPower(s, "c"), permanentToughness(s, "c")]).toEqual([0, 3]); // back to printed
  });
  it("no chosen target → clean no-op", () => {
    let s = state(2, 5);
    s = resolveAtom(s, { op: "switch-pt", targetType: "creature" }, { controller: "user", targets: [] });
    expect([permanentPower(s, "c"), permanentToughness(s, "c")]).toEqual([2, 5]);
  });
});

// ─── 3. Coverage flips + CREED guards ──────────────────────────────────────────────
describe("switch-pt — coverage", () => {
  it("a spell → native-spell (incl. a +draw rider); a {T}/mana activated → native-activated", () => {
    expect(classifyCard({ name: "Transmutation", type: "Instant", mana: "{1}{U}", oracle: "Switch target creature's power and toughness until end of turn." })).toBe("native-spell");
    expect(classifyCard({ name: "Twisted Image", type: "Instant", mana: "{U}", oracle: "Switch target creature's power and toughness until end of turn.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Dwarven Thaumaturgist", type: "Creature — Dwarf", mana: "{2}{R}", oracle: "{T}: Switch target creature's power and toughness until end of turn." })).toBe("native-activated");
  });
  it("Aquamoeba flips (DC-1 graduation — γ1h pays the discard); a modal with an unmodeled mode stays non-native", () => {
    expect(classifyCard({ name: "Aquamoeba", type: "Creature — Elemental Beast", mana: "{1}{U}", oracle: "Discard a card: Switch this creature's power and toughness until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Very Cryptic Command", type: "Instant", mana: "{X}{U}{U}", oracle: "Choose two —\n• Untap two target permanents.\n• Switch target creature's power and toughness until end of turn.\n• Return target instant or sorcery card from your graveyard to your hand." })).not.toMatch(/^native/);
  });
});
