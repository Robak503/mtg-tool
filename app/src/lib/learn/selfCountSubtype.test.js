/**
 * selfCountSubtype.test.js — the layer-7c "for each <X> you control" self-buff learns NON-BASIC SUBTYPES.
 * Swordsman's Steel · Adelbert Steiner · Gatebreaker Ram · Militant Inquisitor · Raised by Wolves.
 *
 * ⭐ THE EVALUATOR ALREADY EXISTED. layers.countSelfSpecOnBoard's `permanentsYouControl` branch reads
 * `spec.cardType || spec.subtype` and does a word-bounded type-line scan — the exact wire the basic-land arm
 * (Squelching Leeches, "the number of Swamps you control") has always used. Only parseSelfCountSource refused
 * to PRODUCE the spec for a non-basic subtype, so a count the runtime computes exactly was unreachable from
 * the printed text. Card types (creature/artifact/land/enchantment) worked; Equipment, Gate and every tribe
 * did not, and the difference was vocabulary rather than capability.
 *
 * ⛔ CREED — the gate is COUNT_SUBTYPE, the single curated allowlist parseCountSource and the team-pump scope
 * already share. Its own criterion is corpus-verified: every entry is a real MTG subtype that appears ONLY in
 * the subtype position of a type line, so a word-bounded `\b<Subtype>\b` can never mis-match a card type. An
 * uncurated word returns null and the card parks — a safe false negative, never a fabricated count.
 *
 * The runtime block is the load-bearing one: a classification assertion cannot tell a real count from a
 * descriptor that silently evaluates to 0, and a 0 here is a buff that never appears rather than a crash.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracle + type lines, read out of the bundled index.
const SWORDSMANS_STEEL = { name: "Swordsman's Steel", type: "Artifact — Equipment", mana: "{2}",
  oracle: "Equipped creature gets +2/+2 for each Equipment you control.\nEquip {3}" };
const GATEBREAKER_RAM = { name: "Gatebreaker Ram", type: "Creature — Sheep", power: "2", toughness: "2", mana: "{2}{G}",
  oracle: "Gatebreaker Ram gets +1/+1 for each Gate you control.\nGatebreaker Ram has vigilance as long as you control a Gate." };
const MILITANT_INQUISITOR = { name: "Militant Inquisitor", type: "Creature — Human Cleric", power: "2", toughness: "2", mana: "{2}{W}",
  oracle: "Militant Inquisitor gets +1/+0 for each Equipment you control." };

let _n = 0;
const mk = (card, controller = "user") =>
  createPermanent({ id: `p-${String(card.name).replace(/\s+/g, "")}-${_n++}`, card: { ...card }, controller, summoningSick: false });
function stateWith(userBf = [], aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}
const AXE = { name: "Bone Saw", type: "Artifact — Equipment", oracle: "Equip {0}" };
const GATE = { name: "Gateway Plaza", type: "Land — Gate", oracle: "" };
const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

describe("classification — the five carriers flip", () => {
  it("Equipment / Gate counts are read now", () => {
    expect(classifyCard(SWORDSMANS_STEEL)).toBe("native-equipment");
    expect(classifyCard(GATEBREAKER_RAM)).toBe("native-static");
    expect(classifyCard(MILITANT_INQUISITOR)).toBe("native-static");
  });

  it("⛔ an UNCURATED count word still parks — the allowlist is the gate, not the grammar", () => {
    const fake = { ...MILITANT_INQUISITOR, name: "Fake Inquisitor",
      oracle: "Fake Inquisitor gets +1/+0 for each widget you control." };
    expect(classifyCard(fake)).not.toMatch(/^native/);
  });

  // ⭐ Note which guard actually does this: the anchor's character class ALLOWS spaces, so "tapped equipment
  // you control" matches the pattern fine. It is the ALLOWLIST LOOKUP that rejects it — "tapped equipment" is
  // not a key. Mutation M2 (allowlist replaced by a capitalize) fails this and the uncurated-word case above,
  // which is how the distinction was established rather than assumed.
  it("⛔ a QUALIFIED subtype count still parks — the allowlist lookup rejects it, not the anchor", () => {
    const fake = { ...MILITANT_INQUISITOR, name: "Fake Inquisitor",
      oracle: "Fake Inquisitor gets +1/+0 for each tapped Equipment you control." };
    expect(classifyCard(fake)).not.toMatch(/^native/);
  });
});

describe("⭐ RUNTIME — the subtype count is really evaluated, and tracks the board", () => {
  it("Militant Inquisitor is 2/2 with no Equipment and 4/2 with two", () => {
    const inq = mk(MILITANT_INQUISITOR);
    const none = stateWith([inq]);
    expect(permanentPower(none, inq.id)).toBe(2);
    const two = stateWith([inq, mk(AXE), mk(AXE)]);
    expect(permanentPower(two, inq.id)).toBe(4);   // +1/+0 per Equipment
    expect(permanentToughness(two, inq.id)).toBe(2);
  });

  it("Gatebreaker Ram grows and SHRINKS with the Gate count", () => {
    const ram = mk(GATEBREAKER_RAM);
    const three = stateWith([ram, mk(GATE), mk(GATE), mk(GATE)]);
    expect(permanentPower(three, ram.id)).toBe(5);
    expect(permanentToughness(three, ram.id)).toBe(5);
    const one = stateWith([ram, mk(GATE)]);
    expect(permanentPower(one, ram.id)).toBe(3);   // two Gates left → drops live
  });

  it("⛔ CREED — an OPPONENT's Equipment is NOT counted ('you control' is enforced)", () => {
    const inq = mk(MILITANT_INQUISITOR);
    const s = stateWith([inq], [mk(AXE, "ai"), mk(AXE, "ai")]);
    expect(permanentPower(s, inq.id)).toBe(2);     // still base — no cross-seat count
  });

  it("⛔ CREED — a non-matching permanent is NOT counted (a Bear is not an Equipment)", () => {
    const inq = mk(MILITANT_INQUISITOR);
    const s = stateWith([inq, mk(BEAR), mk(BEAR)]);
    expect(permanentPower(s, inq.id)).toBe(2);
  });
});
