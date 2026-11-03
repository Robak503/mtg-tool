/**
 * THE FREE IMPULSE PLAY — the play-weighted program.
 *   Urza, Lord High Artificer (EDHREC #805): "{5}: Shuffle your library, then exile the top card. Until end of turn, you may play
 *     that card without paying its mana cost."
 *   Mind's Desire (#3619, twin): "Shuffle your library. Then exile the top card of your library. Until end of turn, you may play that
 *     card without paying its mana cost." + Storm.
 *
 * The impulse-exile stamp with `_impulseFree`: a nonland is cast without paying its mana cost (CR 118.9 — X is 0, additional costs
 * still apply) through the shared free-cast builder, at the timing a paid cast of it would need — Urza's ruling: "Urza's last ability
 * doesn't change when you can play the exiled card. For example, if you exile a sorcery card, you can cast it only during your main
 * phase when the stack is empty. If you exile a land card, you can play it only during your main phase and only if you have an
 * available land play remaining." The permission lapses at cleanup; the card stays in exile ("If you don't play the card exiled with
 * Urza's last ability, it remains in exile.").
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard, isNativeTier } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, nextStep } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

const URZA = {"name":"Urza, Lord High Artificer","type":"Legendary Creature — Human Artificer","mana":"{2}{U}{U}","cmc":4,"power":"1","toughness":"4","keywords":[],"colors":["U"],"oracle":"When Urza enters, create a 0/0 colorless Construct artifact creature token with \"This token gets +1/+1 for each artifact you control.\"\nTap an untapped artifact you control: Add {U}.\n{5}: Shuffle your library, then exile the top card. Until end of turn, you may play that card without paying its mana cost."};
const MINDS_DESIRE = {"name":"Mind's Desire","type":"Sorcery","mana":"{4}{U}{U}","cmc":6,"power":null,"toughness":null,"keywords":["Storm"],"colors":["U"],"oracle":"Shuffle your library. Then exile the top card of your library. Until end of turn, you may play that card without paying its mana cost.\nStorm (When you cast this spell, copy it for each spell cast before it this turn.)"};
const FALLEN_SHINOBI = {"name":"Fallen Shinobi","type":"Creature — Zombie Ninja","mana":"{3}{U}{B}","cmc":5,"power":"5","toughness":"4","keywords":["Ninjutsu"],"colors":["B","U"],"oracle":"Ninjutsu {2}{U}{B} ({2}{U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand tapped and attacking.)\nWhenever this creature deals combat damage to a player, that player exiles the top two cards of their library. Until end of turn, you may play those cards without paying their mana costs."};
const ORACLES_VAULT = {"name":"Oracle's Vault","type":"Artifact","mana":"{4}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{2}, {T}: Exile the top card of your library. Until end of turn, you may play that card. Put a brick counter on this artifact.\n{T}: Exile the top card of your library. Until end of turn, you may play that card without paying its mana cost. Activate only if there are three or more brick counters on this artifact."};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"};
const BLAZE = {"name":"Blaze","type":"Sorcery","mana":"{X}{R}","cmc":1,"power":null,"toughness":null,"keywords":[],"colors":["R"],"oracle":"Blaze deals X damage to any target."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};

const POOL5 = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 5 };
const libOf = (card, n = 3, tag = "L") => Array.from({ length: n }, (_, i) => ({ ...card, id: `${tag}${i}` }));
/** Urza on the battlefield with {5} floating; `library` the user's whole library; `active` whose turn it is. */
function table({ library = libOf(DIVINATION), active = "user", step = "main", phase = "precombat-main", pool = POOL5, landsPlayed = 0 } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const urza = createPermanent({ id: "urza", card: { ...URZA, id: "c-urza" }, controller: "user", summoningSick: false });
  const players = { ...s0.players,
    user: { ...s0.players.user, battlefield: [urza], hand: [], library, manaPool: { ...pool }, landsPlayedThisTurn: landsPlayed },
    ai: { ...s0.players.ai, battlefield: [], hand: [], library: libOf(BEARS, 5, "A") } };
  return { ...s0, players, turn: 6, phase, step, activePlayer: active, priorityHolder: "user", stack: [], pendingTriggers: [], consecutivePasses: 0 };
}
const urzaAct = (s) => legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "urza" && /Shuffle your library/.test(a.abilityText || a.effectText || a.text || JSON.stringify(a)));
function activateUrza(s) {
  const a = urzaAct(s);
  expect(a, "Urza's {5} ability offered").toBeTruthy();
  s = flushTriggers(dispatchAction(s, a));
  return flushTriggers(resolveTopOfStack(s));
}
const exiledOffers = (s) => legalActionsForPlayer(s, "user").filter((a) => (a.kind === "cast-spell" || a.kind === "play-land") && a.fromZone === "exile");
const manaLeft = (s) => Object.values(s.players.user.manaPool).reduce((x, y) => x + y, 0);

