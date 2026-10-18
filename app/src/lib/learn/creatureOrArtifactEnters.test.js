/**
 * creatureOrArtifactEnters.test.js — the play-weighted program: two enters-watcher subjects no arm read.
 *
 *   Weftstalker Ardent (#1378):  "Whenever another creature or artifact you control enters, this creature deals 1 damage to
 *                                 each opponent." (+ Warp)
 *   Haliya, Guided by Light (#1479): "Whenever Haliya or another creature or artifact you control enters, you gain 1 life."
 *                                 (+ an end-step draw, Warp)
 *   Glaring Fleshraker (#1211):  "Whenever another colorless creature you control enters, this creature deals 1 damage to each
 *                                 opponent." (+ its colorless-spell cast trigger)
 *   + Flayer Drone ("… another colorless creature you control enters, target opponent loses 1 life.").
 *
 * (1) "creature or artifact" — a permanent the watcher's controller controls that is a creature (after the layers) or an
 *     artifact: ONE entering permanent, ONE trigger (an artifact creature is not two). "another" excludes the source; Haliya's
 *     "<self> or another …" is the same set with her own entry in it (she is a creature).
 * (2) "colorless creature" — the creature scope with the entering creature's colours read as it enters through the layers
 *     (CR 105.2c — a colorless object has no color; devoid, CR 702.114a, makes one), the read Ayara's colour gate makes; a
 *     permanent that can't be read never fires.
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this
 * slice). Spells are cast through the engine's offer (legalActionsForPlayer + dispatchAction) and passPriority resolves them.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers, checkEnterTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const WEFT = {"name":"Weftstalker Ardent","type":"Creature — Drix Artificer","mana":"{2}{R}","cmc":3,"power":"2","toughness":"3","keywords":["Warp"],"colors":["R"],"oracle":"Whenever another creature or artifact you control enters, this creature deals 1 damage to each opponent.\nWarp {R} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)"}; // body-only #1378
const HALIYA = {"name":"Haliya, Guided by Light","type":"Legendary Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"3","toughness":"3","keywords":["Warp"],"colors":["W"],"oracle":"Whenever Haliya or another creature or artifact you control enters, you gain 1 life.\nAt the beginning of your end step, draw a card if you've gained 3 or more life this turn.\nWarp {W} (You may cast this card from your hand for its warp cost. Exile this creature at the beginning of the next end step, then you may cast it from exile on a later turn.)"}; // body-only #1479
const FLESHRAKER = {"name":"Glaring Fleshraker","type":"Creature — Eldrazi Drone","mana":"{2}{C}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":[],"oracle":"Whenever you cast a colorless spell, create a 0/1 colorless Eldrazi Spawn creature token with \"Sacrifice this token: Add {C}.\"\nWhenever another colorless creature you control enters, this creature deals 1 damage to each opponent."}; // body-only #1211
const FLAYER = {"name":"Flayer Drone","type":"Creature — Eldrazi Drone","mana":"{1}{B}{R}","cmc":3,"power":"3","toughness":"1","keywords":["Devoid","First strike"],"colors":[],"oracle":"Devoid (This card has no color.)\nFirst strike\nWhenever another colorless creature you control enters, target opponent loses 1 life."}; // body-only #19003
const MIMIC = {"name":"Eldrazi Mimic","type":"Creature — Eldrazi","mana":"{2}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":[],"oracle":"Whenever another colorless creature you control enters, you may have this creature's base power and toughness become equal to that creature's power and toughness until end of turn."}; // body-only #10681
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"}; // native-body #782
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land

const P = (id, card, controller) => createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false });
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));

function table({ user = [], ai = [], hand = [], pool = {}, active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: libCards(4, pid), life: 20, landsPlayedThisTurn: 0 };
  players.user = { ...players.user, battlefield: user, hand, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}
function resolveAll(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice && g++ < 200) s = passPriority(s);
  return s;
}
/** `pid` casts `cardId` from hand (the offered cast) and the stack resolves. */
function cast(s, cardId, pid = "user") {
  const a = legalActionsForPlayer(s, pid).find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  expect(a).toBeTruthy();
  return resolveAll(dispatchAction(s, a));
}
const lives = (s) => [s.players.user.life, s.players.ai.life];

