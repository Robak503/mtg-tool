/**
 * colorCreatureEnters.test.js — the play-weighted program, #847 Ayara, First of Locthwain, and the colour-qualified enters
 * watchers that print the same subject.
 *
 *   Ayara: "Whenever Ayara or another black creature you control enters, each opponent loses 1 life and you gain 1 life.
 *           {T}, Sacrifice another black creature: Draw a card."
 *   Ivy Lane Denizen (#2474): "Whenever another green creature you control enters, put a +1/+1 counter on target creature."
 *   Sylvan Anthem (#2828): "Green creatures you control get +1/+1. / Whenever a green creature you control enters, scry 1."
 *   + Court Street Denizen, Foundry Street Denizen, Sage's Row Denizen, Shadow Alley Denizen.
 *
 * No enters watcher read a COLOUR: "a/another <colour> creature you control" fell through every subject arm (undetected), and
 * Ayara's "<self> or another black creature you control" hit the compound-subject refusal. They now read as the creature scopes
 * (creatureYouControl / otherCreatureYouControl) with an `etbColor` gate scopeMatches enforces against the entering creature's
 * colours as it enters — through the layers (layers.permanentColors, CR 105.2 / 613.1e), the read the power gate beside it makes.
 * Ayara's union keeps its self half whatever her colour (`etbColorSelfExempt` — "Ayara or another …" names her outright).
 * The cost "Sacrifice another black creature" reads as the sacrifice-another cost with a colour (the victim's colours now).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this slice).
 * Creatures enter through the engine's cast offer (legalActionsForPlayer + dispatchAction) and passPriority, which flushes the
 * triggers through the trigger chooser and resolves them.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { permanentHasKeyword, permanentPower } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const AYARA = {"name":"Ayara, First of Locthwain","type":"Legendary Creature — Elf Noble","mana":"{B}{B}{B}","cmc":3,"power":"2","toughness":"3","keywords":[],"colors":["B"],"oracle":"Whenever Ayara or another black creature you control enters, each opponent loses 1 life and you gain 1 life.\n{T}, Sacrifice another black creature: Draw a card."}; // body-only #847
const IVY = {"name":"Ivy Lane Denizen","type":"Creature — Elf Warrior","mana":"{3}{G}","cmc":4,"power":"2","toughness":"3","keywords":[],"colors":["G"],"oracle":"Whenever another green creature you control enters, put a +1/+1 counter on target creature."}; // body-only #2474
const SYLVAN = {"name":"Sylvan Anthem","type":"Enchantment","mana":"{G}{G}","cmc":2,"keywords":["Scry"],"colors":["G"],"oracle":"Green creatures you control get +1/+1.\nWhenever a green creature you control enters, scry 1."}; // body-only #2828
const COURT = {"name":"Court Street Denizen","type":"Creature — Human Soldier","mana":"{2}{W}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"Whenever another white creature you control enters, tap target creature an opponent controls."}; // body-only #7646
const FOUNDRY = {"name":"Foundry Street Denizen","type":"Creature — Goblin Warrior","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["R"],"oracle":"Whenever another red creature you control enters, this creature gets +1/+0 until end of turn."}; // body-only #10490
const SAGES = {"name":"Sage's Row Denizen","type":"Creature — Vedalken Wizard","mana":"{2}{U}","cmc":3,"power":"2","toughness":"3","keywords":["Mill"],"colors":["U"],"oracle":"Whenever another blue creature you control enters, target player mills two cards."}; // body-only #18122
const SHADOW = {"name":"Shadow Alley Denizen","type":"Creature — Vampire Rogue","mana":"{B}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["B"],"oracle":"Whenever another black creature you control enters, target creature gains intimidate until end of turn. (It can't be blocked except by artifact creatures and/or creatures that share a color with it.)"}; // body-only #7245
const DIRE = {"name":"Dire Undercurrents","type":"Enchantment","mana":"{3}{U/B}{U/B}","cmc":5,"keywords":[],"colors":["B","U"],"oracle":"Whenever a blue creature you control enters, you may have target player draw a card.\nWhenever a black creature you control enters, you may have target player discard a card."}; // body-only #14561
const CORPSE = {"name":"Walking Corpse","type":"Creature — Zombie","mana":"{1}{B}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["B"],"oracle":""}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const WATCHWOLF = {"name":"Watchwolf","type":"Creature — Wolf","mana":"{G}{W}","cmc":2,"power":"3","toughness":"3","keywords":[],"colors":["G","W"],"oracle":""}; // native-body
const PIKER = {"name":"Goblin Piker","type":"Creature — Goblin Warrior","mana":"{1}{R}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["R"],"oracle":""}; // native-body
const MERFOLK = {"name":"Coral Merfolk","type":"Creature — Merfolk","mana":"{1}{U}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["U"],"oracle":""}; // native-body
const ORNITHOPTER = {"name":"Ornithopter","type":"Artifact Creature — Thopter","mana":"{0}","cmc":0,"power":"0","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying"}; // native-body
const HOMARID = {"name":"Homarid Spawning Bed","type":"Enchantment","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"{1}{U}{U}, Sacrifice a blue creature: Create X 1/1 blue Camarid creature tokens, where X is the sacrificed creature's mana value."}; // body-only #25911
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));

function table({ user = [], ai = [], hand = [], pool = {}, active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: libCards(4, pid), life: 20 };
  players.user = { ...players.user, battlefield: user, hand, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}
function resolveAll(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice && g++ < 200) s = passPriority(s);
  return s;
}
/** The user casts `cardId` from hand (the offered cast) and the stack resolves; returns the state BEFORE the flush too. */
function cast(s, cardId) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === cardId);
  expect(a).toBeTruthy();
  return resolveAll(dispatchAction(s, a));
}
const lives = (s) => [s.players.user.life, s.players.ai.life];
const ctr = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;
const byName = (s, pid, name) => s.players[pid].battlefield.find((p) => p.card?.name === name);

