/**
 * "AND/OR" IN THE TARGETED GRAVEYARD RETURN (play-weighted 2026-10-21):
 *   · Ishgard, the Holy See // Faith & Grief (EDHREC #1436) — the Town's Adventure: "Return up to two target artifact and/or enchantment
 *     cards from your graveyard to your hand.";
 *   · Scholar of the Ages — "When this creature enters, return up to two target instant and/or sorcery cards from your graveyard to
 *     your hand."
 * Each target is a card of either type — an artifact enchantment is both (CR 601.2c checks each target on its own): the " or " union the
 * graveyard filter already reads. A creature, a land, a card of any other type is never offered.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ISHGARD = {"name":"Ishgard, the Holy See // Faith & Grief","type":"Land — Town // Sorcery — Adventure","mana":"{3}{W}{W}","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"layout":"adventure","oracle":"Ishgard, the Holy See - Land — Town \nThis land enters tapped.\n{T}: Add {W}.\n//\nFaith & Grief - Sorcery — Adventure {3}{W}{W}\nReturn up to two target artifact and/or enchantment cards from your graveyard to your hand. (Then exile this card. You may play the land later from exile.)"}; // land-partial on c2d7f0b0
const SCHOLAR = {"name":"Scholar of the Ages","type":"Creature — Human Wizard","mana":"{5}{U}{U}","cmc":7,"power":"3","toughness":"3","keywords":[],"colors":["U"],"layout":"normal","oracle":"When this creature enters, return up to two target instant and/or sorcery cards from your graveyard to your hand."}; // body-only on c2d7f0b0
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."};
const PACIFISM = {"name":"Pacifism","type":"Enchantment — Aura","mana":"{1}{W}","cmc":2,"power":null,"toughness":null,"keywords":["Enchant"],"colors":["W"],"oracle":"Enchant creature\nEnchanted creature can't attack or block."};
const WHIP = {"name":"Whip of Erebos","type":"Legendary Enchantment Artifact","mana":"{2}{B}{B}","cmc":4,"power":null,"toughness":null,"keywords":[],"colors":["B"],"oracle":"Creatures you control have lifelink.\n{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery."};
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""};
const OPT = {"name":"Opt","type":"Instant","mana":"{U}","cmc":1,"power":null,"toughness":null,"keywords":["Scry"],"colors":["U"],"oracle":"Scry 1. (Look at the top card of your library. You may put that card on the bottom.)\nDraw a card."};
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"power":null,"toughness":null,"keywords":[],"colors":["U"],"oracle":"Draw two cards."};
const PLAINS = { name: "Plains", type: "Basic Land — Plains", mana: "", cmc: 0, keywords: [], colors: [], oracle: "({T}: Add {W}.)" };
const ISLAND = { name: "Island", type: "Basic Land — Island", mana: "", cmc: 0, keywords: [], colors: [], oracle: "({T}: Add {U}.)" };

const cardOf = (card, id) => ({ ...card, id });
const lands = (prefix, card, n) => Array.from({ length: n }, (_, i) => createPermanent({ id: `${prefix}${i + 1}`, card: cardOf(card, `c-${prefix}${i + 1}`), controller: "user", summoningSick: false }));
function board({ bf = [], hand = [], graveyard = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, graveyard, library: [] } } };
}
const GRAVEYARD = () => [cardOf(MIND_STONE, "g-ms"), cardOf(PACIFISM, "g-pac"), cardOf(WHIP, "g-whip"), cardOf(BEARS, "g-bear"), cardOf(OPT, "g-opt"), cardOf(DIVINATION, "g-div")];
const targetSets = (acts) => [...new Set(acts.map((a) => (a.targets || []).map((t) => t.id).sort().join(",")))].sort();
const handIds = (s) => s.players.user.hand.map((c) => c.id).sort();

describe("the reader", () => {
  it("⭐ both cards play their whole text", () => {
    expect([ISHGARD, SCHOLAR].map((c) => classifyCard(c))).toEqual(["native-mixed", "native-trigger"]);
  });
  it("⭐ the atom: the up-to-two return over the union of the two types", () => {
    expect(parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle: "Return up to two target artifact and/or enchantment cards from your graveyard to your hand." }).atoms)
      .toEqual([{ op: "return-from-graveyard", targetType: "graveyardCard", cardFilter: "artifact|enchantment", maxTargets: 2, minTargets: 0 }]);
  });
  it("control: a word outside the filter's vocabulary still parks the sentence", () => {
    expect(parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle: "Return up to two target artifact and/or Equipment cards from your graveyard to your hand." }).confidence).toBe("low");
  });
});

describe("Ishgard, the Holy See // Faith & Grief", () => {
  const s0 = () => board({ bf: lands("p", PLAINS, 5), hand: [cardOf(ISHGARD, "c-ish")], graveyard: GRAVEYARD() });
  const faith = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === "c-ish" && a.adventureCast);
  it("⭐ the offered targets: every set of at most two among the artifact, the Aura and the artifact enchantment — never the Bear, the instant or the sorcery", () => {
    expect(targetSets(faith(s0()))).toEqual(["", "g-ms", "g-ms,g-pac", "g-ms,g-whip", "g-pac", "g-pac,g-whip", "g-whip"]);
  });
  it("⭐ Mind Stone and Pacifism return to the hand; the card goes on an adventure", () => {
    const act = faith(s0()).find((a) => targetSets([a])[0] === "g-ms,g-pac");
    expect(act, "Faith & Grief on Mind Stone and Pacifism is offered").toBeTruthy();
    const s = resolveTopOfStack(dispatchAction(s0(), act));
    expect({ hand: handIds(s), graveyard: s.players.user.graveyard.map((c) => c.id).sort(), adventure: s.players.user.exile.some((c) => c.id === "c-ish") })
      .toEqual({ hand: ["g-ms", "g-pac"], graveyard: ["g-bear", "g-div", "g-opt", "g-whip"], adventure: true });
  });
});

describe("Scholar of the Ages", () => {
  it("⭐ its enters trigger returns the instant and the sorcery — the only instant-or-sorcery cards there", () => {
    const s0 = board({ bf: lands("i", ISLAND, 7), hand: [cardOf(SCHOLAR, "c-sch")], graveyard: GRAVEYARD() });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "c-sch");
    expect(cast, "Scholar of the Ages is offered").toBeTruthy();
    let s = resolveTopOfStack(dispatchAction(s0, cast));
    for (let g = 0; g < 10 && (s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice; g++) s = s.stack.length ? resolveTopOfStack(s) : flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(handIds(s)).toEqual(["g-div", "g-opt"]);
  });
});
