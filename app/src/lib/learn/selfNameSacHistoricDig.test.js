/**
 * selfNameSacHistoricDig.test.js — LANDS-TIER slice 3 (2026-09-03): two one-word blockers on Cap America's
 * land tail, each a VOCABULARY gap in front of machinery that already ran.
 *
 *   A. "Sacrifice <this card's own name>" as an activated-ability COST (Inventors' Fair "{4}, {T}, Sacrifice
 *      Inventors' Fair: Search your library for an artifact card …"). CR 201.5: a card's own name in its text
 *      means "this object", so the item is the sacSelf cost the parser already pays for "Sacrifice this land".
 *      Self-name anchored EXACTLY as the remove-counter and unattach self-name items are — full name or the
 *      legendary short name, whole item — never a substring. Flip-diff: +11 more (Lunatic Pandora, Potatoes,
 *      Hakoda, Major Teroh, Toe-Breaking Helmet …), every one a "Sacrifice <own name>" cost.
 *
 *   B. "historic" as a tutor/dig FILTER (Monumental Henge "look at the top five … you may reveal a historic
 *      card from among them"). CR 700.6: historic = the legendary supertype, the artifact card type, or the
 *      Saga subtype. A GATE on the shared matcher (`filter.historic`), never a group word — group words are
 *      matched by containment against the type line and no type line says "historic"; as a group word it
 *      would match nothing and the tier would show the card native while the dig kept nothing (the vacuous-
 *      filter FP the parser's own color note names). Flip-diff: Weatherlight (trigger) + Board the
 *      Weatherlight (sorcery) ride the same word.
 *
 * Real oracle fixtures (bundled Scryfall snapshot, read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { cardMatchesTutorFilter, applyImpulseDigAtom } from "./effects/atoms/library.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const FAIR = {
  id: "c-fair", name: "Inventors' Fair", type: "Legendary Land",
  oracle: "At the beginning of your upkeep, if you control three or more artifacts, you gain 1 life.\n{T}: Add {C}.\n{4}, {T}, Sacrifice Inventors' Fair: Search your library for an artifact card, reveal it, put it into your hand, then shuffle. Activate only if you control three or more artifacts.",
};
const HENGE = {
  id: "c-henge", name: "Monumental Henge", type: "Land",
  oracle: "This land enters tapped unless you control a Plains.\n{T}: Add {W}.\n{2}{W}{W}, {T}: Look at the top five cards of your library. You may reveal a historic card from among them and put it into your hand. Put the rest on the bottom of your library in a random order. (Artifacts, legendaries, and Sagas are historic.)",
};
const HAKODA = { id: "c-hakoda", name: "Hakoda, Selfless Commander", type: "Legendary Creature — Human Warrior Ally", power: 3, toughness: 3, oracle: "Sacrifice Hakoda: Creatures you control get +0/+5 and gain indestructible until end of turn." };

describe("A. the self-name sacrifice cost — exactly the card's own name, nothing looser", () => {
  it("'Sacrifice Inventors' Fair' on Inventors' Fair is the sacSelf cost", () => {
    const c = parseAbilityCost("{4}, {T}, Sacrifice Inventors' Fair", FAIR);
    expect(c).not.toBeNull();
    expect(c.sacSelf).toBe(true);
    expect(c.tapSelf).toBe(true);
  });

  it("the legendary SHORT name reads (Hakoda, Selfless Commander → 'Sacrifice Hakoda' — the printed shape)", () => {
    expect(parseAbilityCost("Sacrifice Hakoda", HAKODA)?.sacSelf).toBe(true);
    // The comma-bearing FULL name is not reachable: the cost string is split into items on commas, so
    // "Sacrifice Hakoda, Selfless Commander" shatters into two items and parks (null — FN-safe). Oracle
    // never prints that form (a legendary names itself by its short name in its own text), so nothing is lost.
    expect(parseAbilityCost("Sacrifice Hakoda, Selfless Commander", HAKODA)).toBeNull();
  });

  it("⛔ refuses a different name, a substring, an article, and a missing card", () => {
    expect(parseAbilityCost("{4}, {T}, Sacrifice Inventors' Fair", { ...FAIR, name: "Some Other Land" })).toBeNull();
    expect(parseAbilityCost("Sacrifice another Inventors' Fair", FAIR)).toBeNull();
    expect(parseAbilityCost("Sacrifice Hakodas", HAKODA)).toBeNull(); // a plural is not the name
    // ("Sacrifice a Hakoda" is deliberately NOT probed here: with an article it is the pre-existing
    // sacrifice-a-<Subtype> cost shape, a different and legal reading — CR 201.5 only covers the bare name.)
    expect(parseAbilityCost("Sacrifice Inventors' Fair", null)).toBeNull();
  });

  it("the parsed ability carries the cost AND its activation condition, payload clean", () => {
    const abs = parseActivatedAbilities(FAIR);
    const tutor = abs.find((a) => a.sacSelf); // cost fields are flattened onto the ability record
    expect(tutor).toBeTruthy();
    expect(tutor.condition).toBe("you control three or more artifacts");
  });

  describe("runtime — the offer gate and the cost genuinely bind", () => {
    const artifact = (id) => createPermanent({ id, card: { id: "ca-" + id, name: "Mind Stone " + id, type: "Artifact", oracle: "" }, controller: "user", summoningSick: false });
    function board(artifacts) {
      const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
      const bf = [createPermanent({ id: "src", card: FAIR, controller: "user", summoningSick: false })];
      for (let i = 0; i < artifacts; i++) bf.push(artifact("a" + i));
      const library = [
        { id: "lib-c", name: "Grizzly Bears", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 },
        { id: "lib-a", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." },
      ];
      return {
        ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6, consecutivePasses: 0,
        players: { ...s.players, user: { ...s.players.user, battlefield: bf, library, hand: [], graveyard: [], manaPool: { W: 9, U: 9, B: 9, R: 9, G: 9, C: 9 } } },
      };
    }
    const offers = (st) => legalActionsForPlayer(st, "user").filter((a) => a.permanentId === "src" && a.kind === "activate-ability");

    it("not offered with two artifacts; offered with three (the metalcraft rider still gates)", () => {
      expect(offers(board(2))).toHaveLength(0);
      expect(offers(board(3))).toHaveLength(1);
    });

    it("⭐ activating SACRIFICES the Fair as the cost, then the resolved search offers only artifact cards", () => {
      const st = board(3);
      const act = offers(st)[0];
      const paid = dispatchAction(st, act);
      expect(paid.players.user.battlefield.some((p) => p.id === "src")).toBe(false);
      expect(paid.players.user.graveyard.some((c) => c.name === "Inventors' Fair")).toBe(true);
      expect(paid.stack.length).toBeGreaterThan(0);
      const resolved = resolveTopOfStack(paid);
      const pc = resolved.pendingChoice;
      expect(pc?.kind).toBe("tutor-search");
      const names = (pc.candidates || []).map((c) => c.name);
      expect(names).toContain("Sol Ring");
      expect(names).not.toContain("Grizzly Bears");
    });
  });
});

describe("B. the historic filter — a gate on the shared matcher, read off the front face", () => {
  it("parses the bare word as a gate with no groups; refuses a qualified form", () => {
    expect(parseTutorFilter("historic")).toEqual({ groups: [], historic: true });
    expect(parseTutorFilter("historic creature")).toBeNull();
  });

  it("CR 700.6 — legendary OR artifact OR Saga; a plain creature, a basic land, an instant are not", () => {
    const f = parseTutorFilter("historic");
    expect(cardMatchesTutorFilter({ name: "Hakoda", type: "Legendary Creature — Human" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Sol Ring", type: "Artifact" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "History of Benalia", type: "Enchantment — Saga" }, f)).toBe(true);
    expect(cardMatchesTutorFilter({ name: "Grizzly Bears", type: "Creature — Bear" }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Plains", type: "Basic Land — Plains" }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Opt", type: "Instant" }, f)).toBe(false);
  });

  it("⛔ FRONT face only (CR 712.4a): an MDFC whose BACK is legendary is not historic in the library", () => {
    const f = parseTutorFilter("historic");
    expect(cardMatchesTutorFilter({ name: "Probe MDFC", type: "Creature — Elf // Legendary Land" }, f)).toBe(false);
    expect(cardMatchesTutorFilter({ name: "Probe MDFC 2", type: "Legendary Creature — Elf // Land" }, f)).toBe(true);
  });

  it("⭐ the Henge dig keeps ONLY the historic cards as candidates; the rest go under", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const library = [
      { id: "t1", name: "Grizzly Bears", type: "Creature — Bear" },
      { id: "t2", name: "Hakoda, Selfless Commander", type: "Legendary Creature — Human Warrior Ally" },
      { id: "t3", name: "Sol Ring", type: "Artifact" },
      { id: "t4", name: "History of Benalia", type: "Enchantment — Saga" },
      { id: "t5", name: "Opt", type: "Instant" },
      { id: "t6", name: "Bottom Stays", type: "Artifact" },
    ];
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, library } } };
    const atom = { op: "impulse-dig", amount: 5, restTo: "bottom", filter: parseTutorFilter("historic"), filterLabel: "historic card" };
    const out = applyImpulseDigAtom(st, atom, { controller: "user", cardName: "Monumental Henge" });
    expect(out.pendingChoice?.kind).toBe("impulse-dig");
    expect(out.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["t2", "t3", "t4"]);
    expect(out.pendingChoice.lookedAt).toBe(5); // t6 was never looked at
  });
});

describe("classification — both Cap lands flip; a mangled sibling still parks", () => {
  it("Inventors' Fair and Monumental Henge are `land`", () => {
    expect(classifyCard(FAIR)).toBe("land");
    expect(classifyCard(HENGE)).toBe("land");
  });

  it("CREED — Henge with an unmodeled qualifier stays land-partial; the Fair under another name stays parked", () => {
    expect(classifyCard({ ...HENGE, oracle: HENGE.oracle.replace("a historic card", "a historic creature card") })).toBe("land-partial");
    expect(classifyCard({ ...FAIR, name: "Some Other Land" })).toBe("land-partial");
  });
});
