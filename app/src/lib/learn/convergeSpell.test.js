/**
 * convergeSpell.test.js — CONVERGE on SPELLS (CR 702.117a): "X is the number of colors of mana spent to cast
 * this spell." Kaleidoscorch and Radiant Flames.
 *
 * ⭐ THE THIRD CONSUMER OF ONE CAPTURE. The colour count is derived once, at cost-payment time, off the
 * payment plan. Sunburst reads it as a keyword, converge's enters-with form reads it as a sentence, and now
 * a SPELL reads it as a dynamic amount. Each slice added a reader; none re-derived the number.
 *
 * ⭐ IT RIDES THE SHARED COUNT PARSER, deliberately. `parseCountSource` is where every scaling atom family
 * (damage, tokens, counters, draw, life) gets its dynamic magnitudes, so one arm there means the damage atom
 * picked this up with no changes of its own — the control probe proved that before the arm existed: the same
 * sentence with an already-modelled count phrase ("the number of creatures you control") parsed HIGH.
 *
 * ⛔ STAMPED ON STATE, NOT THREADED THROUGH PARAMS, and the precedent is exact: `sacrificedForCost` captures
 * a value at cost-payment time for the same reason — by resolution the pool is already deducted and the
 * answer no longer exists. countForSpec reads both off the same channel. An absent stamp reads 0: a clean
 * no-op, never a fabricated magnitude.
 *
 * ⛔ "COLORS", NOT MANA. Two Forests pay two green mana and ONE colour. The witness drives exactly that case.
 *
 * ⓘ 16 converge spells; 2 flip. The rest park on their EFFECTS — Painful Truths' "draw X and lose X" doesn't
 * parse even with an already-modelled count (verified), Prismatic Ending and Exert Influence need
 * comparison-gated targeting, Bring to Light needs a tutor-and-cast. The count is no longer what holds them.
 *
 * ⓘ The SINGULAR "for each COLOR of mana spent" wording is accepted by the count parser and flips ZERO cards
 * today — Unified Front's token atom doesn't route its "for each" phrase through parseCountSource. It is
 * pinned at the helper level rather than through a card, and said plainly here rather than implied.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * state stamp removed -> the witness shows 0 damage from a three-colour cast; the count kind's evaluation
 * removed -> same, via the other end of the wire.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseManaCost } from "./legalChoices.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { splitClauses } from "./effects/splitClauses.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FLAMES = { id: "cs1", name: "Radiant Flames", type: "Sorcery", mana: "{3}",
  oracle: "Converge — Radiant Flames deals X damage to each creature, where X is the number of colors of mana spent to cast this spell." };

describe("the count parser and the atom", () => {
  it("⭐ both printed wordings resolve to one count kind", () => {
    expect(parseCountSource("the number of colors of mana spent to cast this spell")).toEqual({ kind: "colorsSpentThisSpell" });
    // ⓘ The singular "for each COLOR …" remainder. Accepted here; flips no card today (see header).
    expect(parseCountSource("color of mana spent to cast this spell")).toEqual({ kind: "colorsSpentThisSpell" });
  });

  it("⭐ the damage atom picks it up with no changes of its own", () => {
    const p = parseEffectClause(splitClauses("this spell deals x damage to any target, where x is the number of colors of mana spent to cast this spell")[0], "Sorcery");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", targetType: "any", amountCount: { kind: "colorsSpentThisSpell" } }]);
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(FLAMES)).toBe("native-spell");
    expect(classifyCard({ name: "Kaleidoscorch", type: "Sorcery", mana: "{1}{R}",
      oracle: "Converge — Kaleidoscorch deals X damage to any target, where X is the number of colors of mana spent to cast this spell.\nFlashback {4}{R}" })).toBe("native-spell");
  });
});

describe("⭐⭐ LAW 6 — the count survives payment → SPELL resolution", () => {
  /** Cast Radiant Flames for {3} out of `pool`, resolve it, and report the damage marked on a 5/5. */
  function castAndResolve(pool) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const victim = createPermanent({ id: "vic", card: { id: "c-v", name: "Big", type: "Creature — Giant", power: "5", toughness: "5", oracle: "" }, controller: "ai" });
    const start = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [FLAMES], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, battlefield: [victim] } } };
    const cast = dispatchAction(start, { kind: "cast-spell", playerId: "user", cardId: FLAMES.id, name: FLAMES.name, cost: parseManaCost("{3}"), cmc: 3 });
    const resolved = resolveTopOfStack(cast);
    const s = resolved.state || resolved;
    // ⚠️ THE FIELD IS `damageMarked`, NOT `damage` — my first cut read `damage`, got `undefined || 0`, and
    // the witness printed all zeros: indistinguishable from "the count never arrived". Fifth harness error of
    // the day, and the rule has earned its place: **when a Law-6 witness reads all-zero, check the field name
    // before you touch the code.**
    return s.players.ai.battlefield.find((p) => p.id === "vic")?.damageMarked || 0;
  }

  it("⭐⭐ three colours → 3 damage; two Forests → 1 (colours, not mana); colourless → 0", () => {
    const row = {
      threeColours: castAndResolve({ W: 1, U: 1, B: 1 }),
      // ⛔ THE ROW THAT MATTERS: three mana, ONE colour. A count of "mana spent" reads 3 here.
      oneColourThreeMana: castAndResolve({ G: 3 }),
      colourless: castAndResolve({ C: 3 }),
    };
    console.log("  WITNESS convergeSpell", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ threeColours: 3, oneColourThreeMana: 1, colourless: 0 });
  });
});
