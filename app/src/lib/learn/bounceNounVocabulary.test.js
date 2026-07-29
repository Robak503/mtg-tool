/**
 * bounceNounVocabulary.test.js — "planeswalker" and the two UNION nouns on the targeted bounce
 * ("Return target planeswalker to its owner's hand" — Stern Proctor's cousin shape; "Return target artifact
 * or enchantment to its owner's hand" — Quandrix Command's mode).
 *
 * ⭐ A NOUN LIST, NOT A MECHANISM — and three independent pieces of evidence said so before anything was
 * built, which is why this was safe to widen where the tutor-to-battlefield axis was not:
 *   1. `destroy` already says all three, emitting exactly the targetTypes reused here
 *      (planeswalker / creatureOrPlaneswalker / artifactOrEnchantment);
 *   2. the graveyard-recursion sibling already says the union ("return target artifact or enchantment CARD
 *      from your graveyard to your hand");
 *   3. ⭐ `return target PERMANENT to its owner's hand` is native TODAY and demonstrably bounces a
 *      planeswalker — so there was never a runtime question about whether a planeswalker CAN be returned,
 *      only about whether the sentence could be said.
 * enumerateTargets has understood all three targetTypes the whole time; no new one was invented.
 *
 * ⛔ CONTRAST WITH THE UNCAPPED BATTLEFIELD TUTOR, which looked like the same kind of axis and was reverted
 * the same day: that one was pinned as a deliberate JUDGEMENT across eight test files in the words "cheat"
 * and "landmine". This one has no pin anywhere, and its sibling paths already do it. Checking for the pins
 * FIRST is the cheap step that distinguishes the two.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { enumerateTargets } from "./spellEffects.js";

const atom = (txt) => parseEffectClause(txt, "Instant")?.atoms?.[0];

describe("the three added nouns", () => {
  it("⭐ planeswalker", () => {
    expect(atom("Return target planeswalker to its owner's hand.")).toEqual({
      op: "bounce", targetType: "planeswalker", restrictions: [],
    });
  });

  it("⭐ artifact or enchantment — BOTH halves, not just the first", () => {
    // ⚠️ I WROTE THIS FIRST AS AN ORDERING PIN AND THE MUTATION CHECK PROVED ME WRONG. The claim was that
    // alternation is first-match, so listing the union after bare "artifact" would drop the enchantment half.
    // Mutating the order to demonstrate it left all 13 tests green: the whole-clause `$` anchor forces a
    // backtrack into the longer alternative, so the order is cosmetic. What this assertion DOES pin is the
    // outcome — the union must resolve to the UNION targetType and not to either half — which is the thing
    // that would actually be a silent under-delivery if the map were ever edited.
    expect(atom("Return target artifact or enchantment to its owner's hand.")).toEqual({
      op: "bounce", targetType: "artifactOrEnchantment", restrictions: [],
    });
  });

  it("⭐ creature or planeswalker — likewise both halves", () => {
    expect(atom("Return target creature or planeswalker to its owner's hand.")).toEqual({
      op: "bounce", targetType: "creatureOrPlaneswalker", restrictions: [],
    });
  });
});

describe("⛔ the pre-existing nouns are untouched", () => {
  for (const [noun, tt] of [
    ["artifact", "artifact"],
    ["enchantment", "enchantment"],
    ["land", "land"],
    ["permanent", "permanent"],
    ["nonland permanent", "nonlandPermanent"],
  ]) {
    it(`⛔ ${noun}`, () => {
      expect(atom(`Return target ${noun} to its owner's hand.`)).toMatchObject({ op: "bounce", targetType: tt });
    });
  }

  it("⛔ the 'another' + controller qualifiers still ride on a widened noun", () => {
    expect(atom("Return another target permanent an opponent controls to its owner's hand.")).toEqual({
      op: "bounce", targetType: "permanent",
      restrictions: [{ kind: "controller", who: "opponent" }, { kind: "notSource" }],
    });
  });
});

describe("⛔ RUNTIME — the widened nouns enumerate the right permanents, and only those", () => {
  const board = () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const mk = (id, type, controller) => createPermanent({ id, controller, card: { id, name: id, type } });
    // ⚠️ A PLANESWALKER IS IDENTIFIED BY ITS LOYALTY COUNTERS, not by its type line — enumerateTargets'
    // addPlaneswalkers gates on `perm.counters?.loyalty != null`. And `createPermanent` drops `counters` from
    // its opts bag, so this must be stamped AFTER construction (the same harness trap recorded in
    // controlAura.test.js). Without it the board has no planeswalker at all and every assertion below would
    // have passed or failed for the wrong reason.
    const pw = Object.assign(mk("pw", "Legendary Planeswalker — Jace", "user"), { counters: { loyalty: 3 } });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [pw, mk("cre", "Creature — Bear", "user")] },
        ai: { ...s.players.ai, battlefield: [
          mk("art", "Artifact", "ai"),
          mk("ench", "Enchantment", "ai"),
          mk("land", "Land", "ai"),
        ] },
      },
    };
  };
  const ids = (txt) => {
    const a = atom(txt);
    return enumerateTargets(board(), "user", { targetType: a.targetType, restrictions: a.restrictions })
      .map((t) => t.id).sort();
  };

  it("⭐ planeswalker offers the planeswalker and nothing else", () => {
    expect(ids("Return target planeswalker to its owner's hand.")).toEqual(["pw"]);
  });

  it("⭐ artifact or enchantment offers BOTH — the union is real, not a relabelled 'artifact'", () => {
    expect(ids("Return target artifact or enchantment to its owner's hand.")).toEqual(["art", "ench"]);
  });

  it("⭐ creature or planeswalker offers BOTH", () => {
    expect(ids("Return target creature or planeswalker to its owner's hand.")).toEqual(["cre", "pw"]);
  });

  it("⛔ and none of them reaches the land", () => {
    for (const txt of [
      "Return target planeswalker to its owner's hand.",
      "Return target artifact or enchantment to its owner's hand.",
      "Return target creature or planeswalker to its owner's hand.",
    ]) expect(ids(txt)).not.toContain("land");
  });
});
