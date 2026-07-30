/**
 * additionalCostBounce.test.js — AC-BOUNCE (CR 601.2f): "As an additional cost to cast this spell, return a
 * <type> you control to its owner's hand." Deprive · Disappearing Act · Familiar's Ruse · Devour in Flames ·
 * Fear of Isolation. All five were in the dead-in-hand set the unvetted-cost guard created — vetting the
 * cost kind is what converts a suppressed card back into a properly charged cast.
 *
 * ⛔ The failure mode is the same one this whole family has: a free cast. Deprive with no land in play is
 * genuinely UNCASTABLE — not a free counterspell. The offer gate is what makes that true.
 *
 * The returned permanent goes to a HIDDEN zone (its owner's hand), so unlike a sacrifice there is no LKI to
 * read back; a card whose effect refers to "the returned <thing>" is parked by the selfRef guard.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DEPRIVE = { name: "Deprive", type: "Instant", mana: "{U}{U}",
  oracle: "As an additional cost to cast this spell, return a land you control to its owner's hand.\nCounter target spell." };
const RUSE = { name: "Familiar's Ruse", type: "Instant", mana: "{U}{U}",
  oracle: "As an additional cost to cast this spell, return a creature you control to its owner's hand.\nCounter target spell." };
const DEVOUR = { name: "Devour in Flames", type: "Sorcery", mana: "{2}{R}",
  oracle: "As an additional cost to cast this spell, return a land you control to its owner's hand.\nDevour in Flames deals 5 damage to target creature or planeswalker." };

const st_ = (out) => out?.state || out;
// The basic is derived from the card's own pips — an all-Swamp board has reported "not offered" three times
// this run, which reads exactly like a broken feature.
const PIP2LAND = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
function board({ lands = 6, creatures = 1 } = {}, card = DEVOUR) {
  const pips = [...new Set(card.mana.match(/[WUBRG]/g) || ["U"])];
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < lands; i++) {
    const pip = pips[i % pips.length];
    bf.push(createPermanent({ id: `L${i}`, card: { id: `cl${i}`, name: PIP2LAND[pip], type: `Basic Land — ${PIP2LAND[pip]}`, oracle: `{T}: Add {${pip}}.` }, controller: "user" }));
  }
  for (let i = 0; i < creatures; i++) bf.push(createPermanent({ id: `C${i}`, card: { id: `cc${i}`, name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" }, controller: "user" }));
  const foe = createPermanent({ id: "foe", card: { id: "cfoe", name: "Foe", type: "Creature — Beast", power: "5", toughness: "5", oracle: "" }, controller: "ai" });
  return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [{ id: "spell", ...card }], life: 20 },
      ai: { ...s0.players.ai, battlefield: [foe] } } };
}
const castsOf = (s, name) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "cast-spell" && a.name === name);

describe("the parser vets the bounce cost", () => {
  it("reads the permanent type off the phrase", () => {
    expect(extractAdditionalCosts(DEPRIVE.oracle).costs).toEqual([{ kind: "returnToHand", permType: "land" }]);
    expect(extractAdditionalCosts(RUSE.oracle).costs).toEqual([{ kind: "returnToHand", permType: "creature" }]);
    expect(extractAdditionalCosts("As an additional cost to cast this spell, return a permanent you control to its owner's hand.\nCounter target spell.").costs)
      .toEqual([{ kind: "returnToHand", permType: "permanent" }]);
  });

  it("⛔ an unvetted neighbour is NOT swept in", () => {
    // Someone ELSE's permanent, and the opponent-choice form, are different mechanics.
    expect(extractAdditionalCosts("As an additional cost to cast this spell, return a creature an opponent controls to its owner's hand.\nDraw a card.").costs).toBeNull();
  });
});

describe("⭐ the offer is gated on having something to return", () => {
  // ⚠️ Assert on the DISTINCT bounce victims, not the raw action count: the cast block crosses each
  // way-to-pay with every legal target combo, so Devour in Flames on 4 lands with 2 damage targets is
  // legitimately 8 actions. Counting actions here would be asserting the target enumerator, not this cost.
  const victims = (s, name) => [...new Set(castsOf(s, name).map((a) => a.returnPermId))].sort();

  it("one way-to-pay per legal land", () => {
    expect(victims(board({ lands: 4 }), "Devour in Flames")).toEqual(["L0", "L1", "L2", "L3"]);
  });

  it("⛔⛔ no land in play → NOT OFFERED (this is why it isn't a free spell)", () => {
    // Six Mountains is affordable for {2}{R}; strip the lands and add the mana another way is not possible
    // here, so the honest assertion is the one that matters: a board with no land of the right type offers
    // nothing. Familiar's Ruse with no creature is the same shape and is the cleaner fixture.
    expect(castsOf(board({ lands: 6, creatures: 0 }, RUSE), "Familiar's Ruse")).toHaveLength(0);
  });

  it("the type filter is real — a creature is not a land", () => {
    // 3 lands + 2 creatures on the battlefield; a "return a LAND" cost must offer the 3 lands and nothing else.
    expect(victims(board({ lands: 3, creatures: 2 }), "Devour in Flames")).toEqual(["L0", "L1", "L2"]);
  });
});

describe("⭐⭐ RUNTIME — the permanent really goes back to hand", () => {
  it("the chosen land leaves the battlefield and lands in hand", () => {
    const s = board({ lands: 4 });
    const act = castsOf(s, "Devour in Flames").find((a) => a.returnPermId === "L0");
    expect(act).toBeTruthy();
    const after = st_(dispatchAction(s, act));
    expect(after.players.user.battlefield.some((p) => p.id === "L0")).toBe(false);
    expect(after.players.user.battlefield.filter((p) => /Land/.test(p.card?.type || "")).length).toBe(3);
    expect(after.players.user.hand.some((c) => c.name === "Mountain")).toBe(true);
  });

  it("⛔ exactly ONE permanent is returned, not every match", () => {
    const s = board({ lands: 4 });
    const after = st_(dispatchAction(s, castsOf(s, "Devour in Flames")[0]));
    expect(after.players.user.hand.filter((c) => c.name === "Mountain")).toHaveLength(1);
  });
});

describe("coverage", () => {
  it("the carriers flip", () => {
    expect(classifyCard(DEPRIVE)).toBe("native-spell");
    expect(classifyCard(RUSE)).toBe("native-spell");
    expect(classifyCard(DEVOUR)).toBe("native-spell");
    expect(classifyCard({ name: "Fear of Isolation", type: "Enchantment Creature — Nightmare", mana: "{1}{U}", power: "3", toughness: "1",
      oracle: "As an additional cost to cast this spell, return a permanent you control to its owner's hand.\nFlying" })).toBe("native-body");
  });

  it("⛔ an effect that reads the RETURNED object back is still parked (hidden zone, no LKI)", () => {
    expect(classifyCard({ name: "Referent", type: "Instant", mana: "{1}{U}",
      oracle: "As an additional cost to cast this spell, return a creature you control to its owner's hand.\nDraw cards equal to the returned creature's power." })).not.toMatch(/^native/);
  });
});
