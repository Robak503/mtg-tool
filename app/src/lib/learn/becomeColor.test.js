/**
 * becomeColor.test.js — "Target creature becomes blue until end of turn." (Metathran Transport, Fylamarid,
 * Cerulean Wisps) and the REFERENT form "That creature becomes black …" (Singe, after its damage clause).
 *
 * Third instance of the same finding: `setColor` was emitted ONLY from inside applyAnimateEffect — an
 * animate carries a colour along with its P/T and types — so a PURE colour change had no writer. The layer
 * op and its readers existed; nothing parsed to it.
 *
 * ⛔ SET, not ADD. "becomes blue" REPLACES the creature's colours (CR 105.1). "becomes blue IN ADDITION to
 * its other colors" is the addColor op, which has NO emitter anywhere — and measuring it found exactly one
 * corpus carrier with 0 attributable, so it stays unwritten rather than guessed at from this arm.
 *
 * Leads with a runtime assertion (batch 3's lesson): asserting the atom is not asserting the effect.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { runEffectProgram } from "./effects/runProgram.js";
import { permanentColors } from "./layers.js";

// ⚠️ permanentColors(state, id) is the LAYER-AWARE reader, and it is the one this file must use. A first
// draft called colorsOf(state, id) instead — colorsOf takes a CARD, so it returned [] for everything.
// The VACUITY CONTROL caught it on the first run. Without that control the "SETS rather than ADDS"
// assertion (not.toContain("G")) would have PASSED on an empty array — precisely the hollow shape a
// vacuity control exists to expose, and a reminder that a negative assertion proves nothing until some
// positive assertion has shown the reader works at all.

beforeEach(() => _resetIdsForTests());

const atomsOf = (o) => parseEffectClause(o, "Instant")?.atoms;

const board = () => {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  // Green bears, so a change to blue is visible and a leak onto the neighbour is too.
  const mk = (id) => createPermanent({ id, card: { name: id, type: "Creature — Bear", mana: "{1}{G}", oracle: "", id: `c${id}` }, controller: "user" });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("alpha"), mk("beta")] } } };
};

const run = (oracle, targets) => {
  const out = runEffectProgram(board(), {
    source: { name: "C" },
    payload: { params: { program: parseEffectClause(oracle, "Instant"), controller: "user", sourceId: "src", context: {}, targets } },
  });
  return out?.state ?? out;
};

describe("⭐ ENFORCEMENT — the colour actually changes", () => {
  it("VACUITY CONTROL: both bears start green", () => {
    const st = board();
    expect([...permanentColors(st, "alpha")].sort()).toEqual(["G"]);
    expect([...permanentColors(st, "beta")].sort()).toEqual(["G"]);
  });

  it("changes the TARGET's colour and not its neighbour's", () => {
    const st = run("Target creature becomes blue until end of turn.",
      [{ type: "creature", id: "alpha", controller: "user", atomIndex: 0 }]);
    expect([...permanentColors(st, "alpha")].sort()).toEqual(["U"]);
    // The discriminating half.
    expect([...permanentColors(st, "beta")].sort()).toEqual(["G"]);
  });

  it("⛔ SETS rather than ADDS — the old colour is gone (CR 105.1)", () => {
    // If this were addColor the bear would read ["G","U"]. The distinction is the whole reason the ADD
    // form is refused rather than folded in here.
    const st = run("Target creature becomes blue until end of turn.",
      [{ type: "creature", id: "alpha", controller: "user", atomIndex: 0 }]);
    expect([...permanentColors(st, "alpha")]).not.toContain("G");
  });

  it("the REFERENT form colours the creature the previous clause acted on", () => {
    const st = run("C deals 1 damage to target creature. That creature becomes black until end of turn.",
      [{ type: "creature", id: "alpha", controller: "user", atomIndex: 0 }]);
    expect([...permanentColors(st, "alpha")].sort()).toEqual(["B"]);
    expect([...permanentColors(st, "beta")].sort()).toEqual(["G"]);
  });
});

describe("parse", () => {
  it("emits the colour letter for both subjects", () => {
    expect(atomsOf("Target creature becomes blue until end of turn."))
      .toEqual([{ op: "become-color", targetType: "creature", colors: ["U"] }]);
    expect(atomsOf("C deals 1 damage to target creature. That creature becomes black until end of turn.")?.[1])
      .toEqual({ op: "become-color", colors: ["B"], bindPreviousTargets: true });
  });

  it("⛔ the IN-ADDITION form stays unparsed — it is the addColor op, which has no emitter", () => {
    expect(atomsOf("Target creature becomes blue in addition to its other colors until end of turn.")).toEqual([]);
  });

  it("⛔ a non-colour quality is not a colour change", () => {
    expect(atomsOf("Target creature becomes colorless until end of turn.")).toEqual([]);
  });
});

describe("the real cards", () => {
  it("flips all four carriers", () => {
    // Oracle text from the bundled snapshot.
    expect(classifyCard({ name: "Cerulean Wisps", type: "Instant", mana: "{U}",
      oracle: "Target creature becomes blue until end of turn. Untap that creature.\nDraw a card." })).toBe("native-spell");
    expect(classifyCard({ name: "Singe", type: "Instant", mana: "{R}",
      oracle: "Singe deals 1 damage to target creature. That creature becomes black until end of turn." })).toBe("native-spell");
    expect(classifyCard({ name: "Fylamarid", type: "Creature — Squid Beast", mana: "{2}{U}",
      oracle: "Flying\nThis creature can't be blocked by blue creatures.\n{U}: Target creature becomes blue until end of turn." })).toBe("native-activated");
    expect(classifyCard({ name: "Metathran Transport", type: "Creature — Metathran", mana: "{4}{U}",
      oracle: "Flying\nThis creature can't be blocked by blue creatures.\n{U}: Target creature becomes blue until end of turn." })).toBe("native-activated");
  });
});
