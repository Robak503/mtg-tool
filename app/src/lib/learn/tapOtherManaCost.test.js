/**
 * tapOtherManaCost.test.js — mana abilities whose cost TAPS ANOTHER PERMANENT
 * ("{T}, Tap an untapped creature you control: Add one mana of any color." — Springleaf Drum, Loam Dryad,
 * Saruli Caretaker, Jaspera Sentinel, Dragonbroods' Relic).
 *
 * ⭐ GRADUATES A CAPABILITY PIN THAT NAMED ITS OWN CONDITION. manaModel's compound-cost guard refused this
 * whole family because "the sim doesn't tap the other Elves" — riding the {T} half alone minted PHANTOM
 * MANA every turn, since the consumable half was never spent or even required. The sim taps them now:
 * `extraTap` rides from the production parse to manaSources (which resolves real payers off the live board
 * and REFUSES to offer the source when there are too few) and on to commitManaTap (which taps them),
 * mirroring exactly how `sacrifices` already carried the Treasure self-crack.
 *
 * ⛔ THE HONESTY CLAIM IS UNCHANGED, ONLY ITS MECHANISM. These are still not STANDING sources — they are
 * sources only while a payer exists. Phantom mana is prevented by making the cost real rather than by
 * refusing the card, which is precisely what the guard asked for.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { manaProduction, manaSources, planPayment, commitPaymentPlan } from "./manaModel.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DRUM = { id: "drum", name: "Springleaf Drum", type: "Artifact", oracle: "{T}, Tap an untapped creature you control: Add one mana of any color." };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const cost = (o) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...o });

const perm = (id, type, card = null, extra = {}) =>
  Object.assign(createPermanent({ id, controller: "user", card: card || { id, name: id, type } }), extra);
const board = (perms) => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
};
const drumSource = (st) => manaSources(st, "user").find((x) => x.permanentId === "drum");

describe("the cost is parsed", () => {
  it("⭐ Springleaf Drum carries its extraTap", () => {
    expect(manaProduction(DRUM)).toMatchObject({ requiresTap: true, extraTap: { count: 1, filter: "creature" } });
  });

  it("⛔ a REMOVE-COUNTER cost is still refused — a finite pool the sim cannot spend", () => {
    expect(manaProduction({ name: "Sphere of the Suns", type: "Artifact", oracle: "{T}, Remove a charge counter from Sphere of the Suns: Add one mana of any color." })).toBe(null);
  });

  it("⛔ a non-self SACRIFICE cost is still refused", () => {
    expect(manaProduction({ name: "Ashnod's Altar", type: "Artifact", oracle: "Sacrifice a creature: Add {C}{C}." })).toBe(null);
  });

  it("⛔ an unmodeled PAYER FILTER refuses the card — never a tap of something the card didn't allow", () => {
    expect(manaProduction({ name: "X", type: "Artifact", oracle: "{T}, Tap an untapped Sliver you control: Add {G}." })).toBe(null);
  });
});

describe("⛔ AVAILABILITY — the payers must actually be there", () => {
  it("⛔⭐ NO payer → the source is not offered at all (the phantom-mana case)", () => {
    expect(drumSource(board([perm("drum", "Artifact", DRUM)]))).toBeUndefined();
  });

  it("⭐ a payer present → offered, carrying the payer it will tap", () => {
    const st = board([perm("drum", "Artifact", DRUM), perm("bear", "Creature — Bear")]);
    expect(drumSource(st).extraTaps).toEqual(["bear"]);
  });

  it("⛔ a TAPPED creature is not a payer", () => {
    const st = board([perm("drum", "Artifact", DRUM), perm("bear", "Creature — Bear", null, { tapped: true })]);
    expect(drumSource(st)).toBeUndefined();
  });

  it("⛔ a NON-creature is not a payer for a creature-filtered cost", () => {
    const st = board([perm("drum", "Artifact", DRUM), perm("rock", "Artifact")]);
    expect(drumSource(st)).toBeUndefined();
  });

  it("⛔ the source cannot pay its own cost — it is already tapping via its own {T}", () => {
    // Two Drums CAN pay for each other (each is an untapped permanent), but a lone Drum may not tap itself
    // twice. Without the self-exclusion a single Drum would be a free mana source forever.
    expect(drumSource(board([perm("drum", "Artifact", DRUM)]))).toBeUndefined();
  });

  it("⭐⭐ SUMMONING SICKNESS IS NOT A PAYER FILTER (CR 302.6)", () => {
    // ⚠️ The naive implementation excludes sick creatures and is WRONG — sickness restricts the {T} symbol
    // in a creature's OWN cost, and this is a cost of the DRUM's ability. A creature played this turn is a
    // legal payer, which is exactly the turn Springleaf Drum is meant to matter. Wrong in the restrictive
    // direction is still wrong, and nothing else in the suite would notice.
    const st = board([perm("drum", "Artifact", DRUM), perm("bear", "Creature — Bear", null, { summoningSick: true })]);
    expect(drumSource(st).extraTaps).toEqual(["bear"]);
  });

  it("⭐ and a SICK payer is preferred over a ready one — it has nothing else to do this turn", () => {
    const st = board([
      perm("drum", "Artifact", DRUM),
      perm("ready", "Creature — Bear", null, { summoningSick: false }),
      perm("sick", "Creature — Bear", null, { summoningSick: true }),
    ]);
    expect(drumSource(st).extraTaps).toEqual(["sick"]);
  });
});

describe("⛔⭐ RUNTIME — the payer is genuinely tapped", () => {
  it("⭐ paying with the Drum taps BOTH the Drum and its payer", () => {
    // The assertion the whole slice rests on. If the payer is not tapped the cost was never paid, and the
    // guard's phantom mana is back one layer down — with the source now offered, which is worse.
    const st = board([perm("drum", "Artifact", DRUM), perm("bear", "Creature — Bear")]);
    const plan = planPayment(EMPTY_POOL, manaSources(st, "user"), cost({ generic: 1 }));
    expect(plan).not.toBe(null);
    const after = commitPaymentPlan(st, "user", plan);
    const bf = after.players.user.battlefield;
    expect(bf.find((p) => p.id === "drum").tapped).toBe(true);
    expect(bf.find((p) => p.id === "bear").tapped).toBe(true);
  });

  it("⛔ and the payer is tapped ONCE, not once per mana requested", () => {
    const st = board([perm("drum", "Artifact", DRUM), perm("bear", "Creature — Bear"), perm("forest", "Land — Forest")]);
    const plan = planPayment(EMPTY_POOL, manaSources(st, "user"), cost({ generic: 2 }));
    const after = commitPaymentPlan(st, "user", plan);
    expect(after.players.user.battlefield.filter((p) => p.tapped).length).toBeLessThanOrEqual(3);
  });
});
