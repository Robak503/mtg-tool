/**
 * savvyTrader.test.js — SHELF-85 runbook Phase 2 · K9 (2026-09-04): Savvy Trader (Kellan); Sage of the Beyond audited.
 *
 *   "When this creature enters, exile target permanent card from your graveyard. You may play that card for as long as
 *    it remains exiled.
 *    Spells you cast from anywhere other than your hand cost {1} less to cast."
 *
 * The ETB: the permission is its own sentence bound to the previous target, so the splitter's normalize step folds the
 * pair into one clause, a keep-whole carries it past the " and " split, and the exile-from-graveyard arm reads
 * `playableWhileExiled` — the resolver stamps the EXTENDED impulse window (`_impulseExtended`, the flag the "for as long
 * as it remains exiled" library impulses ride), so the one legalChoices lane offers the card from exile on later turns.
 * The static: a cost reducer keyed on the CAST ZONE — costReductionForSpell gained a `fromZone` (default "hand", so every
 * caller that never passed one is byte-identical) and castActionsFromZone passes its zone at both reduction sites.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseStaticAbilities, costReductionForSpell } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TRADER = { id: "c-trader", name: "Savvy Trader", type: "Creature — Human Citizen", mana: "{3}{G}", keywords: [], power: 3, toughness: 3,
  oracle: "When this creature enters, exile target permanent card from your graveyard. You may play that card for as long as it remains exiled.\nSpells you cast from anywhere other than your hand cost {1} less to cast." };
const SAGE = { id: "c-sage", name: "Sage of the Beyond", type: "Creature — Spirit Giant", mana: "{5}{U}{U}", keywords: ["Flying", "Foretell"], power: 3, toughness: 5,
  oracle: "Flying\nSpells you cast from anywhere other than your hand cost {2} less to cast.\nForetell {4}{U} (During your turn, you may pay {2} and exile this card from your hand face down. Cast it on a later turn for its foretell cost.)" };
const FOREST_CARD = { id: "c-gyforest", name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const BEAR_CARD = { id: "c-gybear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", oracle: "", power: 2, toughness: 2 };
const BOLT_CARD = { id: "c-gybolt", name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." };
const forest = (id) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, controller: "user" });

const board = (gy) => {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 5,
    players: { ...s.players, user: { ...s.players.user, graveyard: gy, hand: [], battlefield: [forest("F1"), forest("F2"), forest("F3")], landsPlayedThisTurn: 0 } } };
};
const enterTrader = (s) => {
  const trader = createPermanent({ id: "T", card: TRADER, controller: "user" });
  s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, trader] } } };
  const fired = checkEnterTriggers(s, trader);
  s = flushTriggers(fired);
  while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
  return s;
};

describe("parse", () => {
  it("the ETB folds into one exile-from-graveyard atom carrying playableWhileExiled; the static is a cast-zone reducer", () => {
    const r = parseEffectClause("Exile target permanent card from your graveyard. You may play that card for as long as it remains exiled.", "Creature");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter: "permanent", playableWhileExiled: true }]);
    expect(parseEffectClause("Exile target permanent card from your graveyard.", "Creature").atoms).toEqual([{ op: "exile-from-graveyard", targetType: "graveyardCard", cardFilter: "permanent" }]);
    expect(parseStaticAbilities(TRADER)).toEqual([{ costReduction: { castFromNotHand: true, amount: 1 } }]);
  });
  it("the reducer applies from exile or graveyard, never from the hand; no zone passed means the hand", () => {
    const red = [{ castFromNotHand: true, amount: 1 }];
    expect(costReductionForSpell(red, BEAR_CARD, "exile")).toBe(1);
    expect(costReductionForSpell(red, BEAR_CARD, "graveyard")).toBe(1);
    expect(costReductionForSpell(red, BEAR_CARD, "hand")).toBe(0);
    expect(costReductionForSpell(red, BEAR_CARD)).toBe(0);
  });
});

describe("runtime — the ETB and the window", () => {
  it("targets only PERMANENT cards in your graveyard; the exiled card carries the extended window", () => {
    let s = board([FOREST_CARD, BOLT_CARD]);
    const trader = createPermanent({ id: "T", card: TRADER, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, trader] } } };
    const fired = checkEnterTriggers(s, trader);
    const trig = (fired.pendingTriggers || []).find((t) => t.source?.name === "Savvy Trader");
    expect(trig).toBeTruthy();
    s = flushTriggers(fired);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    const ex = s.players.user.exile.find((c) => c.id === "c-gyforest");
    expect(ex).toBeTruthy();
    expect(ex._impulse).toBe(true);
    expect(ex._impulseExtended).toBe(true);
    expect(ex._impulseOwner).toBe("user");
    expect(s.players.user.graveyard.some((c) => c.id === "c-gybolt")).toBe(true); // the instant was never a legal target
  });
  it("on a LATER turn the exiled land is still offered as a land drop from exile, and a creature casts for one less", () => {
    let s = enterTrader(board([BEAR_CARD]));
    expect(s.players.user.exile.find((c) => c.id === "c-gybear")?._impulseExtended).toBe(true);
    s = { ...s, turn: 7 };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-gybear");
    expect(cast).toBeTruthy();
    expect(cast.fromZone).toBe("exile");
    // THE OFFER carries the reduction, not just the reader: with ONE untapped Forest a {1}{G} Bear from exile is offered
    // only because the cast lane passed fromZone into costReductionForSpell (the two call sites) — the same board
    // without Savvy Trader's reducer offers nothing. This is the pin the direct-reader assertions could not give.
    let one = enterTrader(board([BEAR_CARD]));
    one = { ...one, turn: 7, players: { ...one.players, user: { ...one.players.user, battlefield: one.players.user.battlefield.filter((p) => p.id === "F1" || p.id === "T") } } };
    expect(legalActionsForPlayer(one, "user").some((a) => a.kind === "cast-spell" && a.cardId === "c-gybear")).toBe(true);
    const noReducer = { ...one, players: { ...one.players, user: { ...one.players.user, battlefield: one.players.user.battlefield.filter((p) => p.id === "F1") } } };
    expect(legalActionsForPlayer(noReducer, "user").some((a) => a.kind === "cast-spell" && a.cardId === "c-gybear")).toBe(false);
    let l = enterTrader(board([FOREST_CARD]));
    l = { ...l, turn: 7 };
    const land = legalActionsForPlayer(l, "user").find((a) => a.kind === "play-land" && a.cardId === "c-gyforest");
    expect(land).toBeTruthy();
    expect(land.fromZone).toBe("exile");
  });
});

describe("classifier", () => {
  it("Savvy Trader is native-mixed; Sage of the Beyond native-static (Flying + the reducer + Foretell)", () => {
    expect(classifyCard(TRADER)).toBe("native-mixed");
    expect(classifyCard(SAGE)).toBe("native-static");
  });
});
