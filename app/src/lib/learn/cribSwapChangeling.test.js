/**
 * CRIB SWAP (EDHREC #2456) — "Changeling (This card is every creature type.) / Exile target creature. Its controller creates a 1/1
 * colorless Shapeshifter creature token with changeling."
 *
 * Two pieces the engine already had, which never met on this card:
 *   · Changeling on a Kindred spell is a characteristic-defining ability that works in every zone (CR 702.73a) — the cast watchers
 *     already read a changeling spell as every creature type (everyCreatureType.cardIsEveryCreatureType, P·39b). The line is no part
 *     of what the spell does as it resolves, so the spell program leaves it out (castModifiers.stripChangelingLine), as it leaves
 *     out devoid (CR 702.114a).
 *   · The target's controller's token (CR 608.2h — "its controller" is the exiled creature's controller as it left): the rider grammar
 *     read a coloured token only; a colorless one (CR 105.2c, 111.3) "with changeling" is the token the create-token atom already mints.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, moveCardToZone, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectProgram } from "./effects/parser.js";
import { permIsEveryCreatureType } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const CRIB_SWAP = {"name":"Crib Swap","type":"Kindred Instant — Shapeshifter","mana":"{2}{W}","cmc":3,"power":null,"toughness":null,"keywords":["Changeling"],"colors":["W"],"oracle":"Changeling (This card is every creature type.)\nExile target creature. Its controller creates a 1/1 colorless Shapeshifter creature token with changeling."};
const NAMELESS_INVERSION = {"name":"Nameless Inversion","type":"Kindred Instant — Shapeshifter","mana":"{1}{B}","cmc":2,"power":null,"toughness":null,"keywords":["Changeling"],"colors":["B"],"oracle":"Changeling (This card is every creature type.)\nTarget creature gets +3/-3 and loses all creature types until end of turn."};
const DEEPROOT_WATERS = {"name":"Deeproot Waters","type":"Enchantment","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Whenever you cast a Merfolk spell, create a 1/1 blue Merfolk creature token with hexproof. (A creature with hexproof can't be the target of spells or abilities your opponents control.)"};
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const CRAW_WURM = {"name":"Craw Wurm","type":"Creature — Wurm","mana":"{4}{G}{G}","cmc":6,"power":"6","toughness":"4","keywords":[],"colors":["G"],"oracle":""};

const P = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function pod({ userBoard = [P("mine", GRIZZLY_BEARS, "user")] } = {}) {
  const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const seat = (pid, battlefield, extra = {}) => ({ ...s0.players[pid], battlefield, ...extra });
  return { ...s0, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...s0.players,
      user: seat("user", userBoard, { hand: [{ ...CRIB_SWAP, id: "h-cs" }], manaPool: { W: 1, U: 0, B: 0, R: 0, G: 0, C: 2 } }),
      ai1: seat("ai1", [P("w1", CRAW_WURM, "ai1")]),
      ai2: seat("ai2", [P("b2", GRIZZLY_BEARS, "ai2")]),
      ai3: seat("ai3", []) } };
}
const castAt = (s0, targetId) => {
  const a = legalActionsForPlayer(s0, "user").find((x) => x.kind === "cast-spell" && x.cardId === "h-cs" && x.targets?.[0]?.id === targetId);
  expect(a, `Crib Swap offered at ${targetId}`).toBeTruthy();
  return dispatchAction(s0, a);
};
const tokensOf = (s, pid) => s.players[pid].battlefield.filter((p) => p.card?.token).map((p) => ({
  name: p.card.name, type: p.card.type, pt: `${p.card.power}/${p.card.toughness}`, colors: p.card.colors, everyType: permIsEveryCreatureType(s, p.id),
}));

describe("the reader", () => {
  it("⭐ the card plays its whole text", () => {
    expect(classifyCard(CRIB_SWAP)).toBe("native-spell");
  });
  it("⭐ one atom: the exile carrying its controller's colorless changeling token", () => {
    expect(parseEffectProgram(CRIB_SWAP)?.atoms).toEqual([{ op: "exile", targetType: "creature",
      controllerRider: { kind: "createToken", power: 1, toughness: 1, color: "colorless", subtype: "shapeshifter", changeling: true } }]);
  });
  it("CONTROL — a Kindred changeling spell whose body the engine can't read stays unread (Nameless Inversion)", () => {
    expect({ tier: classifyCard(NAMELESS_INVERSION), atoms: parseEffectProgram(NAMELESS_INVERSION)?.atoms || [] }).toEqual({ tier: "arbiter-spell", atoms: [] });
  });
  it("CONTROL — the coloured rider reads as before; another keyword on the colorless token stays unread", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Instant", oracle })?.atoms || [];
    expect({
      green: atoms("Exile target creature. Its controller creates a 1/1 green Shapeshifter creature token."),
      unknownKeyword: atoms("Exile target creature. Its controller creates a 1/1 colorless Shapeshifter creature token with changeling and banding."),
    }).toEqual({
      green: [{ op: "exile", targetType: "creature", controllerRider: { kind: "createToken", power: 1, toughness: 1, color: "green", subtype: "shapeshifter" } }],
      unknownKeyword: [],
    });
  });
});

describe("the cast", () => {
  it("⭐ an opponent's Wurm is exiled and that opponent gets a 1/1 colorless Shapeshifter that is every creature type; the caster gets nothing", () => {
    const s = resolveTopOfStack(castAt(pod(), "w1"));
    expect({
      wurmGone: !s.players.ai1.battlefield.some((p) => p.id === "w1"),
      wurmInExile: s.players.ai1.exile.some((c) => c.name === "Craw Wurm"),
      ai1Tokens: tokensOf(s, "ai1"), userTokens: tokensOf(s, "user"), ai2Tokens: tokensOf(s, "ai2"),
      spellInGraveyard: s.players.user.graveyard.some((c) => c.id === "h-cs"),
    }).toEqual({
      wurmGone: true, wurmInExile: true,
      ai1Tokens: [{ name: "Shapeshifter", type: "Token Creature — Shapeshifter", pt: "1/1", colors: [], everyType: true }],
      userTokens: [], ai2Tokens: [], spellInGraveyard: true,
    });
  });

  it("⭐ at the caster's own creature, the caster is its controller and gets the token", () => {
    const s = resolveTopOfStack(castAt(pod(), "mine"));
    expect({ mineGone: !s.players.user.battlefield.some((p) => p.id === "mine"), userTokens: tokensOf(s, "user").map((t) => t.everyType) }).toEqual({ mineGone: true, userTokens: [true] });
  });

  it("⭐ its ruling — the target gone before it resolves: the spell doesn't resolve and no player creates a Shapeshifter", () => {
    const onStack = castAt(pod(), "w1");
    const bounced = moveCardToZone(onStack, { playerId: "ai1", fromZone: "battlefield", toZone: "hand", cardId: "w1" });
    const s = resolveTopOfStack(bounced);
    expect({ ai1Tokens: tokensOf(s, "ai1"), userTokens: tokensOf(s, "user"), wurmInHand: s.players.ai1.hand.some((c) => c.name === "Craw Wurm"), spellInGraveyard: s.players.user.graveyard.some((c) => c.id === "h-cs") })
      .toEqual({ ai1Tokens: [], userTokens: [], wurmInHand: true, spellInGraveyard: true });
  });

  it("⭐ its own Changeling still works as it is cast: it is a Merfolk spell to Deeproot Waters", () => {
    const s0 = pod({ userBoard: [P("mine", GRIZZLY_BEARS, "user"), P("dw", DEEPROOT_WATERS, "user")] });
    let s = flushTriggers(castAt(s0, "w1"));
    expect(s.stack.map((o) => o.source?.name || o.card?.name)).toEqual(["Crib Swap", "Deeproot Waters"]);
    s = resolveTopOfStack(s);
    s = resolveTopOfStack(s);
    expect({ merfolk: tokensOf(s, "user").map((t) => t.name), ai1: tokensOf(s, "ai1").map((t) => t.name) }).toEqual({ merfolk: ["Merfolk"], ai1: ["Shapeshifter"] });
  });
});
