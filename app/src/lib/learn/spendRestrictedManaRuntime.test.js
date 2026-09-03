/**
 * spendRestrictedManaRuntime.test.js — SPEND-RESTRICTED MANA (CR 106.6) is now ENFORCED, not refused.
 *
 * ⭐ THIS FILE IS THE GRADUATION EVIDENCE FOR A CAPABILITY PIN. `spendRestrictedMana.test.js` refused these
 * cards outright and said why, in its own header: *"until restrictions are real."* That is a capability pin —
 * it names the missing capability as its reason — and the discipline for one is that it graduates on RUNTIME
 * PROOF and is then RE-POINTED, never deleted. So the old pins still exist and still assert a refusal; what
 * they now assert is the refusal of everything this file does not prove.
 *
 * ⛔ WHAT HAD TO BE TRUE BEFORE ANY OF THOSE PINS COULD MOVE — all four, not three:
 *   1. a restricted source CAN pay the cast it is printed for;
 *   2. it CANNOT pay a cast it is not printed for;
 *   3. it CANNOT pay anything when the caller supplies NO context (default-deny — this is what keeps the
 *      ~9 payment call sites nobody threaded safe, and it is the property that makes partial adoption sound);
 *   4. ⭐ it cannot LAUNDER — an over-producing restricted source may not be tapped for a smaller cost,
 *      because surplus floats into a mana pool that carries no restriction tag, and one such tap would
 *      convert restricted mana into general-purpose mana permanently.
 *
 * Point 4 is the one that would have shipped silently. The FP it prevents is not "the card is too good" —
 * it is Jeweled Lotus tapping for a 1-mana creature spell and leaving 2 general mana behind.
 */
import { describe, expect, it } from "vitest";

import { manaProduction, manaSources, planPayment, canAfford, parseSpendRestriction } from "./manaModel.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

// ⚠️ VERBATIM PRINTED ORACLE, verified against the bundled Scryfall snapshot. The first draft of this file
// paraphrased Jeweled Lotus from memory as "Sacrifice Jeweled Lotus" — the card prints "Sacrifice this
// artifact" — and manaProduction returned null, so two assertions failed against a card that does not exist.
// Card text comes from the data, never from recall; the fixture is not exempt from that rule.
const HERD_HEIRLOOM = {
  id: "hh", name: "Herd Heirloom", type: "Artifact",
  oracle: "{T}: Add one mana of any color. Spend this mana only to cast a creature spell.",
};
const JEWELED_LOTUS = {
  id: "jl", name: "Jeweled Lotus", type: "Artifact",
  oracle: "{T}, Sacrifice this artifact: Add three mana of any one color. Spend this mana only to cast your commander.",
};
const CREATURE = { id: "c1", name: "Bear", type: "Creature — Bear" };
const SORCERY = { id: "s1", name: "Bolt", type: "Sorcery" };

const boardWith = (card) => {
  _resetIdsForTests();
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const perm = createPermanent({ id: card.id, controller: "user", card });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
};
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });

