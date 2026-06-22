/**
 * amass.test.js — AMASS (CR 701.43) atom + clause parser (slice AMASS-ARMY).
 *
 * Covers: a no-Army amass MINTS exactly one 0/0 token that survives as an N/N (counters stamped in the
 * SAME event before the lethal SBA); a repeated amass REUSES the existing Army (the #1 FP guard — never a
 * 2nd token); the minted token's card.type carries the subtype so tribal readers (\b<Subtype>\b) match;
 * the spell/trigger clause path via the in-test-registered amassClauseParser → parseEffectClause; the X
 * (countX) form via ctx.xValue; and the variable "amass Orcs X, where X is …" form stays LOW (null).
 *
 * The clause parser is registered IN-TEST (registrySeams.test.js precedent) — the production wiring is the
 * integrator's registerClauseParser at parser.js-bottom; an atoms module must not self-register (Wave-0
 * circular-import hazard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resolveAtom, ATOM_RESOLVERS } from "../effectAtoms.js";
import { parseEffectClause, registerClauseParser } from "../parser.js";
import { amassClauseParser } from "./amass.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness, findPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

function baseState(battlefield = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield } } };
}
const amass = (s, atom, ctx = {}) => resolveAtom(s, { op: "amass", ...atom }, { controller: "user", targets: [], ...ctx });
const armies = (s) => s.players.user.battlefield.filter((p) => /\bArmy\b/.test(p.card.type));

describe("AMASS resolver — no Army present (mint a token)", () => {
  it("mints exactly ONE 0/0 token that survives as a 2/2 after amass 2 (counters stamped same-event)", () => {
    const s = amass(baseState(), { subtype: "Sliver", amount: 2 });
    const army = armies(s);
    expect(army).toHaveLength(1);                                  // exactly one token minted
    expect(army[0].counters["+1/+1"]).toBe(2);                     // its counters
    expect(creaturePower(army[0], s)).toBe(2);                     // reads as a 2/2 …
    expect(creatureToughness(army[0], s)).toBe(2);                 // … survives the lethal SBA
    expect(s.players.user.graveyard.some((c) => /Army/.test(c.type || ""))).toBe(false); // NOT dead
  });

  it("the minted token's card.type matches /\\bSliver Army\\b/ (tribal readers)", () => {
    const s = amass(baseState(), { subtype: "Sliver", amount: 1 });
    const army = armies(s)[0];
    expect(army.card.type).toMatch(/\bSliver Army\b/);
    expect(army.card.token).toBe(true);
    expect(army.card.power).toBe(0);                               // PRINTED 0/0 (the counters supply the N/N)
    expect(army.card.toughness).toBe(0);
  });

  it("a 0-amass (X=0) mints a 0/0 that dies to the lethal SBA (CR 107.3 no-op count, not forced to 1)", () => {
    const s = amass(baseState(), { subtype: "Orc", countX: true }, { xValue: 0 });
    expect(armies(s)).toHaveLength(0);                             // the 0/0 entered then died
    expect(s.players.user.graveyard.some((c) => /\bOrc Army\b/.test(c.type || ""))).toBe(true);
  });
});

describe("AMASS resolver — Army already present (REUSE, the #1 FP guard)", () => {
  it("REUSES the existing Army on a repeated amass — battlefield Army count stays 1, counters increment", () => {
    let s = amass(baseState(), { subtype: "Orc", amount: 1 });    // mint
    expect(armies(s)).toHaveLength(1);
    const id = armies(s)[0].id;
    s = amass(s, { subtype: "Orc", amount: 1 });                  // amass again — must NOT spawn a 2nd token
    expect(armies(s)).toHaveLength(1);                            // still ONE Army
    expect(armies(s)[0].id).toBe(id);                             // the SAME permanent
    expect(armies(s)[0].counters["+1/+1"]).toBe(2);              // counters grew 1 → 2
  });

  it("a DIFFERENT-subtype amass on an existing Army appends the new subtype to its type line (CR 701.43c)", () => {
    let s = amass(baseState(), { subtype: "Orc", amount: 1 });
    s = amass(s, { subtype: "Sliver", amount: 1 });              // "It's also a Sliver."
    expect(armies(s)).toHaveLength(1);                            // STILL one Army, not a new Sliver token
    const tl = armies(s)[0].card.type;
    expect(tl).toMatch(/\bOrc\b/);
    expect(tl).toMatch(/\bSliver\b/);                             // both subtypes now on the readable type line
    expect(armies(s)[0].counters["+1/+1"]).toBe(2);
  });

  it("routes counters through gameState.addCounter (a non-Army permanent is never touched)", () => {
    const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const s = amass(baseState([bear]), { subtype: "Zombie", amount: 3 });
    expect(findPermanent(s, "bear").permanent.counters["+1/+1"] || 0).toBe(0); // the bear is NOT an Army → untouched
    expect(armies(s)[0].counters["+1/+1"]).toBe(3);
  });
});

describe("AMASS clause parser (registered in-test) → parseEffectClause", () => {
  // Register ONCE for this suite (vitest isolates modules per file, so it can't leak to other suites).
  registerClauseParser(amassClauseParser);

  it("'Amass Slivers 2' yields an `amass` atom and ATOM_RESOLVERS.amass is a function", () => {
    const program = parseEffectClause("Amass Slivers 2.", "Instant");
    expect(program.confidence).toBe("high");
    expect(program.atoms).toHaveLength(1);
    expect(program.atoms[0]).toMatchObject({ op: "amass", subtype: "Sliver", amount: 2 });
    expect(typeof ATOM_RESOLVERS.amass).toBe("function");
  });

  it("maps plurals to singular subtypes (Orcs → Orc) and parses the digit", () => {
    const program = parseEffectClause("Amass Orcs 1.", "Creature — Orc Archer");
    expect(program.confidence).toBe("high");
    expect(program.atoms[0]).toMatchObject({ op: "amass", subtype: "Orc", amount: 1 });
  });

  it("the 'amass <Plural> X' form yields countX (resolves via ctx.xValue)", () => {
    const atom = amassClauseParser("amass Orcs x", {});
    expect(atom).toMatchObject({ op: "amass", subtype: "Orc", countX: true });
    const s = amass(baseState(), atom, { xValue: 3 });
    expect(armies(s)[0].counters["+1/+1"]).toBe(3);
  });

  it("an UNKNOWN plural subtype stays LOW (null — Arbiter, CREED)", () => {
    expect(amassClauseParser("amass Goblins 2", {})).toBeNull();
  });

  it("'Amass Orcs X, where X is that spell's mana value' stays LOW (variable form → Arbiter)", () => {
    // The ", where X is …" rider carries trailing text → fails the ^…$ anchor → null → low.
    expect(amassClauseParser("amass Orcs x, where x is that spell's mana value", {})).toBeNull();
    const program = parseEffectClause("Amass Orcs X, where X is that spell's mana value.", "Sorcery");
    expect(program.confidence).toBe("low");
  });
});
