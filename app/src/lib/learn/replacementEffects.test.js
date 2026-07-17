/**
 * replacementEffects.test.js — Wave-3 COUNTER-AND-TOKEN-DOUBLER-REPLACEMENT (brief #6, the #1 FP).
 *
 * Unit: detection (doublerProfile / isPureDoubler) over the REAL oracle text of all 9 doublers, and the
 * factor math (greedy-max additive+multiplicative, x4 stacking, scope, Vorinclex halve, token multiplier).
 * Integration: the central addCounter interception, the token-count multiply, and the enters-with-counters
 * bypass site (resolvers.js), all doubled; a no-doubler board is a byte-for-byte no-op (regression guard).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { doublerProfile, isPureDoubler, applyCounterDoubling, tokenMultiplier, manaMultiplierProfile, manaMultiplier, stripModeledManaMultiplierClauses } from "./replacementEffects.js";
import { _resetIdsForTests, createGameState, createPermanent, addCounter, findPermanent } from "./gameState.js";
import { applyCreateToken } from "./effects/atoms/tokens.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (verified against the bundled oracle index).
const TEXT = {
  doublingSeason: ["Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead. If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead."],
  branchingEvolution: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on that creature instead."],
  hardenedScales: ["Enchantment", "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."],
  primalVigor: ["Enchantment", "If one or more tokens would be created, twice that many of those tokens are created instead. If one or more +1/+1 counters would be put on a creature, twice that many +1/+1 counters are put on that creature instead."],
  parallelLives: ["Enchantment", "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead."],
  vorinclex: ["Legendary Creature — Phyrexian Praetor", "Trample, haste\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down."],
  corpsejack: ["Creature — Fungus", "If one or more +1/+1 counters would be put on a creature you control, twice that many +1/+1 counters are put on it instead."],
  mondrak: ["Legendary Creature — Phyrexian Horror", "If one or more tokens would be created under your control, twice that many of those tokens are created instead.\n{1}{W/P}{W/P}, Sacrifice two other artifacts and/or creatures: Put an indestructible counter on Mondrak."],
  // Pir, Imaginative Rascal — "your team controls" additive doubler. Caught a gate FP: the scope regex missed
  // "your team controls" and fell through to global, leaking Pir's +1 onto opponents' counters. In this engine
  // (1v1 + FFA only, no teammates) "your team" == you, so Pir is you-scoped.
  pir: ["Legendary Creature — Human", "Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead."],
  // ── Idle-audit (full 33-card runtime-surface scan) false-detection guards ──
  // Mowu: a SELF-NAME doubler ("put on Mowu") — SELF-scoped (CTR-2): the +1 lands only on Mowu, never global.
  mowu: ["Legendary Creature — Dog", "Vigilance, trample\nIf one or more +1/+1 counters would be put on Mowu, that many plus one +1/+1 counters are put on it instead."],
  // Innkeeper's Talent: the doubler is the LEVEL-3 Class ability — must NOT apply unconditionally (Class type skip).
  innkeepersTalent: ["Enchantment — Class", "(Gain the next level as a sorcery to add its ability.)\nAt the beginning of combat on your turn, put a +1/+1 counter on target creature you control.\n{G}: Level 2\nPermanents you control with counters on them have ward {1}.\n{3}{G}: Level 3\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead."],
  // Hosting Season: a DATE-gated Secret Lair joke — the "While it's October …" calendar gate can't be evaluated, so skip.
  hostingSeason: ["Enchantment", "While it's October 25th, 2024, whenever you cast your commander, create a token that's a copy of it except it isn't legendary.\nWhile it's October 26th or 27th, 2024, if one or more tokens would be created under your control, instead twice that many tokens are created and each of them enters with a +1/+1 counter on it.\nOn any other date, both abilities apply."],
};
const cardOf = (k) => ({ name: k, type: TEXT[k][0], oracle: TEXT[k][1] });
const permOf = (k, controller) => ({ id: `dbl-${k}`, controller, card: cardOf(k), counters: {} });
// A minimal state with the given doubler permanents split by controller "me" / "opp".
const stateWith = (...perms) => ({
  players: { me: { battlefield: perms.filter((p) => p.controller === "me") }, opp: { battlefield: perms.filter((p) => p.controller === "opp") } },
  turnOrder: ["me", "opp"],
});

describe("doublerProfile / isPureDoubler — detection over real text", () => {
  it("classifies the pure replacement-static enchantments (native-static)", () => {
    for (const k of ["doublingSeason", "branchingEvolution", "hardenedScales", "primalVigor", "parallelLives"]) {
      expect(doublerProfile(cardOf(k)), k).toBeTruthy();
      expect(isPureDoubler(cardOf(k)), k).toBe(true);
    }
  });
  it("a doubler on a CREATURE / with an activated ability is NOT pure (stays body-only — CREED whole-card)", () => {
    for (const k of ["vorinclex", "corpsejack", "mondrak"]) {
      expect(doublerProfile(cardOf(k)), k).toBeTruthy(); // still a runtime doubler
      expect(isPureDoubler(cardOf(k)), k).toBe(false);   // but not native-static
    }
  });
  it("scope + kind are read correctly", () => {
    expect(doublerProfile(cardOf("branchingEvolution")).counter).toMatchObject({ op: "multiply", kind: "+1/+1", scope: "you" });
    expect(doublerProfile(cardOf("hardenedScales")).counter).toMatchObject({ op: "additive", kind: "+1/+1", scope: "you" });
    expect(doublerProfile(cardOf("primalVigor")).counter).toMatchObject({ kind: "+1/+1", scope: "global" }); // no "you control"
    expect(doublerProfile(cardOf("doublingSeason")).counter).toMatchObject({ kind: "any", scope: "you" });
    expect(doublerProfile(cardOf("vorinclex")).halvesOpponents).toBe(true);
    // Vorinclex's "if you would put …" self-clause IS a you-scope multiply (that is what self-doubles its
    // controller's counters through the central path); the opponent clause is the separate halvesOpponents flag.
    expect(doublerProfile(cardOf("vorinclex")).counter).toMatchObject({ op: "multiply", kind: "any", scope: "you" });
    // Pir "your team controls" → you-scope additive (the gate-FP fix); a creature + Partner body → not pure.
    expect(doublerProfile(cardOf("pir")).counter).toMatchObject({ op: "additive", kind: "any", scope: "you" });
    expect(isPureDoubler(cardOf("pir"))).toBe(false);
  });
  it("a non-doubler card returns null", () => {
    expect(doublerProfile({ type: "Creature", oracle: "Flying" })).toBeNull();
    expect(isPureDoubler({ type: "Creature", oracle: "Flying" })).toBe(false);
  });
  it("scope guards (idle full-surface audit): Mowu is SELF-scoped; Class-level / date-gated doublers still skip", () => {
    // Mowu "put on Mowu" is SELF-scoped (BLITZ CTR-2) — the +1 lands ONLY on Mowu itself, NEVER leaked onto
    // everyone's counters. The runtime applies it ONLY when the recipient permanent IS the source
    // (recipientPermId === the doubler's own permId), so a bare / other-permanent recipient is untouched.
    expect(doublerProfile(cardOf("mowu")).counter).toMatchObject({ op: "additive", kind: "+1/+1", scope: "self" });
    expect(applyCounterDoubling(stateWith(permOf("mowu", "me")), "me", "+1/+1", 1)).toBe(1);              // no recipientPermId → NOT boosted
    expect(applyCounterDoubling(stateWith(permOf("mowu", "me")), "me", "+1/+1", 1, "other")).toBe(1);     // a different permanent → NOT boosted
    expect(applyCounterDoubling(stateWith(permOf("mowu", "me")), "opp", "+1/+1", 1)).toBe(1);             // opponents: NOT boosted
    expect(applyCounterDoubling(stateWith(permOf("mowu", "me")), "me", "+1/+1", 1, "dbl-mowu")).toBe(2);  // Mowu ITSELF → that many plus one
    // Innkeeper's Talent — Class (the doubler is its Level-3 ability); the layer can't track levels → skip entirely.
    expect(doublerProfile(cardOf("innkeepersTalent"))).toBeNull();
    // Hosting Season — date-gated; the "While it's October …" gate can't be evaluated → no token doubler.
    expect(doublerProfile(cardOf("hostingSeason"))?.token ?? null).toBeNull();
  });
});

describe("applyCounterDoubling — factor math (CR 616.1e greedy-max)", () => {
  it("additive THEN multiplicative, greedy-max: Hardened Scales + Primal Vigor on base 1 → 4 (not 3)", () => {
    expect(applyCounterDoubling(stateWith(permOf("hardenedScales", "me"), permOf("primalVigor", "me")), "me", "+1/+1", 1)).toBe(4);
  });
  it("two multiplicative doublers stack to x4", () => {
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "me"), permOf("doublingSeason", "me")), "me", "+1/+1", 1)).toBe(4);
  });
  it("a +1/+1-only doubler does NOT double a non-+1/+1 counter (loyalty)", () => {
    expect(applyCounterDoubling(stateWith(permOf("branchingEvolution", "me")), "me", "loyalty", 3)).toBe(3);
    // …but Doubling Season (any counter) does double loyalty.
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "me")), "me", "loyalty", 3)).toBe(6);
  });
  it("a you-scope doubler never affects an opponent's counters (the forbidden FP)", () => {
    expect(applyCounterDoubling(stateWith(permOf("doublingSeason", "opp")), "me", "+1/+1", 1)).toBe(1);
  });
  it("Pir 'your team controls' is you-scope: boosts its controller, NEVER an opponent (gate-caught FP regression)", () => {
    expect(applyCounterDoubling(stateWith(permOf("pir", "me")), "me", "+1/+1", 1)).toBe(2);  // your counter: base + 1
    expect(applyCounterDoubling(stateWith(permOf("pir", "me")), "opp", "+1/+1", 1)).toBe(1);  // opponent's: UNCHANGED
  });
  it("a GLOBAL doubler (Primal Vigor) affects everyone", () => {
    expect(applyCounterDoubling(stateWith(permOf("primalVigor", "opp")), "me", "+1/+1", 1)).toBe(2);
  });
  it("Vorinclex halves (floor) counters on an opponent's permanent, doubles its controller's", () => {
    expect(applyCounterDoubling(stateWith(permOf("vorinclex", "opp")), "me", "+1/+1", 5)).toBe(2); // floor(5/2)
    expect(applyCounterDoubling(stateWith(permOf("vorinclex", "me")), "me", "+1/+1", 3)).toBe(6);
  });
  it("no doublers → the base amount unchanged (regression no-op)", () => {
    expect(applyCounterDoubling(stateWith(), "me", "+1/+1", 3)).toBe(3);
    expect(applyCounterDoubling({ players: {} }, "me", "+1/+1", 3)).toBe(3);
  });
});

describe("tokenMultiplier", () => {
  it("two token doublers → x4; a you-doubler ignores an opponent; none → x1", () => {
    expect(tokenMultiplier(stateWith(permOf("doublingSeason", "me"), permOf("parallelLives", "me")), "me")).toBe(4);
    expect(tokenMultiplier(stateWith(permOf("parallelLives", "opp")), "me")).toBe(1);
    expect(tokenMultiplier(stateWith(), "me")).toBe(1);
  });
});

describe("integration — the doubling actually fires through the engine", () => {
  // Build a real game state with a doubler + a target creature on the active player's battlefield.
  function gameWithDoubler(doublerKey) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const doubler = createPermanent({ id: "d1", card: cardOf(doublerKey), controller: "user" });
    const bear = createPermanent({ id: "b1", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [doubler, bear] } } };
  }

  it("addCounter is doubled by Doubling Season (central interception)", () => {
    const s = gameWithDoubler("doublingSeason");
    const out = addCounter(s, { permanentId: "b1", type: "+1/+1", amount: 1 });
    expect(findPermanent(out, "b1").permanent.counters["+1/+1"]).toBe(2);
  });

  it("addCounter is NOT doubled with no doubler on the board (regression)", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const bear = createPermanent({ id: "b1", card: { name: "Bear", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [bear] } } };
    const out = addCounter(s, { permanentId: "b1", type: "+1/+1", amount: 1 });
    expect(findPermanent(out, "b1").permanent.counters["+1/+1"]).toBe(1);
  });

  it("token count is doubled by Parallel Lives (applyCreateToken)", () => {
    const s = gameWithDoubler("parallelLives");
    const out = applyCreateToken(s, { op: "create-token", descriptor: "1/1 white Soldier", power: 1, toughness: 1, count: 1 }, { controller: "user" });
    const tokens = out.players.user.battlefield.filter((p) => p.card?.token && /Soldier/.test(p.card.type));
    expect(tokens).toHaveLength(2);
  });

  it("enters-with-+1/+1 counters are doubled at the resolvers.js bypass site", () => {
    const s = gameWithDoubler("doublingSeason");
    // A creature that "enters with two +1/+1 counters on it" (entersWithPlusCounters reads this).
    const card = { name: "Counter Bear", type: "Creature — Bear", power: 0, toughness: 0, oracle: "Counter Bear enters with two +1/+1 counters on it." };
    const out = enterPermanent(s, card, "user");
    const entered = out.players.user.battlefield.find((p) => p.card?.name === "Counter Bear");
    expect(entered.counters["+1/+1"]).toBe(4); // 2 doubled
  });
});

// ─── MANA-MULTIPLIER — "If you tap a permanent for mana, it produces N times as much" ─────────────
// Detection (manaMultiplierProfile) over the REAL oracle text of the only two cards with this template, the
// controller-scoped product (manaMultiplier), and the coverage residue-strip. Runtime tap-site application is
// tested in manaModel.test.js; the native-static classification in coverage.test.js.

describe("MANA-MULTIPLIER detection + factor (manaMultiplierProfile / manaMultiplier)", () => {
  const REFLECTION = "If you tap a permanent for mana, it produces twice as much of that mana instead.";
  const NYXBLOOM = "Trample\nIf you tap a permanent for mana, it produces three times as much of that mana instead.";

  it("Mana Reflection → factor 2; Nyxbloom Ancient → factor 3 (real oracle text)", () => {
    expect(manaMultiplierProfile({ name: "Mana Reflection", type: "Enchantment", oracle: REFLECTION })).toEqual({ factor: 2 });
    expect(manaMultiplierProfile({ name: "Nyxbloom Ancient", type: "Enchantment Creature — Elemental", oracle: NYXBLOOM })).toEqual({ factor: 3 });
  });

  it("non-multiplier mana cards are NOT detected (FP guard) — null profile", () => {
    // Caged Sun / Gauntlet — "add an additional one mana" (not a multiply), plus a choose-color + anthem rider.
    expect(manaMultiplierProfile({ name: "Caged Sun", type: "Artifact", oracle: "As this artifact enters, choose a color.\nCreatures you control of the chosen color get +1/+1.\nWhenever a land's ability causes you to add one or more mana of the chosen color, add an additional one mana of that color." })).toBeNull();
    // Mana Flare family — triggered "adds one mana of any type that land produced" (all players, additive).
    expect(manaMultiplierProfile({ name: "Mana Flare", type: "Enchantment", oracle: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced." })).toBeNull();
    // Doubling Cube — doubles the unspent POOL, not production (an activated ability).
    expect(manaMultiplierProfile({ name: "Doubling Cube", type: "Artifact", oracle: "{3}, {T}: Double the amount of each type of unspent mana you have." })).toBeNull();
    // a counter doubler ("twice that many counters") must not read as a mana multiplier.
    expect(manaMultiplierProfile({ name: "Doubling Season", type: "Enchantment", oracle: "If an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." })).toBeNull();
  });

  it("manaMultiplier(state, player) is the controller-scoped product of factors", () => {
    const lib = (c) => ({ id: c.id || `c-${c.name}`, ...c });
    const perm = (c, id) => ({ id, card: lib(c), tapped: false });
    const ref = (id) => perm({ name: "Mana Reflection", type: "Enchantment", oracle: REFLECTION }, id);
    const nyx = (id) => perm({ name: "Nyxbloom Ancient", type: "Enchantment Creature — Elemental", oracle: NYXBLOOM }, id);
    const st = (mine, theirs = []) => ({ players: { user: { battlefield: mine }, opp: { battlefield: theirs } } });

    expect(manaMultiplier(st([]), "user")).toBe(1);                       // none → ×1
    expect(manaMultiplier(st([ref("r")]), "user")).toBe(2);              // Mana Reflection → ×2
    expect(manaMultiplier(st([nyx("n")]), "user")).toBe(3);             // Nyxbloom → ×3
    expect(manaMultiplier(st([ref("r"), nyx("n")]), "user")).toBe(6);   // both stack multiplicatively → ×6
    // FP guard: an OPPONENT's multiplier never affects this player.
    expect(manaMultiplier(st([], [ref("ro")]), "user")).toBe(1);
    expect(manaMultiplier(st([], [ref("ro")]), "opp")).toBe(2);
  });

  it("coverage residue-strip removes ONLY the modeled multiplier sentence", () => {
    // Nyxbloom: Trample survives, the multiplier sentence is excised → keyword-only residue.
    const stripped = stripModeledManaMultiplierClauses(NYXBLOOM);
    expect(stripped).toContain("Trample");
    expect(stripped).not.toMatch(/three times as much/);
    // an unmodeled multiplier-shaped clause is NOT stripped (CREED: survives as residue).
    expect(stripModeledManaMultiplierClauses("Whenever a player taps a land for mana, that player adds one mana of any type that land produced."))
      .toMatch(/adds one mana/);
  });
});
