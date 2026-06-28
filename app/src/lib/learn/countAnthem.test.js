/**
 * countAnthem.test.js — GROUP COUNT-ANTHEM + subtype-on-battlefield count source (deck wave).
 *
 * "All Sliver creatures get +1/+1 for each other Sliver on the battlefield" (Sliver Legion — the Slivers
 * DECK CENTERPIECE) is now native-static: a layer-7c dynamic P/T applied to the GROUP (parseCreatureSelector)
 * scaled by a LIVE board count (parseSelfCountSource → subtypeOnBattlefield), re-evaluated per affected
 * creature. The same new count source also flips SELF count-buffs ("This creature gets +1/+1 for each other
 * Squirrel on the battlefield" — Squirrel Mob; "-1/-1 for each other creature" — Mogg Squad; "for each
 * enchantment" — Yavimaya Enchantress).
 *
 * CREED — the FP here is OVER-BUFF (wrong count → wrong P/T), so the exact magnitude is asserted at multiple
 * board sizes. The "other" (excludeSelf) magnitude and the selector's membership are independent. An
 * AURA/EQUIPMENT host ("for each OTHER enchantment" — Ancestral Mask) is REJECTED → Arbiter, because its
 * "other" excludes the aura SOURCE, which a creature-scoped count can't represent (it would over-count).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LEGION = "All Sliver creatures get +1/+1 for each other Sliver on the battlefield.";

function withBattlefield(userBf, aiBf = []) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, players: { ...base.players, user: { ...base.players.user, battlefield: userBf }, ai: { ...base.players.ai, battlefield: aiBf } } };
}
const sliver = (id, pt = [1, 1], controller = "user") => createPermanent({ id, card: { name: id, type: "Creature — Sliver", power: pt[0], toughness: pt[1], oracle: "" }, controller });
const legionPerm = (controller = "user") => createPermanent({ id: "legion", card: { name: "Sliver Legion", type: "Legendary Creature — Sliver", power: 7, toughness: 7, oracle: LEGION }, controller });

describe("GROUP COUNT-ANTHEM — recognition", () => {
  it("Sliver Legion + tribal/board count-lords → native-static", () => {
    expect(classifyCard({ name: "Sliver Legion", type: "Legendary Creature — Sliver", oracle: LEGION })).toBe("native-static");
    expect(classifyCard({ name: "Squirrel Mob", type: "Creature — Squirrel", oracle: "This creature gets +1/+1 for each other Squirrel on the battlefield." })).toBe("native-static");
    expect(classifyCard({ name: "Mogg Squad", type: "Creature — Goblin", oracle: "This creature gets -1/-1 for each other creature on the battlefield." })).toBe("native-static");
  });
  it("FN boundary — an AURA host ('for each other enchantment') is REJECTED (Arbiter), not over-buffed", () => {
    expect(classifyCard({ name: "Ancestral Mask", type: "Enchantment — Aura", oracle: "Enchant creature\nEnchanted creature gets +2/+2 for each other enchantment on the battlefield." })).toBe("body-only");
  });
  it("FN boundary — a counter-on-source count (hollow-risk) stays Arbiter", () => {
    expect(classifyCard({ name: "Joraga Warcaller", type: "Creature — Elf Warrior", oracle: "Other Elf creatures you control get +1/+1 for each +1/+1 counter on this creature." })).toBe("body-only");
  });
});

describe("GROUP COUNT-ANTHEM — exact magnitude (over-buff CREED check)", () => {
  it("Sliver Legion scales each Sliver by (#Slivers − 1): 1→+0, 2→+1, 3→+2", () => {
    let s = withBattlefield([legionPerm()]);
    expect([permanentPower(s, "legion"), permanentToughness(s, "legion")]).toEqual([7, 7]);   // alone: +0
    s = withBattlefield([legionPerm(), sliver("s1")]);
    expect([permanentPower(s, "legion"), permanentToughness(s, "legion")]).toEqual([8, 8]);   // +1
    expect([permanentPower(s, "s1"), permanentToughness(s, "s1")]).toEqual([2, 2]);           // the 1/1 also +1
    s = withBattlefield([legionPerm(), sliver("s1"), sliver("s2")]);
    expect([permanentPower(s, "legion"), permanentToughness(s, "legion")]).toEqual([9, 9]);   // +2
    expect([permanentPower(s, "s1"), permanentToughness(s, "s1")]).toEqual([3, 3]);           // +2
  });

  it("the count is BATTLEFIELD-WIDE + the selector is symmetric (an opponent's Sliver counts AND is buffed); a non-Sliver is untouched", () => {
    const bear = createPermanent({ id: "bear", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user" });
    const s = withBattlefield([legionPerm(), bear], [sliver("opp", [1, 1], "ai")]);
    expect([permanentPower(s, "legion"), permanentToughness(s, "legion")]).toEqual([8, 8]);   // 2 Slivers total, other=1
    expect([permanentPower(s, "opp"), permanentToughness(s, "opp")]).toEqual([2, 2]);         // opp Sliver buffed (symmetric, other=1)
    expect([permanentPower(s, "bear"), permanentToughness(s, "bear")]).toEqual([2, 2]);       // Bear is not a Sliver → unbuffed
  });

  it("SELF count-buff Mogg Squad: -1/-1 for each OTHER creature (base 3/3, +2 other creatures → 1/1)", () => {
    const mogg = createPermanent({ id: "mogg", card: { name: "Mogg Squad", type: "Creature — Goblin", power: 3, toughness: 3, oracle: "This creature gets -1/-1 for each other creature on the battlefield." }, controller: "user" });
    const s = withBattlefield([mogg, sliver("c1"), createPermanent({ id: "c2", card: { name: "B", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai" })]);
    expect([permanentPower(s, "mogg"), permanentToughness(s, "mogg")]).toEqual([1, 1]);       // 3/3 − 2 (two other creatures)
  });
});
