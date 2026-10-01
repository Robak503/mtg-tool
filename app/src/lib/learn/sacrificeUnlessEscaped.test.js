/**
 * sacrificeUnlessEscaped.test.js — "When Phlage enters, sacrifice it unless it escaped." (Phlage, Titan of Fire's Fury; Uro,
 * Titan of Nature's Wrath — the 09-06 plan's stage ③, census row ⑰, 2026-09-30. Kroxa carries the line but parks on another
 * gap.)
 *
 * The existing self-sacrifice atom with an `unlessEscaped` flag: the resolver skips a permanent that carries `escaped`. A card's
 * PRINTED escape is never offered (coverage's ESCAPE_LINE note), so a titan cast from the hand is always sacrificed — after its
 * "enters or attacks" trigger does its work, exactly as printed. A GRANTED escape cast (Underworld Breach, P·29) stamps the flag:
 * the last pin holds the flag's half, and underworldBreach.test.js casts an escaped Uro for real.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30); each cast run for real (legal action → dispatch → the stack).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { checkEnterTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const ESCAPE_REMINDER = "(You may cast this card from your graveyard for its escape cost.)";
const PHLAGE = { id: "phl", name: "Phlage, Titan of Fire's Fury", type: "Legendary Creature — Elder Giant", mana: "{1}{R}{W}", power: 6, toughness: 6, keywords: ["Escape"],
  oracle: `When Phlage enters, sacrifice it unless it escaped.\nWhenever Phlage enters or attacks, it deals 3 damage to any target and you gain 3 life.\nEscape—{R}{R}{W}{W}, Exile five other cards from your graveyard. ${ESCAPE_REMINDER}` };
const URO = { id: "uro", name: "Uro, Titan of Nature's Wrath", type: "Legendary Creature — Elder Giant", mana: "{1}{G}{U}", power: 6, toughness: 6, keywords: ["Escape"],
  oracle: `When Uro enters, sacrifice it unless it escaped.\nWhenever Uro enters or attacks, you gain 3 life and draw a card, then you may put a land card from your hand onto the battlefield.\nEscape—{G}{G}{U}{U}, Exile five other cards from your graveyard. ${ESCAPE_REMINDER}` };
const KROXA = { name: "Kroxa, Titan of Death's Hunger", type: "Legendary Creature — Elder Giant", mana: "{B}{R}", power: 6, toughness: 6, keywords: ["Escape"],
  oracle: `When Kroxa enters, sacrifice it unless it escaped.\nWhenever Kroxa enters or attacks, each opponent discards a card, then each opponent who didn't discard a nonland card this way loses 3 life.\nEscape—{B}{B}{R}{R}, Exile five other cards from your graveyard. ${ESCAPE_REMINDER}` };

function game(hand, pool, battlefield = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 3, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, hand, battlefield, library: [{ id: "l1", name: "Island", type: "Basic Land — Island", oracle: "" }],
      manaPool: { ...s.players.user.manaPool, ...pool } } } };
}
const settle = (s) => { let st = flushTriggers(s, { chooseTargets: chooseTriggerTargets }); for (let i = 0; i < 12 && (st.stack || []).length; i++) st = flushTriggers(resolveTopOfStack(st), { chooseTargets: chooseTriggerTargets }); return st; };
function cast(s, cardId) {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
  expect(act).toBeTruthy();
  return settle(dispatchAction(s, act));
}

describe("classification and parse", () => {
  it("Phlage and Uro → native-trigger; Kroxa stays parked on its other gap", () => {
    expect([PHLAGE, URO, KROXA].map(classifyCard)).toEqual(["native-trigger", "native-trigger", "body-only"]);
  });
  it("the clause is the self-sacrifice with the escaped flag", () => {
    expect(parseEffectClause("sacrifice it unless it escaped", "Instant", { sourceScoped: true }).atoms).toEqual([{ op: "sacrifice", target: "self", unlessEscaped: true }]);
  });
});

describe("RUNTIME — cast from the hand, the titan does its work and goes to the graveyard", () => {
  it("⭐ Phlage: 3 damage lands and 3 life is gained, then Phlage is sacrificed", () => {
    const s0 = game([PHLAGE], { R: 1, W: 1, C: 1 });
    const s = cast(s0, "phl");
    const out = { phlageInGraveyard: s.players.user.graveyard.some((c) => c.name === PHLAGE.name), onBattlefield: s.players.user.battlefield.some((p) => p.card?.name === PHLAGE.name),
      lifeGained: s.players.user.life - s0.players.user.life, aiDamage: s0.players.ai.life - s.players.ai.life };
    expect(out).toEqual({ phlageInGraveyard: true, onBattlefield: false, lifeGained: 3, aiDamage: 3 });
    console.log(`WITNESS phlageCast ${JSON.stringify(out)}`);
  });

  it("⭐ Uro: 3 life and a card, then Uro is sacrificed", () => {
    const s0 = game([URO], { G: 1, U: 1, C: 1 });
    const s = cast(s0, "uro");
    expect({ uroInGraveyard: s.players.user.graveyard.some((c) => c.name === URO.name), lifeGained: s.players.user.life - s0.players.user.life,
      drew: s.players.user.library.length === 0 }).toEqual({ uroInGraveyard: true, lifeGained: 3, drew: true });
  });
});

describe("the escaped flag — what an escape cast stamps (P·29: underworldBreach.test.js casts one)", () => {
  it("⛔ a Phlage that carries `escaped` stays on the battlefield when its enters trigger resolves (its damage still lands)", () => {
    const escapedPhlage = { ...createPermanent({ id: "phl-perm", card: PHLAGE, controller: "user", summoningSick: false }), escaped: true };
    const s0 = game([], {}, [escapedPhlage]);
    const s = settle(checkEnterTriggers(s0, escapedPhlage));
    expect({ onBattlefield: !!findPermanent(s, "phl-perm"), aiDamage: s0.players.ai.life - s.players.ai.life }).toEqual({ onBattlefield: true, aiDamage: 3 });
  });
});
