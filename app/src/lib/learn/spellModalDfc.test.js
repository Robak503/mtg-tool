/**
 * SPELL // SPELL MODAL DFCs — the play-weighted program, P·38: BIRGI, GOD OF STORYTELLING // HARNFEL, HORN OF BOUNTY (EDHREC #489).
 *
 * CR 712.11b — a player casting a modal double-faced card chooses which face they cast; CR 712.8f — on the stack and the
 * battlefield it has only the characteristics of the face that's up (in the hand, only the front's — 712.8a). modalDfc.parseSpellModalDfc /
 * spellMdfcFaceCards project each face (the card's id; the face's name, type, oracle, mana, mana value, power/toughness).
 * coverage: native iff BOTH faces are native on their own views (the front's tier). The shared cast builder offers each face
 * of such a card — never the combined card — so every lane gets both faces: the hand, and the command zone with its tax. A
 * face cast as a permanent carries the whole card as printedCard (the V1 machinery), so leaving the battlefield restores it.
 *
 * The fixture is the engine's own card shape (cardIndex.publicCard over the bundled Scryfall data, probed 2026-10-01).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentIsCreature } from "./layers.js";
import { classifyCard } from "./coverage.js";
import { parseSpellModalDfc } from "./modalDfc.js";

beforeEach(() => _resetIdsForTests());

const BIRGI_HARNFEL = { name: "Birgi, God of Storytelling // Harnfel, Horn of Bounty", type: "Legendary Creature — God // Legendary Artifact", mana: "{2}{R}", cmc: 3, power: "3", toughness: "3", keywords: [], layout: "modal_dfc",
  oracle: "Birgi, God of Storytelling - Legendary Creature — God {2}{R}\nWhenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once.\n//\nHarnfel, Horn of Bounty - Legendary Artifact {4}{R}\nDiscard a card: Exile the top two cards of your library. You may play those cards this turn.",
  card_faces: [
    { name: "Birgi, God of Storytelling", mana_cost: "{2}{R}", type_line: "Legendary Creature — God", oracle_text: "Whenever you cast a spell, add {R}. Until end of turn, you don't lose this mana as steps and phases end.\nCreatures you control can boast twice during each of your turns rather than once.", power: "3", toughness: "3" },
    { name: "Harnfel, Horn of Bounty", mana_cost: "{4}{R}", type_line: "Legendary Artifact", oracle_text: "Discard a card: Exile the top two cards of your library. You may play those cards this turn.", power: null, toughness: null },
  ] };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", keywords: [], oracle: "" };

function board({ hand = [], command = [], pool = { R: 5 }, commanderCasts = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s.players, user: { ...s.players.user, hand, command, manaPool: { ...s.players.user.manaPool, ...pool }, commanderCastCount: commanderCasts, library: [1, 2, 3].map((i) => ({ ...BEARS, id: `ul${i}` })) } } };
}
const casts = (s, id = "bh") => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
const faceCast = (s, faceName) => casts(s).find((a) => a.faceCard?.name === faceName);

const ESIKA = { name: "Esika, God of the Tree // The Prismatic Bridge", type: "Legendary Creature — God // Legendary Enchantment", mana: "{1}{G}{G}", cmc: 3, power: "1", toughness: "4", keywords: ["Vigilance"], layout: "modal_dfc",
  oracle: "Esika, God of the Tree - Legendary Creature — God {1}{G}{G}\nVigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and \"{T}: Add one mana of any color.\"\n//\nThe Prismatic Bridge - Legendary Enchantment {W}{U}{B}{R}{G}\nAt the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.",
  card_faces: [
    { name: "Esika, God of the Tree", mana_cost: "{1}{G}{G}", type_line: "Legendary Creature — God", oracle_text: "Vigilance\n{T}: Add one mana of any color.\nOther legendary creatures you control have vigilance and \"{T}: Add one mana of any color.\"", power: "1", toughness: "4" },
    { name: "The Prismatic Bridge", mana_cost: "{W}{U}{B}{R}{G}", type_line: "Legendary Enchantment", oracle_text: "At the beginning of your upkeep, reveal cards from the top of your library until you reveal a creature or planeswalker card. Put that card onto the battlefield and the rest on the bottom of your library in a random order.", power: null, toughness: null },
  ] };
const DISCIPLE = { name: "Disciple of Freyalise // Garden of Freyalise", type: "Creature — Elf Druid // Land", mana: "{3}{G}{G}{G}", cmc: 6, power: "3", toughness: "3", keywords: [], layout: "modal_dfc",
  oracle: "Disciple of Freyalise - Creature — Elf Druid {3}{G}{G}{G}\nWhen this creature enters, you may sacrifice another creature. If you do, you gain X life and draw X cards, where X is that creature's power.\n//\nGarden of Freyalise - Land \nAs this land enters, you may pay 3 life. If you don't, it enters tapped.\n{T}: Add {G}." };

describe("classify", () => {
  it("Birgi // Harnfel → native-mixed (both faces native on their own views)", () => {
    expect(classifyCard(BIRGI_HARNFEL)).toBe("native-mixed");
  });
  it("BOTH faces, never the front alone: Esika (its front native, The Prismatic Bridge not) stays uncredited and is cast as before", () => {
    const s = board({ hand: [{ ...ESIKA, id: "bh" }], pool: { G: 3 } });
    expect({ tier: classifyCard(ESIKA), faceCasts: casts(s).filter((a) => a.faceCard).length }).toEqual({ tier: "body-only", faceCasts: 0 });
  });
  it("a LAND-back modal DFC is never a spell // spell one (it stays parseModalDfc's: the land drop)", () => {
    expect(parseSpellModalDfc(DISCIPLE)).toBe(null);
  });
});

describe("cast either face (CR 712.11b)", () => {
  it("⭐ from the hand: both faces are offered, each at its own cost and mana value — never the combined card", () => {
    const offers = casts(board({ hand: [{ ...BIRGI_HARNFEL, id: "bh" }] })).map((a) => [a.faceCard?.name ?? null, a.cost?.R ?? 0, a.cost?.generic ?? 0, a.faceCard?.cmc]);
    console.log("  WITNESS spellMdfcOffers", JSON.stringify(offers)); // vitest 4 needs --disable-console-intercept
    expect(offers).toEqual([["Birgi, God of Storytelling", 1, 2, 3], ["Harnfel, Horn of Bounty", 1, 4, 5]]);
  });

  it("cast as Birgi: a 3/3 God creature, carrying the whole card; when it leaves, the whole card goes to the graveyard", () => {
    const s0 = board({ hand: [{ ...BIRGI_HARNFEL, id: "bh" }] });
    const s = resolveTopOfStack(dispatchAction(s0, faceCast(s0, "Birgi, God of Storytelling")));
    const perm = s.players.user.battlefield[0];
    const gone = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: perm.id });
    expect({ name: perm.card.name, creature: permanentIsCreature(s, perm.id), pt: [perm.card.power, perm.card.toughness], printed: perm.printedCard?.name, graveyard: gone.players.user.graveyard.map((c) => c.name) })
      .toEqual({ name: "Birgi, God of Storytelling", creature: true, pt: ["3", "3"], printed: BIRGI_HARNFEL.name, graveyard: [BIRGI_HARNFEL.name] });
  });

  it("cast as Harnfel: a legendary artifact — not a creature — whose discard ability is offered", () => {
    const s0 = board({ hand: [{ ...BIRGI_HARNFEL, id: "bh" }, { ...BEARS, id: "fodder" }] });
    const s = resolveTopOfStack(dispatchAction(s0, faceCast(s0, "Harnfel, Horn of Bounty")));
    const perm = s.players.user.battlefield[0];
    const ability = legalActionsForPlayer(s, "user").some((a) => a.kind === "activate-ability" && a.permanentId === perm.id);
    expect({ name: perm.card.name, creature: permanentIsCreature(s, perm.id), pt: [perm.card.power, perm.card.toughness], ability })
      .toEqual({ name: "Harnfel, Horn of Bounty", creature: false, pt: [null, null], ability: true }); // its own face's (none), never Birgi's 3/3
  });

  it("from the command zone (Birgi as commander): both faces, each with the commander tax", () => {
    const offers = casts(board({ command: [{ ...BIRGI_HARNFEL, id: "bh", isCommander: true }], pool: { R: 9 }, commanderCasts: { bh: 1 } })).map((a) => [a.faceCard?.name ?? null, a.cost?.generic ?? 0]);
    expect(offers).toEqual([["Birgi, God of Storytelling", 4], ["Harnfel, Horn of Bounty", 6]]);
  });
});
