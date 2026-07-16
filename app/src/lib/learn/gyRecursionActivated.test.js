/**
 * gyRecursionActivated.test.js — BLITZ GY-1: graveyard-activated self-recursion (CR 602.2).
 * "<mana>: Return this card from your graveyard to <your hand | the battlefield [tapped]>."
 * One shared recognizer (parseGraveyardSelfRecursion) feeds the legalChoices enumerator, the
 * dispatcher, and the coverage classifier, so offer/pay/metric cannot drift. The ability goes ON
 * THE STACK (GY_SELF_RETURN resolver) — the resolver re-checks the card is still in the graveyard
 * and fizzles cleanly if it left (never a fabricated return).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseGraveyardSelfRecursion } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const REASSEMBLING = { id: "rsk", name: "Reassembling Skeleton", type: "Creature — Skeleton Warrior", mana: "{B}",
  power: "1", toughness: "1", oracle: "{1}{B}: Return this card from your graveyard to the battlefield tapped." };
const SANITARIUM = { id: "ssk", name: "Sanitarium Skeleton", type: "Creature — Skeleton", mana: "{B}",
  power: "1", toughness: "2", oracle: "{2}{B}: Return this card from your graveyard to your hand." };

describe("recognizer + classify", () => {
  it("parses both destinations; entersTapped rides the battlefield form", () => {
    expect(parseGraveyardSelfRecursion(REASSEMBLING)).toMatchObject({ dest: "battlefield", entersTapped: true, manaPips: "{1}{B}" });
    expect(parseGraveyardSelfRecursion(SANITARIUM)).toMatchObject({ dest: "hand", entersTapped: false, manaPips: "{2}{B}" });
    expect(parseGraveyardSelfRecursion({ oracle: "{1}{B}: Return this card from your graveyard to the battlefield tapped. You lose 1 life." })).toBe(null); // rider → unmodeled
  });
  it("both cards flip native-activated", () => {
    expect(classifyCard(REASSEMBLING)).toBe("native-activated");
    expect(classifyCard(SANITARIUM)).toBe("native-activated");
  });
});

describe("runtime — offer, stack, resolve to each destination; fizzle when gone", () => {
  const swamp = (id) => createPermanent({ id, card: { name: "Swamp", type: "Basic Land — Swamp", oracle: "{T}: Add {B}." }, controller: "user", summoningSick: false });

  function board(gyCards) {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    return {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 4,
      players: { ...s.players, user: { ...s.players.user, graveyard: gyCards, battlefield: [swamp("s1"), swamp("s2"), swamp("s3")], hand: [] } },
    };
  }
  const gyOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-gy-recursion");

  it("Reassembling Skeleton: offered from the graveyard, resolves to the battlefield TAPPED", () => {
    let s = board([REASSEMBLING]);
    const offers = gyOffers(s);
    expect(offers).toHaveLength(1);
    s = dispatchAction(s, offers[0]);
    expect(s.stack).toHaveLength(1);
    s = resolveTopOfStack(s);
    const perm = s.players.user.battlefield.find((p) => p.card.id === "rsk");
    expect(perm).toBeTruthy();
    expect(perm.tapped).toBe(true);
    expect(s.players.user.graveyard.some((c) => c.id === "rsk")).toBe(false);
  });

  it("Sanitarium Skeleton: resolves to the HAND", () => {
    let s = board([SANITARIUM]);
    s = dispatchAction(s, gyOffers(s)[0]);
    s = resolveTopOfStack(s);
    expect(s.players.user.hand.some((c) => c.id === "ssk")).toBe(true);
    expect(s.players.user.battlefield.some((p) => p.card?.id === "ssk")).toBe(false);
  });

  it("CREED — the card leaving the graveyard in response makes the ability a clean fizzle", () => {
    let s = board([REASSEMBLING]);
    s = dispatchAction(s, gyOffers(s)[0]);
    // The card vanishes from the graveyard while the ability is on the stack (exile in response).
    s = { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: [] } } };
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.some((p) => p.card?.id === "rsk")).toBe(false);
    expect((s.log || []).some((e) => e.effect === "gy-self-return" && e.fizzled)).toBe(true);
  });
});