describe("DETECTION + CLASSIFICATION", () => {
  it("Ayara's union → the creature scope with the black gate, her own entry exempt from it; it routes natively", () => {
    const d = detectTriggers(AYARA).find((x) => x.event === "etb");
    expect(d).toMatchObject({ event: "etb", scope: "creatureYouControl", etbColor: "B", etbColorSelfExempt: true });
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("\"another <colour> creature you control\" → otherCreatureYouControl + the gate; \"a <colour> creature you control\" → creatureYouControl + the gate", () => {
    const row = (card) => { const d = detectTriggers(card).find((x) => x.event === "etb"); return d && [d.scope, d.etbColor, !!d.etbColorSelfExempt, triggerRoutesNatively(d)]; };
    expect({ ivy: row(IVY), court: row(COURT), foundry: row(FOUNDRY), sages: row(SAGES), shadow: row(SHADOW), sylvan: row(SYLVAN) }).toEqual({
      ivy: ["otherCreatureYouControl", "G", false, true],
      court: ["otherCreatureYouControl", "W", false, true],
      foundry: ["otherCreatureYouControl", "R", false, true],
      sages: ["otherCreatureYouControl", "U", false, true],
      shadow: ["otherCreatureYouControl", "B", false, true],
      sylvan: ["creatureYouControl", "G", false, true],
    });
  });

  it("Ayara's cost → sacrifice another creature that is black now", () => {
    const [ab] = parseActivatedAbilities(AYARA);
    expect({ sacOther: ab.sacOther, tapSelf: ab.tapSelf, modeled: ab.modeled }).toEqual({ sacOther: { type: "creature", another: true, color: "B" }, tapSelf: true, modeled: true });
  });

  it("⭐ Ayara, Ivy Lane Denizen, Sylvan Anthem, Court Street Denizen, Foundry Street Denizen, Sage's Row Denizen and Shadow Alley Denizen classify native", () => {
    for (const c of [AYARA, IVY, SYLVAN, COURT, FOUNDRY, SAGES, SHADOW]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
  });

  it("CREED — Dire Undercurrents' \"you may have target player …\" stays parked; a colour on an opponent's creature or a colour pair is not read", () => {
    expect(isNativeTier(classifyCard(DIRE))).toBe(false);
    for (const oracle of [
      "Whenever a black creature an opponent controls enters, you gain 1 life.",
      "Whenever another black or green creature you control enters, you gain 1 life.",
      "Whenever another black creature enters, you gain 1 life.",
    ]) {
      const d = detectTriggers({ name: "Probe", type: "Creature — Elf", oracle }).filter((x) => x.event === "etb" && x.etbColor);
      expect([oracle, d.length]).toEqual([oracle, 0]);
    }
  });
});

describe("RUNTIME — Ayara, First of Locthwain", () => {
  it("⭐ another black creature (Walking Corpse) enters under the user: the AI loses 1, the user gains 1", () => {
    const s = cast(table({ user: [P("ayara", AYARA, "user")], hand: [{ ...CORPSE, id: "corpse" }], pool: { B: 2 } }), "corpse");
    expect(lives(s)).toEqual([21, 19]);
  });

  it("⭐ Ayara's own entry drains too", () => {
    const s = cast(table({ hand: [{ ...AYARA, id: "ayara-c" }], pool: { B: 3 } }), "ayara-c");
    expect(lives(s)).toEqual([21, 19]);
  });

  it("control — a green creature entering does nothing; neither does the AI's black creature", () => {
    const s = cast(table({ user: [P("ayara", AYARA, "user")], hand: [{ ...BEARS, id: "bears" }], pool: { G: 2 } }), "bears");
    expect(lives(s)).toEqual([20, 20]);
    let t = table({ user: [P("ayara", AYARA, "user")], active: "ai" });
    t = { ...t, players: { ...t.players, ai: { ...t.players.ai, hand: [{ ...CORPSE, id: "ai-corpse" }], manaPool: { W: 0, U: 0, B: 2, R: 0, G: 0, C: 0 } } } };
    const a = legalActionsForPlayer(t, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "ai-corpse");
    expect(a).toBeTruthy();
    t = resolveAll(dispatchAction(t, a));
    expect(lives(t)).toEqual([20, 20]);
  });

  it("⭐ {T}, Sacrifice another black creature: offered with Walking Corpse as the victim — not Grizzly Bears, not Ayara — and it draws a card", () => {
    let s = table({ user: [P("ayara", AYARA, "user"), P("corpse", CORPSE, "user"), P("bears", BEARS, "user")] });
    const acts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "ayara");
    expect(acts.map((a) => a.sacCreatureId)).toEqual(["corpse"]);
    s = resolveAll(dispatchAction(s, acts[0]));
    expect({ corpseGone: !byName(s, "user", "Walking Corpse"), inGy: s.players.user.graveyard.map((c) => c.name), hand: s.players.user.hand.length, tapped: byName(s, "user", "Ayara, First of Locthwain").tapped })
      .toEqual({ corpseGone: true, inGy: ["Walking Corpse"], hand: 1, tapped: true });
  });

  it("control — with no other black creature (an artifact Ornithopter and Grizzly Bears only) the draw is not offered", () => {
    const s = table({ user: [P("ayara", AYARA, "user"), P("thopter", ORNITHOPTER, "user"), P("bears", BEARS, "user")] });
    expect(legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "ayara")).toHaveLength(0);
  });

  it("⭐ the twin the colour cost reads — Homarid Spawning Bed: only a BLUE creature is offered as the victim, and X is its mana value", () => {
    expect(isNativeTier(classifyCard(HOMARID))).toBe(true);
    let s = table({ user: [P("bed", HOMARID, "user"), P("merfolk", MERFOLK, "user"), P("bears", BEARS, "user")], pool: { U: 2, C: 1 } });
    const acts = legalActionsForPlayer(s, "user").filter((x) => x.kind === "activate-ability" && x.permanentId === "bed");
    expect(acts.map((a) => a.sacCreatureId)).toEqual(["merfolk"]);
    s = resolveAll(dispatchAction(s, acts[0]));
    expect({ camarids: s.players.user.battlefield.filter((p) => p.card?.token && /Camarid/.test(String(p.card?.type || ""))).length, merfolk: !!byName(s, "user", "Coral Merfolk") })
      .toEqual({ camarids: 2, merfolk: false });
  });
});

describe("RUNTIME — the Denizens and Sylvan Anthem", () => {
  it("⭐ Ivy Lane Denizen: another green creature entering puts a +1/+1 counter on a creature the user controls", () => {
    const s = cast(table({ user: [P("ivy", IVY, "user")], ai: [P("giant", GIANT, "ai")], hand: [{ ...BEARS, id: "bears" }], pool: { G: 2 } }), "bears");
    const bears = byName(s, "user", "Grizzly Bears");
    expect({ own: ctr(s, "ivy") + ctr(s, bears.id), giant: ctr(s, "giant") }).toEqual({ own: 1, giant: 0 });
  });

  it("Ivy Lane Denizen: a multicoloured green-white creature counts (Watchwolf); a black one does not; its own entry does not", () => {
    const s = cast(table({ user: [P("ivy", IVY, "user")], hand: [{ ...WATCHWOLF, id: "wolf" }], pool: { G: 1, W: 1 } }), "wolf");
    expect(ctr(s, "ivy") + ctr(s, byName(s, "user", "Watchwolf").id)).toBe(1);
    const t = cast(table({ user: [P("ivy", IVY, "user")], hand: [{ ...CORPSE, id: "corpse" }], pool: { B: 2 } }), "corpse");
    expect(ctr(t, "ivy") + ctr(t, byName(t, "user", "Walking Corpse").id)).toBe(0);
    const u = cast(table({ hand: [{ ...IVY, id: "ivy-c" }], pool: { G: 4 } }), "ivy-c");
    expect(ctr(u, byName(u, "user", "Ivy Lane Denizen").id)).toBe(0);
  });

  it("⭐ Court Street Denizen: another white creature entering taps the AI's creature", () => {
    const s = cast(table({ user: [P("court", COURT, "user")], ai: [P("giant", GIANT, "ai")], hand: [{ ...WATCHWOLF, id: "wolf" }], pool: { G: 1, W: 1 } }), "wolf");
    expect(byName(s, "ai", "Hill Giant").tapped).toBe(true);
  });

  it("⭐ Foundry Street Denizen: another red creature entering gives it +1/+0; a blue one does not", () => {
    const s = cast(table({ user: [P("foundry", FOUNDRY, "user")], hand: [{ ...PIKER, id: "piker" }], pool: { R: 2 } }), "piker");
    expect(permanentPower(s, "foundry")).toBe(2);
    const t = cast(table({ user: [P("foundry", FOUNDRY, "user")], hand: [{ ...MERFOLK, id: "merfolk" }], pool: { U: 2 } }), "merfolk");
    expect(permanentPower(t, "foundry")).toBe(1);
  });

  it("⭐ Sage's Row Denizen: another blue creature entering mills the AI two", () => {
    const s = cast(table({ user: [P("sages", SAGES, "user")], hand: [{ ...MERFOLK, id: "merfolk" }], pool: { U: 2 } }), "merfolk");
    expect([s.players.ai.graveyard.length, s.players.ai.library.length]).toEqual([2, 2]);
  });

  it("⭐ Shadow Alley Denizen: another black creature entering gives a creature intimidate until end of turn", () => {
    const s = cast(table({ user: [P("shadow", SHADOW, "user")], hand: [{ ...CORPSE, id: "corpse" }], pool: { B: 2 } }), "corpse");
    const holders = s.players.user.battlefield.filter((p) => permanentHasKeyword(s, p.id, "Intimidate")).length;
    expect(holders).toBe(1);
  });

  it("⭐ Sylvan Anthem: a green creature the user controls entering triggers the scry (the user's scry choice opens); a red one does not", () => {
    const run = (card, pool) => {
      let s = table({ user: [P("sylvan", SYLVAN, "user")], hand: [{ ...card, id: "entering" }], pool });
      s = cast(s, "entering"); // resolves until the stack is empty or a choice is open
      return { scry: s.pendingChoice?.kind ?? null, scryLog: s.log.filter((l) => l.kind === "scry-pending").length };
    };
    expect(run(BEARS, { G: 2 })).toEqual({ scry: "scry-surveil", scryLog: 1 });
    expect(run(PIKER, { R: 2 })).toEqual({ scry: null, scryLog: 0 });
  });
});
