/**
 * castFromHandEtb.test.js — "…, if you cast it from your hand, …" (CR 601.2 / 400.7)
 * Furnace Dragon · Reiver Demon · Angel of the Dire Hour · Wakening Sun's Avatar · Coal Stoker.
 *
 * The ZONE-qualified sibling of the bare "you cast it" rider (castVsPutEtb.test.js). Same per-permanent
 * fact about how the object arrived — resolvers.enterPermanent stamps `castFromZone` beside `wasCast`,
 * from the cast resolvers only — narrowed by which zone the spell was cast from.
 *
 * ⛔ THE FAIL-SAFE DIRECTION MATTERS MORE HERE THAN ANYWHERE. Every carrier is a heavy sweep whose printed
 * cost is that you had to hard-cast it: Furnace Dragon exiles ALL artifacts, Reiver Demon destroys all
 * nonartifact nonblack creatures, Angel of the Dire Hour exiles all attackers. A permanent that arrives
 * any other way — reanimated, blinked, cheated in with Show and Tell — never gets the stamp, so the rider
 * reads FALSE and the sweep does not fire. Defaulting an absent zone to "hand" would hand every
 * reanimation deck a free board wipe, which is precisely what the printed rider exists to prevent.
 *
 * ⭐ So the negative tests below are the point of the file, not decoration.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { detectTriggers } from "./triggers.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// Real printed oracles, read out of the bundled snapshot rather than typed.
// ⚠️ A first draft PARAPHRASED these from memory and got Reiver Demon wrong — "non-Demon" for the real
// "nonblack" — plus three mana costs. The corpus test below is the only reason it is not still wrong.
// Card text comes from the snapshot, never from recall.
const FURNACE_DRAGON = { name: "Furnace Dragon", type: "Creature — Dragon", power: "5", toughness: "5", mana: "{6}{R}{R}{R}",
  oracle: "Affinity for artifacts (This spell costs {1} less to cast for each artifact you control.)\nFlying\nWhen this creature enters, if you cast it from your hand, exile all artifacts." };
const REIVER_DEMON = { name: "Reiver Demon", type: "Creature — Demon", power: "6", toughness: "6", mana: "{4}{B}{B}{B}{B}",
  oracle: "Flying\nWhen this creature enters, if you cast it from your hand, destroy all nonartifact, nonblack creatures. They can't be regenerated." };
const ANGEL_DIRE_HOUR = { name: "Angel of the Dire Hour", type: "Creature — Angel", power: "5", toughness: "4", mana: "{5}{W}{W}",
  oracle: "Flash\nFlying\nWhen this creature enters, if you cast it from your hand, exile all attacking creatures." };
const WAKENING_SUN = { name: "Wakening Sun's Avatar", type: "Creature — Dinosaur Avatar", power: "7", toughness: "7", mana: "{5}{W}{W}{W}",
  oracle: "When this creature enters, if you cast it from your hand, destroy all non-Dinosaur creatures." };
const COAL_STOKER = { name: "Coal Stoker", type: "Creature — Elemental", power: "3", toughness: "3", mana: "{3}{R}",
  oracle: "When this creature enters, if you cast it from your hand, add {R}{R}{R}." };

const ask = (state, id) => evaluateInterveningIf(state, "you cast it from your hand", "user", { triggeringPermanentId: id });
const fresh = () => createGameState({ userDeck: [], aiDeck: [] });

describe("⭐ THE STAMP — cast from hand vs. every other way in", () => {
  it("a permanent CAST FROM HAND satisfies the condition", () => {
    const s = enterPermanent(fresh(), { ...FURNACE_DRAGON, id: "f1" }, "user", { wasCast: true, castFromZone: "hand" });
    const perm = s.players.user.battlefield.at(-1);
    expect(perm.castFromZone).toBe("hand");
    expect(ask(s, perm.id)).toBe(true);
  });

  it("⛔ a REANIMATED / put-onto-the-battlefield permanent does NOT — the whole point of the rider", () => {
    // enterPermanent with no cast opts is every non-cast route: reanimation, Show and Tell, blink, a token.
    const s = enterPermanent(fresh(), { ...FURNACE_DRAGON, id: "f2" }, "user");
    const perm = s.players.user.battlefield.at(-1);
    expect(perm.castFromZone).toBeUndefined();
    expect(ask(s, perm.id)).toBe(false);   // false — never null, and certainly never true
  });

  it("⛔ CAST FROM ELSEWHERE (flashback / from exile) does not satisfy it either", () => {
    // The discriminating case the bare wasCast rider cannot distinguish: genuinely cast, wrong zone.
    const s = enterPermanent(fresh(), { ...FURNACE_DRAGON, id: "f3" }, "user", { wasCast: true, castFromZone: "graveyard" });
    const perm = s.players.user.battlefield.at(-1);
    expect(perm.wasCast).toBe(true);       // it WAS cast …
    expect(ask(s, perm.id)).toBe(false);   // … just not from hand
  });

  it("⛔ no entering permanent in context → null (can't confirm), never true", () => {
    expect(ask(fresh(), undefined)).toBeNull();
    expect(ask(fresh(), "nonexistent")).toBeNull();
  });

  it("the bare 'you cast it' rider is unaffected by the zone stamp", () => {
    // Regression guard on the sibling arm: a hand-cast still satisfies the unqualified form.
    const s = enterPermanent(fresh(), { ...FURNACE_DRAGON, id: "f4" }, "user", { wasCast: true, castFromZone: "hand" });
    const perm = s.players.user.battlefield.at(-1);
    expect(evaluateInterveningIf(s, "you cast it", "user", { triggeringPermanentId: perm.id })).toBe(true);
  });
});

describe("detection + vocabulary", () => {
  it("the rider is carried as an intervening-if and is now parseable", () => {
    const d = detectTriggers(FURNACE_DRAGON)[0];
    expect(d.interveningIf).toBe("you cast it from your hand");
    expect(interveningIfParseable("you cast it from your hand")).toBe(true);
  });

  it("⛔ an unmodelled zone qualifier stays unparseable (SAFE FN)", () => {
    expect(interveningIfParseable("you cast it from your graveyard")).toBe(false);
  });
});

describe("the corpus rows", () => {
  it("all five carriers flip", () => {
    for (const c of [FURNACE_DRAGON, REIVER_DEMON, ANGEL_DIRE_HOUR, WAKENING_SUN, COAL_STOKER]) {
      expect(classifyCard(c)).toMatch(/^native/);
    }
  });
});
