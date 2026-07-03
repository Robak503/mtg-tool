/**
 * VAULTBORN TYRANT — the self-or-other power ETB + the dies-copy artifact rider (CR 707.9a).
 *
 * Oracle: "Trample. Whenever this creature or another creature you control with power 4 or greater enters,
 * you gain 3 life and draw a card. When this creature dies, if it's not a token, create a token that's a copy
 * of it, except it's an artifact in addition to its other types."
 *
 * THREE faithful slices, each independently CREED-pinned:
 *   1. ETB power-threshold SELF-OR-OTHER scope — "this creature or another creature you control with power N
 *      or greater enters" reduces to the existing creatureYouControlPower scope (the "with power N" qualifier
 *      gates BOTH the self and the other; the self IS a creature you control). Fires when a controller-owned
 *      creature with power ≥ 4 enters (self or other), never on a power-3 or an opponent's creature.
 *   2. NOT-A-TOKEN intervening-if (CR 111.7 + 603.4) — "if it's not a token" reads the DYING source's captured
 *      token status (ctx.triggeringCardIsToken), so a nontoken Vaultborn dying copies itself but a TOKEN copy
 *      dying does NOT (the printed non-recurse guard).
 *   3. ADD-CARD-TYPE copy rider (CR 707.9a) — "…except it's an artifact in addition to its other types" makes
 *      the minted token GENUINELY an artifact (the card type prepended to the type line), not a dropped rider.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { tokenCopyParser } from "./effects/atoms/tokenCopy.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { interveningIfParseable, evaluateInterveningIf } from "./interveningIf.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ORACLE =
  "Trample\nWhenever this creature or another creature you control with power 4 or greater enters, you gain 3 life and draw a card.\n" +
  "When this creature dies, if it's not a token, create a token that's a copy of it, except it's an artifact in addition to its other types.";

const VT_CARD = { name: "Vaultborn Tyrant", type: "Creature — Dinosaur", mana: "{5}{G}{G}", power: "6", toughness: "6", oracle: ORACLE };

function resolveAll(s) {
  s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((s.stack || []).length && g++ < 50) s = resolveTopOfStack(s);
  return s;
}

// ─── Classification (the whole card flips) ────────────────────────────────────────
describe("Vaultborn Tyrant — classification", () => {
  // The exact bundled oracle (verified against the real card index in the MTG_APP_ROOT harness; here the card
  // is inline so the metric runs under plain vitest without the Scryfall data snapshot). classifyCard is a
  // pure function of the card object, so an inline card with the real oracle flips identically.
  it("the whole card flips body-only → native-trigger", () => {
    expect(classifyCard(VT_CARD)).toBe("native-trigger");
  });

  it("both triggers are detected (the ETB power-threshold + the dies-copy)", () => {
    const trigs = detectTriggers(VT_CARD);
    expect(trigs).toHaveLength(2);
    const etb = trigs.find((t) => t.event === "etb");
    const dies = trigs.find((t) => t.event === "dies");
    expect(etb).toMatchObject({ scope: "creatureYouControlPower", powerThreshold: 4 });
    expect(dies).toMatchObject({ scope: "self", interveningIf: "it's not a token" });
  });
});

// ─── 1. Self-or-other power ETB scope ─────────────────────────────────────────────
describe("Vaultborn Tyrant — ETB power-threshold (self-or-other)", () => {
  const detect = (o) => detectTriggers({ name: "X", type: "Creature", power: "6", toughness: "6", mana: "{5}{G}{G}", oracle: o })[0];

  it("'this creature or another creature you control with power 4 or greater enters' → creatureYouControlPower(4)", () => {
    expect(detect("Whenever this creature or another creature you control with power 4 or greater enters, draw a card."))
      .toMatchObject({ event: "etb", scope: "creatureYouControlPower", powerThreshold: 4 });
  });

  it("the bare 'a creature you control with power N' form still maps to the same scope (no regression)", () => {
    expect(detect("Whenever a creature you control with power 3 or greater enters, draw a card."))
      .toMatchObject({ scope: "creatureYouControlPower", powerThreshold: 3 });
  });

  it("CREED: an unmodeled 'with' restriction in the self-or-other form stays undetected → non-native", () => {
    // "with a +1/+1 counter on it" is not scope-expressible → falls through → no trigger
    expect(detectTriggers({ name: "X", type: "Creature", oracle: "Whenever this creature or another creature you control with a +1/+1 counter on it enters, draw a card." }))
      .toHaveLength(0);
  });

  function stateWithVT() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, activePlayer: "user",
      players: { ...s.players, user: { ...s.players.user, battlefield: [], life: 40, library: [{ id: "d1", name: "Drawn", type: "Instant", oracle: "" }] } },
    };
  }

  it("a power-4 creature you control entering fires gain-3-life + draw", () => {
    let s = stateWithVT();
    s = enterPermanent(s, { id: "c-vt", name: "Vaultborn Tyrant", type: "Creature — Dinosaur", power: 6, toughness: 6, oracle: ORACLE }, "user"); // Vaultborn watches
    s = enterPermanent(s, { id: "c-big", name: "Big", type: "Creature — Beast", power: 4, toughness: 4, oracle: "" }, "user");
    s = resolveAll(s);
    expect(s.players.user.life).toBeGreaterThanOrEqual(43); // at least one gain-3 (self-entry + the big one)
    expect(s.players.user.hand.length).toBeGreaterThanOrEqual(1);
  });

  it("Vaultborn ITSELF entering fires its own ETB (the 'this creature' half — power 6 ≥ 4)", () => {
    let s = stateWithVT();
    s = enterPermanent(s, { id: "c-vt", name: "Vaultborn Tyrant", type: "Creature — Dinosaur", power: 6, toughness: 6, oracle: ORACLE }, "user");
    s = resolveAll(s);
    expect(s.players.user.life).toBe(43); // self-fired once
    expect(s.players.user.hand.length).toBe(1);
  });

  it("a power-3 creature does NOT fire (the ≥4 gate holds even in the self-or-other form)", () => {
    let s = stateWithVT();
    s = enterPermanent(s, { id: "c-vt", name: "Vaultborn Tyrant", type: "Creature — Dinosaur", power: 6, toughness: 6, oracle: ORACLE }, "user");
    s = resolveAll(s);
    const life0 = s.players.user.life, hand0 = s.players.user.hand.length;
    s = enterPermanent(s, { id: "c-sm", name: "Small", type: "Creature — Bird", power: 3, toughness: 3, oracle: "" }, "user");
    s = resolveAll(s);
    expect(s.players.user.life).toBe(life0);        // no additional gain (power 3 < 4)
    expect(s.players.user.hand.length).toBe(hand0); // no additional draw
  });

  it("an OPPONENT's power-5 creature does NOT fire (the you-control gate)", () => {
    let s = stateWithVT();
    s = enterPermanent(s, { id: "c-vt", name: "Vaultborn Tyrant", type: "Creature — Dinosaur", power: 6, toughness: 6, oracle: ORACLE }, "user");
    s = resolveAll(s); const life0 = s.players.user.life;
    s = enterPermanent(s, { id: "c-opp", name: "OppBig", type: "Creature — Beast", power: 5, toughness: 5, oracle: "" }, "ai");
    s = resolveAll(s);
    expect(s.players.user.life).toBe(life0); // opponent's creature never fires the controller's watcher
  });
});

// ─── 2. NOT-A-TOKEN intervening-if ─────────────────────────────────────────────────
describe("Vaultborn Tyrant — NOT-A-TOKEN intervening-if (CR 111.7 + 603.4)", () => {
  it("'it's not a token' / 'it isn't a token' / 'it is not a token' all parse", () => {
    expect(interveningIfParseable("it's not a token")).toBe(true);
    expect(interveningIfParseable("it isn't a token")).toBe(true);
    expect(interveningIfParseable("it is not a token")).toBe(true);
  });
  it("evaluates off the triggering object's captured token status", () => {
    const st = { players: { p: { battlefield: [] } } };
    expect(evaluateInterveningIf(st, "it's not a token", "p", { triggeringCardIsToken: false })).toBe(true);  // nontoken → fires
    expect(evaluateInterveningIf(st, "it's not a token", "p", { triggeringCardIsToken: true })).toBe(false);  // token → dropped
    expect(evaluateInterveningIf(st, "it's not a token", "p", {})).toBeNull();                                 // no flag → FN-safe
  });
  it("CREED: a non-token designation ('it's not a Goblin') stays unparseable → Arbiter", () => {
    expect(interveningIfParseable("it's not a Goblin")).toBe(false);
  });
});

// ─── 3. Dies-copy artifact rider (the whole mechanic, end to end) ──────────────────
describe("Vaultborn Tyrant — dies → artifact token-copy (CR 707.9a)", () => {
  it("the clause parses HIGH to a create-token-copy with addCardTypes:[Artifact]", () => {
    const prog = parseEffectClause("create a token that's a copy of it, except it's an artifact in addition to its other types", "Instant");
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms[0]).toMatchObject({ op: "create-token-copy", copySource: "triggering", addCardTypes: ["Artifact"] });
  });

  function stateAfterDeath(isToken) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, activePlayer: "user", players: { ...s.players, user: { ...s.players.user, battlefield: [], life: 40 } } };
    const dead = [{ id: "vt", controller: "user", card: { id: "c-vt", name: "Vaultborn Tyrant", type: "Creature — Dinosaur", power: 6, toughness: 6, oracle: ORACLE, token: isToken }, power: 6 }];
    s = checkDiesTriggers(s, dead);
    return resolveAll(s);
  }
  const tokensOf = (s) => s.players.user.battlefield.filter((p) => p.card.token);

  it("a NONTOKEN Vaultborn dying mints ONE token copy that is GENUINELY an artifact", () => {
    const s = stateAfterDeath(false);
    const toks = tokensOf(s);
    expect(toks).toHaveLength(1);
    expect(toks[0].card.name).toBe("Vaultborn Tyrant");
    expect(toks[0].card.type).toBe("Artifact Creature — Dinosaur"); // the card type prepended — genuinely an artifact
    expect(toks[0].card.token).toBe(true);
    expect(toks[0].card.power).toBe(6); // printed P/T copied (CR 707.2)
  });

  it("CREED non-recurse (CR 111.7): a TOKEN Vaultborn dying mints ZERO copies (the intervening-if drops it)", () => {
    const s = stateAfterDeath(true);
    expect(tokensOf(s)).toHaveLength(0); // token source → "it's not a token" false → no copy, no loop
  });
});

// ─── CREED near-miss: an unmodeled copy rider keeps the whole card non-native ──────
describe("Vaultborn Tyrant — CREED near-misses (parser stays null)", () => {
  it("a 4/4-Hero P/T+subtype rider is still deferred", () => {
    expect(tokenCopyParser("create a token that's a copy of it, except it's a 4/4 black hero")).toBeNull();
  });
  it("an un-addable card type ('vehicle') is deferred", () => {
    expect(tokenCopyParser("create a token that's a copy of it, except it's a vehicle in addition to its other types")).toBeNull();
  });
  it("a bare 'it's an artifact' (a REPLACE, not an in-addition) is deferred", () => {
    expect(tokenCopyParser("create a token that's a copy of it, except it's an artifact")).toBeNull();
  });
});
