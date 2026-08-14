/**
 * SOFT-COUNTER-RIDER (Dex, real-deck-unlock slice 3) — premium counters whose SECOND sentence makes the
 * COUNTERED spell's controller create tokens (CR — "its controller" = the controller of the spell that was
 * countered, NOT the caster):
 *   - An Offer You Can't Refuse "Counter target noncreature spell. Its controller creates two Treasure tokens."
 *   - Swan Song              "Counter target enchantment, instant, or sorcery spell. Its controller creates a
 *                            2/2 blue Bird creature token with flying."
 *
 * Extends the slice-2 `controllerRider` infrastructure to the COUNTER op (the rider is applied in applyCounter
 * to the countered spell's controller), and WIDENS the token-rider to NAMED tokens (Treasure/Clue/Food/Gold,
 * reusing applyCreateNamedToken) + KEYWORD tokens (Swan Song's flying Bird, via parseTokenKeywords). The
 * widening also lights up keyword/named-token REMOVAL riders (Angelic Ascension's flying Angel, Buy Your
 * Silence's Treasure). This file pins: parser, the cross-player engine-sim, and coverage.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const S = (oracle, type = "Instant") => parseEffectProgram({ type, oracle });
const isHigh = (oracle, type = "Instant") => programConfidence(S(oracle, type)) === "high";
const riderOf = (oracle, type = "Instant") => (S(oracle, type).atoms || []).find((a) => a.controllerRider)?.controllerRider;

describe("parser — counter + 'its controller' rider (SOFT-COUNTER-RIDER)", () => {
  it("An Offer / Swan Song parse to a counter atom carrying the rider (reminder stripped)", () => {
    expect(S('Counter target noncreature spell. Its controller creates two Treasure tokens. (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")').atoms)
      .toEqual([{ op: "counter", spellFilter: "noncreature", targetType: "spell", controllerRider: { kind: "createNamedToken", token: "treasure", count: 2 } }]);
    expect(S("Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.").atoms)
      .toEqual([{ op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell", controllerRider: { kind: "createToken", power: 2, toughness: 2, color: "blue", subtype: "bird", keywords: ["Flying"] } }]);
  });

  it("the token-rider widening also lights up KEYWORD/NAMED-token REMOVAL riders", () => {
    expect(riderOf("Exile target creature or planeswalker. Its controller creates a 4/4 white Angel creature token with flying.")) // Angelic Ascension
      .toEqual({ kind: "createToken", power: 4, toughness: 4, color: "white", subtype: "angel", keywords: ["Flying"] });
    expect(riderOf("Exile target nonland permanent. Its controller creates a Treasure token.")) // Buy Your Silence
      .toEqual({ kind: "createNamedToken", token: "treasure", count: 1 });
  });

  it("CREED: a soft-counter ('unless pays {N}') is NOT hijacked by the rider recognizer", () => {
    // Force Spike / Offering to Asha keep their SOFT-CNT path (no '. Its controller' rider sentence).
    expect(S("Counter target spell unless its controller pays {1}.").atoms).toEqual([{ op: "counter", spellFilter: "any", targetType: "spell", unlessPay: 1 }]);
    expect(isHigh("Counter target spell unless its controller pays {4}. You gain 4 life.")).toBe(true); // Offering to Asha (soft-cnt + gain-life, not a rider)
  });

  it("CREED: an UNMODELED counter-rider keeps the card LOW → Arbiter", () => {
    expect(isHigh("Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.")).toBe(false); // Arcane Denial (delayed draw)
    expect(isHigh("Counter target creature or battle spell unless its controller pays {4}. If they do, you incubate 2.")).toBe(false); // Assimilate Essence (incubate)
    expect(isHigh("Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying and you gain 2 life.")).toBe(false); // a rider tail past the keyword → low
  });
});

describe("engine — the counter rider resolves to the COUNTERED spell's controller (SOFT-COUNTER-RIDER)", () => {
  function withStack(spellType) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const spell = { id: "sp1", kind: "spell", controller: "ai", source: { id: "c1", name: "Some Spell", type: spellType, oracle: "" } };
    return { ...s, stack: [spell], players: { ...s.players, ai: { ...s.players.ai, life: 40 }, user: { ...s.players.user, life: 40 } } };
  }
  const spellTarget = { type: "spell", id: "sp1" };

  it("An Offer — the COUNTERED spell's controller gets two Treasures (not the caster); the spell leaves the stack", () => {
    const atom = { op: "counter", spellFilter: "noncreature", targetType: "spell", controllerRider: { kind: "createNamedToken", token: "treasure", count: 2 } };
    const st = resolveAtom(withStack("Sorcery"), atom, { controller: "user", targets: [spellTarget], cardName: "An Offer You Can't Refuse" });
    expect(st.stack).toHaveLength(0);
    expect(st.players.ai.battlefield.filter((p) => p.card.name === "Treasure")).toHaveLength(2);
    expect(st.players.user.battlefield.filter((p) => p.card.name === "Treasure")).toHaveLength(0);
  });

  it("Swan Song — the countered controller gets a 2/2 blue Bird WITH FLYING", () => {
    const atom = { op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell", controllerRider: { kind: "createToken", power: 2, toughness: 2, color: "blue", subtype: "bird", keywords: ["Flying"] } };
    const st = resolveAtom(withStack("Instant"), atom, { controller: "user", targets: [spellTarget], cardName: "Swan Song" });
    const birds = st.players.ai.battlefield.filter((p) => p.card.token);
    expect(birds).toHaveLength(1);
    expect(birds[0].card).toMatchObject({ power: 2, toughness: 2, type: "Token Creature — Bird", keywords: ["Flying"] });
  });

  it("CREED: Swan Song's filter refuses a CREATURE spell — no counter, no rider (a fizzle)", () => {
    const atom = { op: "counter", spellFilter: "enchantmentInstantSorcery", targetType: "spell", controllerRider: { kind: "createToken", power: 2, toughness: 2, color: "blue", subtype: "bird", keywords: ["Flying"] } };
    const st = resolveAtom(withStack("Creature — Bear"), atom, { controller: "user", targets: [spellTarget], cardName: "Swan Song" });
    expect(st.stack).toHaveLength(1);                                          // the creature spell is NOT countered
    expect(st.players.ai.battlefield.filter((p) => p.card.token)).toHaveLength(0); // and the rider does NOT fire
  });
});

describe("coverage — SOFT-COUNTER-RIDER staples flip native; the unmodeled ones bounce", () => {
  const C = (type, oracle, name) => ({ type, oracle, mana: "", name });
  it("An Offer / Swan Song + the bonus keyword/named-token cards are native-spell", () => {
    expect(classifyCard(C("Instant", 'Counter target noncreature spell. Its controller creates two Treasure tokens. (They\'re artifacts with "{T}, Sacrifice this token: Add one mana of any color.")', "An Offer You Can't Refuse"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Counter target enchantment, instant, or sorcery spell. Its controller creates a 2/2 blue Bird creature token with flying.", "Swan Song"))).toBe("native-spell");
    expect(classifyCard(C("Instant", "Exile target creature or planeswalker. Its controller creates a 4/4 white Angel creature token with flying.", "Angelic Ascension"))).toBe("native-spell");
    expect(classifyCard(C("Sorcery", "Exile target nonland permanent. Its controller creates a Treasure token.", "Buy Your Silence"))).toBe("native-spell");
  });
  it("CREED: delayed / conditional counter-riders stay Arbiter-routed (Mana Drain GRADUATED 2026-08-14)", () => {
    expect(classifyCard(C("Instant", "Counter target spell. Its controller may draw up to two cards at the beginning of the next turn's upkeep. You draw a card at the beginning of the next turn's upkeep.", "Arcane Denial"))).toBe("arbiter-spell");
    // Mana Drain left this pin 2026-08-14: its delayed payout rides the CR 603.7 queue now
    // (the MANA-DRAIN FOLD + delayedManaFromMv; witnesses in manaDrainDelayed.test.js).
    expect(classifyCard(C("Instant", "Counter target spell. At the beginning of your next main phase, add an amount of {C} equal to that spell's mana value.", "Mana Drain"))).toBe("native-spell");
  });
});
