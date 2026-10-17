/**
 * metallicMimic.test.js — the play-weighted program, #961 Metallic Mimic.
 *
 *   "As this creature enters, choose a creature type.
 *    This creature is the chosen type in addition to its other types.
 *    Each other creature you control of the chosen type enters with an additional +1/+1 counter on it."
 *
 * The first two lines were modeled (the enter-site chooser stamps `chosenType`; the layer-4 self type add — Adaptive
 * Automaton). The third is the others-enter-with replacement (CR 614.1c — Renata, Bramblewood Paragon) on the chosen type: the
 * reader (staticAbilityParser.othersEnterWithCounters) returns `chosenType: true`, and the entering creature is matched against
 * the SOURCE permanent's stored `chosenType` (a creature as it enters — CR 614.12; a changeling is every creature type, CR
 * 702.73a). A Mimic whose type was never chosen adds nothing (no type to match). The Mimic never counts itself: it is not on
 * the battlefield as it enters.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { othersEnterWithCounters } from "./staticAbilityParser.js";
import { enterPermanent } from "./resolvers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const MIMIC = {"name":"Metallic Mimic","type":"Artifact Creature — Shapeshifter","mana":"{2}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":[],"oracle":"As this creature enters, choose a creature type.\nThis creature is the chosen type in addition to its other types.\nEach other creature you control of the chosen type enters with an additional +1/+1 counter on it."}; // body-only #961
const ELVES = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const AUTOMATON = {"name":"Universal Automaton","type":"Artifact Creature — Shapeshifter","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)"}; // native-body
const PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // native-body
const RAGING = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"}; // native-body
const HARDENED = {"name":"Hardened Scales","type":"Enchantment","mana":"{G}","cmc":1,"keywords":[],"colors":["G"],"oracle":"If one or more +1/+1 counters would be put on a creature you control, that many plus one +1/+1 counters are put on it instead."}; // native-static
const MOUNTAIN = {"name":"Mountain","type":"Basic Land — Mountain","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {R}.)"}; // land
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const mimic = (chosenType, id = "mimic", controller = "user") => P(id, MIMIC, controller, chosenType ? { chosenType } : {});

function table({ user = [], ai = [], hand = [] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: [] };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0 };
}
const plusOf = (s, pid, name) => s.players[pid].battlefield.filter((p) => p.card?.name === name).map((p) => p.counters?.["+1/+1"] || 0);
function resolveStack(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && g++ < 200) s = passPriority(s);
  return s;
}
const cast = (s, cardId) => {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  if (!a) throw new Error(`${cardId} was not offered`);
  return resolveStack(dispatchAction(s, a));
};

describe("reader + classification", () => {
  it("the chosen-type line reads as the fixed +1 on the source's chosen type", () => {
    expect(othersEnterWithCounters(MIMIC)).toEqual({ subtype: null, fixed: 1, metric: null, chosenType: true });
  });

  it("Metallic Mimic classifies native", () => {
    expect(isNativeTier(classifyCard(MIMIC))).toBe(true);
  });

  it("CREED — without its chooser the chosen-type line is not read (no type could ever be stamped)", () => {
    const noChooser = { ...MIMIC, oracle: "Each other creature you control of the chosen type enters with an additional +1/+1 counter on it." };
    expect(othersEnterWithCounters(noChooser)).toBeNull();
    expect(isNativeTier(classifyCard(noChooser))).toBe(false);
  });

  it("control — the plain and the typed forms read exactly as before", () => {
    expect(othersEnterWithCounters({ name: "Bramblewood Paragon", oracle: "Each other Warrior creature you control enters with an additional +1/+1 counter on it.\nEach creature you control with a +1/+1 counter on it has trample." }))
      .toEqual({ subtype: "Warrior", fixed: 1, metric: null });
  });
});

describe("RUNTIME — the entering creature against the Mimic's chosen type", () => {
  it("⭐ Mimic on Elf: an Elf enters with a +1/+1 counter; a Bear enters with none", () => {
    let s = table({ user: [mimic("Elf")] });
    s = enterPermanent(s, { ...ELVES, id: "c-elf" }, "user");
    s = enterPermanent(s, { ...BEARS, id: "c-bear" }, "user");
    expect(plusOf(s, "user", "Llanowar Elves")).toEqual([1]);
    expect(plusOf(s, "user", "Grizzly Bears")).toEqual([0]);
  });

  it("a changeling is every creature type — it enters with the counter", () => {
    let s = table({ user: [mimic("Elf")] });
    s = enterPermanent(s, { ...AUTOMATON, id: "c-auto" }, "user");
    expect(plusOf(s, "user", "Universal Automaton")).toEqual([1]);
  });

  it("two Mimics on Elf add one each; one Mimic beside Hardened Scales: the Mimic's 1, plus one (CR 616.1 — both replace the one entry)", () => {
    let s = table({ user: [mimic("Elf", "m1"), mimic("Elf", "m2")] });
    s = enterPermanent(s, { ...ELVES, id: "c-elf" }, "user");
    expect(plusOf(s, "user", "Llanowar Elves")).toEqual([2]);
    let s2 = table({ user: [mimic("Elf"), P("hs", HARDENED, "user")] });
    s2 = enterPermanent(s2, { ...ELVES, id: "c-elf" }, "user");
    expect(plusOf(s2, "user", "Llanowar Elves")).toEqual([2]);
  });

  it("control — an opponent's Mimic on Elf gives the user's Elf nothing; a Mimic with no chosen type gives nothing", () => {
    let s = table({ ai: [mimic("Elf", "aim", "ai")] });
    s = enterPermanent(s, { ...ELVES, id: "c-elf" }, "user");
    expect(plusOf(s, "user", "Llanowar Elves")).toEqual([0]);
    let s2 = table({ user: [mimic(null)] });
    s2 = enterPermanent(s2, { ...ELVES, id: "c-elf" }, "user");
    expect(plusOf(s2, "user", "Llanowar Elves")).toEqual([0]);
  });

  it("end to end: the cast Mimic chooses Goblin (the board's tribe), enters with no counter, and the next Goblin cast enters with one", () => {
    let s = table({
      user: [P("piker", PIKER, "user"), ...Array.from({ length: 5 }, (_, i) => P(`m${i}`, MOUNTAIN, "user")), P("f0", FOREST, "user"), P("f1", FOREST, "user")],
      hand: [{ ...MIMIC, id: "mimic-card" }, { ...RAGING, id: "raging" }, { ...BEARS, id: "bear" }],
    });
    s = cast(s, "mimic-card");
    const m = s.players.user.battlefield.find((p) => p.card?.name === "Metallic Mimic");
    expect(m.chosenType).toBe("Goblin");
    expect(m.counters?.["+1/+1"] || 0).toBe(0);
    s = cast(s, "raging");
    expect(plusOf(s, "user", "Raging Goblin")).toEqual([1]);
    s = cast(s, "bear");
    expect(plusOf(s, "user", "Grizzly Bears")).toEqual([0]);
  });
});
