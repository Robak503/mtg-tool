/**
 * eladamriKorvecdal.test.js — Eladamri, Korvecdal (shelf decks D37, 2026-09-30: Kellan of the West).
 *
 *   "{G}, {T}, Tap two untapped creatures you control: Reveal a card from your hand or the top card of your library. If you
 *    reveal a creature card this way, put it onto the battlefield. Activate only during your turn."
 *
 * splitClauses folds the two sentences into one clause; putFromHand.js reads it as the hand → battlefield tutor with a second
 * source, applyTutor's "libraryTop" pseudo-zone: ONLY the top card, revealed rather than searched, so the settle never
 * shuffles. revealChoice: revealing a noncreature puts nothing, so the put may be skipped only when the hand or the top
 * card holds a noncreature; with nothing but creatures to reveal, one of them must be put (mayFailToFind false).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30), except the synthetic clauses that pin the fences.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseEffectClause } from "./effects/parser.js";
import { autoPickTutorCandidate, resolveTutorChoice } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const EFFECT = "Reveal a card from your hand or the top card of your library. If you reveal a creature card this way, put it onto the battlefield.";
const ELADAMRI = { name: "Eladamri, Korvecdal", type: "Legendary Creature — Elf Warrior", mana: "{1}{G}{G}", power: "3", toughness: "3", keywords: [],
  oracle: `You may look at the top card of your library any time.\nYou may cast creature spells from the top of your library.\n{G}, {T}, Tap two untapped creatures you control: ${EFFECT} Activate only during your turn.` };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" };
const ANGEL = { name: "Serra Angel", type: "Creature — Angel", mana: "{3}{W}{W}", power: "4", toughness: "4", keywords: ["Flying", "Vigilance"], oracle: "Flying, vigilance" };
const DIVINATION = { name: "Divination", type: "Sorcery", mana: "{2}{U}", keywords: [], oracle: "Draw two cards." };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };

const P = (id, c) => createPermanent({ id, card: { ...c, id: `c-${id}` }, controller: "user", summoningSick: false });
function table({ hand = [], library = [], active = "user" } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, activePlayer: active, priorityHolder: "user", consecutivePasses: 0, phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: [P("EL", ELADAMRI), P("B1", BEARS), P("B2", BEARS)],
      hand: hand.map(([id, c]) => ({ ...c, id })), library: library.map(([id, c]) => ({ ...c, id })), manaPool: { ...g.players.user.manaPool, G: 1 } } } };
}
const offers = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "EL");
/** Activate and resolve up to the reveal choice; fail loudly on a logged resolver crash. */
function activate(s) {
  const act = offers(s)[0];
  if (!act) throw new Error("Eladamri's ability is not offered");
  let n = dispatchAction(s, act), g = 0;
  while (n.stack.length && !n.pendingChoice && g++ < 5) n = resolveTopOfStack(n);
  const crash = (n.log || []).find((e) => e.kind === "stack-resolve-error");
  if (crash) throw new Error(`a resolver crashed: ${crash.error}`);
  return n;
}
const LIBRARY = [["topAngel", ANGEL], ["l2", FOREST], ["l3", BEARS], ["l4", DIVINATION], ["l5", FOREST], ["l6", BEARS]];

describe("the card", () => {
  it("reads native-mixed; the folded reveal is the hand-or-top tutor onto the battlefield", () => {
    expect({ tier: classifyCard(ELADAMRI), atoms: parseEffectClause(EFFECT, "Creature").atoms }).toEqual({
      tier: "native-mixed",
      atoms: [{ op: "tutor", sourceZones: ["hand", "libraryTop"], filter: { groups: [["creature"]] }, filterLabel: "creature card from your hand or the top of your library",
        destination: "battlefield", entersTapped: false, revealChoice: true, targetType: null }],
    });
  });

  it("fences (synthetic): the reveal alone, or a different payoff sentence, parks", () => {
    const conf = (text) => parseEffectClause(text, "Creature")?.confidence ?? "low";
    expect([
      conf("Reveal a card from your hand or the top card of your library."),
      conf("Reveal a card from your hand or the top card of your library. If you reveal a land card this way, put it onto the battlefield."),
    ]).toEqual(["low", "low"]);
  });
});

describe("in play", () => {
  it("the cost taps Eladamri and two creatures; the top card joins the hand's creatures, and taking it never shuffles (WITNESS)", () => {
    const paused = activate(table({ hand: [["handBear", BEARS], ["div", DIVINATION]], library: LIBRARY }));
    const choice = paused.pendingChoice;
    const s = resolveTutorChoice(paused, "topAngel");
    const witness = {
      tapped: paused.players.user.battlefield.filter((p) => p.tapped).map((p) => p.id).sort(),
      candidates: (choice?.candidates || []).map((c) => `${c.id}@${c.zone}`).sort(),
      mayDecline: choice?.mayFailToFind,
      entered: s.players.user.battlefield.some((p) => p.card?.name === "Serra Angel"),
      library: s.players.user.library.map((c) => c.id),
    };
    console.log(`WITNESS eladamri ${JSON.stringify(witness)}`);
    expect(witness).toEqual({ tapped: ["B1", "B2", "EL"], candidates: ["handBear@hand", "topAngel@library"], mayDecline: true, entered: true, library: ["l2", "l3", "l4", "l5", "l6"] });
  });

  it("only the TOP card is revealable: a creature deeper in the library is never a candidate", () => {
    let s = activate(table({ hand: [["div", DIVINATION]], library: [["f", FOREST], ["deepBear", BEARS]] }));
    const candidates = (s.pendingChoice?.candidates || []).map((c) => c.id);
    if (s.pendingChoice) s = resolveTutorChoice(s, null); // nothing to put; settle the (empty) choice if one was raised
    expect({ candidates, deepBearStillInLibrary: s.players.user.library.some((c) => c.id === "deepBear"), creaturesOnBattlefield: s.players.user.battlefield.length })
      .toEqual({ candidates: [], deepBearStillInLibrary: true, creaturesOnBattlefield: 3 });
  });

  it("with nothing but creatures to reveal, one must be put: a decline is refused and the auto-pick takes the best", () => {
    const paused = activate(table({ hand: [["handBear", BEARS]], library: [["topAngel", ANGEL], ["l2", FOREST]] }));
    const declined = resolveTutorChoice(paused, null);
    expect({ mayDecline: paused.pendingChoice?.mayFailToFind, stillPending: declined.pendingChoice?.kind ?? null, autoPick: autoPickTutorCandidate(paused, paused.pendingChoice) })
      .toEqual({ mayDecline: false, stillPending: "tutor-search", autoPick: "topAngel" });
  });

  it("is not offered on an opponent's turn (\"Activate only during your turn\")", () => {
    expect(offers(table({ hand: [["handBear", BEARS]], library: LIBRARY, active: "ai" }))).toEqual([]);
  });
});
