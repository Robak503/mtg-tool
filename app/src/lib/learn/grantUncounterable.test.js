/**
 * grantUncounterable.test.js — the GRANTED "can't be countered" (Vexing Shusher, CR 701.6a):
 * "{R/G}: Target spell can't be countered."
 *
 * The missing arm of a mechanic that was otherwise complete. The four pre-existing uncounterability
 * paths are all STATIC or ON-CARD — the printed self-reference, the subtype board static (Root Sliver),
 * the controller static (Chimil) and the type-filtered controller static (Prowling Serpopard) — and every
 * one of them answers "is this spell uncounterable?" by RE-DERIVING it from the board. A one-shot grant
 * leaves nothing on the board to re-derive from, so it rides the stack object as a mark instead.
 *
 * Enforcement is real, not a bare coverage marker: every claim below drives enumerateTargets or the
 * resolver itself, and each exclusion is paired with the same assertion in the absence of the grant so a
 * vacuously-empty target list can never pass for a working gate.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";
import { grantUncounterableClauseParser, stackResolvers } from "./effects/atoms/stack.js";

beforeEach(() => _resetIdsForTests());

// Oracle text read from the bundled Scryfall snapshot, not from memory.
const SHUSHER = {
  name: "Vexing Shusher",
  type: "Creature — Goblin Shaman",
  mana: "{R/G}{R/G}",
  oracle: "This spell can't be countered.\n{R/G}: Target spell can't be countered.",
};

/** Two unrelated spells on the stack, both cast by `user`; no board statics anywhere. */
function twoSpellStack() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s,
    stack: [
      { kind: "spell", id: "sp1", controller: "user", source: { name: "Bear", type: "Creature — Bear", oracle: "" } },
      { kind: "spell", id: "sp2", controller: "user", source: { name: "Elk", type: "Creature — Elk", oracle: "" } },
    ],
  };
}

const counterTargets = (state, pid = "ai") =>
  enumerateTargets(state, pid, { targetType: "spell", spellFilter: "any" })
    .filter((t) => t.type === "spell")
    .map((t) => t.id);

/** Run the grant resolver against one stack-spell id, the way a resolving ability would. */
const grantOn = (state, id) =>
  stackResolvers["make-uncounterable"](
    state,
    { op: "make-uncounterable", targetType: "spell", spellFilter: "any", grantNotCounter: true },
    { targets: [{ type: "spell", id }], controller: "user" },
  );

describe("Vexing Shusher — granted uncounterability", () => {
  it("flips the card native (its printed self-reference already parsed; the grant was the sole blocker)", () => {
    expect(classifyCard(SHUSHER)).toBe("native-mixed");
  });

  it("parses the clause into a spell-targeting grant atom", () => {
    expect(grantUncounterableClauseParser("Target spell can't be countered.")).toEqual({
      op: "make-uncounterable",
      targetType: "spell",
      spellFilter: "any",
      grantNotCounter: true,
    });
  });

  it("refuses a wording it does not model (CREED: no atom → Arbiter, never a guess)", () => {
    expect(grantUncounterableClauseParser("Target creature can't be blocked.")).toBeNull();
    expect(grantUncounterableClauseParser("Counter target spell.")).toBeNull();
    // The STATIC forms belong to staticAbilityParser, not here — this arm must not swallow them.
    expect(grantUncounterableClauseParser("Spells you control can't be countered.")).toBeNull();
  });
});

describe("ENFORCEMENT — the mark actually protects the spell", () => {
  it("VACUITY CONTROL: with no grant, both stack spells are legal counter targets", () => {
    expect(counterTargets(twoSpellStack()).sort()).toEqual(["sp1", "sp2"]);
  });

  it("after the grant resolves, the marked spell is NOT a legal counter target", () => {
    const after = grantOn(twoSpellStack(), "sp1");
    expect(counterTargets(after)).not.toContain("sp1");
  });

  it("the mark is PER STACK OBJECT — the other spell stays counterable", () => {
    const after = grantOn(twoSpellStack(), "sp1");
    // If the mark leaked to the whole stack (or to the controller) this would be empty. It is the
    // difference between Vexing Shusher and Chimil, and nothing else in this file would catch it.
    expect(counterTargets(after)).toEqual(["sp2"]);
  });

  it("the grant itself may still target an already-marked spell (not-a-counter carve, CR 601.2c)", () => {
    const after = grantOn(twoSpellStack(), "sp1");
    const grantable = enumerateTargets(after, "user", { targetType: "spell", spellFilter: "any", grantNotCounter: true })
      .filter((t) => t.type === "spell")
      .map((t) => t.id);
    // Redundant, but legal: excluding it would be a false negative on target legality. The COUNTER
    // path above sets no such flag, which is why that one does exclude it.
    expect(grantable.sort()).toEqual(["sp1", "sp2"]);
  });

  it("fizzles cleanly when the target has already left the stack — and marks nothing else", () => {
    const base = twoSpellStack();
    const after = grantOn(base, "gone");
    expect(after.stack.map((o) => o.uncounterable)).toEqual([undefined, undefined]);
    expect(counterTargets(after).sort()).toEqual(["sp1", "sp2"]);
  });

  it("is idempotent — granting twice leaves one mark and one log entry", () => {
    const once = grantOn(twoSpellStack(), "sp1");
    const twice = grantOn(once, "sp1");
    const marks = twice.stack.filter((o) => o.uncounterable).length;
    expect(marks).toBe(1);
    const logs = (twice.log || []).filter((e) => e.effect === "make-uncounterable").length;
    expect(logs).toBe(1);
  });
});
