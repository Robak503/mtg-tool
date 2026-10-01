/**
 * multikickerCount.test.js — "for each time it was kicked" (CR 702.33c/d): Skitter of Lizards, Quag Vampires,
 * Enclave Elite, Gnarlid Pack, Apex Hawks (enters-with counters) and Wolfbriar Elemental, Lightkeeper of
 * Emeria (ETB payoffs).
 *
 * GRADUATED (P·15, 2026-10-01): until then legalChoices never offered a multikicked cast, every cast really
 * was kicked zero times, and this file pinned zero as the correct answer. The offer exists now
 * (parseMultikickerCost) — everflowingChalice.test.js drives it end to end through legalChoices. The pins
 * below still hold at the dispatcher: an unkicked cast is zero, and a supplied kick count is the count.
 *
 * ⭐ MODELLED AS A COUNT SOURCE RATHER THAN STRIPPED, and that is the whole design choice. A strip would say
 * "this text does not exist" and would have to be revisited the day multikicker is offered. A count says
 * "the answer is however many times it was kicked", computes the true value for every available cast, and
 * went live with no further edit when the offer shipped. **The second runtime pin below proves it is a real
 * count and not a dressed-up zero** — supply a non-zero kick count and the counters follow.
 *
 * ⓘ The Multikicker LINE itself was already accepted as a covered cost keyword (verified: the keyword plus a
 * vanilla body reads native today), so this rider was the only thing parking these cards.
 *
 * ⭐ ONE CAPTURE, MANY READERS — the fourth time this session. The count rides `parseCountSource` for the
 * effect families (Wolfbriar's tokens, Lightkeeper's lifegain) AND `parseMetricCountSource` for the
 * enters-with family, both resolving through countForSpec's one `timesKicked` kind.
 *
 * Mutation-checked (2026-08-05, each grep-verified as applied AND verified on the case under test): the
 * countForSpec kind removed -> the non-zero pin reads 0 counters; the dispatcher stamp removed -> same.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-05).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseManaCost } from "./legalChoices.js";
import { parseCountSource } from "./effects/parseHelpers.js";
import { entersWithMetricCounters } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SKITTER = { id: "mk1", name: "Skitter of Lizards", type: "Creature — Lizard", mana: "{R}", power: "1", toughness: "1",
  oracle: "Multikicker {1}{R} (You may pay an additional {1}{R} any number of times as you cast this spell.)\nHaste\nThis creature enters with a +1/+1 counter on it for each time it was kicked." };

describe("the count source", () => {
  it("⭐ both readers resolve the phrase to one kind", () => {
    expect(parseCountSource("times it was kicked")).toEqual({ kind: "timesKicked" });
    expect(entersWithMetricCounters(SKITTER)).toMatchObject({ perUnit: 1, metric: { kind: "timesKicked" } });
  });

  it("⭐ the whole cards flip", () => {
    expect(classifyCard(SKITTER)).toBe("native-body");
    expect(classifyCard({ name: "Wolfbriar Elemental", type: "Creature — Elemental", mana: "{2}{G}{G}", power: "4", toughness: "4",
      oracle: "Multikicker {G}\nWhen this creature enters, create a 2/2 green Wolf creature token for each time it was kicked." })).toBe("native-trigger");
  });
});

describe("⭐⭐ LAW 6 — zero on a real cast, and LIVE when the count isn't zero", () => {
  function castSkitter(stateOver = {}) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const start = { ...g, ...stateOver, players: { ...g.players,
      user: { ...g.players.user, hand: [SKITTER], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    const cast = dispatchAction(start, { kind: "cast-spell", playerId: "user", cardId: SKITTER.id, name: SKITTER.name, cost: parseManaCost("{R}"), cmc: 1 });
    const resolved = resolveTopOfStack(cast);
    const s = resolved.state || resolved;
    const perm = (s.players.user.battlefield || []).find((p) => p.card?.id === SKITTER.id);
    return { perm, stamp: perm?.timesKicked ?? 0 }; // the permanent's own count (P·15 — no state-wide stamp)
  }

  it("⭐⭐ a normal cast: stamped ZERO, enters with no counters — the printed 1/1 haste", () => {
    const { perm, stamp } = castSkitter();
    const row = { stamp, counters: perm?.counters?.["+1/+1"] ?? 0, onBattlefield: !!perm };
    console.log("  WITNESS multikicker/normal", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ stamp: 0, counters: 0, onBattlefield: true });
  });

  it("⭐⭐ IT IS A REAL COUNT, NOT A DRESSED-UP ZERO — a non-zero stamp produces counters", () => {
    // The kick count is supplied on the action directly — the dispatcher-level half of the proof. Since P·15
    // legalChoices produces such actions itself (everflowingChalice.test.js drives that end to end).
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const start = { ...g, players: { ...g.players,
      user: { ...g.players.user, hand: [SKITTER], manaPool: { W: 0, U: 0, B: 0, R: 1, G: 0, C: 0 } } } };
    const cast = dispatchAction(start, { kind: "cast-spell", playerId: "user", cardId: SKITTER.id, name: SKITTER.name, cost: parseManaCost("{R}"), cmc: 1, kickCount: 3 });
    const resolved = resolveTopOfStack(cast);
    const s = resolved.state || resolved;
    const perm = (s.players.user.battlefield || []).find((p) => p.card?.id === SKITTER.id);
    const row = { stamp: perm?.timesKicked ?? 0, counters: perm?.counters?.["+1/+1"] ?? 0 };
    console.log("  WITNESS multikicker/kicked", JSON.stringify(row));
    expect(row).toEqual({ stamp: 3, counters: 3 });
  });
});