describe("the reader", () => {
  it("⭐ Urza and Mind's Desire play their whole text", () => {
    expect({ urza: isNativeTier(classifyCard(URZA)), desire: classifyCard(MINDS_DESIRE) }).toEqual({ urza: true, desire: "native-spell" });
  });
  it("CONTROL — Fallen Shinobi (another player's library, two cards) and Oracle's Vault (its paid line adds a counter) stay parked", () => {
    expect({ shinobi: isNativeTier(classifyCard(FALLEN_SHINOBI)), vault: isNativeTier(classifyCard(ORACLES_VAULT)) }).toEqual({ shinobi: false, vault: false });
  });
});

describe("Urza's {5} — the game", () => {
  it("⭐ the ability shuffles, then exiles the top card face up with the free permission; {5} is spent", () => {
    const s = activateUrza(table());
    expect(s.players.user.exile.map((c) => ({ name: c.name, impulse: !!c._impulse, free: !!c._impulseFree }))).toEqual([{ name: "Divination", impulse: true, free: true }]);
    expect(s.players.user.library).toHaveLength(2);
    expect(manaLeft(s)).toBe(0);
    expect((s.log || []).some((e) => e.effect === "shuffle" || e.kind === "shuffle" || /shuffle/i.test(String(e.effect || e.kind || "")))).toBe(true);
  });
  it("⭐ a sorcery is offered free in your main phase with the stack empty, and cast without paying its mana cost — it resolves", () => {
    let s = activateUrza(table({ library: [...libOf(DIVINATION, 1, "D"), ...libOf(BEARS, 0)] }));
    const offers = exiledOffers(s);
    expect(offers.map((a) => ({ name: a.name, free: !!a.freeCast }))).toEqual([{ name: "Divination", free: true }]);
    s = flushTriggers(dispatchAction(s, offers[0]));
    expect(manaLeft(s)).toBe(0); // nothing was paid (the {5} was already spent; the pool stays empty)
    s = flushTriggers(resolveTopOfStack(s));
    expect({ exile: s.players.user.exile.length, graveyard: s.players.user.graveyard.map((c) => c.name) }).toEqual({ exile: 0, graveyard: ["Divination"] });
    expect(exiledOffers(s)).toEqual([]); // it left exile: never offered twice
  });
  it("⭐ the sorcery's timing holds: activated on an opponent's turn, the exiled sorcery is not offered (it stays exiled)", () => {
    const s = { ...activateUrza(table({ active: "ai" })), priorityHolder: "user" };
    expect(s.players.user.exile.map((c) => c.name)).toEqual(["Divination"]);
    expect(exiledOffers(s)).toEqual([]);
  });
  it("⭐ an instant is offered free at instant speed — on an opponent's turn too", () => {
    const s = { ...activateUrza(table({ active: "ai", library: libOf(OPT) })), priorityHolder: "user" }; // priority passed back to the user
    expect(exiledOffers(s).map((a) => ({ name: a.name, free: !!a.freeCast }))).toEqual([{ name: "Opt", free: true }]);
  });
  it("⭐ a land is played as your land play — only while one is left (it has no mana cost to skip)", () => {
    const fresh = activateUrza(table({ library: libOf(FOREST) }));
    expect(exiledOffers(fresh).map((a) => ({ kind: a.kind, name: a.name }))).toEqual([{ kind: "play-land", name: "Forest" }]);
    const played = flushTriggers(dispatchAction(fresh, exiledOffers(fresh)[0]));
    expect(played.players.user.battlefield.map((p) => p.card.name).sort()).toEqual(["Forest", "Urza, Lord High Artificer"]);
    const spent = activateUrza(table({ library: libOf(FOREST), landsPlayed: 1 }));
    expect(exiledOffers(spent)).toEqual([]);
  });
  it("⭐ an X spell is cast with X = 0 (CR 107.3b, the ruling)", () => {
    const s = activateUrza(table({ library: libOf(BLAZE) }));
    const offers = exiledOffers(s);
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.map((a) => ({ free: !!a.freeCast, x: a.xValue }))).toEqual(offers.map(() => ({ free: true, x: 0 })));
  });
  it("⭐ the permission ends with the turn: the card stays in exile, no longer playable", () => {
    let s = activateUrza(table({ library: libOf(OPT) }));
    expect(exiledOffers(s)).toHaveLength(1);
    s = { ...s, phase: "ending", step: "end", consecutivePasses: 0 };
    s = nextStep(s); // → cleanup (CR 514.2 — "until end of turn" ends)
    const later = { ...s, turn: s.turn + 1, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], consecutivePasses: 0 };
    expect(later.players.user.exile.map((c) => ({ name: c.name, impulse: !!c._impulse, free: !!c._impulseFree }))).toEqual([{ name: "Opt", impulse: false, free: false }]);
    expect(exiledOffers(later)).toEqual([]);
  });
  it("⭐ the default AI, holding the free permission, takes the free cast", () => {
    const s = activateUrza(table({ library: libOf(DIVINATION) }));
    const asAi = { ...s, activePlayer: "ai", priorityHolder: "ai", players: { ...s.players, ai: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => ({ ...p, controller: "ai" })) }, user: { ...s.players.ai } } };
    const offers = legalActionsForPlayer(asAi, "ai").filter((a) => a.fromZone === "exile");
    expect(offers.map((a) => a.name)).toEqual(["Divination"]);
    const pick = pickAction(asAi, "ai", legalActionsForPlayer(asAi, "ai"));
    expect({ kind: pick?.kind, name: pick?.name, free: !!pick?.freeCast }).toEqual({ kind: "cast-spell", name: "Divination", free: true });
  });
});

