/**
 * TRUNK-ENTERSTAPPED (CR 614.1g) — "~ enters tapped" (Temples, Triomes, karoos, bounce lands, tapped duals,
 * a handful of tapped artifacts/creatures) now actually enters the battlefield TAPPED, so it can't be tapped
 * for mana the turn it's played — correct mana timing, which the sims depend on. Only the BARE, unconditional
 * form: a check / fast / reveal / shock land's gated tap is left untapped (the gate isn't evaluated — the
 * CREED-safe direction: never deny a player mana they might be owed).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { dispatchAction } from "./actionDispatcher.js";
import { enterPermanent } from "./resolvers.js";
import { entersTapped } from "./staticAbilityParser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const land = (name, oracle, type = "Land") => ({ id: `c-${name}`, name, type, mana: "", oracle });
const baseState = () => ({ ...createGameState({ userDeck: [], aiDeck: [] }), phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user" });
const withHand = (s, cards) => ({ ...s, players: { ...s.players, user: { ...s.players.user, hand: cards } } });
const playLand = (c) => dispatchAction(withHand(baseState(), [c]), { kind: "play-land", playerId: "user", cardId: c.id, name: c.name });
const lastBf = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];

describe("TRUNK-ENTERSTAPPED — the helper (bare vs conditional)", () => {
  it("bare 'enters tapped' → true", () => {
    expect(entersTapped(land("Triome", "Savai Triome enters tapped. {T}: Add {R}, {W}, or {B}."))).toBe(true);
    expect(entersTapped(land("Temple", "Temple of Triumph enters tapped. When Temple of Triumph enters, scry 1."))).toBe(true);
    expect(entersTapped(land("Bog", "Bojuka Bog enters the battlefield tapped."))).toBe(true);
  });
  it("conditional / choice forms → false (left untapped, CREED-safe)", () => {
    expect(entersTapped(land("Check", "Glacial Fortress enters tapped unless you control a Plains or an Island."))).toBe(false);
    expect(entersTapped(land("Reveal", "As Game Trail enters, you may reveal a Mountain or Forest card from your hand. If you don't, Game Trail enters tapped."))).toBe(false);
    expect(entersTapped(land("Shock", "As Steam Vents enters, you may pay 2 life. If you don't, it enters tapped."))).toBe(false);
    expect(entersTapped(land("Fast", "Rockfall Vale enters tapped unless you control two or more other lands."))).toBe(false);
    expect(entersTapped(land("Basic", "{T}: Add {G}."))).toBe(false);
  });
});

describe("TRUNK-ENTERSTAPPED — engine: lands (play-land path)", () => {
  it("a Triome played from hand is TAPPED on the battlefield", () => {
    const s = playLand(land("Savai Triome", "Savai Triome enters tapped. {T}: Add {R}, {W}, or {B}."));
    expect(lastBf(s).card.name).toBe("Savai Triome");
    expect(lastBf(s).tapped).toBe(true);
  });
  it("a basic land enters UNTAPPED (available for mana)", () => {
    const s = playLand(land("Forest", "", "Basic Land — Forest"));
    expect(lastBf(s).tapped).toBe(false);
  });
  it("a check land (conditional) enters UNTAPPED (gate not evaluated — safe)", () => {
    const s = playLand(land("Glacial Fortress", "Glacial Fortress enters tapped unless you control a Plains or an Island. {T}: Add {W} or {U}."));
    expect(lastBf(s).tapped).toBe(false);
  });
});

describe("TRUNK-ENTERSTAPPED — engine: cast permanents (enterPermanent path)", () => {
  it("a tapped artifact (Moss Diamond) enters tapped", () => {
    const s = enterPermanent(baseState(), { id: "md", name: "Moss Diamond", type: "Artifact", mana: "{2}", oracle: "Moss Diamond enters tapped.\n{T}: Add {G}." }, "user");
    expect(lastBf(s).card.name).toBe("Moss Diamond");
    expect(lastBf(s).tapped).toBe(true);
  });
  it("an ordinary creature is NOT force-tapped", () => {
    const s = enterPermanent(baseState(), { id: "bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" }, "user");
    expect(lastBf(s).tapped).toBe(false);
  });
});
