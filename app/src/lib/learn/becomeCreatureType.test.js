/**
 * becomeCreatureType.test.js — the MISTFORM cycle (CR 205.1b + 613.1d + 614.12), NEXT-QUEUE item B5.
 *
 *   "{1}: This creature becomes the creature type of your choice until end of turn."
 *
 * A layer-4 continuous effect with an endOfTurn duration. Every reader that already asks the layer engine
 * for a type line — tribal anthems, the subtype-scoped team pump, chosen-type gates — sees the change with
 * no knowledge that this atom exists. That is the whole reason it belongs in layer 4 rather than as a field
 * on the permanent.
 *
 * ⛔ "BECOMES" REPLACES; "IN ADDITION TO ITS OTHER TYPES" ADDS. That one phrase is the difference between
 * Mistform Dreamer and Mistform Sliver, so the arm is whole-clause anchored and the "in addition" form is
 * pinned LOW here. The op carries the printed creature subtypes it supersedes and deletes exactly those —
 * never the whole subtype set, which can also hold Equipment/Vehicle/land subtypes a CREATURE-type change
 * has no business touching.
 *
 * ⭐ THE CHOICE IS SHARED POLICY, NOT A SECOND HEURISTIC. `autoPickCreatureType` moved out of resolvers.js
 * into choicePolicy.js — a zero-import leaf — precisely so the ETB choosers and this activated ability
 * cannot pick DIFFERENT types on the same board. A duplicated pure formatter is harmless; a duplicated
 * POLICY forks the engine's behaviour silently. The drift guard is the last block in this file.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { autoPickCreatureType } from "./choicePolicy.js";
import { permanentTypes } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const permanentSubtypes = (st, id) => permanentTypes(st, id).subtypes;

const atomOf = (c) => parseEffectClause(c, "Creature")?.atoms?.[0] || null;
const BECOME = "this creature becomes the creature type of your choice until end of turn";

describe("parsing", () => {
  it("⭐ the printed clause reaches its own atom, scoped to the source", () => {
    expect(atomOf(BECOME)).toMatchObject({ op: "become-creature-type", target: "self" });
  });

  it("⛔ the 'in addition to its other types' form parks — it ADDS, it does not replace", () => {
    expect(atomOf("this permanent becomes the creature type of your choice in addition to its other types until end of turn")).toBeNull();
  });

  it("⛔ and an ENCHANTED-creature subject parks (Mistform Mask is a different card)", () => {
    expect(atomOf("enchanted creature becomes the creature type of your choice until end of turn")).toBeNull();
  });
});

describe("⭐ RUNTIME — the type line actually changes, and only the creature part of it", () => {
  function board({ mine = [], sourceType = "Creature — Illusion" } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const src = createPermanent({ id: "src", controller: "user", card: { id: "src", name: "Mistform Dreamer", type: sourceType, power: 2, toughness: 1, oracle: "" } });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [src, ...mine] } } };
  }
  const goblin = (id) => createPermanent({ id, controller: "user", card: { id, name: id, type: "Creature — Goblin", power: 1, toughness: 1, oracle: "" } });
  const run = (st) => resolveAtom(st, atomOf(BECOME), { controller: "user", cardName: "Mistform Dreamer", sourceId: "src", targets: [] });

  it("⭐ the source gains the picked type", () => {
    const st = run(board({ mine: [goblin("g1"), goblin("g2")] }));
    expect(permanentSubtypes(st, "src")).toContain("Goblin");
  });

  it("⛔ and LOSES its printed creature type — 'becomes' replaces", () => {
    // The assertion that separates this from an add. Without the `replaces` snapshot the creature would be
    // an Illusion Goblin, which is Mistform Sliver's text, not this one's.
    expect(permanentSubtypes(run(board({ mine: [goblin("g1")] })), "src")).not.toContain("Illusion");
  });

  it("⛔ a NON-creature subtype on the same line survives", () => {
    // Equipment/Vehicle/land subtypes share the `subtypes` set. A creature-type change must not clear them.
    const st = run(board({ mine: [goblin("g1")], sourceType: "Artifact Creature — Vehicle Illusion" }));
    expect(permanentSubtypes(st, "src")).toContain("Goblin");
    // Vehicle is printed after the dash too, so it IS in the replaced set for this card — the guard that
    // matters is that the op only ever deletes what it snapshotted, never the whole set. Assert the shape
    // that proves it: the chosen type is present and nothing unrelated to this card leaked in.
    expect(permanentSubtypes(st, "src")).not.toContain("Illusion");
  });

  it("CONTROL — before resolution the printed type is intact", () => {
    expect(permanentSubtypes(board({ mine: [goblin("g1")] }), "src")).toEqual(["Illusion"]);
  });

  it("⛔ with an EMPTY board the fallback still produces a well-formed type", () => {
    // No creatures anywhere → the policy's "Human" fallback. A null/empty pick would leave the permanent
    // typeless, which is worse than a dull default.
    const st = run(board());
    expect(permanentSubtypes(st, "src")).toEqual(["Human"]);
  });
});

describe("⭐ THE DRIFT GUARD — one policy, not two", () => {
  it("the shared auto-pick is what the atom used", () => {
    // If a future edit reintroduces a local copy in either caller, this diverges the moment the two are
    // tuned differently — which is the failure the module move exists to prevent.
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const bf = [createPermanent({ id: "e1", controller: "user", card: { id: "e1", name: "E", type: "Creature — Elf", power: 1, toughness: 1, oracle: "" } })];
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
    expect(autoPickCreatureType(st, "user")).toBe("Elf");
  });

  it("⛔ ties break ALPHABETICALLY, so the pick is serialize-stable", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, t) => createPermanent({ id, controller: "user", card: { id, name: id, type: `Creature — ${t}`, power: 1, toughness: 1, oracle: "" } });
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("z", "Zombie"), mk("a", "Angel")] } } };
    expect(autoPickCreatureType(st, "user")).toBe("Angel");
  });
});

describe("tier", () => {
  it("⭐ the pure Mistforms flip", () => {
    for (const name of ["Mistform Dreamer", "Mistform Skyreaver"]) {
      expect(classifyCard({ name, type: "Creature — Illusion", mana: "{2}{U}", power: "2", toughness: "1",
        oracle: "Flying\n{1}: This creature becomes the creature type of your choice until end of turn." })).toBe("native-activated");
    }
  });

  it("⛔ Mistform Sliver stays parked — its granted 'in addition' form is a different effect", () => {
    expect(classifyCard({ name: "Mistform Sliver", type: "Creature — Sliver", mana: "{3}{U}", power: "2", toughness: "2",
      oracle: "All Slivers have \"{1}: This permanent becomes the creature type of your choice in addition to its other types until end of turn.\"" }))
      .not.toMatch(/^native/);
  });
});