describe("CONTROL — the paid impulse is unchanged", () => {
  it("a plain impulse stamp still costs its mana", () => {
    const s0 = table({ library: libOf(DIVINATION) });
    const paidCard = { ...DIVINATION, id: "paid", _impulse: true, _impulseTurn: s0.turn };
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, exile: [paidCard], manaPool: { W: 0, U: 3, B: 0, R: 0, G: 0, C: 0 } } } };
    const offers = exiledOffers(s);
    expect(offers.map((a) => ({ name: a.name, free: !!a.freeCast }))).toEqual([{ name: "Divination", free: false }]);
  });
});

describe("Mind's Desire — the twin", () => {
  it("⭐ cast as the second spell this turn (storm 1): two cards exiled, each free to play", () => {
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = { ...s, turn: 6, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, hand: [{ ...MINDS_DESIRE, id: "md" }], library: libOf(OPT, 4), manaPool: { W: 0, U: 6, B: 0, R: 0, G: 0, C: 0 }, spellsCastThisTurn: 1 } } };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "md");
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    for (let g = 0; g < 10 && s.stack.length; g++) s = flushTriggers(resolveTopOfStack(s));
    expect(s.players.user.exile.map((c) => ({ name: c.name, free: !!c._impulseFree }))).toEqual([{ name: "Opt", free: true }, { name: "Opt", free: true }]);
    expect(exiledOffers(s).map((a) => ({ name: a.name, free: !!a.freeCast }))).toEqual([{ name: "Opt", free: true }, { name: "Opt", free: true }]);
  });
});

describe("found on the way — Dauthi Voidwalker's free play held to its timing (its ruling)", () => {
  // "Playing a card with Dauthi Voidwalker's last ability is still subject to normal timing restrictions." The cross-player lane cast
  // the stamped card through the free builder, which skips the timing gate: an opponent's sorcery was offered on their own turn.
  const voidPlayed = (active, card) => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: "user", stack: [], consecutivePasses: 0,
      players: { ...s0.players, ai: { ...s0.players.ai, exile: [{ ...card, id: "v1", _impulse: true, _impulseFor: "user", _impulseFree: true, _impulseTurn: 5 }] } } };
  };
  const offered = (s) => legalActionsForPlayer(s, "user").filter((a) => a.fromZone === "exile").map((a) => ({ name: a.name, free: !!a.freeCast, from: a.fromPlayerId }));
  it("⭐ on an opponent's turn their sorcery is not offered", () => {
    expect(offered(voidPlayed("ai", DIVINATION))).toEqual([]);
  });
  it("on your own main phase it is, free, from its owner's exile", () => {
    expect(offered(voidPlayed("user", DIVINATION))).toEqual([{ name: "Divination", free: true, from: "ai" }]);
  });
  it("an instant is offered on an opponent's turn", () => {
    expect(offered(voidPlayed("ai", OPT))).toEqual([{ name: "Opt", free: true, from: "ai" }]);
  });
});
