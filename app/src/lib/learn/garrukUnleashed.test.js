/**
 * GARRUK, UNLEASHED — SHELF-85 · Atraxa A4, 2026-09-05. "−2: Create a 3/3 green Beast creature token. Then if an
 * opponent controls more creatures than you, put a loyalty counter on Garruk."
 *
 * The +1 pump and the −7 emblem already parsed HIGH; the −2 parked on one thing — the walker naming ITSELF as the
 * recipient of the loyalty counter. The effect parser has no card in hand, so "Garruk" was never a self reference
 * there. parseLoyaltyAbilities (the single source both the runtime and the metric read) now rewrites the fixed-count
 * "put a loyalty counter on <own name>" tail to the self noun the named-counter-self atom already reads; that atom
 * lands on the SAME `counters.loyalty` key the loyalty cost and the 0-loyalty SBA use, through addCounter, so a
 * counter doubler applies to the EFFECT's counter and never to the cost.
 *
 * Mutation-checked: see the run ledger (docs-sk78).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseLoyaltyAbilities } from "./effects/loyaltyAbilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const GARRUK = { id: "c-gu", name: "Garruk, Unleashed", type: "Legendary Planeswalker — Garruk", mana: "{2}{G}{G}", loyalty: "4", keywords: [],
  oracle: "+1: Up to one target creature gets +3/+3 and gains trample until end of turn.\n−2: Create a 3/3 green Beast creature token. Then if an opponent controls more creatures than you, put a loyalty counter on Garruk.\n−7: You get an emblem with \"At the beginning of your end step, you may search your library for a creature card, put it onto the battlefield, then shuffle.\"" };
const HUATLI = { id: "c-hr", name: "Huatli, Radiant Champion", type: "Legendary Planeswalker — Huatli", mana: "{2}{G}{W}", loyalty: "3", keywords: [],
  oracle: "+1: Put a loyalty counter on Huatli for each creature you control.\n−1: Target creature gets +X/+X until end of turn, where X is the number of creatures you control.\n−8: You get an emblem with \"Whenever a creature enters under your control, you may draw a card.\"" };
const BEAR = { id: "c-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" };
const DOUBLING_SEASON = { id: "c-ds", name: "Doubling Season", type: "Enchantment", mana: "{4}{G}", keywords: [],
  oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." };

function board({ aiBears = 0, season = false } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const ai = Array.from({ length: aiBears }, (_, i) => createPermanent({ id: `b${i}`, card: { ...BEAR, id: `c-bear${i}` }, controller: "ai", summoningSick: false }));
  // createPermanent has no counters field — the loyalty counter (the walker's "entered as one" mark) is stamped on after.
  const user = [{ ...createPermanent({ id: "gar", card: GARRUK, controller: "user" }), counters: { loyalty: 4 } }];
  if (season) user.push(createPermanent({ id: "ds", card: DOUBLING_SEASON, controller: "user" }));
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } } };
}
function fireMinusTwo(s) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-loyalty" && a.permanentId === "gar" && a.costDelta === -2);
  expect(act).toBeTruthy();
  const after = dispatchAction(s, act);
  const resolved = resolveTopOfStack(after);
  const gar = resolved.players.user.battlefield.find((p) => p.id === "gar");
  const beasts = resolved.players.user.battlefield.filter((p) => /Beast/.test(String(p.card?.type || "")) && p.card?.isToken !== false && p.id !== "gar");
  return { loyalty: gar?.counters?.loyalty, beasts: beasts.length };
}

describe("the loyalty parser — a walker naming itself as the counter's recipient", () => {
  it("Garruk's −2 parses HIGH: the token, then the conditional loyalty counter on the self noun", () => {
    const abs = parseLoyaltyAbilities(GARRUK);
    const row = abs.map((a) => [a.costDelta, a.modeled, a.effectClause]);
    console.log("  WITNESS garrukLoyalty", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(abs.map((a) => a.modeled)).toEqual([true, true, true]);
    const minus2 = abs[1];
    expect(minus2.effectClause).toMatch(/put a loyalty counter on this permanent\.$/);
    expect(minus2.program.atoms.map((x) => x.op)).toEqual(["create-token", "add-named-counter-self"]);
    expect(minus2.program.atoms[1]).toMatchObject({ counterType: "loyalty", amount: 1, condition: "an opponent controls more creatures than you" });
  });

  it("CREED — the COUNTED tail is not rewritten (Huatli's 'for each creature you control' stays parked)", () => {
    const abs = parseLoyaltyAbilities(HUATLI);
    expect(abs[0].effectClause).toBe("Put a loyalty counter on Huatli for each creature you control.");
    expect(abs[0].modeled).toBe(false);
  });

  it("classification — Garruk, Unleashed flips to native-planeswalker; Huatli does not", () => {
    expect(classifyCard(GARRUK)).toBe("native-planeswalker");
    expect(classifyCard(HUATLI)).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the −2 through the real loyalty lane", () => {
  it("an opponent with more creatures: the Beast arrives and Garruk nets 4 − 2 + 1 = 3 loyalty", () => {
    const r = fireMinusTwo(board({ aiBears: 2 }));
    console.log("  WITNESS garrukRuntime", JSON.stringify(r)); // vitest 4 needs --disable-console-intercept
    expect(r.beasts).toBe(1);
    expect(r.loyalty).toBe(3);
  });

  it("no opponent creatures: the Beast arrives, the condition fails, Garruk sits at 2", () => {
    // After the Beast the user controls 1 creature and the opponent 0 — "an opponent controls more creatures than you" is false.
    const r = fireMinusTwo(board({ aiBears: 0 }));
    expect(r.beasts).toBe(1);
    expect(r.loyalty).toBe(2);
  });

  it("Doubling Season doubles the EFFECT's loyalty counter and never the cost: 4 − 2 + 2 = 4 (and two Beasts)", () => {
    const r = fireMinusTwo(board({ aiBears: 3, season: true }));
    expect(r.beasts).toBe(2);
    expect(r.loyalty).toBe(4);
  });
});
