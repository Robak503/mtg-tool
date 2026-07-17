/**
 * MODAL-DECK-MODES (lever 20) — the previously-unmodeled MODES that, once built, let several deck modal
 * cards flip native under the lever-18 modal-trigger seam (which auto-resolves a modal trigger when EVERY
 * mode is modeled). Three net-new primitives:
 *
 *   1. DOUBLE-COUNTERS — "double the number of +1/+1 counters on this creature" (CR 121). Modeled as a
 *      self-targeted add-counter whose dynamic count reads the source's CURRENT +1/+1 count at resolution
 *      (countForSpec kind:"countersOnSource"); adding that-many MORE nets a double. Composes with addCounter's
 *      doubler hook (Doubling Season further multiplies, CR 616). → Voracious Hydra (Zaxara), Mossborn Hydra.
 *   2. MODAL "choose one or more —" (CR 700.2) — any non-empty subset of the modes (expandCastChoices sizes
 *      1..N). → Black Market Connections (Vihaan).
 *   3. MODE-NAME PREFIX (CR 700.2g) — strip a flavor label "• <Name> — <effect>" before parsing each mode.
 *      → Black Market Connections (every mode is labeled), and a reusable corpus lever (Charms/Commands).
 *   4. CHANGELING TOKEN (CR 702.73a) — "create a 3/2 colorless Shapeshifter creature token with changeling":
 *      the token is EVERY creature type (minted with the Changeling keyword so hasKeyword/cardIsChangeling
 *      treat it as all types). → Black Market Connections.
 *
 * Real oracle text (verified vs the local Scryfall index), verbatim. CREED: a flip only happens when EVERY
 * mode resolves correctly; the guards below pin that the near-miss variants (each-creature doubling, -1/-1,
 * a non-changeling-enforced keyword) STAY low → Arbiter.
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "../../coverage.js";
import { parseEffectClause, programConfidence } from "../parser.js";
import { countForSpec } from "./shared.js";
import { applyAddCounter } from "./counters.js";
import { applyCreateToken } from "./tokens.js";
import { runEffectProgram } from "../runProgram.js";
import { hasKeyword } from "../../keywords.js";
import { createGameState, _resetIdsForTests, createPermanent, findPermanent } from "../../gameState.js";
import { legalActionsForPlayer } from "../../legalChoices.js";
import { dispatchAction } from "../../actionDispatcher.js";
import { resolveTopOfStack } from "../../gameEngine.js";

const VORACIOUS = {
  name: "Voracious Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}", power: 0, toughness: 0,
  oracle: "Trample\nThis creature enters with X +1/+1 counters on it.\nWhen this creature enters, choose one —\n• Double the number of +1/+1 counters on this creature.\n• This creature fights target creature you don't control.",
};
const MOSSBORN = {
  name: "Mossborn Hydra", type: "Creature — Elemental Hydra", mana: "{2}{G}", power: 0, toughness: 0,
  oracle: "Trample\nThis creature enters with a +1/+1 counter on it.\nLandfall — Whenever a land you control enters, double the number of +1/+1 counters on this creature.",
};
const BMC = {
  name: "Black Market Connections", type: "Enchantment", mana: "{2}{B}",
  oracle: "At the beginning of your first main phase, choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life. (It is every creature type.)",
};

describe("MODAL-DECK-MODES — coverage flips (whole card native once the blocking mode is modeled)", () => {
  it("Voracious Hydra → native-trigger (fight mode already modeled + new double-counters mode)", () => {
    expect(classifyCard(VORACIOUS)).toBe("native-trigger");
  });
  it("Mossborn Hydra → native-trigger (landfall trigger + double-counters self; ripple flip)", () => {
    expect(classifyCard(MOSSBORN)).toBe("native-trigger");
  });
  it("Black Market Connections → native-trigger (one-or-more modal + named modes + changeling token)", () => {
    expect(classifyCard(BMC)).toBe("native-trigger");
  });
});

describe("MODAL-DECK-MODES — DOUBLE-COUNTERS resolves correctly (reads current count, adds that many)", () => {
  // The trigger-effect clause is parsed with the engine's trigger cardType ("Instant").
  const doubleAtom = () => {
    const r = parseEffectClause("Double the number of +1/+1 counters on this creature", "Instant", {});
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms[0]).toMatchObject({ op: "add-counter", target: "self", counterType: "+1/+1", countFor: { kind: "countersOnSource", counterType: "+1/+1" } });
    return r.atoms[0];
  };
  const withSource = (counters) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "src", card: { ...VORACIOUS, id: "src" }, controller: "user", summoningSick: false });
    perm.counters = counters;
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
    return s;
  };

  it("countForSpec(countersOnSource) reads the source's live +1/+1 count", () => {
    const s = withSource({ "+1/+1": 3 });
    expect(countForSpec(s, { controller: "user", sourceId: "src" }, { kind: "countersOnSource", counterType: "+1/+1" })).toBe(3);
  });
  it("a 3-counter creature becomes 6 (net double)", () => {
    const s = applyAddCounter(withSource({ "+1/+1": 3 }), doubleAtom(), { controller: "user", sourceId: "src", targets: [] });
    expect(findPermanent(s, "src").permanent.counters["+1/+1"]).toBe(6);
  });
  it("a 1-counter creature becomes 2", () => {
    const s = applyAddCounter(withSource({ "+1/+1": 1 }), doubleAtom(), { controller: "user", sourceId: "src", targets: [] });
    expect(findPermanent(s, "src").permanent.counters["+1/+1"]).toBe(2);
  });
  it("0 counters → stays 0 (no fabricated counter, CR 107.3)", () => {
    const s = applyAddCounter(withSource({}), doubleAtom(), { controller: "user", sourceId: "src", targets: [] });
    expect(findPermanent(s, "src").permanent.counters["+1/+1"] || 0).toBe(0);
  });
  it("absent source → clean no-op (no crash)", () => {
    const s = withSource({ "+1/+1": 2 });
    expect(() => applyAddCounter(s, doubleAtom(), { controller: "user", sourceId: "gone", targets: [] })).not.toThrow();
  });
});

describe("MODAL-DECK-MODES — Voracious Hydra resolves end-to-end through the real cast→resolve→flush", () => {
  const castForX = (X, withEnemy) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const hydra = { ...VORACIOUS, id: "hyd" };
    const ai = withEnemy
      ? { ...s.players.ai, battlefield: [{ id: "bear", card: { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 }, controller: "ai", counters: {}, tapped: false, summoningSick: false }] }
      : s.players.ai;
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [hydra], manaPool: { ...s.players.user.manaPool, G: 6, C: 20 } }, ai },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hyd" && a.xValue === X);
    expect(cast, `an X=${X} cast was offered`).toBeTruthy();
    s = dispatchAction(s, cast);
    let guard = 0;
    while (s.stack && s.stack.length > 0 && guard < 12) { s = resolveTopOfStack(s); guard += 1; }
    return s;
  };

  it("cast for X=3 with no enemy creature → the double mode resolves, 3 counters become 6", () => {
    const s = castForX(3, false);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "hyd");
    expect(perm.counters["+1/+1"]).toBe(6);
  });
  it("cast for X=4 with an enemy creature present → still resolves natively (both modes legal)", () => {
    const s = castForX(4, true);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "hyd");
    // The AI chooser may pick either mode; both are CREED-clean. Double → 8 (no fight), fight → 4 (enemy traded).
    // Either way the Hydra is on the battlefield and the trigger resolved natively (never an Arbiter no-op).
    expect([4, 8]).toContain(perm.counters["+1/+1"]);
  });
});

describe("MODAL-DECK-MODES — Black Market Connections: changeling token + one-or-more modal", () => {
  it("mints a 3/2 Shapeshifter that IS every creature type (Changeling keyword + oracle)", () => {
    const r = parseEffectClause("Create a 3/2 colorless Shapeshifter creature token with changeling", "Instant", {});
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms[0]).toMatchObject({ op: "create-token", power: 3, toughness: 2, descriptor: "colorless shapeshifter", changeling: true });
    _resetIdsForTests();
    const s = applyCreateToken(createGameState({ userDeck: [], aiDeck: [] }), r.atoms[0], { controller: "user", targets: [] });
    const tok = s.players.user.battlefield[0].card;
    expect(tok.type).toBe("Token Creature — Shapeshifter");
    expect(tok.power).toBe(3);
    expect(tok.toughness).toBe(2);
    expect(hasKeyword(tok, "changeling")).toBe(true);
    expect(/\bchangeling\b/i.test(tok.oracle)).toBe(true);
  });

  it("the one-or-more modal parses all three modes high (chooseCount=N, atLeastOne)", () => {
    const block = "choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life.";
    const r = parseEffectClause(block, "Instant", {});
    expect(r.structure).toBe("modal");
    expect(programConfidence(r)).toBe("high");
    expect(r.modal.atLeastOne).toBe(true);
    expect(r.modal.chooseCount).toBe(3);
    expect(r.modal.modes).toHaveLength(3);
  });

  const runModes = (chosenMode) => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, life: 40, library: [{ id: "c1", name: "Forest", type: "Land" }, { id: "c2", name: "Forest", type: "Land" }] } } };
    const block = "choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.\n• Hire a Mercenary — Create a 3/2 colorless Shapeshifter creature token with changeling. You lose 3 life.";
    const program = parseEffectClause(block, "Instant", {});
    const stackObject = { payload: { resolver: "effect-program", params: { program, controller: "user", targets: [], sourceId: "bmc", chosenMode, context: {} } }, source: { name: "Black Market Connections", permanentId: "bmc" } };
    return runEffectProgram(s, stackObject);
  };

  it("picking all three modes: lose 1+2+3 life, make a Treasure + a changeling token, draw 1", () => {
    const s = runModes([0, 1, 2]);
    expect(s.players.user.life).toBe(34);
    expect(s.players.user.hand).toHaveLength(1);
    const names = s.players.user.battlefield.map((p) => p.card.name).sort();
    expect(names).toEqual(["Shapeshifter", "Treasure"]);
  });
  it("picking only the changeling mode (subset of 1): lose 3 life, make only the token", () => {
    const s = runModes([2]);
    expect(s.players.user.life).toBe(37);
    expect(s.players.user.battlefield.map((p) => p.card.name)).toEqual(["Shapeshifter"]);
  });
});

describe("MODAL-DECK-MODES — CREED guards (near-miss variants STAY low → Arbiter)", () => {
  const low = (clause) => expect(programConfidence(parseEffectClause(clause, "Instant", {}))).toBe("low");
  it("double the number on EACH creature you control → now HIGH (board-wide perTargetDouble lever; see kalonianDouble.test.js)", () => {
    // Once the SELF self-double shipped, the board-wide form was the next lever (DOUBLE-COUNTERS-EACH): a
    // youControl-scoped perTargetDouble atom that doubles EACH creature's own counters. It parses HIGH now and
    // flips Kalonian Hydra native-trigger — so this is no longer the Arbiter-park it was at the self-only stage.
    expect(programConfidence(parseEffectClause("Double the number of +1/+1 counters on each creature you control", "Instant", {}))).toBe("high");
  });
  it("double -1/-1 counters → low (only +1/+1 is modeled here)", () => {
    low("Double the number of -1/-1 counters on this creature");
  });
  it("double on TARGET creature → low (a chosen-target form not modeled)", () => {
    low("Double the number of +1/+1 counters on target creature");
  });
  it("a token 'with <unmodeled keyword>' alongside changeling → low (whole token or nothing)", () => {
    // "banding" is a real keyword the engine doesn't enforce (shadow now IS grantable — SLIVER INTERIORS
    // SP-1), so the companion drops the whole token to low even though changeling itself is modeled
    // (a grantable companion like flying WOULD compose — tested above).
    low("Create a 3/2 colorless Shapeshifter creature token with changeling and banding");
  });
  it("Primordial Hydra → native-mixed (upkeep doubler routes AND the conditional-trample static is now modeled)", () => {
    // Was body-only while the "has trample as long as it has ten or more +1/+1 counters on it" rider was
    // unmodeled; the SELF-COUNTER-GATED KEYWORD lever (selfCounterGatedKeyword.test.js) now models that static
    // as a layer-6 gated addKeyword, so every clause is covered and the composite gate flips it to native-mixed.
    expect(classifyCard({
      name: "Primordial Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}",
      oracle: "This creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature.\nThis creature has trample as long as it has ten or more +1/+1 counters on it.",
    })).toBe("native-mixed");
  });
});
