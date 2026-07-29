/**
 * imprint.test.js — IMPRINT (CR 207.2c), piece 1: THE STAMP AND ITS FIRE SITE.
 *
 * Imprint is an ABILITY WORD, in the same CR 207.2c list as landfall / enrage / raid / opus — verified
 * against knowledge/mtg-judge/data/cr/cr_current.json, which names it there. (It is NOT a keyword ability;
 * 702.61 is Split Second.) That classification is the whole first bug: the unstripped "Imprint —" label sat
 * between the line start and "When", so the boundary-anchored trigger regex never matched and the ETB of ALL
 * 29 corpus imprint cards was invisible. Measured before the fix — even "Imprint — When this artifact
 * enters, draw a card." detected NOTHING.
 *
 * ⚠️ WHY THIS SLICE STOPS AT THE STAMP. The payoffs (Chrome Mox's mana, Semblance Anvil's cost reduction,
 * Isochron Scepter's copy) all READ a stamp that nothing set. Building a payoff first would have produced a
 * card that classifies native and does nothing — and for Chrome Mox specifically, a bare Mox modeled as "any
 * color" is a turn-one ritual out of a card that should be dead: the forbidden false-positive direction, the
 * same shape already refused for condition-gated mana (Mox Opal). So the stamp lands first, proven on a
 * board, and the mana source is gated on it.
 *
 * DECLINING IS A REAL BOARD STATE, not an error: imprint is "you MAY", and an un-imprinted permanent must
 * simply carry no stamp.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { resolveImprintChoice, resolveOptionalChoice } from "./effects/runProgram.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MOX_LINE = "Imprint — When this artifact enters, you may exile a nonartifact, nonland card from your hand.";
const MOX = { id: "mox", name: "Chrome Mox", type: "Artifact", mana: "{0}", oracle: MOX_LINE };
const BOLT = { id: "bolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", colors: ["R"], cmc: 1, oracle: "" };
const RELIC = { id: "relic", name: "Relic of Progenitus", type: "Artifact", mana: "{1}", colors: [], cmc: 1, oracle: "" };

describe("the ability word (CR 207.2c)", () => {
  it("⭐ 'Imprint —' no longer hides the trigger — it did for all 29 corpus cards", () => {
    const [t] = detectTriggers(MOX);
    expect(t).toMatchObject({ event: "etb", scope: "self", optional: true });
  });

  it("the label is stripped for ANY trigger, not just the exile shape", () => {
    const [t] = detectTriggers({ ...MOX, oracle: "Imprint — When this artifact enters, draw a card." });
    expect(t).toMatchObject({ event: "etb", scope: "self" });
  });
});

describe("the clause", () => {
  it("parses to an imprint atom carrying the hand filter and the optional flag", () => {
    // "Instant" is the type buildTriggerStack passes for every trigger program.
    const p = parseEffectClause("you may exile a nonartifact, nonland card from your hand", "Instant", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "imprint", handFilter: { exclude: ["Artifact", "Land"] }, optional: true });
  });

  it("carries a mana-value cap when printed (Isochron Scepter)", () => {
    const p = parseEffectClause("you may exile an instant card from your hand with mana value 2 or less", "Instant", { hasX: false });
    expect(p.atoms[0]).toMatchObject({ op: "imprint", handFilter: { include: ["Instant"], maxCmc: 2 } });
  });

  it("⛔ CREED — an UNMODELED filter routes to the Arbiter rather than imprinting the wrong card", () => {
    expect(parseEffectClause("you may exile a nonbasic card from your hand", "Instant", { hasX: false }).confidence).toBe("low");
  });

  it("⛔ CREED — a RIDER past the exile stays unmatched (whole-clause anchored)", () => {
    expect(parseEffectClause("you may exile a creature card from your hand face down", "Instant", { hasX: false }).confidence).toBe("low");
  });
});

describe("⭐ RUNTIME — the stamp lands on a board", () => {
  function playMox(hand) {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand } } };
    s = flushTriggers(enterPermanent(s, MOX, "user"));
    let g = 0;
    while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
    return s;
  }
  const moxPerm = (s) => s.players.user.battlefield.find((p) => p.card.name === "Chrome Mox");

  it("the ETB pauses for the may, then for the card pick", () => {
    let s = playMox([BOLT]);
    expect(s.pendingChoice.kind).toBe("optional-effect");
    s = resolveOptionalChoice(s, true);
    expect(s.pendingChoice).toMatchObject({ kind: "imprint-exile", optional: true });
    expect(s.pendingChoice.candidates.map((c) => c.name)).toEqual(["Lightning Bolt"]);
    // The choice carries the IMPRINTING permanent, not the card id — the stamp's destination.
    expect(s.pendingChoice.sourceId).toBe(moxPerm(s).id);
  });

  it("⭐ taking it EXILES the card and STAMPS it, characteristics and all", () => {
    let s = resolveOptionalChoice(playMox([BOLT]), true);
    s = resolveImprintChoice(s, "bolt");
    expect(moxPerm(s).imprinted).toMatchObject({ name: "Lightning Bolt", colors: ["R"] });
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.user.exile.map((c) => c.name)).toEqual(["Lightning Bolt"]);
  });

  it("⭐ DECLINING leaves it un-imprinted, card still in hand — a real state, not a failure", () => {
    let s = resolveOptionalChoice(playMox([BOLT]), true);
    s = resolveImprintChoice(s, null);
    expect(moxPerm(s).imprinted).toBeUndefined();
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.exile).toHaveLength(0);
  });

  it("⭐ CREED — a card the FILTER excludes is never offered (an artifact, for Chrome Mox)", () => {
    // The "you may" pause fires first regardless (it precedes the atom — the engine's optional
    // convention), so the guarantee under test is what happens after saying YES: no picker is raised,
    // because nothing in hand is legal, and the Mox is left un-imprinted with the card untouched.
    const s = resolveOptionalChoice(playMox([RELIC]), true);
    expect(s.pendingChoice).toBeFalsy();
    expect(moxPerm(s).imprinted).toBeUndefined();
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.exile).toHaveLength(0);
  });

  it("⭐ CREED — a stale/foreign pick is a decline, never a free exile of some other card", () => {
    let s = resolveOptionalChoice(playMox([BOLT]), true);
    s = resolveImprintChoice(s, "not-a-card-in-hand");
    expect(moxPerm(s).imprinted).toBeUndefined();
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.user.exile).toHaveLength(0);
  });

  it("an empty hand is a clean no-op (no picker, no stamp)", () => {
    const s = resolveOptionalChoice(playMox([]), true);
    expect(s.pendingChoice).toBeFalsy();
    expect(moxPerm(s).imprinted).toBeUndefined();
  });
});
