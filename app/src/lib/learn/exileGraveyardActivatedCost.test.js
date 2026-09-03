/**
 * exileGraveyardActivatedCost.test.js — LANDS-TIER slice 4 (2026-09-03): "Exile N [<type>] card(s) from your
 * graveyard" as a BATTLEFIELD activated-ability cost (CR 601.2h / 602.2b). Mines of Moria's one blocker
 * ("{3}{R}, {T}, Exile three cards from your graveyard: Create two Treasure tokens"); 63 corpus carriers
 * (Grim Lavamancer, Graveyard Marshal, Fungal Plots, Cryptwailing …).
 *
 * THE MODEL IS GR-2 (the graveyard-recursion lane's `exileFromGy`), which pays the same cost for a card
 * acting FROM the graveyard. Here the source is on the battlefield: parseAbilityCost reads the item into
 * `exileGyCount {count, cardType}`; legalChoices freezes EXACTLY N legal victims on the action (`exileGyIds`,
 * typed through cardMatchesAddCostType, least-valuable first) and never offers the ability with fewer; the
 * dispatcher re-verifies every id is still in the graveyard and exiles them BEFORE the ability stacks — a
 * short list throws rather than discounts. The per-X offer lanes refuse the combination (they would carry
 * no victims).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const MINES = {
  id: "c-mines", name: "Mines of Moria", type: "Legendary Land",
  oracle: "Mines of Moria enters tapped unless you control a legendary creature.\n{T}: Add {R}.\n{3}{R}, {T}, Exile three cards from your graveyard: Create two Treasure tokens.",
};
const LAVAMANCER = {
  id: "c-lava", name: "Grim Lavamancer", type: "Creature — Human Wizard", mana: "{R}", power: 1, toughness: 1, keywords: [],
  oracle: "{R}, {T}, Exile two cards from your graveyard: This creature deals 2 damage to any target.",
};
const MARSHAL = {
  id: "c-marshal", name: "Graveyard Marshal", type: "Creature — Zombie Soldier", mana: "{B}{B}", power: 3, toughness: 2, keywords: [],
  oracle: "{2}{B}, Exile a creature card from your graveyard: Create a tapped 2/2 black Zombie creature token.",
};

describe("the cost item — count and type forms, exact refusals", () => {
  it("reads 'three cards' (any), 'two cards' (any), 'a creature card' (typed)", () => {
    expect(parseAbilityCost("{3}{R}, {T}, Exile three cards from your graveyard", MINES)?.exileGyCount).toEqual({ count: 3, cardType: "any" });
    expect(parseAbilityCost("{R}, {T}, Exile two cards from your graveyard", LAVAMANCER)?.exileGyCount).toEqual({ count: 2, cardType: "any" });
    expect(parseAbilityCost("{2}{B}, Exile a creature card from your graveyard", MARSHAL)?.exileGyCount).toEqual({ count: 1, cardType: "creature" });
  });

  it("⛔ refuses a permanent-card filter, a tribal word, X, and 'all' (each parks the whole cost)", () => {
    expect(parseAbilityCost("Exile a permanent card from your graveyard")).toBeNull();
    expect(parseAbilityCost("Exile an Elf card from your graveyard")).toBeNull();
    expect(parseAbilityCost("Exile X cards from your graveyard")).toBeNull();
    expect(parseAbilityCost("Exile all cards from your graveyard")).toBeNull();
  });

  it("the parsed ability carries the count, the tap, and a clean payload", () => {
    const ab = parseActivatedAbilities(MINES).find((a) => a.exileGyCount);
    expect(ab).toBeTruthy();
    expect(ab.tapSelf).toBe(true);
    expect(ab.exileGyCount).toEqual({ count: 3, cardType: "any" });
    expect(ab.effectClause).toMatch(/^Create two Treasure tokens\.?$/);
  });
});

describe("runtime — the offer withholds, the cost is paid from the graveyard, the ability resolves", () => {
  const gyCard = (id, name, type) => ({ id, name, type, oracle: "" });
  function board(card, graveyard) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card, controller: "user", summoningSick: false })];
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, graveyard, hand: [], exile: [], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const offers = (st) => legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability");
  const three = [gyCard("g1", "Lightning Bolt", "Instant"), gyCard("g2", "Mountain", "Basic Land — Mountain"), gyCard("g3", "Grizzly Bears", "Creature — Bear")];

  it("Mines of Moria: not offered with two graveyard cards; offered with three, carrying exactly three ids", () => {
    expect(offers(board(MINES, three.slice(0, 2)))).toHaveLength(0);
    const acts = offers(board(MINES, three));
    expect(acts).toHaveLength(1);
    expect(acts[0].exileGyIds).toHaveLength(3);
    expect(new Set(acts[0].exileGyIds)).toEqual(new Set(["g1", "g2", "g3"]));
  });

  it("⭐ activating EXILES the three from the graveyard before the ability stacks; resolving makes two Treasures", () => {
    const st = board(MINES, [...three, gyCard("g4", "Spare", "Sorcery")]);
    const act = offers(st)[0];
    const paid = dispatchAction(st, act);
    const gyAfter = paid.players.user.graveyard.map((c) => c.id);
    expect(gyAfter).toHaveLength(1); // exactly three left the graveyard
    const exiled = (paid.players.user.exile || []).map((c) => c.id);
    for (const id of act.exileGyIds) {
      expect(gyAfter).not.toContain(id);
      expect(exiled).toContain(id);
    }
    expect(paid.players.user.battlefield.find((p) => p.id === "src").tapped).toBe(true);
    expect(paid.stack.length).toBeGreaterThan(0);
    const resolved = resolveTopOfStack(paid);
    const treasures = resolved.players.user.battlefield.filter((p) => /treasure/i.test(p.card?.name || "") || /treasure/i.test(p.card?.type || ""));
    expect(treasures).toHaveLength(2);
  });

  it("⛔ the dispatcher refuses a short victim list rather than discounting the cost", () => {
    const st = board(MINES, three);
    const act = offers(st)[0];
    expect(() => dispatchAction(st, { ...act, exileGyIds: act.exileGyIds.slice(0, 2) })).toThrow(/exiling 3/);
    expect(() => dispatchAction(st, { ...act, exileGyIds: ["nope", "g1", "g2"] })).toThrow(/not in graveyard/);
  });

  it("Graveyard Marshal: the TYPED form counts only creature cards (a land and an instant do not pay it)", () => {
    expect(offers(board(MARSHAL, [gyCard("g1", "Lightning Bolt", "Instant"), gyCard("g2", "Mountain", "Basic Land — Mountain")]))).toHaveLength(0);
    const acts = offers(board(MARSHAL, [gyCard("g1", "Lightning Bolt", "Instant"), gyCard("g3", "Grizzly Bears", "Creature — Bear")]));
    expect(acts).toHaveLength(1);
    expect(acts[0].exileGyIds).toEqual(["g3"]);
  });

  it("Grim Lavamancer: two of any, and the ability needs a target like any other", () => {
    const st = board(LAVAMANCER, three);
    const acts = offers(st);
    expect(acts.length).toBeGreaterThan(0);
    expect(acts.every((a) => a.exileGyIds.length === 2)).toBe(true);
  });
});

describe("target/victim overlap — Cabal Surgeon exiles two and returns a third", () => {
  const SURGEON = {
    id: "c-surgeon", name: "Cabal Surgeon", type: "Creature — Human Minion", mana: "{2}{B}", power: 2, toughness: 1, keywords: [],
    oracle: "{2}{B}{B}, {T}, Exile two cards from your graveyard: Return target creature card from your graveyard to your hand.",
  };
  const gyCard = (id, name, type) => ({ id, name, type, oracle: "" });
  function board(graveyard) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const bf = [createPermanent({ id: "src", card: SURGEON, controller: "user", summoningSick: false })];
    return {
      ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: bf, graveyard, hand: [], exile: [], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
    };
  }
  const offers = (st) => legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability");

  it("⛔ the auto-picked victims NEVER include the card the ability targets", () => {
    const st = board([gyCard("g1", "Grizzly Bears", "Creature — Bear"), gyCard("g2", "Lightning Bolt", "Instant"), gyCard("g3", "Mountain", "Basic Land — Mountain")]);
    const acts = offers(st);
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) {
      expect(a.exileGyIds).toHaveLength(2);
      for (const t of a.targets) expect(a.exileGyIds).not.toContain(t.id);
    }
  });

  it("with only the target and one other card in the graveyard, the cost cannot be paid around the target → not offered", () => {
    expect(offers(board([gyCard("g1", "Grizzly Bears", "Creature — Bear"), gyCard("g2", "Lightning Bolt", "Instant")]))).toHaveLength(0);
  });
});

describe("classification", () => {
  it("Mines of Moria is `land`; Grim Lavamancer is native", () => {
    expect(classifyCard(MINES)).toBe("land");
    expect(classifyCard(LAVAMANCER)).toMatch(/^native/);
  });

  it("CREED — an unreadable exile filter still parks the card", () => {
    expect(classifyCard({ ...MINES, oracle: MINES.oracle.replace("Exile three cards", "Exile three permanent cards") })).toBe("land-partial");
  });
});
