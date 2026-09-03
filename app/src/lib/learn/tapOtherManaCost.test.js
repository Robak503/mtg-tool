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

  it("⛔ a non-self SACRIFICE cost is still refused — except 'Sacrifice a creature', PAID since 2026-09-03 (SG-3: the Altars)", () => {
    // Ashnod's Altar is a real source now: manaSources gates it on another creature and commitManaTap
    // sacrifices that creature through the dies chokepoint (altarManaSac.test.js). Every OTHER non-self
    // sacrifice is still phantom mana and still refused.
    expect(manaProduction({ name: "Ashnod's Altar", type: "Artifact", oracle: "Sacrifice a creature: Add {C}{C}." })).toMatchObject({ sacrificesCreature: true });
    expect(manaProduction({ name: "Artifact Altar", type: "Artifact", oracle: "Sacrifice an artifact: Add {C}{C}." })).toBe(null);
    expect(manaProduction({ name: "Utopia Mycon-like", type: "Creature — Fungus", oracle: "Sacrifice a Saproling: Add {C}{C}." })).toBe(null);
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

describe("⭐ the TAPLESS form — a cost with no {T} of its own", () => {
  const RANGERS = { id: "br", name: "Birchlore Rangers", type: "Creature — Elf Druid", oracle: "Tap two untapped Elves you control: Add one mana of any color." };
  const rangersSource = (st) => manaSources(st, "user").find((x) => x.permanentId === "br");

  it("⚠️⭐ the PLURAL payer noun parses — the greedy-regex bug that split this family in half", () => {
    // `([a-z]+)s?` is GREEDY, so "two untapped Elves" captured "elves" and "two untapped creatures" captured
    // "creatures" — neither in the allowlist. Every count>1 card silently kept its refusal while the count==1
    // cards flipped: a PARTIAL FLIP across identical printed shapes, the same tell that uncovered the
    // destroy-CREATURE lead hole. De-pluralized against the allowlist rather than widening it with plurals.
    expect(manaProduction(RANGERS)).toMatchObject({ requiresTap: false, extraTap: { count: 2, filter: "elf" } });
    expect(manaProduction({ name: "Supportive Parents", type: "Creature — Human", oracle: "Tap two untapped creatures you control: Add one mana of any color." }))
      .toMatchObject({ extraTap: { count: 2, filter: "creature" } });
  });

  it("⭐⭐ the source IS a legal payer for its own tapless cost (it is an untapped Elf)", () => {
    // ⛔ Excluding the source unconditionally would demand two OTHER Elves where the card asks for two Elves
    // TOTAL — wrong in the restrictive direction. The exclusion applies only when the source is already
    // tapping via its own {T} (Springleaf Drum).
    const st = board([perm("br", null, RANGERS), perm("e1", "Creature — Elf")]);
    expect(rangersSource(st).extraTaps.sort()).toEqual(["br", "e1"]);
  });

  it("⛔ but one Elf in total is still not two", () => {
    expect(rangersSource(board([perm("br", null, RANGERS)]))).toBeUndefined();
  });

  it("⭐⭐ and it is usable the turn it lands — no {T} in its cost (CR 302.6)", () => {
    // The source-side twin of the payer rule. A summoning-sick creature whose mana ability carries no {T} is
    // legal immediately; gating it as though it tapped is the same mistake on the other side of the cost.
    const st = board([perm("br", null, RANGERS, { summoningSick: true }), perm("e1", "Creature — Elf", null, { summoningSick: true })]);
    expect(rangersSource(st)).toBeDefined();
  });

  it("⛔⚠️ but a LAND played this turn is still gated — undefined requiresTap means it DOES tap", () => {
    // The regression this nearly shipped: `!prod.requiresTap` is true for lands (no such key), which made
    // every mass-animated land usable the turn it was played. The check is `=== false`, and the CR 302.6 land
    // test is what caught it.
    const forest = perm("f", "Land — Forest", null, { summoningSick: true });
    const st = board([forest]);
    expect(manaSources(st, "user").some((x) => x.permanentId === "f")).toBe(true);   // lands are not creatures
    expect(manaProduction({ name: "Forest", type: "Land — Forest", oracle: "" }).requiresTap).toBeUndefined();
  });
});

describe("⭐ PAY-LIFE costs — the same graduation, a different currency", () => {
  const STAFF = { id: "st", name: "Staff of Compleation", type: "Artifact", oracle: "{T}, Pay 2 life: Add one mana of any color." };
  const boardAt = (life) => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, life, battlefield: [perm("st", "Artifact", STAFF)] } } };
  };
  const staffSource = (st) => manaSources(st, "user").find((x) => x.permanentId === "st");

  it("⭐ the cost is parsed and carried", () => {
    expect(manaProduction(STAFF)).toMatchObject({ requiresTap: true, payLife: 2 });
  });

  it("⛔ a second consumable in the same cost still refuses (Hazel taps X tokens too)", () => {
    expect(manaProduction({ name: "Hazel", type: "Creature — Human", oracle: "{T}, Pay 2 life, Tap X untapped tokens you control: Add X mana of any one color." })).toBe(null);
  });

  it("⭐ affordable at 3 life", () => expect(staffSource(boardAt(3))).toBeDefined());

  it("⛔⭐ NOT offered at exactly the cost — paying to 0 is legal but loses the game", () => {
    // ⚠️ `>` not `>=`, deliberately. CR 118.4 permits paying life down to 0; a state-based action then ends
    // the game. A `>=` gate lets the sim kill itself for one mana — a legal move no player would make, and a
    // corrupted training game. Declining that last point is a documented narrowing, not a rules claim.
    expect(staffSource(boardAt(2))).toBeUndefined();
    expect(staffSource(boardAt(1))).toBeUndefined();
  });

  it("⛔⭐ RUNTIME — the life is actually spent", () => {
    const st = boardAt(40);
    const plan = planPayment(EMPTY_POOL, manaSources(st, "user"), cost({ generic: 1 }));
    const after = commitPaymentPlan(st, "user", plan);
    expect(after.players.user.life).toBe(38);
    expect(after.players.user.battlefield.find((p) => p.id === "st").tapped).toBe(true);
  });

  it("⛔ DISCARD and REMOVE-COUNTER costs still refuse — spendability, not difficulty", () => {
    // A discard needs a hand the mana model never consults; a remove-counter draws on a finite pool the sim
    // would treat as infinite. Neither is state this seam can honestly spend.
    expect(manaProduction({ name: "Skirge Familiar", type: "Creature — Imp", oracle: "Discard a card: Add {B}." })).toBe(null);
    expect(manaProduction({ name: "Trilobite", type: "Creature — Trilobite", oracle: "Remove a +1/+1 counter from this creature: Add {C}{C}." })).toBe(null);
  });
});

