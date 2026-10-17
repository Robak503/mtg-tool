/**
 * learnLogLabels.test.jsx — the Academy's game logs read as words (left by the 10-17 action-label slice). LearnLogEntry (the
 * live "Recent actions" feed and the P7 replay scrubber) and LearnBoard's Game Log printed the engine's seat id and action
 * kind: "ai1 · activate-ability · Prodigal Pyromancer". They now print the seat label and the action's label — the same
 * words its button would show — told from the acting seat ("from Opponent 2's graveyard", not "your").
 *
 * A log entry carries the full action object the dispatcher applied (learnSession's decisionLog), so every word comes from
 * the action and the shared labeller. Kinds that are not dispatcher actions (the engine's choice and bookkeeping entries)
 * keep their kind's words and name.
 */
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import LearnBoard, { actionLabel } from "./LearnBoard.jsx";
import { LearnLogEntry } from "./LearnLogEntry.jsx";

const NO_COST = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hasX: false, xCount: 0, hybrid: [], phyrexian: [], anyColor: 0, snow: 0 };
const cost = (over) => ({ ...NO_COST, ...over });

// Ability texts and costs are the cards' bundled Scryfall text (Prodigal Pyromancer, Smuggler's Copter, Reassembling
// Skeleton, Mind Stone, Talon Gates of Madara, Lurrus of the Dream-Den, Slickshot Show-Off).
const PING_YOU = { kind: "activate-ability", playerId: "ai1", permanentId: "pyro", name: "Prodigal Pyromancer", cost: cost({}), tapSelf: true,
  targets: [{ type: "player", id: "user" }], abilityText: "This creature deals 1 damage to any target." };
const CREW = { kind: "crew-vehicle", playerId: "user", permanentId: "p1", vehicleName: "Smuggler's Copter", crew: 1, tapIds: ["p2"], allSick: false };
const SKELETON = { kind: "activate-gy-recursion", playerId: "ai2", cardId: "c1", name: "Reassembling Skeleton", cost: cost({ generic: 1, B: 1 }),
  abilityText: "{1}{B}: Return this card from your graveyard to the battlefield tapped." };
const ATTACK_YOU = { kind: "declare-attacker", playerId: "ai1", permanentId: "giant", name: "Hill Giant", defenderId: "user" };

