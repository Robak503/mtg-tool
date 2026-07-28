/**
 * predefinedTokensLanderMutagenJunk.test.js — three more predefined artifact tokens in NAMED_TOKENS.
 *
 * WHAT EARNS A REGISTRY SLOT, and it is not "the card names a token". The six tokens already here
 * (Treasure/Clue/Food/Gold/Blood/Map) all share one property: the token's printed ability PARSES AND RUNS, so
 * minting one hands the player a permanent the engine can actually use. Registering a token whose ability the
 * engine could NOT execute would credit the card native while its payoff silently does nothing — the same
 * shape as the phantom-mana bug the mana model refuses tap-another-permanent costs over. So the first
 * describe block below asserts EXECUTABILITY per token, not merely that a name resolves.
 *
 * Every oracle string in the registry is the PRINTED reminder text read out of the bundled index. Each of
 * these three is identical across every printing that makes one, which is what makes a fixed registry entry
 * the right model rather than per-card synthesis.
 *
 * ON THE DELIBERATE NARROWNESS. These join ONLY the fixed-N create anchor, exactly as Map did. That is
 * measured, not lazy: of every corpus clause creating one of the three, 50 use the fixed-N form and ~6 use a
 * dynamic count ("create X Lander tokens", "for each +1/+1 counter on it"). Deriving the alternation from
 * Object.keys(NAMED_TOKENS) would have been one line and would open token/form pairs no card prints. Harmless
 * to coverage — but the narrow anchors encode which forms were actually observed, and that evidence is the
 * point. The last describe block pins the unprinted forms as unmatched so a future widening has to be
 * deliberate.
 */
import { describe, expect, it } from "vitest";

import { NAMED_TOKENS, createNamedTokenClauseParser } from "./effects/atoms/tokens.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

const NEW = ["lander", "mutagen", "junk"];

describe("THE BAR — a registered token's ability must actually run", () => {
  it.each(NEW)("%s's printed ability parses to a modeled, high-confidence program", (key) => {
    const spec = NAMED_TOKENS[key];
    const abilities = parseActivatedAbilities({ name: spec.name, type: spec.type, oracle: spec.oracle });
    expect(abilities).toHaveLength(1);
    expect(abilities[0].modeled).toBe(true);
    expect(abilities[0].program?.confidence).toBe("high");
  });

  it("each carries the distinct payload its printed text promises", () => {
    const op = (key) => parseActivatedAbilities({ ...NAMED_TOKENS[key], oracle: NAMED_TOKENS[key].oracle })[0].program.atoms[0].op;
    expect(op("lander")).toBe("tutor");           // search for a basic land, onto the battlefield tapped
    expect(op("mutagen")).toBe("add-counter");    // a +1/+1 counter on target creature
    expect(op("junk")).toBe("impulse-exile");     // exile the top card, playable this turn
  });

  it("all three are artifact tokens, typed like the six already here", () => {
    for (const key of NEW) expect(NAMED_TOKENS[key].type).toMatch(/^Token Artifact — /);
  });
});

describe("the fixed-N create anchor accepts them", () => {
  const atom = (clause) => createNamedTokenClauseParser(clause);

  it.each(NEW)("create a %s token", (key) => {
    expect(atom(`create a ${key} token`)).toEqual({ op: "create-named-token", token: key, count: 1, targetType: null });
  });

  it("counts and the tapped rider still work", () => {
    expect(atom("create two mutagen tokens")).toMatchObject({ token: "mutagen", count: 2 });
    expect(atom("create three junk tokens")).toMatchObject({ token: "junk", count: 3 });
    expect(atom("create a tapped lander token")).toMatchObject({ token: "lander", count: 1, tapped: true });
  });

  it("the six existing tokens are untouched", () => {
    expect(atom("create a treasure token")).toMatchObject({ token: "treasure", count: 1 });
    expect(atom("create a map token")).toMatchObject({ token: "map", count: 1 });
  });
});

describe("classification — real carriers flip, and the CREED still holds", () => {
  const card = (oracle, extra = {}) => ({ name: "X", type: "Creature — Human Scout", mana: "{2}{G}", power: 2, toughness: 2, keywords: [], oracle, ...extra });

  it("a plain ETB carrier flips (Galactic Wayfarer's shape)", () => {
    expect(classifyCard(card("When this creature enters, create a Lander token."))).toMatch(/^native/);
  });

  it.each(NEW)("%s carries its own ETB shape", (key) => {
    const name = NAMED_TOKENS[key].name;
    expect(classifyCard(card(`When this creature enters, create a ${name} token.`))).toMatch(/^native/);
  });

  it("CREED — an UNREGISTERED token name still parks the card", () => {
    // The registry is the whole mechanism; a token nobody has defined must not be minted as a blank permanent.
    expect(classifyCard(card("When this creature enters, create a Glorbulator token."))).not.toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard(card("When this creature enters, create a Lander token.\nEach opponent glorbulates."))).not.toMatch(/^native/);
  });
});

describe("⛔ POWERSTONE IS NOT NEXT — the trap this slice sets for whoever reads it", () => {
  /**
   * Powerstone is the single largest remaining unregistered predefined token: 15 parked corpus cards, an
   * "It's an artifact with …" reminder, one consistent definition. It looks EXACTLY like the three above,
   * and adding it is a two-line change. Do not.
   *
   * Its ability is "{T}: Add {C}. This mana can't be spent to cast a nonartifact spell." — RESTRICTED mana.
   * The mana pool is a plain per-color count with no restriction tracking (manaModel.js:447,
   * staticAbilityParser.js:436, and parser.js:241 all say so, the last one naming Powerstone outright).
   * Registering it would hand the player unrestricted colorless mana on 15 cards — a false positive, which
   * is the one direction the CREED forbids, and the same shape as the phantom-mana bug that makes manaModel
   * refuse tap-another-permanent costs.
   *
   * These assertions fail the moment someone registers it, which is the point: the objection arrives at the
   * edit, not in a doc nobody opens.
   */
  it("Powerstone is deliberately ABSENT from the registry", () => {
    expect(NAMED_TOKENS.powerstone).toBeUndefined();
  });

  it("a Powerstone carrier stays parked", () => {
    const card = { name: "X", type: "Creature — Human Artificer", mana: "{2}", power: 2, toughness: 2, keywords: [],
      oracle: "When this creature enters, create a Powerstone token." };
    expect(classifyCard(card)).not.toMatch(/^native/);
  });

  it("…and the clause does not parse to an atom", () => {
    expect(createNamedTokenClauseParser("create a powerstone token")).toBeNull();
  });
});

describe("the unprinted dynamic forms stay UNMATCHED — pin the measured narrowness", () => {
  // These are not oversights. No corpus card prints them, so they route to the Arbiter rather than being
  // credited. If a future set prints one, widening is a deliberate edit that has to update this pin.
  it("no 'that many' form", () => {
    expect(createNamedTokenClauseParser("create that many lander tokens")).toBeNull();
  });

  it("no 'half X, rounded' form", () => {
    expect(createNamedTokenClauseParser("create half x junk tokens, rounded up")).toBeNull();
  });

  it("no 'equal to its power' form", () => {
    expect(createNamedTokenClauseParser("create a number of mutagen tokens equal to its power")).toBeNull();
  });

  it("…while the SAME forms still work for the tokens that DO print them", () => {
    expect(createNamedTokenClauseParser("create that many treasure tokens")).toMatchObject({ token: "treasure" });
  });
});
