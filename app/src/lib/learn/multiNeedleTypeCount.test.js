/**
 * multiNeedleTypeCount.test.js — "for each LEGENDARY CREATURE you control" (Benalish Honor Guard) and
 * "for each ARTIFACT AND/OR ENCHANTMENT you control" (All That Glitters, Nettlecyst) parked, because the
 * board-count evaluator's type-line scan took exactly ONE needle.
 *
 * Benalish Honor Guard is named in `parseSelfCountSource`'s own doc comment as a card the layer-7c
 * "for each" lane was written for — and it has been parking the whole time, because one needle cannot
 * express a supertype qualifier. The lane worked; its scan was one regex too narrow.
 *
 * SAME SCAN, EXPLICIT JOIN. `allOf` requires every needle on one type line (Legendary AND Creature);
 * `anyOf` requires at least one (Artifact OR Enchantment). Both are the identical word-bounded
 * `typeLineOf` read the single-needle branch has always used — no new state, no new source of truth.
 *
 * ⭐ EACH PERMANENT COUNTS AT MOST ONCE, which is the entire point of the "and/or" form: a card that is
 * BOTH an artifact and an enchantment contributes 1, not 2. That is what the printed card means, and
 * summing two independent counts would be the plausible wrong implementation. Pinned.
 *
 * ⛔ Deliberately narrow — only the supertype+cardtype AND-form and the artifact/enchantment OR-form. An
 * arbitrary qualifier ("nonlegendary creature", "tapped artifact") has no evaluator and still parks.
 *
 * Mutation-checked (2026-08-04, each grep-verified as applied): `allOf` join flipped to `some` -> the
 * legendary-artifact and nonlegendary-creature guards go red; the multi arm removed -> every flip pin red.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-04).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const BENALISH_HONOR_GUARD = { id: "c-bhg", name: "Benalish Honor Guard", type: "Creature — Human Knight", mana: "{2}{W}",
  power: 2, toughness: 2, oracle: "This creature gets +1/+0 for each legendary creature you control." };
const ALL_THAT_GLITTERS = { id: "c-atg", name: "All That Glitters", type: "Enchantment — Aura", mana: "{1}{W}",
  oracle: "Enchant creature\nEnchanted creature gets +1/+1 for each artifact and/or enchantment you control." };
const NETTLECYST = { id: "c-nc", name: "Nettlecyst", type: "Artifact — Equipment", mana: "{4}",
  oracle: "Living weapon (When this Equipment enters, create a 0/0 black Phyrexian Germ creature token, then attach this to it.)\nEquipped creature gets +1/+1 for each artifact and/or enchantment you control.\nEquip {2}" };

function perm(card, id, over = {}) {
  return { id, card, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function board(user, ai = []) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user",
    players: { ...b.players, user: { ...b.players.user, battlefield: user }, ai: { ...b.players.ai, battlefield: ai } } };
}
const pt = (state, id) => `${permanentPower(state, id)}/${permanentToughness(state, id)}`;
const thing = (name, type) => perm({ name, type, oracle: "", power: 1, toughness: 1 }, name.replace(/\s/g, ""));

describe("recognition", () => {
  it("all three carriers flip", () => {
    expect(classifyCard(BENALISH_HONOR_GUARD)).toBe("native-static");
    expect(classifyCard(ALL_THAT_GLITTERS)).toBe("native-aura");
    expect(classifyCard(NETTLECYST)).toBe("native-equipment");
  });

  it("⛔ an arbitrary qualifier has no evaluator and still parks", () => {
    expect(classifyCard({ ...BENALISH_HONOR_GUARD, id: "c-x", name: "Odd Guard",
      oracle: "This creature gets +1/+0 for each nonlegendary creature you control." })).toBe("body-only");
    expect(classifyCard({ ...BENALISH_HONOR_GUARD, id: "c-y", name: "Odder Guard",
      oracle: "This creature gets +1/+0 for each tapped artifact you control." })).toBe("body-only");
  });
});

describe("⭐ LAW 6 — the AND join needs every needle on one type line", () => {
  const g = perm(BENALISH_HONOR_GUARD, "g");

  it("the harness itself is honest: alone, the Guard reads its PRINTED 2/2", () => {
    expect(pt(board([g]), "g")).toBe("2/2");
  });

  it("each legendary creature adds exactly +1/+0", () => {
    expect(pt(board([g, thing("Hero", "Legendary Creature — Human")]), "g")).toBe("3/2");
    expect(pt(board([g, thing("Hero", "Legendary Creature — Human"), thing("Sage", "Legendary Creature — Elf")]), "g")).toBe("4/2");
  });

  it("⛔ half a match counts for nothing — in both directions", () => {
    expect(pt(board([g, thing("Relic", "Legendary Artifact")]), "g")).toBe("2/2");
    expect(pt(board([g, thing("Bear", "Creature — Bear")]), "g")).toBe("2/2");
  });
});

describe("⭐ LAW 6 — the OR join counts each permanent ONCE", () => {
  const bear = perm({ name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "bear");
  const atg = perm(ALL_THAT_GLITTERS, "atg", { attachedTo: "bear" });

  it("the Aura counts itself — it IS an enchantment you control", () => {
    expect(pt(board([bear, atg]), "bear")).toBe("3/3");
  });

  it("either type qualifies", () => {
    expect(pt(board([bear, atg, thing("Sol Ring", "Artifact")]), "bear")).toBe("4/4");
    expect(pt(board([bear, atg, thing("Ward", "Enchantment")]), "bear")).toBe("4/4");
  });

  it("⭐ a permanent that is BOTH contributes 1, not 2 (summing two counts is the wrong version)", () => {
    expect(pt(board([bear, atg, thing("Sigil", "Artifact Enchantment")]), "bear")).toBe("4/4");
  });

  it("⛔ a permanent that is neither contributes nothing", () => {
    expect(pt(board([bear, atg, thing("Bear2", "Creature — Bear")]), "bear")).toBe("3/3");
  });
});
