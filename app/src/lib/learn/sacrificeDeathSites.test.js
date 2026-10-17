/**
 * sacrificeDeathSites.test.js — the sacrifices that built their own death entry or graveyard move now leave through the shared
 * sacrifice paths (2026-10-17).
 *
 * Found by the cost-sacrifice slice (costSacrifice.js, 2026-10-16), each re-proved on 93250da2 on a real board:
 *   ① fading.applyFadeVanishUpkeep built a hand-made death entry with no replacement flags: a Blastoderm sacrificed at upkeep under Rest
 *     in Peace went to exile, yet Blood Artist triggered and a death was counted (CR 700.4: dies means put into a graveyard); a
 *     death-specific exile (the Lava Coil-stamp family; at an upkeep, a static such as Misery's Shadow) was not the destination; no
 *     sacrifice watcher fired (CR 701.21a — Korvold).
 *   ② tokens.applyMobilizeSac moved the mobilized Warriors to the graveyard, then asked destroyLethalCreatures, which could no longer see
 *     them: no dies trigger, no sacrifice trigger, no death counted.
 *   ③ gameEngine.sweepFinishedSagas (CR 714.4) assumed a Saga is never a creature: an Urza's Saga that Living Plane made a 1/1 was
 *     sacrificed with no dies trigger (CR 603.10a — its types as it left).
 *   ④ a planeswalker sacrificed as a cost never reached checkPlaneswalkerDiesTriggers, the dispatch a destroyed, combat-killed or
 *     batch-sacrificed planeswalker goes through (Cruel Celebrant's "creature or planeswalker you control dies"). The audit found the
 *     same gap at the single effect sacrifice (an edict that takes a planeswalker) and the legend rule (CR 704.5j).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, oracle-index.json, read in-session 2026-10-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { advanceStep, nextStep, resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { checkAllStateBasedActions } from "./sba.js";

beforeEach(() => _resetIdsForTests());

const BLASTODERM = {"name":"Blastoderm","type":"Creature — Beast","mana":"{2}{G}{G}","cmc":4,"keywords":["Shroud","Fading"],"colors":["G"],"oracle":"Shroud (This creature can't be the target of spells or abilities.)\nFading 3 (This creature enters with three fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)","power":"5","toughness":"5"};
const WANING_WURM = {"name":"Waning Wurm","type":"Creature — Zombie Wurm","mana":"{3}{B}","cmc":4,"keywords":["Vanishing"],"colors":["B"],"oracle":"Vanishing 2 (This creature enters with two time counters on it. At the beginning of your upkeep, remove a time counter from it. When the last is removed, sacrifice it.)","power":"7","toughness":"6"};
const REJUVENATION_CHAMBER = {"name":"Rejuvenation Chamber","type":"Artifact","mana":"{3}","cmc":3,"keywords":["Fading"],"colors":[],"oracle":"Fading 2 (This artifact enters with two fade counters on it. At the beginning of your upkeep, remove a fade counter from it. If you can't, sacrifice it.)\n{T}: You gain 2 life."};
const VOICE_OF_VICTORY = {"name":"Voice of Victory","type":"Creature — Human Bard","mana":"{1}{W}","cmc":2,"keywords":["Mobilize"],"colors":["W"],"oracle":"Mobilize 2 (Whenever this creature attacks, create two tapped and attacking 1/1 red Warrior creature tokens. Sacrifice them at the beginning of the next end step.)\nYour opponents can't cast spells during your turn.","power":"1","toughness":"3"};
const URZAS_SAGA = {"name":"Urza's Saga","type":"Enchantment Land — Urza's Saga","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI — This Saga gains \"{T}: Add {C}.\"\nII — This Saga gains \"{2}, {T}: Create a 0/0 colorless Construct artifact creature token with 'This token gets +1/+1 for each artifact you control.'\"\nIII — Search your library for an artifact card with mana cost {0} or {1}, put it onto the battlefield, then shuffle."};
const LIVING_PLANE = {"name":"Living Plane","type":"World Enchantment","mana":"{2}{G}{G}","cmc":4,"keywords":[],"colors":["G"],"oracle":"All lands are 1/1 creatures that are still lands."};
const CLAWS_OF_GIX = {"name":"Claws of Gix","type":"Artifact","mana":"{0}","cmc":0,"keywords":[],"colors":[],"oracle":"{1}, Sacrifice a permanent: You gain 1 life."};
const SPARK_REAPER = {"name":"Spark Reaper","type":"Creature — Zombie","mana":"{2}{B}","cmc":3,"keywords":[],"colors":["B"],"oracle":"{3}, Sacrifice a creature or planeswalker: You gain 1 life and draw a card.","power":"2","toughness":"3"};
const JACE_BELEREN = {"name":"Jace Beleren","type":"Legendary Planeswalker — Jace","mana":"{1}{U}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"+2: Each player draws a card.\n−1: Target player draws a card.\n−10: Target player mills twenty cards.","loyalty":"3"};
const SHEOLDREDS_EDICT = {"name":"Sheoldred's Edict","type":"Instant","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Choose one —\n• Each opponent sacrifices a nontoken creature of their choice.\n• Each opponent sacrifices a creature token of their choice.\n• Each opponent sacrifices a planeswalker of their choice."};
const CRUEL_CELEBRANT = {"name":"Cruel Celebrant","type":"Creature — Vampire","mana":"{W}{B}","cmc":2,"keywords":[],"colors":["B","W"],"oracle":"Whenever this creature or another creature or planeswalker you control dies, each opponent loses 1 life and you gain 1 life.","power":"1","toughness":"2"};
const BLOOD_ARTIST = {"name":"Blood Artist","type":"Creature — Vampire","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"Whenever this creature or another creature dies, target player loses 1 life and you gain 1 life.","power":"0","toughness":"1"};
const KORVOLD = {"name":"Korvold, Fae-Cursed King","type":"Legendary Creature — Dragon Noble","mana":"{2}{B}{R}{G}","cmc":5,"keywords":["Flying"],"colors":["B","G","R"],"oracle":"Flying\nWhenever Korvold enters or attacks, sacrifice another permanent.\nWhenever you sacrifice a permanent, put a +1/+1 counter on Korvold and draw a card.","power":"4","toughness":"4"};
const DISCIPLE = {"name":"Disciple of the Vault","type":"Creature — Human Cleric","mana":"{B}","cmc":1,"keywords":[],"colors":["B"],"oracle":"Whenever an artifact is put into a graveyard from the battlefield, you may have target opponent lose 1 life.","power":"1","toughness":"1"};
const VENGEFUL_TOWNSFOLK = {"name":"Vengeful Townsfolk","type":"Creature — Human Citizen","mana":"{2}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Whenever one or more other creatures you control die, put a +1/+1 counter on this creature.","power":"3","toughness":"3"};
const MISERYS_SHADOW = {"name":"Misery's Shadow","type":"Creature — Shade","mana":"{1}{B}","cmc":2,"keywords":[],"colors":["B"],"oracle":"If a creature an opponent controls would die, exile it instead.\n{1}: This creature gets +1/+1 until end of turn.","power":"2","toughness":"2"};
const REST_IN_PEACE = {"name":"Rest in Peace","type":"Enchantment","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"When this enchantment enters, exile all graveyards.\nIf a card or token would be put into a graveyard from anywhere, exile it instead."};
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}."};
const SWAMP = {"name":"Swamp","type":"Basic Land — Swamp","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {B}.)"};
const SOL_RING = {"name":"Sol Ring","type":"Artifact","mana":"{1}","cmc":1,"keywords":[],"colors":[],"oracle":"{T}: Add {C}{C}."};

// [id, card, { ...permanent fields }] → a permanent `controller` controls, on the battlefield since turn 1.
const place = (controller) => ([id, card, extra = {}]) =>
  ({ ...createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false }), enteredOnTurn: 1, ...extra });
// A two-player game on turn 3, the user active, at (phase, step); `mine` / `theirs` are the two battlefields.
function board({ phase, step, mine = [], theirs = [], hand = [] }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const library = Array.from({ length: 6 }, (_, i) => ({ id: `L${i}`, name: "Swamp", type: "Basic Land — Swamp", oracle: "({T}: Add {B}.)" }));
  return {
    ...s0, turn: 3, phase, step, activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s0.players,
      user: { ...s0.players.user, battlefield: mine.map(place("user")), hand: hand.map((c, i) => ({ ...c, id: `h${i}` })), graveyard: [], exile: [], library },
      ai: { ...s0.players.ai, battlefield: theirs.map(place("ai")), graveyard: [], exile: [] } },
  };
}
const triggers = (s) => (s.stack || []).filter((o) => o.kind === "triggered-ability").map((o) => `${o.controller}:${o.source?.name}`);
const countOf = (list, entry) => list.filter((x) => x === entry).length;
const zoneNames = (s, zone, pid = "user") => (s.players[pid][zone] || []).map((c) => c.name);
const died = (s) => s.players.user.creaturesDiedThisTurn || 0;
const replacedDeaths = (s) => s.log.filter((e) => e.kind === "creature-exiled-instead" || e.kind === "creature-shuffled-instead").map((e) => [e.kind, e.cardName, e.via]);

// ① Fading / Vanishing — the untap step advanced into the upkeep, where the engine applies the keyword's upkeep sacrifice.
const toUpkeep = (mine) => nextStep(board({ phase: "beginning", step: "untap", mine }));

describe("① the Fading / Vanishing upkeep sacrifice (CR 702.32a / 702.63a)", () => {
  it("⭐⛔ Blastoderm out of fade counters under Rest in Peace: exiled, so no Blood Artist drain and no death — a sacrifice Korvold sees, and the log says where it went", () => {
    const s = toUpkeep([["bd", BLASTODERM, { counters: { fade: 0 } }], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]]);
    expect(s.step).toBe("upkeep");
    expect(zoneNames(s, "exile")).toEqual(["Blastoderm"]);
    expect(zoneNames(s, "graveyard")).toEqual([]);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
    expect(replacedDeaths(s)).toEqual([["creature-exiled-instead", "Blastoderm", "sacrifice"]]);
  });

  it("⭐ CONTROL — without Rest in Peace it dies: the graveyard, ONE Blood Artist trigger, one death, and the sacrifice watcher too", () => {
    const s = toUpkeep([["bd", BLASTODERM, { counters: { fade: 0 } }], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]);
    expect(zoneNames(s, "graveyard")).toEqual(["Blastoderm"]);
    expect(triggers(s)).toEqual(["user:Blood Artist", "user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(1);
    expect(replacedDeaths(s)).toEqual([]);
  });

  it("⛔ a death-specific exile is the destination — an opponent's Misery's Shadow (\"if a creature an opponent controls would die, exile it instead\"): exile, no dies trigger", () => {
    const s = nextStep(board({ phase: "beginning", step: "untap", mine: [["bd", BLASTODERM, { counters: { fade: 0 } }], ["artist", BLOOD_ARTIST]], theirs: [["shadow", MISERYS_SHADOW]] }));
    expect(zoneNames(s, "exile")).toEqual(["Blastoderm"]);
    expect(zoneNames(s, "graveyard")).toEqual([]);
    expect(triggers(s)).toEqual([]);
    expect(died(s)).toBe(0);
    expect(replacedDeaths(s)).toEqual([["creature-exiled-instead", "Blastoderm", "sacrifice"]]);
  });

  it("a fade counter left: removed, nothing sacrificed, nothing triggers", () => {
    const s = toUpkeep([["bd", BLASTODERM, { counters: { fade: 1 } }], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]);
    expect(s.players.user.battlefield.find((p) => p.id === "bd").counters.fade || 0).toBe(0);
    expect(zoneNames(s, "graveyard")).toEqual([]);
    expect(triggers(s)).toEqual([]);
  });

  it("⛔ Vanishing: Waning Wurm's last time counter removed under Rest in Peace — exiled, no Blood Artist, Korvold", () => {
    const s = toUpkeep([["wurm", WANING_WURM, { counters: { time: 1 } }], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]]);
    expect(zoneNames(s, "exile")).toEqual(["Waning Wurm"]);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
  });

  it("Vanishing CONTROL — without Rest in Peace Waning Wurm dies: Blood Artist, then Korvold", () => {
    const s = toUpkeep([["wurm", WANING_WURM, { counters: { time: 1 } }], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]);
    expect(zoneNames(s, "graveyard")).toEqual(["Waning Wurm"]);
    expect(triggers(s)).toEqual(["user:Blood Artist", "user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(1);
  });

  it("⭐ a noncreature with fading (Rejuvenation Chamber): an artifact put into the graveyard (Disciple), then a sacrifice (Korvold) — no death", () => {
    const s = toUpkeep([["chamber", REJUVENATION_CHAMBER, { counters: { fade: 0 } }], ["disciple", DISCIPLE], ["korvold", KORVOLD], ["artist", BLOOD_ARTIST]]);
    expect(zoneNames(s, "graveyard")).toEqual(["Rejuvenation Chamber"]);
    expect(triggers(s)).toEqual(["user:Disciple of the Vault", "user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
  });
});

// ② Mobilize — Voice of Victory attacks, the Warriors join, the turn runs to the end step, where the delayed sacrifice resolves.
function mobilizeToEndStep(mine) {
  let s = board({ phase: "combat", step: "declare-attackers", mine: [["voice", VOICE_OF_VICTORY], ...mine] });
  s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "voice"));
  s = nextStep(s); // the attack declaration closes: the mobilize trigger stacks
  for (let g = 0; s.stack.length && g < 10; g++) s = resolveTopOfStack(s);
  expect(s.players.user.battlefield.filter((p) => p.card?.name === "Warrior")).toHaveLength(2);
  for (let h = 0; h < 30 && s.step !== "end"; h++) {
    s = runStepActions(advanceStep(s));
    for (let k = 0; s.stack.length && s.step !== "end" && k < 10; k++) s = resolveTopOfStack(s);
  }
  expect(s.step).toBe("end");
  expect(triggers(s)).toEqual(["user:Voice of Victory"]); // the CR 603.7 delayed sacrifice, and nothing else
  return resolveTopOfStack(s);
}

describe("② the mobilized Warriors' end-step sacrifice (CR 702.181a)", () => {
  it("⭐ two Warriors sacrificed together: Blood Artist twice, Korvold twice, the one-or-more watcher ONCE, two deaths", () => {
    const s = mobilizeToEndStep([["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["towns", VENGEFUL_TOWNSFOLK]]);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Warrior")).toHaveLength(0);
    const t = triggers(s);
    expect(countOf(t, "user:Blood Artist")).toBe(2);
    expect(countOf(t, "user:Korvold, Fae-Cursed King")).toBe(2);
    expect(countOf(t, "user:Vengeful Townsfolk")).toBe(1);
    expect(died(s)).toBe(2);
    expect(replacedDeaths(s)).toEqual([]);
    expect(s.players.user.battlefield.some((p) => p.id === "voice")).toBe(true); // the source is not among them
  });

  it("⛔ under Rest in Peace the Warriors are exiled instead: no dies trigger, no death — still two sacrifices for Korvold, both logged", () => {
    const s = mobilizeToEndStep([["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["towns", VENGEFUL_TOWNSFOLK], ["rip", REST_IN_PEACE]]);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Warrior")).toHaveLength(0);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King", "user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
    expect(replacedDeaths(s)).toEqual([["creature-exiled-instead", "Warrior", "sacrifice"], ["creature-exiled-instead", "Warrior", "sacrifice"]]);
  });
});

// ③ The Saga sweep — Urza's Saga at lore II; the draw step adds the third, chapter III resolves, and the finalizer sacrifices it.
function sagaFinishes(mine) {
  let s = board({ phase: "beginning", step: "upkeep", mine: [["saga", URZAS_SAGA, { sagaFinal: 3, counters: { lore: 2 } }], ...mine] });
  s = nextStep(s);
  expect(s.step).toBe("draw");
  expect(triggers(s)).toEqual(["user:Urza's Saga"]); // chapter III
  s = resolveTopOfStack(s);
  expect(s.players.user.battlefield.some((p) => p.id === "saga")).toBe(false);
  return s;
}

describe("③ the finished Saga's sacrifice (CR 714.4)", () => {
  it("⭐ an Urza's Saga Living Plane made a 1/1 creature is sacrificed AS a creature: it dies (Blood Artist), and Korvold sees the sacrifice", () => {
    const s = sagaFinishes([["plane", LIVING_PLANE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]);
    expect(zoneNames(s, "graveyard")).toEqual(["Urza's Saga"]);
    expect(triggers(s)).toEqual(["user:Blood Artist", "user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(1);
    expect(s.log.some((e) => e.kind === "saga-sacrificed" && e.cardName === "Urza's Saga")).toBe(true);
  });

  it("⛔ the creature Saga under Rest in Peace: exiled instead, no dies trigger, no death, the replaced death logged", () => {
    const s = sagaFinishes([["plane", LIVING_PLANE], ["artist", BLOOD_ARTIST], ["korvold", KORVOLD], ["rip", REST_IN_PEACE]]);
    expect(zoneNames(s, "exile")).toEqual(["Urza's Saga"]);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
    expect(replacedDeaths(s)).toEqual([["creature-exiled-instead", "Urza's Saga", "sacrifice"]]);
  });

  it("CONTROL — a Saga that is no creature just goes to the graveyard: a sacrifice, no dies trigger, no death", () => {
    const s = sagaFinishes([["artist", BLOOD_ARTIST], ["korvold", KORVOLD]]);
    expect(zoneNames(s, "graveyard")).toEqual(["Urza's Saga"]);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
    expect(died(s)).toBe(0);
    expect(replacedDeaths(s)).toEqual([]);
  });
});

// ④ A planeswalker put into a graveyard from the battlefield dies (CR 700.4) — through every sacrifice and the legend rule.
const activateSacrificing = (s, sourceId, victimId) => {
  const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === sourceId && a.sacCreatureId === victimId);
  expect(act).toBeTruthy();
  return dispatchAction(s, act);
};
const main = (mine, extra = {}) => board({ phase: "precombat-main", step: "main", mine, ...extra });
const JACE = ["jace", JACE_BELEREN, { counters: { loyalty: 3 } }];
const MANA = [["w1", WASTES], ["w2", WASTES], ["w3", WASTES]];

describe("④ a planeswalker sacrificed as a COST dies", () => {
  it("⭐ Claws of Gix sacrificing Jace Beleren: Cruel Celebrant's planeswalker-dies trigger, then Korvold's sacrifice trigger", () => {
    const s = activateSacrificing(main([["claws", CLAWS_OF_GIX], JACE, ["cel", CRUEL_CELEBRANT], ["korvold", KORVOLD], ...MANA]), "claws", "jace");
    expect(zoneNames(s, "graveyard")).toEqual(["Jace Beleren"]);
    expect(triggers(s)).toEqual(["user:Cruel Celebrant", "user:Korvold, Fae-Cursed King"]);
    expect(s.stack[0]).toMatchObject({ kind: "activated-ability", source: { name: "Claws of Gix" } });
  });

  it("⭐ Spark Reaper's \"creature or planeswalker\" cost: the same Cruel Celebrant trigger", () => {
    const s = activateSacrificing(main([["reaper", SPARK_REAPER], JACE, ["cel", CRUEL_CELEBRANT], ...MANA]), "reaper", "jace");
    expect(triggers(s)).toEqual(["user:Cruel Celebrant"]);
  });

  it("⛔ under Rest in Peace Jace is exiled instead: it never died, so no Cruel Celebrant — the sacrifice still triggers Korvold", () => {
    const s = activateSacrificing(main([["claws", CLAWS_OF_GIX], JACE, ["cel", CRUEL_CELEBRANT], ["korvold", KORVOLD], ["rip", REST_IN_PEACE], ...MANA]), "claws", "jace");
    expect(zoneNames(s, "exile")).toEqual(["Jace Beleren"]);
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
  });

  it("CONTROL — Claws of Gix sacrificing a Sol Ring (neither creature nor planeswalker): no Cruel Celebrant", () => {
    const s = activateSacrificing(main([["claws", CLAWS_OF_GIX], ["ring", SOL_RING], ["cel", CRUEL_CELEBRANT], ["korvold", KORVOLD], ...MANA]), "claws", "ring");
    expect(triggers(s)).toEqual(["user:Korvold, Fae-Cursed King"]);
  });
});

describe("④ a planeswalker sacrificed by an EFFECT and by the legend rule dies too", () => {
  // Sheoldred's Edict, its planeswalker mode, at the opponent's Jace — the only planeswalker they control, so a forced sacrifice.
  const edictJace = (theirs) => {
    let s = main([["s1", SWAMP], ["s2", SWAMP]], { theirs: [JACE, ["cel", CRUEL_CELEBRANT], ...theirs], hand: [SHEOLDREDS_EDICT] });
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "h0" && a.chosenMode === 2);
    expect(cast).toBeTruthy();
    s = dispatchAction(s, cast);
    return resolveTopOfStack(s);
  };

  it("⭐ Sheoldred's Edict takes Jace: the opponent's Cruel Celebrant triggers", () => {
    const s = edictJace([]);
    expect(zoneNames(s, "graveyard", "ai")).toEqual(["Jace Beleren"]);
    expect(triggers(s)).toEqual(["ai:Cruel Celebrant"]);
  });

  it("⛔ the same edict under Rest in Peace: Jace exiled instead, no trigger", () => {
    const s = edictJace([["rip", REST_IN_PEACE]]);
    expect(zoneNames(s, "exile", "ai")).toEqual(["Jace Beleren"]);
    expect(triggers(s)).toEqual([]);
  });

  const twoJaces = (extra) => checkAllStateBasedActions(main([
    ["j1", JACE_BELEREN, { counters: { loyalty: 3 }, timestamp: 1 }], ["j2", JACE_BELEREN, { counters: { loyalty: 5 }, timestamp: 2 }], ["cel", CRUEL_CELEBRANT], ...extra]));
  const pending = (s) => (s.pendingTriggers || []).map((t) => t.source?.name);

  it("⭐ the legend rule puts the older Jace into the graveyard (CR 704.5j): it died, so Cruel Celebrant triggers once", () => {
    const s = twoJaces([]);
    expect(s.players.user.battlefield.map((p) => p.id)).toEqual(["j2", "cel"]);
    expect(zoneNames(s, "graveyard")).toEqual(["Jace Beleren"]);
    expect(pending(s)).toEqual(["Cruel Celebrant"]);
  });

  it("⛔ the legend rule under Rest in Peace: exiled instead, no trigger", () => {
    const s = twoJaces([["rip", REST_IN_PEACE]]);
    expect(zoneNames(s, "exile")).toEqual(["Jace Beleren"]);
    expect(pending(s)).toEqual([]);
  });

  it("PARITY CONTROL — a Jace at 0 loyalty (CR 704.5i, the dispatch the others now share) fires the same one Cruel Celebrant trigger", () => {
    const s = checkAllStateBasedActions(main([["j1", JACE_BELEREN, { counters: { loyalty: 0 } }], ["cel", CRUEL_CELEBRANT]]));
    expect(zoneNames(s, "graveyard")).toEqual(["Jace Beleren"]);
    expect(pending(s)).toEqual(["Cruel Celebrant"]);
  });
});
