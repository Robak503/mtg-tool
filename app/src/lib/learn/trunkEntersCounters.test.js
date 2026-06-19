/**
 * TRUNK-ENTERSCOUNTERS (CR 614.1f) — "~ enters with N +1/+1 counters on it" adds the counters AS the
 * permanent enters, so its P/T is right from turn 1 (Kavu Primarch, Baloth Gorger, Llanowar Elite…). The
 * resolver applies it; the coverage classifier credits a single-line such card native-body — both off the
 * SAME entersWithPlusCounters helper (so the metric never over-claims a card the engine plays wrong). Only
 * the bare literal-N form; a kicker / "for each" / "if …" / "where X" variant adds nothing (stays LOW).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { enterPermanent } from "./resolvers.js";
import { entersWithPlusCounters } from "./staticAbilityParser.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const state0 = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), turn: 3 });
const card = (name, oracle, p = 2, t = 2) => ({ id: `c-${name}`, name, type: "Creature — Beast", power: p, toughness: t, oracle });
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];

describe("TRUNK-ENTERSCOUNTERS — the helper (single source of truth)", () => {
  it("reads the literal count (a / three / digit)", () => {
    expect(entersWithPlusCounters(card("A", "This creature enters with a +1/+1 counter on it."))).toBe(1);
    expect(entersWithPlusCounters(card("B", "Baloth Gorger enters with three +1/+1 counters on it."))).toBe(3);
    expect(entersWithPlusCounters(card("C", "This creature enters the battlefield with 5 +1/+1 counters on it."))).toBe(5);
  });
  it("returns 0 for a conditional / variable form (NOT modeled → no fabricated counters)", () => {
    expect(entersWithPlusCounters(card("K", "If this creature was kicked, it enters with two +1/+1 counters on it."))).toBe(0);
    expect(entersWithPlusCounters(card("F", "This creature enters with a +1/+1 counter on it for each artifact you control."))).toBe(0);
    expect(entersWithPlusCounters(card("X", "This creature enters with X +1/+1 counters on it, where X is your devotion to green."))).toBe(0);
    expect(entersWithPlusCounters(card("V", "This creature has vigilance."))).toBe(0);
  });
});

describe("TRUNK-ENTERSCOUNTERS — engine: enters with the counters (correct P/T from turn 1)", () => {
  it("a 2/2 that enters with three +1/+1 counters is a 5/5 on the battlefield", () => {
    const s = enterPermanent(state0(), card("Baloth Gorger", "Baloth Gorger enters with three +1/+1 counters on it.", 2, 2), "user");
    const perm = enteredPerm(s);
    expect(perm.counters["+1/+1"]).toBe(3);
    expect(permanentPower(s, perm.id)).toBe(5);
    expect(permanentToughness(s, perm.id)).toBe(5);
  });
  it("a CONDITIONAL enters-with-counters adds NO counters (enters as its printed body)", () => {
    const s = enterPermanent(state0(), card("Kicker Guy", "If this creature was kicked, it enters with two +1/+1 counters on it.", 1, 1), "user");
    expect(enteredPerm(s).counters["+1/+1"] || 0).toBe(0);
  });
});

describe("TRUNK-ENTERSCOUNTERS — coverage: single-line cards flip native-body", () => {
  it("a vanilla body whose only text is enters-with-counters classifies native-body", () => {
    expect(classifyCard({ type: "Creature — Beast", name: "Baloth Gorger", mana: "{4}{G}", oracle: "Baloth Gorger enters with three +1/+1 counters on it." })).toBe("native-body");
  });
  it("enters-with-counters + a keyword line is still native-body", () => {
    expect(classifyCard({ type: "Creature — Drake", name: "Academy Drake", mana: "{4}{U}", oracle: "Flying\nAcademy Drake enters with two +1/+1 counters on it." })).toBe("native-body");
  });
  it("a CONDITIONAL enters-with-counters does NOT flip (stays body-only)", () => {
    expect(classifyCard({ type: "Creature — Elf", name: "Kicker Elf", mana: "{G}", oracle: "Kicker {2}\nIf this creature was kicked, it enters with two +1/+1 counters on it." })).toBe("body-only");
  });
  it("enters-with-counters + an UNMODELED other clause stays body-only (all-or-nothing)", () => {
    expect(classifyCard({ type: "Creature — Horror", name: "Mystery Horror", mana: "{3}{B}", oracle: "Mystery Horror enters with two +1/+1 counters on it.\nMystery Horror's power and toughness are each equal to the number of cards in your opponents' graveyards." })).toBe("body-only");
  });
});