const entry = (turn, actor, action, auto = actor !== "user") => ({ ts: turn * 100, turn, phase: "precombat-main", step: "main", actor, action, auto, reasoning: "" });
const text = (markup) => markup.replace(/&#x27;/g, "'").replace(/&quot;/g, "\"").replace(/&amp;/g, "&");
const renderEntry = (e) => text(renderToStaticMarkup(createElement(LearnLogEntry, { entry: e })));

describe("LearnLogEntry — the Recent actions feed and the replay scrubber name the seat and the action in words", () => {
  it("an opponent's activation reads as its seat and its label, never 'ai1 · activate-ability'", () => {
    const html = renderEntry(entry(4, "ai1", PING_YOU));
    expect(html).toContain("T4 · Opponent 1 (auto)");
    expect(html).toContain("Activate Prodigal Pyromancer: This creature deals 1 damage to any target → You ({T})");
    expect(html).not.toMatch(/ai1|activate-ability/);
  });

  it("the player's own crew reads 'You' and the crew label", () => {
    const html = renderEntry(entry(3, "user", CREW));
    expect(html).toContain("T3 · You");
    expect(html).toContain("Crew Smuggler's Copter (crew 1, tap 1 creature)");
    expect(html).not.toContain("crew-vehicle");
  });

  it("an opponent's graveyard ability is told from that seat: 'from Opponent 2's graveyard', not 'your'", () => {
    const html = renderEntry(entry(6, "ai2", SKELETON));
    expect(html).toContain("T6 · Opponent 2 (auto)");
    expect(html).toContain("Activate Reassembling Skeleton from Opponent 2's graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped");
  });

  it("an attack on the player reads 'Attack you with Hill Giant'", () => {
    expect(renderEntry(entry(5, "ai1", ATTACK_YOU))).toContain("Attack you with Hill Giant");
  });

  it("an entry that is not a dispatcher action keeps its kind's words and its card's name", () => {
    const html = renderEntry(entry(7, "ai1", { kind: "spell-unresolved", name: "Kozilek's Return" }));
    expect(html).toContain("T7 · Opponent 1 (auto)");
    expect(html).toContain("Spell unresolved · Kozilek's Return");
    expect(html).not.toContain("spell-unresolved");
  });

  it("a legacy string entry still renders as-is", () => {
    expect(renderEntry("cast Bolt")).toContain(">cast Bolt<");
  });
});

describe("LearnBoard's Game Log names the seat and the action in words", () => {
  const seat = (id, extra = {}) => ({ id, isUser: id === "user", life: 40, handCount: 0, hand: id === "user" ? [] : null, libraryCount: 50,
    lands: [], permanents: [], graveyard: [], exile: [], command: [], manaPool: id === "user" ? {} : null, ...extra });
  const board = { stack: [], players: [seat("user"), seat("ai1")] };
  const render = (logTail) => text(renderToStaticMarkup(createElement(LearnBoard, {
    board, decision: { kind: "ask", prompt: "Your move", options: [{ kind: "pass-priority", playerId: "user" }] },
    onAction: () => {}, logTail, turn: 4, step: "main", status: "running",
  })));

  it("'Opponent 1 (auto) · Activate …' and 'You · Crew …', never the seat id or the kind", () => {
    const html = render([entry(3, "user", CREW), entry(4, "ai1", PING_YOU)]);
    expect(html).toContain("<b>Opponent 1 (auto)</b> · Activate Prodigal Pyromancer: This creature deals 1 damage to any target → You ({T})");
    expect(html).toContain("<b>You</b> · Crew Smuggler's Copter (crew 1, tap 1 creature)");
    expect(html).not.toMatch(/ai1 \(auto\)|· activate-ability|· crew-vehicle/);
  });
});

describe("actionLabel tells an action from the seat that takes it", () => {
  it("'your' is the acting seat's possessive; the player's own buttons read as before", () => {
    const hand = { kind: "activate-hand-self-put", cardId: "c1", name: "Talon Gates of Madara", cost: cost({ generic: 4 }), abilityText: "{4}: Put this card from your hand onto the battlefield." };
    const exileCost = { kind: "activate-ability", permanentId: "p1", name: "Mind Stone", targets: [], abilityText: "Draw a card.", exileGyIds: ["g1"] };
    const companion = { kind: "companion-to-hand", cardId: "c1", name: "Lurrus of the Dream-Den", cost: cost({ generic: 3 }), cmc: 3 };
    const plotTop = { kind: "plot", cardId: "c1", name: "Slickshot Show-Off", cost: cost({ generic: 1, R: 1 }), cmc: 2, fromZone: "library" };
    expect({
      skeletonYou: actionLabel(SKELETON),
      skeletonOpp: actionLabel(SKELETON, { seat: "ai1" }),
      handOpp: actionLabel(hand, { seat: "ai3" }),
      exileOpp: actionLabel(exileCost, { seat: "ai1" }),
      companionOpp: actionLabel(companion, { seat: "ai2" }),
      plotOpp: actionLabel(plotTop, { seat: "ai1" }),
    }).toEqual({
      skeletonYou: "Activate Reassembling Skeleton from your graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped",
      skeletonOpp: "Activate Reassembling Skeleton from Opponent 1's graveyard: {1}{B}: Return this card from your graveyard to the battlefield tapped",
      handOpp: "Activate Talon Gates of Madara from Opponent 3's hand: {4}: Put this card from your hand onto the battlefield",
      exileOpp: "Activate Mind Stone: Draw a card (exile 1 card from Opponent 1's graveyard)",
      companionOpp: "Put companion Lurrus of the Dream-Den into Opponent 2's hand ({3})",
      plotOpp: "Plot Slickshot Show-Off from the top of Opponent 1's library ({1}{R})",
    });
  });
});
