/**
 * dfcEntersTapped.test.js — an opponents-enter-tapped imposition (Kismet, Imposing Sovereign) reads the entering permanent's FRONT
 * face, never its back face.
 *
 * The rules (bundled CR): a double-faced card put onto the battlefield from a zone other than the stack enters front face up by
 * default (CR 712.14), a double-faced spell is cast front face up (CR 712.11), and a double-faced permanent with its front face up
 * has only its front face's characteristics (CR 712.8d). In-game multi-face cards carry Scryfall's COMBINED type line
 * ("Front // Back"), and impositionEntersTapped tested its type words against that whole line: Kismet's "Artifacts, creatures,
 * and lands your opponents control enter tapped" tapped an entering Growing Rites of Itlimoc (a Legendary Enchantment whose
 * back face is a Legendary Land) and Imposing Sovereign's "Creatures your opponents control enter tapped" tapped an entering
 * Westvale Abbey (a Land whose back face is a Legendary Creature). Every entry site consults this one reader (the land drop,
 * enterPermanent's replacement pass), so the fix is one read: faceUp.characteristicTypeLine.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-18; the trailing comment is the card's tier and EDHREC
 * rank), the enriched game-deck shape.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { impositionEntersTapped } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KISMET = {"name":"Kismet","type":"Enchantment","mana":"{3}{W}","cmc":4,"keywords":[],"colors":["W"],"oracle":"Artifacts, creatures, and lands your opponents control enter tapped."}; // native-static #11991
const IMPOSING_SOVEREIGN = {"name":"Imposing Sovereign","type":"Creature — Human Noble","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["W"],"oracle":"Creatures your opponents control enter tapped."}; // native-static #12415
const GROWING_RITES = {"name":"Growing Rites of Itlimoc // Itlimoc, Cradle of the Sun","type":"Legendary Enchantment // Legendary Land","mana":"{2}{G}","cmc":3,"keywords":["Transform"],"colors":[],"oracle":"Growing Rites of Itlimoc - Legendary Enchantment {2}{G}\nWhen Growing Rites of Itlimoc enters, look at the top four cards of your library. You may reveal a creature card from among them and put it into your hand. Put the rest on the bottom of your library in any order.\nAt the beginning of your end step, if you control four or more creatures, transform Growing Rites of Itlimoc.\n//\nItlimoc, Cradle of the Sun - Legendary Land \n(Transforms from Growing Rites of Itlimoc.)\n{T}: Add {G}.\n{T}: Add {G} for each creature you control.","layout":"transform"}; // body-only #572
const WESTVALE_ABBEY = {"name":"Westvale Abbey // Ormendahl, Profane Prince","type":"Land // Legendary Creature — Demon","mana":"","cmc":0,"keywords":["Flying","Lifelink","Indestructible","Transform","Haste"],"colors":[],"oracle":"Westvale Abbey - Land \n{T}: Add {C}.\n{5}, {T}, Pay 1 life: Create a 1/1 white and black Human Cleric creature token.\n{5}, {T}, Sacrifice five creatures: Transform this land, then untap it.\n//\nOrmendahl, Profane Prince - Legendary Creature — Demon \nFlying, lifelink, indestructible, haste","layout":"transform"}; // land #1496
const GRIZZLY_BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body #8126
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
const perm = (card, id, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
/** The user's precombat main phase with an empty stack; the AI controls the imposition. */
function board({ hand = [], aiBf = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [], consecutivePasses: 0,
    players: { ...g.players,
      user: { ...g.players.user, hand, library: [{ ...GRIZZLY_BEARS, id: "lib1" }], graveyard: [], battlefield: [], landsPlayedThisTurn: 0, manaPool: { ...EMPTY_POOL, ...pool } },
      ai: { ...g.players.ai, hand: [], battlefield: aiBf, manaPool: { ...EMPTY_POOL } } } };
}
/** The user plays or casts `card` (the first offer for it) and the stack resolves; is the permanent it became tapped? */
function entersTapped(card, imposer, pool = {}) {
  const s0 = board({ hand: [{ ...card, id: "h1" }], aiBf: [perm(imposer, "imp", "ai")], pool });
  const offer = legalActionsForPlayer(s0, "user").find((a) => a.cardId === "h1" && (a.kind === "play-land" || a.kind === "cast-spell"));
  expect(offer).toBeTruthy();
  let s = dispatchAction(s0, offer);
  while (s.stack.length) s = resolveTopOfStack(s);
  const entered = s.players.user.battlefield.find((p) => p.card?.name === card.name);
  expect(entered).toBeTruthy();
  return !!entered.tapped;
}

describe("⭐ the opponents-enter-tapped impositions read the entering permanent's front face", () => {
  it("⭐ Imposing Sovereign does not tap an entering Westvale Abbey (a land; its back face is the creature)", () => {
    expect(entersTapped(WESTVALE_ABBEY, IMPOSING_SOVEREIGN)).toBe(false);
  });

  it("⭐ Kismet does not tap an entering Growing Rites of Itlimoc (an enchantment; its back face is the land)", () => {
    expect(entersTapped(GROWING_RITES, KISMET, { G: 3 })).toBe(false);
    expect(impositionEntersTapped(board({ aiBf: [perm(KISMET, "imp", "ai")] }), GROWING_RITES, "user")).toBe(false);
  });

  it("control — Kismet taps an entering Forest and Westvale Abbey; Imposing Sovereign taps an entering Grizzly Bears", () => {
    expect({ forest: entersTapped(FOREST, KISMET), abbey: entersTapped(WESTVALE_ABBEY, KISMET), bears: entersTapped(GRIZZLY_BEARS, IMPOSING_SOVEREIGN, { G: 2 }) })
      .toEqual({ forest: true, abbey: true, bears: true });
  });
});
