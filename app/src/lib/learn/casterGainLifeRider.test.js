/**
 * casterGainLifeRider.test.js — "Destroy/Exile target X. You gain life equal to its <toughness|mana value>."
 * (Sever Soul, Divine Offering, Serene Offering, Terashi's Grasp, Exile).
 *
 * ⭐ THE SUBJECT IS THE OTHER ONE. The removal-rider fold already handled "ITS CONTROLLER <rider>"; this is
 * the "YOU <rider>" sibling on the identical lead grammar, sharing the same pre-removal metric capture.
 *
 * ⛔ AND THE BENEFICIARY IS THE ENTIRE RISK. Swords to Plowshares gives the life to the TARGET'S CONTROLLER;
 * Sever Soul gives it to the CASTER. The two sentences differ by one word, they fold through the same
 * matcher family onto the same atom field, and swapping them produces a card that reads native, resolves
 * without error, and heals the player it was cast at. Every runtime assertion below checks WHO gained,
 * never just how much.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyControllerRider } from "./effects/atoms/removal.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { tokenTypeLine } from "./effects/atoms/tokens.js";

const atomOf = (t) => parseEffectClause(t, "Instant")?.atoms?.[0];

describe("parse — metric and lead", () => {
  it("⭐ toughness", () => {
    expect(atomOf("Destroy target creature. You gain life equal to its toughness.").controllerRider)
      .toEqual({ kind: "casterGainLife", metric: "toughness" });
  });

  it("⭐ mana value, on a non-creature lead", () => {
    expect(atomOf("Destroy target artifact. You gain life equal to its mana value.").controllerRider)
      .toEqual({ kind: "casterGainLife", metric: "mv" });
  });

  it('⭐ the "that creature\'s toughness" phrasing is the same rider', () => {
    expect(atomOf("Exile target creature. You gain life equal to that creature's toughness.").controllerRider)
      .toEqual({ kind: "casterGainLife", metric: "toughness" });
  });

  it("⛔ the creature-lead RESTRICTION survives (Sever Soul is nonblack-only)", () => {
    expect(atomOf("Destroy target nonblack creature. You gain life equal to its toughness.").restrictions)
      .toEqual([{ kind: "colorNeg", color: "B" }]);
  });

  it("Sever Soul and Divine Offering classify native", () => {
    expect(classifyCard({ name: "Sever Soul", type: "Sorcery", mana: "{4}{B}", oracle: "Destroy target nonblack creature. It can't be regenerated. You gain life equal to its toughness." })).toBe("native-spell");
    expect(classifyCard({ name: "Divine Offering", type: "Instant", mana: "{1}{W}", oracle: "Destroy target artifact. You gain life equal to its mana value." })).toBe("native-spell");
  });
});

describe("⛔ CREED — unmodeled metrics still refuse", () => {
  const low = (t) => expect(programConfidence(parseEffectClause(t, "Instant"))).toBe("low");

  it("⛔ a metric with no capture behind it", () => {
    low("Exile target creature or planeswalker. You gain life equal to the number of counters on it.");
    low("Destroy target creature. You gain life equal to its loyalty.");
  });

  it("⛔⭐ POWER is deliberately NOT wired to the caster subject, though it IS captured", () => {
    // The capture holds power/toughness/mv, so admitting "equal to its power" here would be one word of
    // regex. It stays out because no corpus card prints it on the caster subject — POWER is the CONTROLLER's
    // metric (Swords to Plowshares). Widening a vocabulary to what the data structure could support, rather
    // than to what the cards actually say, is how a parser starts inventing shapes.
    low("Destroy target creature. You gain life equal to its power.");
  });

  it("⛔ a BOARD COUNT is a different mechanism and keeps its own (pre-existing, correct) path", () => {
    // "…equal to the number of Swamps you control" needs no capture — it is computed off the board at
    // resolution and was already modeled. Asserted so a future reader does not fold it into this rider and
    // mistake a working path for a gap. (This assertion started life as a wrong refusal of mine.)
    expect(programConfidence(parseEffectClause("Destroy target creature. You gain life equal to the number of Swamps you control.", "Instant"))).toBe("high");
  });

  it("⛔ an unmodeled LEAD keeps its refusal — the rider is not a licence", () => {
    low("Target player loses 3 life. You gain life equal to the life lost this way.");
  });
});

describe("⛔⭐ RUNTIME — WHO gained, not just how much", () => {
  const board = () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, life: 40 }, ai: { ...s.players.ai, life: 40 } } };
  };
  const cap = { controller: "ai", power: 2, toughness: 5, mv: 3 };

  it("⭐ toughness → the CASTER gains 5, the victim gains nothing", () => {
    const next = applyControllerRider(board(), { kind: "casterGainLife", metric: "toughness" }, cap, { controller: "user" });
    expect(next.players.user.life).toBe(45);
    expect(next.players.ai.life).toBe(40);
  });

  it("⭐ mana value → the CASTER gains 3", () => {
    const next = applyControllerRider(board(), { kind: "casterGainLife", metric: "mv" }, cap, { controller: "user" });
    expect(next.players.user.life).toBe(43);
    expect(next.players.ai.life).toBe(40);
  });

  it("⛔⭐ and the CONTROLLER-subject sibling still pays the OTHER player", () => {
    // ⚠️ THE PAIR ASSERTED TOGETHER, deliberately. Each is individually satisfiable by a wrong
    // implementation that always pays one player; only holding both at once pins the distinction, and the
    // distinction is the entire content of this slice.
    const next = applyControllerRider(board(), { kind: "gainLifePower" }, cap, { controller: "user" });
    expect(next.players.ai.life).toBe(42);    // Swords to Plowshares — the TARGET's controller
    expect(next.players.user.life).toBe(40);
  });

  it("⛔ a zero metric is a clean no-op, never a negative", () => {
    const next = applyControllerRider(board(), { kind: "casterGainLife", metric: "toughness" }, { controller: "ai", toughness: 0 }, { controller: "user" });
    expect(next.players.user.life).toBe(40);
  });
});

describe("⭐ TWO-COLOUR token rider — the rider grammar catches up with the token builder", () => {
  it("⭐ a two-colour token parses, with the full colour phrase kept in the descriptor", () => {
    const a = parseEffectClause("Exile target nonland permanent. Its controller creates a 3/2 red and white Spirit creature token.", "Sorcery")?.atoms?.[0];
    expect(a.controllerRider).toEqual({ kind: "createToken", power: 3, toughness: 2, color: "red and white", subtype: "spirit" });
  });

  it("⛔ THREE colours stay unmodeled — the widening is to what the CARDS print, not to what parses", () => {
    expect(programConfidence(parseEffectClause("Exile target nonland permanent. Its controller creates a 3/2 red, white, and blue Spirit creature token.", "Sorcery"))).toBe("low");
  });

  it("⛔ an unmodeled token KEYWORD still refuses, two colours or not", () => {
    expect(programConfidence(parseEffectClause("Exile target nonland permanent. Its controller creates a 3/2 red and white Spirit creature token with annihilator 2.", "Sorcery"))).toBe("low");
  });

  it("⛔⭐ and the token BUILDER produces the same type line either way — colour was never in it", () => {
    // The reason this widening is faithful rather than optimistic: `tokenTypeLine` strips colour words
    // ("and" is itself in TOKEN_COLOR_WORDS), so a two-colour descriptor yields exactly what a one-colour
    // descriptor yields. The parser was the only half that had not been told.
    expect(tokenTypeLine("red and white spirit")).toEqual(tokenTypeLine("red spirit"));
  });
});
