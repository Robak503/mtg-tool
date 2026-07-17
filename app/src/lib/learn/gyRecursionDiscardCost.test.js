/**
 * gyRecursionDiscardCost.test.js — BLITZ GR-1: the ", Discard N cards" COST RIDER on graveyard
 * self-recursion (Stitchwing Skaab / Advanced Stitchwing / Ghoulsteed — "{mana}, Discard two cards:
 * Return this card from your graveyard to the battlefield tapped."). The rider parses into
 * parseGraveyardSelfRecursion (bare "card(s)" only — a TYPED discard stays unmodeled), gates the
 * enumeration on hand size (CR 601.2h — an unpayable cost is never offered), auto-picks the victims
 * by hand order (the sacCount slice discipline), and the dispatcher pays them BEFORE the ability
 * stacks. Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseGraveyardSelfRecursion } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SKAAB = { id: "sk", name: "Stitchwing Skaab", type: "Creature — Zombie", power: "3", toughness: "1", mana: "{3}{U}",
  oracle: "Flying\n{1}{U}, Discard two cards: Return this card from your graveyard to the battlefield tapped." };

function board() {
  let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const isle = (i) => createPermanent({ id: `l${i}`, card: { id: `lc${i}`, name: "Island", type: "Basic Land — Island", oracle: "{T}: Add {U}." }, controller: "user", summoningSick: false });
  return { ...s,
    phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user,
      battlefield: [isle(1), isle(2)],
      graveyard: [{ ...SKAAB }],
      hand: [{ id: "h1", name: "Filler One", type: "Sorcery", oracle: "" }, { id: "h2", name: "Filler Two", type: "Sorcery", oracle: "" }] } } };
}

describe("parse + classify", () => {
  it("the rider parses; the family flips; typed-discard and mana-only forms behave", () => {
    expect(parseGraveyardSelfRecursion(SKAAB)).toMatchObject({ discardCards: 2, dest: "battlefield", entersTapped: true });
    // The bare mana-only form is byte-identical to before (discardCards 0).
    expect(parseGraveyardSelfRecursion({ oracle: "{1}{B}: Return this card from your graveyard to your hand." })).toMatchObject({ discardCards: 0, dest: "hand" });
    // A TYPED discard (Kraul Swarm) never matches — the whole line stays unmodeled.
    expect(parseGraveyardSelfRecursion({ oracle: "{2}{B}, Discard a creature card: Return this card from your graveyard to your hand." })).toBeNull();
    expect(classifyCard(SKAAB)).toBe("native-activated");
    expect(classifyCard({ id: "gh", name: "Ghoulsteed", type: "Creature — Zombie Horse", power: "4", toughness: "6", mana: "{4}{B}",
      oracle: "{2}{B}, Discard two cards: Return this card from your graveyard to the battlefield tapped." })).toBe("native-activated");
    // Geralf's Masterpiece stays parked — its hand-scaled -1/-1 static is unmodeled (whole-card law).
    expect(classifyCard({ id: "gm", name: "Geralf's Masterpiece", type: "Creature — Zombie Horror", power: "7", toughness: "7", mana: "{2}{U}",
      oracle: "Flying\nThis creature gets -1/-1 for each card in your hand.\n{3}{U}, Discard three cards: Return this card from your graveyard to the battlefield tapped." })).toBe("body-only");
  });
});

describe("enumeration + dispatch — the cost pays before the ability stacks (CR 601.2h)", () => {
  it("offered only with 2+ cards in hand; pays both victims, returns tapped", () => {
    let s = board();
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-gy-recursion" && a.cardId === "sk");
    expect(act).toBeTruthy();
    expect(act.discardIds).toEqual(["h1", "h2"]);
    let after = dispatchAction(s, act);
    expect(after.players.user.hand.length).toBe(0);                               // both victims paid at dispatch
    expect(after.players.user.graveyard.some((c) => c.id === "h1")).toBe(true);
    let g = 0; while ((after.stack || []).length && g++ < 6) after = resolveTopOfStack(after);
    const perm = after.players.user.battlefield.find((p) => p.card?.id === "sk");
    expect(perm).toBeTruthy();
    expect(perm.tapped).toBe(true);                                               // "…to the battlefield tapped"
    expect(after.players.user.graveyard.some((c) => c.id === "sk")).toBe(false);
  });
  it("NOT offered with a 1-card hand (unpayable cost, CR 601.2h)", () => {
    let s = board();
    s = { ...s, players: { ...s.players, user: { ...s.players.user, hand: [{ id: "h1", name: "Only One", type: "Sorcery", oracle: "" }] } } };
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "activate-gy-recursion" && a.cardId === "sk")).toBe(false);
  });
});
