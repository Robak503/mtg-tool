/**
 * removalTriggerRanking.test.js — THE DEFAULT AI'S REMOVAL TRIGGER AIMS AT THE BIGGEST THREAT (the play-weighted slice pw26 — its blind
 * review's F3, gameEngine.chooseTriggerTargets): without policy-eval, a trigger with no modes whose every row removes an opponent's permanent
 * (destroy, exile, bounce, tuck) takes the row whose permanents it would really remove are worth the most (boardEval.permanentValue); a
 * destroy removes nothing from an indestructible permanent (CR 702.12b). A modal trigger, a spell target and a player target keep the first
 * correct-side row. The automatic chooser is what an AI seat takes as its trigger goes on the stack (CR 603.3d). Witnessed through real game
 * states.
 *
 * Card text: the bundled Scryfall oracle (cardIndex.publicCard → learnDeckEnrich.mergeCardData), generated, never typed.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { chooseTriggerTargets, finalizeStackResolution, flushTriggers, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const CHUPACABRA = {"name":"Ravenous Chupacabra","type":"Creature — Beast Horror","mana":"{2}{B}{B}","oracle":"When this creature enters, destroy target creature an opponent controls.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["B"],"colorIdentity":["B"]}; // EDHREC #1133
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","oracle":"","layout":"normal","cmc":4,"power":"3","toughness":"3","loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #29123
const COLOSSUS = {"name":"Darksteel Colossus","type":"Artifact Creature — Golem","mana":"{11}","oracle":"Trample (This creature can deal excess combat damage to the player or planeswalker it's attacking.)\nIndestructible (Damage and effects that say \"destroy\" don't destroy this creature.)\nIf Darksteel Colossus would be put into a graveyard from anywhere, reveal Darksteel Colossus and shuffle it into its owner's library instead.","layout":"normal","cmc":11,"power":"11","toughness":"11","loyalty":null,"keywords":["Indestructible","Trample"],"colors":[],"colorIdentity":[]}; // EDHREC #2383
const CHANNELER = {"name":"Aether Channeler","type":"Creature — Human Wizard","mana":"{2}{U}","oracle":"When this creature enters, choose one —\n• Create a 1/1 white Bird creature token with flying.\n• Return another target nonland permanent to its owner's hand.\n• Draw a card.","layout":"normal","cmc":3,"power":"2","toughness":"1","loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1552
const VENSER = {"name":"Venser, Shaper Savant","type":"Legendary Creature — Human Wizard","mana":"{2}{U}{U}","oracle":"Flash (You may cast this spell any time you could cast an instant.)\nWhen Venser enters, return target spell or permanent to its owner's hand.","layout":"normal","cmc":4,"power":"2","toughness":"2","loyalty":null,"keywords":["Flash"],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #1973
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","oracle":"Draw two cards.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["U"],"colorIdentity":["U"]}; // EDHREC #6263

const on = (seat, id, card, extra = {}) => ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller: seat, summoningSick: false }), ...extra });
/** The AI's precombat main with `card` in hand and {2}{B}{B} + {U}{U}{1} floating; the person's `board`. Heads-up, the person at the table. */
function table(card, board) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, humanSeats: ["user"], turn: 6, phase: "precombat-main", step: "main", activePlayer: "ai", priorityHolder: "ai", consecutivePasses: 0,
    players: {
      ...g.players,
      user: { ...g.players.user, battlefield: board, hand: [], graveyard: [], library: [] },
      ai: { ...g.players.ai, battlefield: [], hand: [{ ...card, id: "h0" }], graveyard: [], library: [{ ...BEARS, id: "l0" }], manaPool: { W: 0, U: 2, B: 2, R: 0, G: 0, C: 3 } },
    } };
}
/** The AI casts it; the spell resolves and its enters trigger is put on the stack by the automatic chooser and resolves. */
function aiCasts(s) {
  const a = legalActionsForPlayer(s, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "h0");
  expect(a, "the card is not offered to the AI").toBeTruthy();
  let n = resolveTopOfStack(dispatchAction(s, a));
  n = flushTriggers(n, { chooseTargets: chooseTriggerTargets });
  const targets = (n.stack || []).map((o) => (o.targets || []).map((t) => t.id));
  for (let i = 0; i < 6 && n.stack?.length; i++) n = resolveTopOfStack(n);
  return { s: finalizeStackResolution(n), targets };
}
const names = (s, pid) => s.players[pid].battlefield.map((p) => p.card?.name).sort();

describe("the default AI's removal trigger (the review of pw26, F3)", () => {
  it("⭐ Ravenous Chupacabra destroys the person's Hill Giant, not the Grizzly Bears that came first (the more valuable)", () => {
    const { s, targets } = aiCasts(table(CHUPACABRA, [on("user", "bears", BEARS), on("user", "giant", GIANT)]));
    expect({ targets, user: names(s, "user") }).toEqual({ targets: [["giant"]], user: ["Grizzly Bears"] });
  });
  it("⭐ a destroy can't destroy an indestructible creature (CR 702.12b): beside Darksteel Colossus, it destroys the Bears", () => {
    const { s, targets } = aiCasts(table(CHUPACABRA, [on("user", "colossus", COLOSSUS), on("user", "bears", BEARS)]));
    expect({ targets, user: names(s, "user") }).toEqual({ targets: [["bears"]], user: ["Darksteel Colossus"] });
  });
  it("control — a modal trigger keeps its first mode: Aether Channeler makes its Bird rather than bouncing the person's Hill Giant", () => {
    const { s } = aiCasts(table(CHANNELER, [on("user", "giant", GIANT)]));
    expect({ user: names(s, "user"), ai: names(s, "ai") }).toEqual({ user: ["Hill Giant"], ai: ["Aether Channeler", "Bird"] });
  });
  it("control — a row that aims at a spell keeps the first-row pick: the AI's Venser, Shaper Savant returns the person's Divination on the stack, not their Hill Giant", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...g, humanSeats: ["user"], turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...g.players,
        user: { ...g.players.user, battlefield: [on("user", "bears", BEARS), on("user", "giant", GIANT)], hand: [{ ...DIVINATION, id: "u0" }], graveyard: [], library: [{ ...BEARS, id: "ul0" }, { ...BEARS, id: "ul1" }], manaPool: { W: 0, U: 1, B: 0, R: 0, G: 0, C: 2 } },
        ai: { ...g.players.ai, battlefield: [], hand: [{ ...VENSER, id: "a0" }], graveyard: [], library: [], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 2 } } } };
    const div = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "u0");
    expect(div, "Divination is not offered").toBeTruthy();
    s = { ...dispatchAction(s, div), priorityHolder: "ai" };
    const ven = legalActionsForPlayer(s, "ai").find((a) => a.kind === "cast-spell" && a.cardId === "a0");
    expect(ven, "Venser is not offered to the AI").toBeTruthy();
    const n = flushTriggers(resolveTopOfStack(dispatchAction(s, ven)), { chooseTargets: chooseTriggerTargets });
    const trigger = n.stack.find((o) => /Venser/.test(String(o.source?.name || "")));
    expect((trigger?.targets || []).map((t) => t.type)).toEqual(["spell"]);
  });
});