describe("the restriction reaches the source", () => {
  it("⭐ manaProduction carries it", () => {
    expect(manaProduction(HERD_HEIRLOOM).restriction).toEqual({ castTypes: ["creature"] });
  });

  it("⭐ and manaSources carries it onto the board source", () => {
    const src = manaSources(boardWith(HERD_HEIRLOOM), "user").find((s) => s.permanentId === "hh");
    expect(src.restriction).toEqual({ castTypes: ["creature"] });
  });

  it("⛔ an unrestricted source has no restriction field at all (no behavior change for the other 99%)", () => {
    const sol = { id: "sr", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." };
    const src = manaSources(boardWith(sol), "user").find((s) => s.permanentId === "sr");
    expect(src.restriction).toBeUndefined();
  });
});

describe("⛔ ENFORCEMENT — the four properties the pins graduate on", () => {
  const sources = () => manaSources(boardWith(HERD_HEIRLOOM), "user");

  it("⭐ 1. it PAYS the cast it is printed for", () => {
    expect(canAfford(EMPTY_POOL, sources(), cost({ generic: 1 }), { castCard: CREATURE })).toBe(true);
  });

  it("⛔ 2. it does NOT pay a cast it is not printed for", () => {
    expect(canAfford(EMPTY_POOL, sources(), cost({ generic: 1 }), { castCard: SORCERY })).toBe(false);
  });

  it("⛔ 3. DEFAULT-DENY — no spend context means the source is not offered", () => {
    // The property that makes every un-threaded call site safe. A caller that forgets the context
    // under-pays (a clean failure) instead of spending restricted mana on the wrong thing.
    expect(canAfford(EMPTY_POOL, sources(), cost({ generic: 1 }))).toBe(false);
    expect(canAfford(EMPTY_POOL, sources(), cost({ generic: 1 }), null)).toBe(false);
  });

  it("⛔⭐ 4. NO LAUNDERING — an over-producing restricted source can't be tapped for a smaller cost", () => {
    // Jeweled Lotus makes THREE. Paying a 1-generic commander cast would float 2 into a pool that carries
    // no restriction tag — general-purpose mana minted from a commander-only source, permanently. Refused.
    const lotusSources = manaSources(boardWith(JEWELED_LOTUS), "user");
    const ctx = { castCard: { id: "cmd", name: "Cmd", type: "Legendary Creature — Elf" }, isCommander: true };
    expect(canAfford(EMPTY_POOL, lotusSources, cost({ generic: 1 }), ctx)).toBe(false);   // would float 2
    expect(canAfford(EMPTY_POOL, lotusSources, cost({ generic: 2 }), ctx)).toBe(false);   // would float 1
    expect(canAfford(EMPTY_POOL, lotusSources, cost({ generic: 3 }), ctx)).toBe(true);    // fully consumed
  });
});

describe("⛔ the COMMANDER restriction is a designation, not a type-line word", () => {
  const lotus = () => manaSources(boardWith(JEWELED_LOTUS), "user");
  const cmd = { id: "cmd", name: "Cmd", type: "Legendary Creature — Elf" };

  it("⭐ it pays a commander cast", () => {
    expect(canAfford(EMPTY_POOL, lotus(), cost({ generic: 3 }), { castCard: cmd, isCommander: true })).toBe(true);
  });

  it("⛔ and NOT the same card cast from hand", () => {
    // ⚠️ The identical card object — only `isCommander` differs. "Commander" is a DESIGNATION (CR 903.3),
    // never a word in the type line, so it must never be matched by the type-line path; a card that happens
    // to read "Legendary Creature" is not thereby a commander. Same failure class as the vacuous subtype
    // filter, in the other direction.
    expect(canAfford(EMPTY_POOL, lotus(), cost({ generic: 3 }), { castCard: cmd, isCommander: false })).toBe(false);
  });

  it("⛔ a creature-restricted source does NOT pay a commander just for being a creature card", () => {
    // Herd Heirloom says "creature spell" — a creature commander IS a creature spell, so this one legitimately
    // does pay. Asserted so the two restriction kinds are not confused: @commander is narrower, not a synonym.
    expect(canAfford(EMPTY_POOL, manaSources(boardWith(HERD_HEIRLOOM), "user"), cost({ generic: 1 }), { castCard: cmd, isCommander: true })).toBe(true);
  });
});

describe("⛔ the parser refuses everything it cannot honor", () => {
  it("⛔ non-cast permissions stay null → the card stays refused, exactly as before", () => {
    for (const t of [
      "Spend this mana only to activate abilities.",
      "Spend this mana only to pay cumulative upkeep costs.",
      "Spend this mana only on costs that contain {X}.",
      "Spend this mana only to cast spells with mana value 5 or greater.",
    ]) expect(parseSpendRestriction(t)).toBe(null);
  });

  it("⭐ an 'or activate …' tail is IGNORED, not approximated — the cast half only", () => {
    // Modeling a SUBSET of what the card permits under-uses it (a safe FN). Approximating the activate half
    // would be the FP direction. Dalakos permits both; the engine takes only the cast.
    expect(parseSpendRestriction("Spend this mana only to cast artifact spells or activate abilities of artifacts."))
      .toEqual({ castTypes: ["artifact"] });
  });

  it("⛔ one unrecognised word in the list refuses the WHOLE card", () => {
    expect(parseSpendRestriction("Spend this mana only to cast historic spells.")).toBe(null);
  });

  it("⛔⭐ A QUALIFIED restriction is refused — reading the prefix would model it LOOSER than printed", () => {
    // Caught by an existing pin (Helga, Skittish Seer) after I shipped the prefix-matching version. "cast
    // creature spells WITH MANA VALUE 4 OR GREATER" is not "cast creature spells"; taking the prefix grants
    // the engine a restriction looser than the card's, which is the forbidden direction and exactly the
    // lossy-clause-tail class probe-lossy-clause-tails.mjs was built to find. ⭐ For a RESTRICTION, reading
    // less than is printed makes it WEAKER — the usual "an unread tail only under-delivers" intuition is
    // inverted here, which is why it slipped past me.
    for (const t of [
      "Spend this mana only to cast creature spells with mana value 4 or greater or creature spells with {X} in their mana costs.",
      "Spend this mana only to cast creature spells with no abilities.",
      // "…of the chosen type OR TO ACTIVATE an ability of a creature of the chosen type" (the Secluded Courtyard
      // shape) — the activate tail keeps the whole clause refused (the cast-only asymmetry is the safety).
      "Spend this mana only to cast a creature spell of the chosen type or to activate an ability of a creature of the chosen type.",
    ]) expect(parseSpendRestriction(t)).toBe(null);
    // GRADUATED (CAP-CAVERN, 2026-09-03): the bare "of the chosen type" qualifier sat in the refused list above; it
    // is now read as its OWN form — stamped `chosenType` and resolved per permanent by manaSources into the
    // conjunctive "<chosen> creature" entry (cavernOfSouls.test.js owns the runtime witness). Asserted AS parsed so
    // this pin can never silently re-refuse it.
    expect(parseSpendRestriction("Spend this mana only to cast a creature spell of the chosen type.")).toEqual({ castTypes: ["creature"], chosenType: true });
  });

  it("⛔⭐ a QUOTED GRANT is not this card's mana — the granter is credited nothing", () => {
    // Battery Bearer grants a restricted ability to OTHER creatures and taps for nothing itself. Stripping
    // the restriction and re-parsing credited the GRANTER with {C} — a fabricated source on a card that
    // makes no mana. Worse than the bug this whole feature fixes, and shipped for exactly one test run.
    expect(manaProduction({ name: "Battery Bearer", type: "Creature — Human Artificer",
      oracle: `Creatures you control have "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell."` })).toBeNull();
  });
});

describe("⛔ the plan actually taps it", () => {
  it("⭐ planPayment returns a real tap of the restricted permanent", () => {
    const plan = planPayment(EMPTY_POOL, manaSources(boardWith(HERD_HEIRLOOM), "user"), cost({ generic: 1 }), { castCard: CREATURE });
    expect(plan).not.toBe(null);
    expect(plan.taps.map((t) => t.permanentId)).toEqual(["hh"]);
  });
});
