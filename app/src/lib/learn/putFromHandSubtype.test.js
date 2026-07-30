/**
 * putFromHandSubtype.test.js — PUT-FROM-HAND learns subtype filters, AND the bare "permanent card" filter
 * stops offering instants.
 *
 * ⛔⭐ THE BUG FIRST, BECAUSE IT WAS LIVE. `TYPE_FILTER.permanent` was `{ groups: [] }` with no
 * `permanentOnly` gate. An empty `groups` means "every card type" to cardMatchesTutorFilter
 * (`groups.length === 0 → return true`), so "put a permanent card from your hand onto the battlefield"
 * offered INSTANTS AND SORCERIES. Measured, not theorised — the resolver handed back
 * ["Lightning Bolt", "Grizzly Bears"] from a two-card hand.
 *
 * ⚠️ AND IT WAS REACHABLE IN A REAL GAME. The Ur-Dragon classifies native-mixed, prints this exact clause,
 * and is the COMMANDER of a deck on the shelf — so this was not a latent corner, it was on the table every
 * game that deck is played. The library-side tutor has always carried `permanentOnly` for the same printed
 * word (CR 110.4a: a permanent card is one whose front face is artifact/creature/enchantment/land/
 * planeswalker/battle). Same word, same meaning, same gate.
 *
 * The widening is the ordinary half: three printed subtype shapes — a bare subtype (Stoneforge Mystic's
 * "an Equipment card"), "<Subtype> permanent" (Goblin Lackey, Didgeridoo), and "<Subtype> creature"
 * (Warren Instigator) — gated on COUNT_SUBTYPE, the one curated allowlist three other readers already share.
 *
 * ⛔ DIDGERIDOO STAYS PARKED ON PURPOSE. Its "Minotaur permanent card" would flip if Minotaur were added to
 * that allowlist, and Minotaur would almost certainly qualify. It is not added: the allowlist is curated
 * per-need with corpus verification and is shared by three other readers, so bumping it for one obscure card
 * (#17717) trades a shared invariant for a number. A safe false negative is the correct outcome.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const filterOf = (phrase) =>
  parseEffectClause(`You may put a${/^[AEIOU]/.test(phrase) ? "n" : ""} ${phrase} card from your hand onto the battlefield.`, "Instant")?.atoms?.[0]?.filter;

const card = (id, name, type) => ({ id, name, type, mana_cost: "{1}", cmc: 1, oracle: "" });
function handState(hand) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand } } };
}
const offered = (phrase, hand) => {
  const atom = parseEffectClause(`You may put a${/^[AEIOU]/.test(phrase) ? "n" : ""} ${phrase} card from your hand onto the battlefield.`, "Instant").atoms[0];
  const out = ATOM_RESOLVERS.tutor(handState(hand), atom, { controller: "user", targets: [], cardName: "Probe" });
  return (out.pendingChoice?.candidates || []).map((c) => c.name);
};

describe("⛔⭐ the LIVE false positive: a 'permanent card' put must not offer an instant", () => {
  it("the filter now carries the permanentOnly front-face gate", () => {
    expect(filterOf("permanent")).toEqual({ groups: [], permanentOnly: true });
  });

  it("⭐ REGRESSION — Lightning Bolt is no longer a legal pick; the creature still is", () => {
    expect(offered("permanent", [card("bolt", "Lightning Bolt", "Instant"), card("bear", "Grizzly Bears", "Creature — Bear")]))
      .toEqual(["Grizzly Bears"]);
  });

  it("⭐ every non-permanent card type is excluded, and every permanent type is kept", () => {
    const hand = [
      card("i", "Bolt", "Instant"), card("s", "Wrath", "Sorcery"),
      card("a", "Ring", "Artifact"), card("c", "Bear", "Creature — Bear"),
      card("e", "Anthem", "Enchantment"), card("l", "Wastes", "Land"),
      card("p", "Jace", "Legendary Planeswalker — Jace"), card("b", "Siege", "Battle — Siege"),
    ];
    expect(offered("permanent", hand).sort()).toEqual(["Anthem", "Bear", "Jace", "Ring", "Siege", "Wastes"]);
  });
});

describe("the three printed SUBTYPE shapes parse", () => {
  it("bare subtype (Stoneforge Mystic's Equipment)", () => {
    expect(filterOf("Equipment")).toEqual({ groups: [["equipment"]] });
  });
  it("<Subtype> permanent carries the permanentOnly gate too (Goblin Lackey)", () => {
    expect(filterOf("Goblin permanent")).toEqual({ groups: [["goblin"]], permanentOnly: true });
  });
  it("<Subtype> creature ANDs the two words (Warren Instigator)", () => {
    expect(filterOf("Goblin creature")).toEqual({ groups: [["goblin", "creature"]] });
  });

  it("⛔ an UNCURATED word parks in all three shapes — the allowlist is the gate", () => {
    expect(filterOf("widget")).toBeUndefined();
    expect(filterOf("widget permanent")).toBeUndefined();
    expect(filterOf("widget creature")).toBeUndefined();
  });

  it("⛔ Minotaur is deliberately NOT in the allowlist — Didgeridoo stays a safe FN", () => {
    expect(filterOf("Minotaur permanent")).toBeUndefined();
  });
});

describe("⭐ RUNTIME — the subtype filter really restricts the hand", () => {
  it("an Equipment put offers only the Equipment", () => {
    const hand = [card("eq", "Bone Saw", "Artifact — Equipment"), card("art", "Sol Ring", "Artifact"), card("cr", "Bear", "Creature — Bear")];
    expect(offered("Equipment", hand)).toEqual(["Bone Saw"]);
  });

  it("a Goblin creature put excludes a Goblin that is NOT a creature", () => {
    const hand = [
      card("gc", "Goblin Guide", "Creature — Goblin"),
      card("gl", "Goblin Mine", "Land — Goblin"),        // the AND group must reject this
      card("nc", "Bear", "Creature — Bear"),
    ];
    expect(offered("Goblin creature", hand)).toEqual(["Goblin Guide"]);
  });

  it("a Goblin permanent put takes the non-creature Goblin too", () => {
    const hand = [card("gc", "Goblin Guide", "Creature — Goblin"), card("gl", "Goblin Mine", "Land — Goblin"), card("nc", "Bear", "Creature — Bear")];
    expect(offered("Goblin permanent", hand).sort()).toEqual(["Goblin Guide", "Goblin Mine"]);
  });
});

describe("coverage — the three carriers flip", () => {
  it("Stoneforge Mystic / Goblin Lackey / Warren Instigator", () => {
    expect(classifyCard({ name: "Stoneforge Mystic", type: "Creature — Kor Artificer", power: "1", toughness: "2", mana: "{1}{W}",
      oracle: "When this creature enters, you may search your library for an Equipment card, reveal it, put it into your hand, then shuffle.\n{1}{W}, {T}: You may put an Equipment card from your hand onto the battlefield." })).toBe("native-mixed");
    expect(classifyCard({ name: "Goblin Lackey", type: "Creature — Goblin", power: "1", toughness: "1", mana: "{R}",
      oracle: "Whenever this creature deals damage to a player, you may put a Goblin permanent card from your hand onto the battlefield." })).toBe("native-trigger");
    expect(classifyCard({ name: "Warren Instigator", type: "Creature — Goblin Berserker", power: "1", toughness: "1", mana: "{R}{R}",
      oracle: "Double strike\nWhenever this creature deals damage to an opponent, you may put a Goblin creature card from your hand onto the battlefield." })).toBe("native-trigger");
  });
});
