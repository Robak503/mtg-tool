/**
 * tribalDigFilter.test.js — "look at the top N … you may reveal a <Subtype> card" with the PRINTED capital (shelf deck work,
 * 2026-09-30 — Avengers Tower for Hulk Smash; Director Nick Fury, Courageous Outrider, Kolaghan Warmonger, Commune with
 * Dinosaurs, Boromir, Gondor's Hope, Staunch Crewmate).
 *
 * parseTutorFilter's vocabulary is lowercase, and three raw-oracle matchers handed it the printed capital ("a Dragon card"),
 * so every curated creature SUBTYPE was refused there while the lowercase clause paths accepted the same word. The filter
 * now lowercases its phrase, and "hero" joins the curated subtypes under the list's own two criteria (carriers: Avengers
 * Tower, Director Nick Fury; collisions: only the Theros Hero's Path challenge cards, a card type never in a library).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveImpulseDigChoice } from "./effects/runProgram.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { parseTutorFilter } from "./effects/parseHelpers.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const AVENGERS_TOWER = { name: "Avengers Tower", type: "Land", mana: "", cmc: 0, colors: [], keywords: [],
  oracle: "{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a Hero spell or to activate an ability of a Hero source.\n{4}, {T}: Look at the top three cards of your library. You may reveal a Hero card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const COURAGEOUS_OUTRIDER = { name: "Courageous Outrider", type: "Creature — Human Scout", mana: "{3}{W}", cmc: 4, colors: ["W"], power: "3", toughness: "4", keywords: [],
  oracle: "When this creature enters, look at the top four cards of your library. You may reveal a Human card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
const COMMUNE_WITH_DINOSAURS = { name: "Commune with Dinosaurs", type: "Sorcery", mana: "{G}", cmc: 1, colors: ["G"], keywords: [],
  oracle: "Look at the top five cards of your library. You may reveal a Dinosaur or land card from among them and put it into your hand. Put the rest on the bottom of your library in any order." };
// Library cards (only name + type matter to the dig): Captain America, First Avenger is a real Hero.
const CAPTAIN = { id: "cap", name: "Captain America, First Avenger", type: "Legendary Creature — Human Soldier Hero", oracle: "" };
const BEARS = { id: "gb", name: "Grizzly Bears", type: "Creature — Bear", oracle: "" };
const FOREST = { id: "fo", name: "Forest", type: "Basic Land — Forest", oracle: "" };

describe("the filter reads the printed capital", () => {
  it("⭐ \"a Dragon card\", \"a Human card\" and \"a Hero card\" parse; case never mattered", () => {
    expect(["Dragon", "Human", "Hero", "hero"].map((w) => parseTutorFilter(w))).toEqual([
      { groups: [["dragon"]] }, { groups: [["human"]] }, { groups: [["hero"]] }, { groups: [["hero"]] },
    ]);
    const prog = parseEffectClause("Look at the top three cards of your library. You may reveal a Hero card from among them and put it into your hand. Put the rest on the bottom of your library in any order.", "Land", { hasX: false });
    expect({ conf: programConfidence(prog), filter: prog.atoms[0].filter }).toEqual({ conf: "high", filter: { groups: [["hero"]] } });
  });
  it("⛔ an unlisted word still parks — \"a Spacecraft card\" (no curated entry)", () => {
    expect(parseTutorFilter("Spacecraft")).toBeNull();
  });
  it("⭐ the carriers read native (Avengers Tower as a land)", () => {
    expect({ tower: classifyCard(AVENGERS_TOWER), outrider: isNativeTier(classifyCard(COURAGEOUS_OUTRIDER)), commune: isNativeTier(classifyCard(COMMUNE_WITH_DINOSAURS)) })
      .toEqual({ tower: "land", outrider: true, commune: true });
  });
});

describe("⭐ Avengers Tower's real activation", () => {
  function board(library) {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const tower = createPermanent({ id: "at", card: { ...AVENGERS_TOWER, id: "c-at" }, controller: "user", summoningSick: false });
    return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
      players: { ...g.players, user: { ...g.players.user, battlefield: [tower], library, hand: [], manaPool: { ...g.players.user.manaPool, C: 4 } } } };
  }
  const activate = (s) => {
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "at" && /Look at the top three/i.test(a.abilityText || a.label || JSON.stringify(a.program || "")));
    let out = dispatchAction(s, act);
    for (let i = 0; i < 4 && out.stack.length && !out.pendingChoice; i++) out = resolveTopOfStack(out);
    return out;
  };
  it("⭐ only the Hero is offered from the top three; taking it puts it in hand and the rest on the bottom", () => {
    const paused = activate(board([BEARS, CAPTAIN, FOREST, { id: "x", name: "Deep Card", type: "Sorcery", oracle: "" }]));
    const offered = (paused.pendingChoice?.candidates || []).map((c) => c.name);
    const out = resolveImpulseDigChoice(paused, "cap");
    const row = { offered, hand: out.players.user.hand.map((c) => c.name), libraryTop: out.players.user.library[0]?.name };
    console.log(`WITNESS tribalDig ${JSON.stringify(row)}`);
    expect(row).toEqual({ offered: ["Captain America, First Avenger"], hand: ["Captain America, First Avenger"], libraryTop: "Deep Card" });
  });
  it("VACUITY CONTROL — no Hero in the top three: nothing can be taken", () => {
    const paused = activate(board([BEARS, FOREST, { id: "y", name: "Other", type: "Instant", oracle: "" }, { id: "x", name: "Deep Card", type: "Sorcery", oracle: "" }]));
    expect((paused.pendingChoice?.candidates || []).length).toBe(0);
    expect(paused.players.user.hand).toEqual([]);
  });
});
