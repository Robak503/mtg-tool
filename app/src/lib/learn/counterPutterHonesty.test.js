/**
 * counterPutterHonesty.test.js — a counter replacement keyed on WHO PUTS the counters, or naming a player, is not credited
 * (2026-10-17, the false-positive honesty slice).
 *
 * "If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one …"
 * (Lae'zel, Vlaakith's Champion). A replacement effect applies to the event its text describes (CR 614.1a), and this one
 * describes two things the runtime never reads:
 *   · WHO PUTS the counters. "If you would put" is its controller's own putting; an opponent's -1/-1 counters on her
 *     controller's creature (wither or infect damage is put by the source's controller — CR 120.3d, 120.3b for a player) are
 *     not hers to touch. replacementEffects.applyCounterDoubling has no putter: gameState.addCounter is called with a
 *     permanent, a kind and an amount, and the profile applies by the RECIPIENT's controller. Doc Samson's "If you would put
 *     one or more counters on a permanent you control" and Vorinclex's "If you would put … on a permanent or player … If an
 *     opponent would put … half that many" are the same shape (Vorinclex doubles an opponent's counters on its controller's
 *     creatures and halves its controller's on an opponent's — both backwards).
 *   · A PLAYER RECIPIENT ("or on yourself", "permanent or player"). Only Winding Constrictor's exact "If you would get one or
 *     more counters" template reaches the player-counter adders (playerCounterAdditive); nothing else adds to a player's
 *     energy, experience, poison or rad counters.
 * The 10-17 Ozolith slice found Lae'zel's player half unmodelled while the card read native-static. These sentences are no
 * longer stripped as modelled (isModeledDoublerSentence), so the three cards are no longer credited; the runtime still applies
 * the recipient half as before. Passive "would be put on … you control" (Hardened Scales, Winding Constrictor, Kami of
 * Whispered Hopes) and "If an effect would put" (Doubling Season) name no putter and stay credited.
 *
 * Fixtures: real oracle text from the bundled index (read in-session 2026-10-17).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { isModeledDoublerSentence } from "./replacementEffects.js";
import { createGameState, createPermanent, addCounter, addEnergy, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const LAEZEL = { name: "Lae'zel, Vlaakith's Champion", type: "Legendary Creature — Gith Warrior", mana: "{2}{W}", mana_cost: "{2}{W}", power: "3", toughness: "3", colors: ["W"],
  oracle: "If you would put one or more counters on a creature or planeswalker you control or on yourself, put that many plus one of each of those kinds of counters on that permanent or player instead.\nChoose a Background (You can have a Background as a second commander.)" };
const VORINCLEX = { name: "Vorinclex, Monstrous Raider", type: "Legendary Creature — Phyrexian Praetor", mana: "{4}{G}{G}", mana_cost: "{4}{G}{G}", power: "6", toughness: "6", colors: ["G"],
  oracle: "Trample, haste\nIf you would put one or more counters on a permanent or player, put twice that many of each of those kinds of counters on that permanent or player instead.\nIf an opponent would put one or more counters on a permanent or player, they put half that many of each of those kinds of counters on that permanent or player instead, rounded down." };
const DOC_SAMSON = { name: "Doc Samson, Super Psychiatrist", type: "Legendary Creature — Gamma Doctor Hero", mana: "{4}{G}", mana_cost: "{4}{G}", power: "3", toughness: "6", colors: ["G"],
  oracle: "If you would put one or more counters on a permanent you control, put that many plus one of each of those kinds of counters on that permanent instead.\n{T}: Add X mana of any one color, where X is Doc Samson's power." };
// Controls — no putter in the text.
const HARDENED_SCALES = { name: "Hardened Scales", type: "Enchantment", mana: "{G}", mana_cost: "{G}", colors: ["G"],
  oracle: "If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead." };
const CONSTRICTOR = { name: "Winding Constrictor", type: "Creature — Snake", mana: "{B}{G}", mana_cost: "{B}{G}", power: "2", toughness: "3", colors: ["B", "G"],
  oracle: "If one or more counters would be put on an artifact or creature you control, that many plus one of each of those kinds of counters are put on that permanent instead.\nIf you would get one or more counters, you get that many plus one of each of those kinds of counters instead." };
const DOUBLING_SEASON = { name: "Doubling Season", type: "Enchantment", mana: "{4}{G}", mana_cost: "{4}{G}", colors: ["G"],
  oracle: "If an effect would create one or more tokens under your control, it creates twice that many of those tokens instead.\nIf an effect would put one or more counters on a permanent you control, it puts twice that many of those counters on that permanent instead." };
const KAMI = { name: "Kami of Whispered Hopes", type: "Creature — Spirit", mana: "{2}{G}", mana_cost: "{2}{G}", power: "1", toughness: "1", colors: ["G"],
  oracle: "If one or more +1/+1 counters would be put on a permanent you control, that many plus one +1/+1 counters are put on that permanent instead.\n{T}: Add X mana of any one color, where X is this creature's power." };

const sentences = (card) => card.oracle.split("\n").filter((l) => /counters?/.test(l) && /instead\.$/.test(l)).map((l) => l.replace(/\.$/, "").toLowerCase());
const short = (card) => card.name.split(",")[0].toLowerCase();

describe("the sentence: a putter or a player recipient is not a modelled doubler sentence", () => {
  it("⛔ Lae'zel's, Doc Samson's and both of Vorinclex's sentences are refused", () => {
    for (const card of [LAEZEL, DOC_SAMSON, VORINCLEX]) {
      for (const s of sentences(card)) expect([card.name, isModeledDoublerSentence(s, short(card))]).toEqual([card.name, false]);
    }
  });

  it("⛔ SYNTHETIC: a passive sentence naming a player recipient is refused too — the player half reaches no adder", () => {
    const probe = { name: "Probe Season", type: "Enchantment", mana: "{2}{G}", mana_cost: "{2}{G}", colors: ["G"],
      oracle: "If one or more counters would be put on a creature or player, twice that many of each of those kinds of counters are put on that creature or player instead." };
    expect(isModeledDoublerSentence(sentences(probe)[0], "probe season")).toBe(false);
    expect(classifyCard(probe)).toBe("body-only");
  });

  it("control: the passive and \"an effect would put\" sentences stay modelled (Hardened Scales, Winding Constrictor, Doubling Season, Kami)", () => {
    for (const card of [HARDENED_SCALES, CONSTRICTOR, DOUBLING_SEASON, KAMI]) {
      for (const s of sentences(card)) expect([card.name, s, isModeledDoublerSentence(s, short(card))]).toEqual([card.name, s, true]);
    }
  });
});

describe("the tier", () => {
  it("⛔ Lae'zel, Vorinclex and Doc Samson are no longer credited native", () => {
    expect([LAEZEL, VORINCLEX, DOC_SAMSON].map(classifyCard)).toEqual(["body-only", "body-only", "body-only"]);
  });

  it("control: Hardened Scales, Winding Constrictor and Doubling Season keep native-static; Kami of Whispered Hopes native-mana", () => {
    expect([HARDENED_SCALES, CONSTRICTOR, DOUBLING_SEASON, KAMI].map(classifyCard)).toEqual(["native-static", "native-static", "native-static", "native-mana"]);
  });
});

describe("why: the runtime reads neither the putter nor a player recipient", () => {
  const board = (userBattlefield, aiBattlefield = []) => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: userBattlefield }, ai: { ...s0.players.ai, battlefield: aiBattlefield } } };
  };
  const BEAR = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", oracle: "" };
  const P = (id, card, controller = "user") => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });

  it("the energy Lae'zel's controller gets is not increased — no player half reaches the adders", () => {
    const s = addEnergy(board([P("lz", LAEZEL)]), { playerId: "user", amount: 2 });
    expect(s.players.user.energy).toBe(2);
  });

  it("control: Winding Constrictor's \"you get\" sentence does reach them", () => {
    const s = addEnergy(board([P("wc", CONSTRICTOR)]), { playerId: "user", amount: 2 });
    expect(s.players.user.energy).toBe(3);
  });

  it("addCounter carries no putter: the recipient half applies by the recipient's controller (unchanged by this slice)", () => {
    const s = addCounter(board([P("lz", LAEZEL), P("bear", BEAR)]), { permanentId: "bear", type: "+1/+1", amount: 1 });
    expect(s.players.user.battlefield.find((p) => p.id === "bear").counters["+1/+1"]).toBe(2);
  });
});
