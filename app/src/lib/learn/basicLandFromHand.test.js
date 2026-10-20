/**
 * "YOU MAY PUT A BASIC LAND CARD FROM YOUR HAND ONTO THE BATTLEFIELD [TAPPED]" — the land-from-hand put (Growth Spiral's) with the
 * basic supertype (CR 205.4c — a land with the basic supertype; Wastes too): put by an effect, never played, so the turn's land drop
 * is not spent (CR 305.4 — an effect that puts a land onto the battlefield is not playing it):
 *   · Terrain Generator (EDHREC #1877) — "{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped.";
 *   · Elvish Pioneer (its enters trigger, "… tapped") and Firebrand Ranger (untapped). Murasa Rootgrazer reads the line too and stays
 *     parked on its other ability ("{T}: Return target basic land you control to its owner's hand.").
 * The pick is among the basic land cards in the hand — a nonbasic land, a spell, a basic in another zone never.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveOptionalChoice, resolveTutorChoice } from "./effects/runProgram.js";
import { parseEffectProgram } from "./effects/parser.js";

beforeEach(() => _resetIdsForTests());

const TERRAIN_GENERATOR = {"name":"Terrain Generator","type":"Land","mana":"","cmc":0,"power":null,"toughness":null,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{2}, {T}: You may put a basic land card from your hand onto the battlefield tapped."}; // land-partial on 0a65c51c
const ELVISH_PIONEER = {"name":"Elvish Pioneer","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"When this creature enters, you may put a basic land card from your hand onto the battlefield tapped."}; // body-only on 0a65c51c
const MURASA_ROOTGRAZER = {"name":"Murasa Rootgrazer","type":"Creature — Beast","mana":"{G}{W}","cmc":2,"power":"2","toughness":"3","keywords":["Vigilance"],"colors":["G","W"],"oracle":"Vigilance\n{T}: You may put a basic land card from your hand onto the battlefield.\n{T}: Return target basic land you control to its owner's hand."}; // body-only on 0a65c51c
const FIREBRAND_RANGER = {"name":"Firebrand Ranger","type":"Creature — Human Soldier Ranger","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":"{G}, {T}: You may put a basic land card from your hand onto the battlefield."}; // body-only on 0a65c51c
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const WASTES = { name: "Wastes", type: "Basic Land", mana: "", cmc: 0, colors: [], keywords: [], oracle: "{T}: Add {C}." };
const TEMPLE = { name: "Temple Garden", type: "Land — Forest Plains", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G} or {W}.)\nAs this land enters, you may pay 2 life. If you don't, it enters tapped." };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: "2", toughness: "2", colors: ["G"], keywords: [], oracle: "" };

const perm = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board({ user = [], hand = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    landsPlayedThisTurn: 0,
    players: { ...s.players, user: { ...s.players.user, hand, battlefield: user, graveyard: [{ ...FOREST, id: "g-forest" }] } } };
}
const HAND = () => [{ ...TEMPLE, id: "h-temple" }, { ...BEARS, id: "h-bears" }, { ...FOREST, id: "h-forest" }, { ...WASTES, id: "h-wastes" }];
// Resolve everything; a "you may" is taken, the search pause records its candidates and takes `pick`.
function resolveAll(s, pick) {
  let out = flushTriggers(s);
  const offered = [];
  for (let i = 0; i < 20 && ((out.stack || []).length || out.pendingChoice || (out.pendingTriggers || []).length); i++) {
    if (out.pendingChoice?.kind === "optional-effect") out = resolveOptionalChoice(out, true);
    else if (out.pendingChoice) { offered.push(...(out.pendingChoice.candidates || out.pendingChoice.options || []).map((c) => c.id ?? c.cardId)); out = resolveTutorChoice(out, pick); }
    else out = flushTriggers(resolveTopOfStack(out));
  }
  return { out, offered: [...new Set(offered)].sort() };
}
const onBf = (s, cardId) => s.players.user.battlefield.find((p) => (p.card?.id ?? p.id) === cardId) || null;

describe("the reader", () => {
  it("⭐ the three cards play their whole text (Murasa Rootgrazer parks on its other line)", () => {
    expect([TERRAIN_GENERATOR, ELVISH_PIONEER, MURASA_ROOTGRAZER, FIREBRAND_RANGER].map((c) => classifyCard(c)))
      .toEqual(["land", "native-trigger", "body-only", "native-activated"]);
  });
  it("⭐ the atom: the hand put with the basic land filter", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle })?.atoms || [];
    expect(atoms("Put a basic land card from your hand onto the battlefield tapped.")).toEqual([
      { op: "tutor", sourceZone: "hand", filter: { groups: [["basic", "land"]] }, filterLabel: "basic land card from your hand", destination: "battlefield", entersTapped: true, targetType: null },
    ]);
  });
  it("control: the plain land form is unchanged", () => {
    const atoms = (oracle) => parseEffectProgram({ name: "x", type: "Sorcery", mana: "{1}", oracle })?.atoms || [];
    expect(atoms("Put a land card from your hand onto the battlefield.")).toEqual([
      { op: "tutor", sourceZone: "hand", filter: { groups: [["land"]] }, filterLabel: "land card from your hand", destination: "battlefield", entersTapped: false, targetType: null },
    ]);
  });
});

describe("Terrain Generator", () => {
  it("⭐ {2}, {T}: the Forest from the hand enters tapped; the pick was among the basic land cards in the hand; no land drop spent", () => {
    const s0 = board({ user: [perm("tg", TERRAIN_GENERATOR), perm("w1", WASTES), perm("w2", WASTES)], hand: HAND() });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "tg");
    expect(act, "the ability is offered").toBeDefined();
    const { out, offered } = resolveAll(dispatchAction(s0, act), "h-forest");
    expect({ offered, forest: onBf(out, "h-forest")?.tapped, hand: out.players.user.hand.map((c) => c.id).sort(), drops: out.landsPlayedThisTurn ?? 0 })
      .toEqual({ offered: ["h-forest", "h-wastes"], forest: true, hand: ["h-bears", "h-temple", "h-wastes"], drops: 0 });
  });
});

describe("Elvish Pioneer, Firebrand Ranger", () => {
  it("⭐ Elvish Pioneer's enters trigger puts the Wastes tapped", () => {
    const s0 = board({ user: [perm("f1", FOREST)], hand: [{ ...ELVISH_PIONEER, id: "h-pio" }, ...HAND()] });
    const cast = legalActionsForPlayer(s0, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h-pio");
    const { out, offered } = resolveAll(resolveTopOfStack(dispatchAction(s0, cast)), "h-wastes");
    expect({ offered, wastes: onBf(out, "h-wastes")?.tapped }).toEqual({ offered: ["h-forest", "h-wastes"], wastes: true });
  });
  it("⭐ Firebrand Ranger's {G}, {T}: the Forest enters untapped", () => {
    const s0 = board({ user: [perm("ranger", FIREBRAND_RANGER), perm("f1", FOREST)], hand: HAND() });
    const act = legalActionsForPlayer(s0, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "ranger");
    expect(act, "the ability is offered").toBeDefined();
    const { out } = resolveAll(dispatchAction(s0, act), "h-forest");
    expect(onBf(out, "h-forest")?.tapped).toBe(false);
  });
});
