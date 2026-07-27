/**
 * gyRecursionExileCost.test.js — GR-2: the exile-from-graveyard cost on the GY self-recursion lane,
 * census slice 35.
 *
 * The GY-1 lane (Reassembling Skeleton class) already offers, pays and credits "Return this card from your
 * graveyard …" as a single source. Its cost vocabulary was mana-only plus a bare "discard N cards" rider.
 * This adds "<mana>, Exile a/an/another <type> card from your graveyard:" — SINGULAR ONLY, the way every
 * other cost lane in this codebase started; the count forms ("exile two other creature cards", "exile seven
 * other cards") stay unmodeled → body-only, a safe FN.
 *
 * SELF IS ALWAYS EXCLUDED as a victim, for "a/an" as much as for "another": the card being returned is
 * sitting in the very graveyard the cost draws from, and paying with it would exile the object the ability
 * returns. Excluding it is both the sane line and the one that cannot produce a self-referential paradox.
 *
 * THE GATE IS THE POINT. With no legal victim the ability must not be offered at all (CR 601.2h) — without
 * that, this becomes free recursion, which is the over-permissive direction.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseGraveyardSelfRecursion } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const SCROUNGER = { id: "c-ss", name: "Scrapheap Scrounger", type: "Artifact Creature — Construct", mana: "{2}", power: 3, toughness: 2,
  oracle: "Scrapheap Scrounger can't block.\n{1}{B}, Exile another creature card from your graveyard: Return this card from your graveyard to the battlefield." };

describe("parse", () => {
  it("the singular exile rider is read as a typed cost", () => {
    expect(parseGraveyardSelfRecursion(SCROUNGER)).toMatchObject({
      manaPips: "{1}{B}", exileFromGy: { cardType: "creature", count: 1 }, dest: "battlefield",
    });
  });
  it("'an <type> card' reads the same as 'another'", () => {
    expect(parseGraveyardSelfRecursion({ name: "X", oracle: "{3}{B}{B}, Exile an artifact card from your graveyard: Return this card from your graveyard to the battlefield." }))
      .toMatchObject({ exileFromGy: { cardType: "artifact", count: 1 } });
  });
  it("the COUNT forms stay unmodeled (safe FN)", () => {
    expect(parseGraveyardSelfRecursion({ name: "X", oracle: "{B}{B}, Exile two other creature cards from your graveyard: Return this card from your graveyard to the battlefield." })).toBeNull();
  });
  it("Scrapheap Scrounger classifies native-activated", () => {
    expect(classifyCard(SCROUNGER)).toBe("native-activated");
  });
});

describe("RUNTIME — the cost gates the offer and is actually paid", () => {
  function board(graveyard) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const sw = (id) => createPermanent({ id, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false });
    return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: [sw("s1"), sw("s2")], graveyard } } };
  }
  const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion");

  it("NOT offered when the graveyard holds only the card itself — self is never its own victim", () => {
    expect(offers(board([SCROUNGER]))).toHaveLength(0);
  });

  it("NOT offered when the only other card is the wrong TYPE", () => {
    expect(offers(board([SCROUNGER, { id: "g2", name: "Shock", type: "Instant" }]))).toHaveLength(0);
  });

  it("offered with a legal victim, and resolving exiles it while returning the card", () => {
    let s = board([SCROUNGER, { id: "g2", name: "Dead Bear", type: "Creature — Bear" }]);
    const o = offers(s);
    expect(o).toHaveLength(1);
    expect(o[0].exileGyIds).toEqual(["g2"]);

    s = dispatchAction(s, o[0]);
    let g = 0; while (s.stack.length && g++ < 8) s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some((p) => p.card?.name === "Scrapheap Scrounger")).toBe(true);
    expect((s.players.user.exile || []).map((c) => c.name)).toEqual(["Dead Bear"]);
    expect(s.players.user.graveyard).toHaveLength(0);
  });
});