describe("DETECTION + CLASSIFICATION", () => {
  it("⭐ 'another creature or artifact you control' → the creature-or-artifact scope without the source; Haliya's union keeps hers", () => {
    const row = (card) => { const d = detectTriggers(card).find((x) => x.event === "etb"); return d && { scope: d.scope, excludeSelf: !!d.etbExcludeSelf, routes: triggerRoutesNatively(d) }; };
    expect({ weft: row(WEFT), haliya: row(HALIYA) }).toEqual({
      weft: { scope: "creatureOrArtifactYouControl", excludeSelf: true, routes: true },
      haliya: { scope: "creatureOrArtifactYouControl", excludeSelf: false, routes: true },
    });
  });

  it("⭐ 'another colorless creature you control' → the other-creature scope with the colorless gate", () => {
    const row = (card) => { const d = detectTriggers(card).find((x) => x.event === "etb"); return d && { scope: d.scope, colorless: !!d.etbColorless, routes: triggerRoutesNatively(d) }; };
    expect({ fleshraker: row(FLESHRAKER), flayer: row(FLAYER) }).toEqual({
      fleshraker: { scope: "otherCreatureYouControl", colorless: true, routes: true },
      flayer: { scope: "otherCreatureYouControl", colorless: true, routes: true },
    });
  });

  it("⭐ Weftstalker Ardent, Haliya, Glaring Fleshraker and Flayer Drone classify native", () => {
    for (const c of [WEFT, HALIYA, FLESHRAKER, FLAYER]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — Eldrazi Mimic's base P/T effect stays parked; an opponent's or a colour-pair subject stays undetected", () => {
    expect(isNativeTier(classifyCard(MIMIC))).toBe(false);
    for (const oracle of [
      "Whenever another creature or artifact an opponent controls enters, you gain 1 life.",
      "Whenever another colorless creature enters, you gain 1 life.",
      "Whenever another creature or enchantment you control enters, you gain 1 life.",
    ]) {
      const d = detectTriggers({ name: "Probe", type: "Creature — Elf", oracle }).filter((x) => x.event === "etb");
      expect([oracle, d.length]).toEqual([oracle, 0]);
    }
  });
});

describe("RUNTIME — Weftstalker Ardent", () => {
  it("⭐ a noncreature artifact (Mind Stone) entering: 1 damage to the opponent", () => {
    const s = cast(table({ user: [P("weft", WEFT, "user")], hand: [{ ...MIND_STONE, id: "stone" }], pool: { C: 2 } }), "stone");
    expect(lives(s)).toEqual([20, 19]);
  });

  it("⭐ a creature (Grizzly Bears) entering: 1 damage; an artifact creature (Ornithopter): exactly 1, not 2", () => {
    const bears = cast(table({ user: [P("weft", WEFT, "user")], hand: [{ ...BEARS, id: "bears" }], pool: { G: 2 } }), "bears");
    const thopter = cast(table({ user: [P("weft", WEFT, "user")], hand: [{ ...ORNITHOPTER, id: "thopter" }] }), "thopter");
    expect({ bears: lives(bears), thopter: lives(thopter) }).toEqual({ bears: [20, 19], thopter: [20, 19] });
  });

  it("control — its own entry, a land, and the opponent's artifact do nothing", () => {
    const own = cast(table({ hand: [{ ...WEFT, id: "weft-c" }], pool: { R: 1, C: 2 } }), "weft-c");
    let t = table({ user: [P("weft", WEFT, "user")] });
    const land = legalActionsForPlayer({ ...t, players: { ...t.players, user: { ...t.players.user, hand: [{ ...FOREST, id: "forest" }] } } }, "user").find((x) => x.kind === "play-land");
    expect(land).toBeTruthy();
    const afterLand = resolveAll(dispatchAction({ ...t, players: { ...t.players, user: { ...t.players.user, hand: [{ ...FOREST, id: "forest" }] } } }, land));
    t = table({ user: [P("weft", WEFT, "user")], active: "ai" });
    t = { ...t, players: { ...t.players, ai: { ...t.players.ai, hand: [{ ...MIND_STONE, id: "ai-stone" }], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 2 } } } };
    const theirs = cast(t, "ai-stone", "ai");
    expect({ own: lives(own), land: lives(afterLand), theirs: lives(theirs) }).toEqual({ own: [20, 20], land: [20, 20], theirs: [20, 20] });
  });
});

describe("RUNTIME — Haliya, Guided by Light", () => {
  it("⭐ her own entry gains 1; then an artifact entering gains 1 more", () => {
    let s = cast(table({ hand: [{ ...HALIYA, id: "haliya-c" }, { ...MIND_STONE, id: "stone" }], pool: { W: 3, C: 2 } }), "haliya-c");
    const afterHer = lives(s);
    s = cast(s, "stone");
    expect({ afterHer, afterStone: lives(s) }).toEqual({ afterHer: [21, 20], afterStone: [22, 20] });
  });
});

describe("RUNTIME — the colorless watchers", () => {
  it("⭐ Glaring Fleshraker: casting Ornithopter makes a Spawn (its cast trigger) and both colorless creatures entering deal 1 each", () => {
    const s = cast(table({ user: [P("flesh", FLESHRAKER, "user")], hand: [{ ...ORNITHOPTER, id: "thopter" }] }), "thopter");
    expect(lives(s)).toEqual([20, 18]);
  });

  it("control — a green creature entering beside Fleshraker deals nothing", () => {
    const s = cast(table({ user: [P("flesh", FLESHRAKER, "user")], hand: [{ ...BEARS, id: "bears" }], pool: { G: 2 } }), "bears");
    expect(lives(s)).toEqual([20, 20]);
  });

  it("⭐ a colorless NONcreature (Mind Stone): only the cast trigger's Spawn deals its 1 — the artifact itself is no creature", () => {
    const s = cast(table({ user: [P("flesh", FLESHRAKER, "user")], hand: [{ ...MIND_STONE, id: "stone" }], pool: { C: 2 } }), "stone");
    expect(lives(s)).toEqual([20, 19]);
  });

  it("⭐ Flayer Drone: a colorless creature entering — the opponent loses 1", () => {
    const s = cast(table({ user: [P("flayer", FLAYER, "user")], hand: [{ ...ORNITHOPTER, id: "thopter" }] }), "thopter");
    expect(lives(s)).toEqual([20, 19]);
  });

  it("control — a green creature entering fires no colorless watcher (the watcher check alone)", () => {
    const s0 = table({ user: [P("flayer", FLAYER, "user"), P("bears", BEARS, "user")] });
    const bears = s0.players.user.battlefield.find((p) => p.id === "bears");
    expect((checkEnterTriggers(s0, bears).pendingTriggers || []).length).toBe(0);
  });
});