describe("⭐ payer NOUNS earned by measurement, and the ordering they exposed", () => {
  const GENE = { id: "gp", name: "Gene Pollinator", type: "Creature — Insect", oracle: "{T}, Tap an untapped permanent you control: Add one mana of any color." };
  const geneSource = (perms) => manaSources(
    (() => { const s = createGameState({ userDeck: [], aiDeck: [] }); return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } }; })(),
    "user",
  ).find((x) => x.permanentId === "gp");
  const gene = () => Object.assign(perm("gp", "Creature — Insect", GENE), { summoningSick: false });
  const forest = () => perm("f", "Basic Land — Forest");
  const bear = (id, sick) => Object.assign(perm(id, "Creature — Bear"), { summoningSick: sick });

  it('⭐ "permanent" parses as a payer noun', () => {
    expect(manaProduction(GENE)).toMatchObject({ extraTap: { count: 1, filter: "permanent" } });
  });

  it('⛔⭐ "permanent" must NOT go through the word-bound type-line test', () => {
    // ⚠️ THE VACUOUS-FILTER TRAP, third sighting in this engine (Norn's Choirmaster, Keleth were the others).
    // The word "permanent" never appears in a type line, so `\bpermanent\b` is a gate NO printed card can
    // satisfy: the source would be built and then never offered, and the card would look modeled while
    // producing nothing — silent in every metric. Everything on a battlefield IS a permanent (CR 110.1).
    expect(geneSource([gene(), forest()]).extraTaps).toEqual(["f"]);
    expect(geneSource([gene(), bear("b", false)]).extraTaps).toEqual(["b"]);
  });

  it("⭐⭐ a NON-mana payer is preferred over a land — otherwise the card nets zero", () => {
    // Tapping a Forest to make one mana is legal and pointless. The sim would have done it on every
    // activation. This is a POLICY (both orderings are legal), so it is asserted rather than assumed.
    expect(geneSource([gene(), forest(), bear("b", false)]).extraTaps).toEqual(["b"]);
  });

  it("⛔⚠️ and the sickness preference is CREATURE-scoped, or a fresh land outranks a ready creature", () => {
    // createPermanent stamps summoningSick on EVERY fresh permanent, lands included, and sickness is
    // meaningless for a land tapped as a COST. An unscoped key sorted a just-played Forest ahead of a ready
    // creature and picked the land — caught only by asserting WHICH payer was chosen, not that one was.
    expect(geneSource([gene(), forest(), bear("bs", true)]).extraTaps).toEqual(["bs"]);
  });

  it('⭐ "druid" (a subtype) rides the ordinary word-bound path', () => {
    expect(manaProduction({ name: "Seton", type: "Creature — Centaur Druid", oracle: "Tap an untapped Druid you control: Add {G}." }))
      .toMatchObject({ extraTap: { count: 1, filter: "druid" } });
  });

  it("⛔ an unmeasured noun is still refused — the list is curated, not open", () => {
    expect(manaProduction({ name: "X", type: "Artifact", oracle: "{T}, Tap an untapped Sliver you control: Add {G}." })).toBe(null);
  });
});
