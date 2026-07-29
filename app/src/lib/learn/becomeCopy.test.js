/**
 * becomeCopy.test.js — "~ becomes a copy of <target> until end of turn" (CR 613.1a / 707.9).
 *
 * Increment 2b of the layer-1 copy wave. Increment 1 built the layer (a permanent CAN be a copy); 2a built
 * the shared rider vocabulary; this wires the clause to the layer for the SELF-becomes-a-copy-of-a-CHOSEN-
 * TARGET shape.
 *
 * ⛔ THE BOARD ASSERTIONS ARE THE POINT, not the tier. The BLOCKED list records ATTACHED-UNBLOCKABLE — a
 * grant that measured GAINED 4 / LOST 0 / RETIERED 0 while the keyword was never on the creature. So this
 * file resolves the atom against a real board and reads the permanent's derived characteristics back.
 *
 * SCOPE, and what parks (each an increment-3 binding, not a copy problem):
 *   • REFERENT sources — "a copy of THAT CARD" (Vesuvan Drifter's reveal, Scion of the Ur-Dragon's tutored
 *     graveyard card), "a copy of IT" (Sarkhan's triggering Dragon).
 *   • non-self SUBJECTS — Shuri ("target artifact becomes a copy of a SECOND target artifact"), Naga
 *     Fleshcrafter ("each other creature you control").
 *   • unmodelled RIDERS — Sarkhan (legendary-in-addition, deliberately parked), Hulkling ("this ability"),
 *     Cephalid Facetaker (a quoted grant that isn't the one modelled body).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { deriveCharacteristics } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const atomOf = (clause) => parseEffectClause(clause, "Creature", { hasX: false })?.atoms?.[0] || null;
const CLAUSE = "~ becomes a copy of another target creature until end of turn";

describe("parsing", () => {
  it("⭐ the self-becomes-a-copy-of-a-target shape is an atom", () => {
    expect(atomOf(CLAUSE)).toMatchObject({ op: "become-copy", targetType: "creature", riders: [] });
  });

  it("⭐ riders reuse the SHARED clone vocabulary", () => {
    expect(atomOf("~ becomes a copy of another target permanent until end of turn, except its name is ~"))
      .toMatchObject({ op: "become-copy", targetType: "permanent", riders: [{ kind: "setName", selfName: true }] });
  });

  it("⛔ an UNMODELLED rider parks the whole clause (CREED all-or-nothing)", () => {
    // A copy applied with a rider silently dropped is a body the card never printed.
    expect(atomOf("~ becomes a copy of another target creature until end of turn, except it gains protection from everything")).toBeNull();
  });

  it("⛔ an unlisted target NOUN parks — never a guessed target class", () => {
    expect(atomOf("~ becomes a copy of target land until end of turn")).toBeNull();
  });

  it("⛔ a NON-SELF subject does not ride this atom", () => {
    // Applying a self-scoped effect to the wrong permanent is the failure this guard prevents; Shuri's
    // "target artifact becomes a copy of a second target artifact" is increment 3.
    expect(atomOf("target artifact becomes a copy of another target artifact until end of turn")).toBeNull();
  });
});

describe("⭐ RUNTIME — the source's characteristics actually change", () => {
  const BEAR = { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
  const DRAGON = { id: "drg", name: "Shivan Dragon", type: "Creature — Dragon", mana: "{4}{R}{R}", power: 5, toughness: 5, oracle: "Flying" };
  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [
      createPermanent({ id: "src", card: BEAR, controller: "user" }),
      createPermanent({ id: "tgt", card: DRAGON, controller: "user" }),
    ] } } };
  }
  const resolve = (state, atom, targets = [{ type: "creature", id: "tgt" }]) =>
    resolveAtom(state, atom, { controller: "user", sourceId: "src", cardName: "Test Shifter", targets });

  it("⭐ the 2/2 Bear becomes a 5/5 Dragon with flying", () => {
    const out = resolve(board(), atomOf(CLAUSE));
    const c = deriveCharacteristics(out, "src");
    expect([c.power, c.toughness]).toEqual([5, 5]);
    expect(c.subtypes).toContain("Dragon");
    expect(c.keywords.has("flying")).toBe(true);
  });

  it("⛔ the TARGET is untouched — only the source becomes a copy", () => {
    const out = resolve(board(), atomOf(CLAUSE));
    expect(deriveCharacteristics(out, "tgt").power).toBe(5); // still itself
    expect(deriveCharacteristics(out, "tgt").subtypes).toContain("Dragon");
  });

  it("CONTROL — before resolution the Bear is a 2/2 Bear", () => {
    // Without this, an assertion that the source is a 5/5 could be satisfied by a fixture that was never
    // a Bear to begin with.
    const c = deriveCharacteristics(board(), "src");
    expect([c.power, c.toughness]).toEqual([2, 2]);
    expect(c.subtypes).toContain("Bear");
  });

  it("⭐ the effect expires at END OF TURN, not permanently", () => {
    const out = resolve(board(), atomOf(CLAUSE));
    const eff = (out.continuousEffects || []).find((e) => e.layer === 1);
    expect(eff.duration).toMatchObject({ kind: "endOfTurn" });
    expect(eff.affects).toMatchObject({ mode: "self", permanentId: "src" });
  });

  it("⭐ the NAME rider resolves against the copying card, not the copied one", () => {
    const out = resolve(board(), atomOf("~ becomes a copy of another target creature until end of turn, except its name is ~"));
    // `~` is the source's own card — a Grizzly Bears here — so the copy keeps that name on a Dragon body.
    expect(deriveCharacteristics(out, "src").power).toBe(5);
    expect((out.continuousEffects || []).find((e) => e.layer === 1).copiableCard.name).toBe("Grizzly Bears");
  });

  it("⛔ CR 608.2b — a DEPARTED target stores no effect (a fizzle, never a dangling layer-1 record)", () => {
    const out = resolve(board(), atomOf(CLAUSE), [{ type: "creature", id: "gone" }]);
    expect((out.continuousEffects || []).some((e) => e.layer === 1)).toBe(false);
    expect(deriveCharacteristics(out, "src").power).toBe(2); // unchanged
  });

  it("⛔ a missing SOURCE stores nothing either", () => {
    const out = resolveAtom(board(), atomOf(CLAUSE), { controller: "user", sourceId: "vanished", cardName: "x", targets: [{ type: "creature", id: "tgt" }] });
    expect((out.continuousEffects || []).some((e) => e.layer === 1)).toBe(false);
  });
});

describe("tier", () => {
  it("⭐ Impossible Man flips body-only → native-activated", () => {
    expect(classifyCard({ name: "Impossible Man", type: "Legendary Creature — Human Hero", mana: "{1}{U}", power: "2", toughness: "2",
      oracle: "{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man." }))
      .toBe("native-activated");
  });

  it("⛔ Sarkhan, Soul Aflame stays PARKED — its legendary-in-addition rider is deliberately unmodelled", () => {
    // Recorded so the wave's yield is not overstated: this is the Dragons shelf card the copy work does NOT
    // buy. See cloneRiderVocabulary.test.js for why that rider must not be treated as a no-op.
    expect(classifyCard({ name: "Sarkhan, Soul Aflame", type: "Legendary Creature — Human Noble", mana: "{2}{R}", power: "3", toughness: "3",
      oracle: "Whenever a Dragon you control enters, you may have Sarkhan become a copy of it until end of turn, except its name is Sarkhan, Soul Aflame and it's legendary in addition to its other types." }))
      .toBe("body-only");
  });
});

describe("⛔ TARGET INTENT — become-copy is AMBIGUOUS on purpose (CR 613.1a)", () => {
  it("⭐ the intent is ambiguous, so a TRIGGER routes to the Arbiter rather than mis-targeting", () => {
    // The value of a copy is the QUALITY of the body, not whose it is — copying an opponent's fattest
    // attacker is the classic line, and copying your own is equally common. No side is provable from the
    // atom, so this follows the bare `suspect` precedent: ambiguous → safe FN on the trigger path.
    expect(atomTargetIntent(atomOf(CLAUSE))).toBe("ambiguous");
  });

  it("⛔ Tilonalli's Skinshifter therefore PARKS — correct, not a gap", () => {
    // Its trigger IS detected and its effect clause parses HIGH; only the intent gate holds it. An earlier
    // ledger note called this a one-line fix — it is not. Tilonalli's looks own-side only because of its
    // ATTACKING restriction, which the atom does not carry (the noun map flattens it to "creature"), so
    // declaring a side here would mis-target every other member of the family.
    expect(classifyCard({ name: "Tilonalli's Skinshifter", type: "Creature — Human Shaman", mana: "{2}{R}", power: "1", toughness: "1",
      oracle: "Whenever this creature attacks, it becomes a copy of another target nonlegendary attacking creature until end of turn." }))
      .toBe("body-only");
  });

  it("CONTROL — an ACTIVATED ability is unaffected (its target is picked at activation)", () => {
    // Impossible Man plays natively despite the same ambiguous intent, which is what makes the gate a
    // trigger-path safety measure rather than a blanket refusal.
    expect(classifyCard({ name: "Impossible Man", type: "Legendary Creature — Human Hero", mana: "{1}{U}", power: "2", toughness: "2",
      oracle: "{2}{U}: Impossible Man becomes a copy of another target permanent until end of turn, except his name is Impossible Man." }))
      .toBe("native-activated");
  });
});
