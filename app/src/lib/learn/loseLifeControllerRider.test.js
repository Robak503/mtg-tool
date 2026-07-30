/**
 * loseLifeControllerRider.test.js — "Its controller loses N life." (Hideous End, Sip of Hemlock, Despoil,
 * Glissa's Scorn, Launch Party, Inevitable Defeat …) and its drain twin "…loses N life and you gain N life."
 * (Certain Death), plus the counterspell lead (Undermine, Countersquall, Punish Ignorance, Psychic Barrier).
 *
 * ⭐ A MISSING MAP ENTRY, NOT A MISSING MECHANISM — the sixth-and-a-half instance of that shape this run. The
 * removal/counter lead grammar, the target-controller CAPTURE and the apply seam were all already built and in
 * use for gain-life / tokens / draw / mill riders. `parseControllerRider` simply had no arm for the single
 * MOST COMMON printed rider in the family, so seventeen cards parked on a vocabulary hole.
 *
 * ⚠️ AND A SECOND, OLDER HOLE UNDERNEATH IT, found only because the first fix did not flip the cards it
 * should have: the fold's lead resolver (`destroyExileClauseParser`) owns destroy-LAND, destroy-ARTIFACT and
 * exile-ANYTHING — but NOT destroy-CREATURE, which lives in the main clause grammar with its regeneration
 * riders. So "Destroy target land. Its controller …" had always worked and "Destroy target CREATURE. Its
 * controller …" had always failed, which is the most common printing of the shape. The fix injects parser.js's
 * own clause parser as a FALLBACK lead resolver, reached only when the existing one returns null.
 */
import { describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseControllerRider } from "./effects/spanMatchers.js";
import { classifyCard } from "./coverage.js";
import { applyControllerRider } from "./effects/atoms/removal.js";
import { createGameState, _resetIdsForTests } from "./gameState.js";

const atomOf = (t, type = "Instant") => parseEffectClause(t, type)?.atoms?.[0];

describe("the rider vocabulary", () => {
  it("⭐ the plain form", () => {
    expect(parseControllerRider("loses 2 life")).toEqual({ kind: "loseLife", amount: 2 });
  });

  it("⭐ the DRAIN form carries both amounts, read separately", () => {
    expect(parseControllerRider("loses 3 life and you gain 3 life"))
      .toEqual({ kind: "loseLife", amount: 3, youGain: 3 });
  });

  it("⛔ a SCALED form has no captured metric here and stays unmodeled", () => {
    expect(parseControllerRider("loses life equal to its power")).toBe(null);
    expect(parseControllerRider("loses life equal to the number of creatures you control")).toBe(null);
  });
});

describe("⭐ every lead the fold supports now carries it", () => {
  const cases = [
    ["destroy-CREATURE (the hole under the hole)", "Destroy target creature. Its controller loses 2 life."],
    ["destroy-creature with a colour restriction", "Destroy target nonblack creature. Its controller loses 2 life."],
    ["destroy-land", "Destroy target land. Its controller loses 2 life."],
    ["destroy-artifact", "Destroy target artifact. Its controller loses 2 life."],
    ["exile", "Exile target nonland permanent. Its controller loses 3 life."],
    ["counter", "Counter target spell. Its controller loses 3 life."],
    ["the DRAIN twin", "Destroy target creature. Its controller loses 2 life and you gain 2 life."],
  ];
  for (const [label, text] of cases) {
    it(`⭐ ${label}`, () => {
      expect(programConfidence(parseEffectClause(text, "Instant"))).toBe("high");
      expect(atomOf(text).controllerRider.kind).toBe("loseLife");
    });
  }

  it("⛔ the creature-lead RESTRICTION survives the fold — it is not a bare 'destroy target creature'", () => {
    // The fallback resolves the lead through the FULL grammar, so "nonblack" must still be on the atom. If it
    // were dropped, the card would destroy any creature — a strictly-wider effect than printed.
    expect(atomOf("Destroy target nonblack creature. Its controller loses 2 life.").restrictions)
      .toEqual([{ kind: "colorNeg", color: "B" }]);
  });
});

describe("⛔ CREED — the refusals that must survive", () => {
  const low = (t) => expect(programConfidence(parseEffectClause(t, "Instant"))).toBe("low");

  it("⛔ a CONDITIONAL rider still refuses (Soul Reap)", () => {
    low("Destroy target nongreen creature. Its controller loses 3 life if you've cast another black spell this turn.");
    expect(classifyCard({ name: "Soul Reap", type: "Instant", mana: "{B}", oracle: "Destroy target nongreen creature. Its controller loses 3 life if you've cast another black spell this turn." })).toBe("arbiter-spell");
  });

  it("⛔ a SCALED rider still refuses", () => {
    low("Destroy target creature. Its controller loses life equal to its power.");
  });

  it("⛔ an UNMODELED rider on the same lead still refuses — the fold is not a licence", () => {
    low("Destroy target creature. Its controller reveals their hand."); // RE-POINTED 2026-07-30: the DISCARD rider is modeled now (player-referent slice), so the stand-in moved again — `investigates` is unmodeled even for an explicit "Target player investigates." The pin is the UNMODELED-RIDER refusal, not this rider. // RE-POINTED 2026-07-30 (final): `investigates` is modeled now, so the stand-in moved to `reveals their hand` — 126 corpus carriers but ZERO attributable, so nothing will ever flip by building it. A stand-in with no attribution is permanent.
    low("Counter target spell. Its controller sacrifices another creature.");
  });
});

describe("⛔⭐ RUNTIME — the loss hits the TARGET's controller, the gain hits the CASTER", () => {
  const board = () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, players: { ...s.players, user: { ...s.players.user, life: 40 }, ai: { ...s.players.ai, life: 40 } } };
  };

  it("⭐ the captured controller loses the life", () => {
    const next = applyControllerRider(board(), { kind: "loseLife", amount: 2 }, { controller: "ai" }, { controller: "user" });
    expect(next.players.ai.life).toBe(38);
    expect(next.players.user.life).toBe(40);
  });

  it("⛔⭐ the DRAIN half goes to the CASTER, not the victim", () => {
    // ⚠️ THE ASSERTION MOST LIKELY TO BE SILENTLY BACKWARDS. Every other rider in this family touches ONLY the
    // captured controller, so the natural (wrong) implementation hands the victim the life too. Certain Death
    // would then read native while healing the player it was cast at.
    const next = applyControllerRider(board(), { kind: "loseLife", amount: 2, youGain: 2 }, { controller: "ai" }, { controller: "user" });
    expect(next.players.ai.life).toBe(38);
    expect(next.players.user.life).toBe(42);
  });

  it("⛔ no drain half → the caster's life is untouched", () => {
    const next = applyControllerRider(board(), { kind: "loseLife", amount: 2 }, { controller: "ai" }, { controller: "user" });
    expect(next.players.user.life).toBe(40);
  });
});
