/**
 * xCastToken.test.js — the X-cast token-maker commander trigger (Zaxara). The parser predicate + the
 * end-to-end cast→trigger flow: casting a spell with {X} makes a 0/0 Hydra token that enters with X
 * +1/+1 counters (a real X/X), not a 0/0 that dies to the SBA.
 */
import { describe, it, expect } from "vitest";
import { parseXCastTokenTrigger, applyXCastTokenTriggers } from "./xCastToken.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";

const ZAXARA_ORACLE =
  "Deathtouch\n{T}: Add two mana of any one color.\nWhenever you cast a spell with {X} in its mana cost, create a 0/0 green Hydra creature token, then put X +1/+1 counters on it.";

describe("parseXCastTokenTrigger", () => {
  it("parses Zaxara's X-cast token trigger", () => {
    expect(parseXCastTokenTrigger({ oracle: ZAXARA_ORACLE })).toEqual({ count: 1, power: 0, toughness: 0, descriptor: "green Hydra" });
  });
  it("returns null for a non-matching card", () => {
    expect(parseXCastTokenTrigger({ oracle: "Whenever you cast a spell, draw a card." })).toBeNull();
    expect(parseXCastTokenTrigger({ oracle: "Flying" })).toBeNull();
    expect(parseXCastTokenTrigger({})).toBeNull();
  });
});

describe("applyXCastTokenTriggers — direct", () => {
  const withZaxara = () => {
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const zax = createPermanent({ card: { name: "Zaxara, the Exemplary", type: "Legendary Creature — Nightmare Hydra", power: 3, toughness: 3, oracle: ZAXARA_ORACLE }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [zax] } } };
  };
  const hydraTokens = (s, pid) => s.players[pid].battlefield.filter((p) => p.card.token && /Hydra/.test(p.card.type));

  it("an {X} cast for X=4 makes a 0/0 Hydra token with 4 +1/+1 counters (a real 4/4)", () => {
    const out = applyXCastTokenTriggers(withZaxara(), { spellCard: { name: "Hungering Hydra", mana: "{X}{G}" }, casterId: "user", xValue: 4 });
    const toks = hydraTokens(out, "user");
    expect(toks).toHaveLength(1);
    expect(toks[0].counters["+1/+1"]).toBe(4);
  });
  it("a non-X cast makes no token (no xValue / no {X} in cost)", () => {
    expect(hydraTokens(applyXCastTokenTriggers(withZaxara(), { spellCard: { name: "Bolt", mana: "{R}" }, casterId: "user", xValue: undefined }), "user")).toHaveLength(0);
    expect(hydraTokens(applyXCastTokenTriggers(withZaxara(), { spellCard: { name: "Sol Ring", mana: "{1}" }, casterId: "user", xValue: 0 }), "user")).toHaveLength(0);
  });
  it("only fires for the controller's own Zaxara, not an opponent's cast", () => {
    // applyXCastTokenTriggers keys off casterId — an AI cast doesn't make the user's Zaxara fire.
    const out = applyXCastTokenTriggers(withZaxara(), { spellCard: { name: "Hydra", mana: "{X}{G}" }, casterId: "ai", xValue: 5 });
    expect(hydraTokens(out, "user")).toHaveLength(0);
    expect(hydraTokens(out, "ai")).toHaveLength(0);
  });
});

describe("ZAXARA X-CAST — end-to-end through the real cast dispatch", () => {
  it("casting Hungering Hydra for X=3 with Zaxara out spawns a 3/3 Hydra token", () => {
    _resetIdsForTests();
    let s = createGameState({ userDeck: [], aiDeck: [] });
    const zax = createPermanent({ card: { name: "Zaxara, the Exemplary", type: "Legendary Creature — Nightmare Hydra", power: 3, toughness: 3, oracle: ZAXARA_ORACLE }, controller: "user" });
    const hydra = { id: "hyd", name: "Hungering Hydra", type: "Creature — Hydra", mana: "{X}{G}", power: 0, toughness: 0, oracle: "This creature enters with X +1/+1 counters on it." };
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [zax], hand: [hydra], manaPool: { ...s.players.user.manaPool, G: 2, C: 8 } } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "hyd" && a.xValue === 3);
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast); // Zaxara's trigger fires on cast (the Hydra spell is still on the stack)
    const toks = s.players.user.battlefield.filter((p) => p.card.token && /Hydra/.test(p.card.type));
    expect(toks).toHaveLength(1);
    expect(toks[0].counters["+1/+1"]).toBe(3); // the token is a real 3/3
  });
});
