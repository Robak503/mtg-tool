/**
 * castChooserCover.test.jsx — the Academy board's cast chooser over a multi-target spell whose target slots multiply past the cast
 * offer's cap (effects/targeting.js, THE OFFER OVER THE CAP, 2026-11-03). A person picks a target by clicking a highlighted
 * permanent or a target button, then a cast aimed at it (castChooserView over the casts legalActionsForPlayer offers). Before, on
 * the pw23 review's board (a four-seat pod, 6 Grizzly Bears and 5 Forests a seat), Hungry Flames highlighted only the first 16
 * Bears — none of the fourth seat's — so a person could not aim it there at all. Card text: the bundled Scryfall oracle.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { castChooserView, castsAimedAt } from "./LearnBoard.jsx";
import { legalActionsForPlayer } from "../../lib/learn/legalChoices.js";
import { _resetIdsForTests, createGameState, createPermanent } from "../../lib/learn/gameState.js";

beforeEach(() => _resetIdsForTests());

const HUNGRY_FLAMES = {"name":"Hungry Flames","type":"Instant","mana":"{2}{R}","oracle":"Hungry Flames deals 3 damage to target creature and 2 damage to target player or planeswalker.","layout":"normal","cmc":3,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":["R"],"colorIdentity":["R"]}; // EDHREC #22164
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","oracle":"","layout":"normal","cmc":2,"power":"2","toughness":"2","loyalty":null,"keywords":[],"colors":["G"],"colorIdentity":["G"]}; // EDHREC #8126
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","oracle":"({T}: Add {G}.)","layout":"normal","cmc":0,"power":null,"toughness":null,"loyalty":null,"keywords":[],"colors":[],"colorIdentity":["G"]};

const SEATS = ["user", "ai1", "ai2", "ai3"];
const bearsOf = (seat) => Array.from({ length: 6 }, (_, i) => `${seat}-bear${i}`);
function pod() {
  const g = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const players = { ...g.players };
  for (const seat of SEATS) {
    const bf = [];
    for (let i = 0; i < 6; i++) bf.push(createPermanent({ id: `${seat}-bear${i}`, card: { ...BEARS, id: `c-${seat}-bear${i}` }, controller: seat, summoningSick: false }));
    for (let i = 0; i < 5; i++) bf.push(createPermanent({ id: `${seat}-forest${i}`, card: { ...FOREST, id: `c-${seat}-forest${i}` }, controller: seat, summoningSick: false }));
    players[seat] = { ...players[seat], life: 40, battlefield: bf, hand: [] };
  }
  players.user = { ...players.user, hand: [{ ...HUNGRY_FLAMES, id: "hf" }], manaPool: { W: 0, U: 0, B: 0, R: 3, G: 0, C: 0 } };
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], players };
}
// A hand card's legal plays and the ids of every permanent — exactly what the board hands the chooser.
const playsOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const boardIdsOf = (s) => new Set(Object.values(s.players).flatMap((p) => p.battlefield.map((x) => x.id)));
const slot = (a, i) => a.targets.find((t) => t.atomIndex === i)?.id ?? null;

describe("Hungry Flames from a person's seat, past the cap", () => {
  it("⭐ every seat's Bears are highlighted and every player is a target button", () => {
    const s = pod();
    const view = castChooserView(playsOf(s, "hf"), boardIdsOf(s));
    expect([...view.boardTargetIds].sort()).toEqual(SEATS.flatMap(bearsOf).sort());
    expect(view.targetButtons.map((t) => t.id).sort()).toEqual([...SEATS].sort());
  });
  it("⭐ clicking the fourth seat's last Bear offers a cast at it beside each player — the one that burns that seat among them", () => {
    const s = pod();
    const plays = playsOf(s, "hf");
    const view = castChooserView(plays, boardIdsOf(s), "ai3-bear5");
    expect(view.picked?.id).toBe("ai3-bear5");
    expect(view.rows.map((r) => slot(r.option, 1)).sort()).toEqual([...SEATS].sort());
    expect(view.rows.every((r) => slot(r.option, 0) === "ai3-bear5")).toBe(true);
  });
  it("⭐ clicking the ai3 button offers ai3's face beside every Bear on the table", () => {
    const s = pod();
    const aimed = castsAimedAt(playsOf(s, "hf"), "ai3");
    expect(aimed.filter((a) => slot(a, 1) === "ai3").map((a) => slot(a, 0)).sort()).toEqual(SEATS.flatMap(bearsOf).sort());
  });
});
