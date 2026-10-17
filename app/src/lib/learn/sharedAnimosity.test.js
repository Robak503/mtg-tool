/**
 * SHARED ANIMOSITY — the play-weighted program (EDHREC #684).
 *   "Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a
 *    creature type with it."
 *
 * One trigger per attacker (CR 508.3a, they trigger as the declaration closes, CR 508.1m). The trigger's "it" is the attacking
 * creature (the non-self pronoun the detector names "the triggering creature"); the bonus counts the OTHER attacking creatures
 * (CR 508.1k — attacking until removed from combat, CR 506.4) that share at least one creature type with it (CR 205.3m), a
 * changeling being every creature type (CR 702.73a). The count is taken once, as the trigger resolves (CR 608.2h), and the bonus
 * it gives is locked in (a layer-7c modification, CR 613.4c) until end of turn (CR 611.2a, 514.2).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier at generation).
 * Every runtime case drives the engine's own entry points: legalActionsForPlayer + dispatchAction declare the attackers,
 * passPriority closes the declaration (the triggers stack) and resolves them in the declare attackers step.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, passPriority, runStepActions } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness, findPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const ANIMOSITY = {"name":"Shared Animosity","type":"Enchantment","mana":"{2}{R}","cmc":3,"keywords":[],"colors":["R"],"oracle":"Whenever a creature you control attacks, it gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it."}; // body-only before this slice
const LLANOWAR = {"name":"Llanowar Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const FYNDHORN = {"name":"Fyndhorn Elves","type":"Creature — Elf Druid","mana":"{G}","cmc":1,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Add {G}."}; // native-mana
const ELVISH_WARRIOR = {"name":"Elvish Warrior","type":"Creature — Elf Warrior","mana":"{G}{G}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["G"],"oracle":""}; // native-body
const CHANGELING = {"name":"Woodland Changeling","type":"Creature — Shapeshifter","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":["Changeling"],"colors":["G"],"oracle":"Changeling (This card is every creature type.)"}; // native-body
const AUTOMATON = {"name":"Universal Automaton","type":"Artifact Creature — Shapeshifter","mana":"{1}","cmc":1,"power":"1","toughness":"1","keywords":["Changeling"],"colors":[],"oracle":"Changeling (This card is every creature type.)"}; // native-body
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const RAGING_GOBLIN = {"name":"Raging Goblin","type":"Creature — Goblin Berserker","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste (This creature can attack and {T} as soon as it comes under your control.)"}; // native-body
const COLONY_SHIP = {"name":"Mondassian Colony Ship","type":"Plane — Spacecraft","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"Whenever a creature attacks, it gets +1/+1 until end of turn for each other creature its controller controls that shares a creature type with it.\nWhenever chaos ensues, turn target creature face down. It becomes a 2/2 Cyberman artifact creature."}; // body-only
const RABBLEMASTER = {"name":"Goblin Rabblemaster","type":"Creature — Goblin Warrior","mana":"{2}{R}","cmc":3,"power":"2","toughness":"2","keywords":[],"colors":["R"],"oracle":"Other Goblin creatures you control attack each combat if able.\nAt the beginning of combat on your turn, create a 1/1 red Goblin creature token with haste.\nWhenever this creature attacks, it gets +1/+0 until end of turn for each other attacking Goblin."}; // body-only

const P = (id, card, controller = "user") => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });

/** A two-seat game at the user's declare-attackers step; `user` and `ai` are the two battlefields. */
function table(user, ai = []) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, stack: [], pendingTriggers: [],
    players: { ...g.players, user: { ...g.players.user, battlefield: user }, ai: { ...g.players.ai, battlefield: ai } } };
}
/** Declare each id as an attacker through the offered actions, then pass once: the declaration closes and the attack triggers stack. */
function declare(s, ids) {
  for (const id of ids) {
    const action = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === id);
    if (!action) throw new Error(`no declare-attacker offered for ${id}`);
    s = dispatchAction(s, action);
  }
  return passPriority(s);
}
/** Pass until the declare attackers step is over (every attack trigger resolved). */
function resolveAll(s) {
  let g = 0;
  while (s.step === "declare-attackers" && g++ < 120) s = passPriority(s);
  return s;
}
const attack = (s, ids) => resolveAll(declare(s, ids));
const powers = (s, ids) => Object.fromEntries(ids.map((id) => [id, findPermanent(s, id) ? creaturePower(findPermanent(s, id).permanent, s) : null]));
const toughs = (s, ids) => Object.fromEntries(ids.map((id) => [id, creatureToughness(findPermanent(s, id).permanent, s)]));

const ELVES = () => [P("llan", LLANOWAR), P("fynd", FYNDHORN), P("warrior", ELVISH_WARRIOR)];

describe("parse + classify", () => {
  it("⭐ one attacks trigger per creature you control; its clause is the triggering creature's power pump sized by the other attackers sharing a creature type; native-trigger", () => {
    const trig = detectTriggers(ANIMOSITY);
    const p = parseEffectClause(trig[0]?.effectClause, ANIMOSITY.type);
    const row = { triggers: trig.map((t) => ({ event: t.event, scope: t.scope })), routes: trig.map(triggerRoutesNatively), conf: programConfidence(p), atoms: p.atoms,
      tier: classifyCard(ANIMOSITY) };
    console.log("  WITNESS animosityParse", JSON.stringify(row));
    expect(row).toEqual({ triggers: [{ event: "attacks", scope: "creatureYouControl" }], routes: [true], conf: "high",
      atoms: [{ op: "pump", target: "thatCreature", ptDelta: { p: 0, t: 0 }, ptDeltaCount: { kind: "otherAttackersSharingCreatureType", per: 1 }, ptDeltaCountSlot: "p" }],
      tier: "native-trigger" });
  });

  it("CREED near-misses stay parked: the source's own \"it\" (a self trigger), every other creature its controller controls (Mondassian Colony Ship), a named type (Goblin Rabblemaster)", () => {
    expect(programConfidence(parseEffectClause("this creature gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it", "Creature"))).toBe("low");
    expect(programConfidence(parseEffectClause("target creature gets +1/+0 until end of turn for each other attacking creature that shares a creature type with it", "Instant"))).toBe("low");
    expect(classifyCard(COLONY_SHIP)).not.toMatch(/^native/);
    expect(classifyCard(RABBLEMASTER)).not.toMatch(/^native/);
  });
});

describe("the runtime — three Elves, a changeling, a Bear", () => {
  it("⭐ each Elf +3 (two Elves and the changeling), the changeling +4 (every other attacker has a creature type), the Bear +1 (the changeling only); toughness untouched", () => {
    const ids = ["llan", "fynd", "warrior", "chg", "bears"];
    const s = attack(table([P("anim", ANIMOSITY), ...ELVES(), P("chg", CHANGELING), P("bears", BEARS)]), ids);
    const row = { power: powers(s, ids), tough: toughs(s, ids) };
    console.log("  WITNESS animosityBoard", JSON.stringify(row));
    expect(row).toEqual({ power: { llan: 4, fynd: 4, warrior: 5, chg: 6, bears: 3 }, tough: { llan: 1, fynd: 1, warrior: 3, chg: 2, bears: 2 } });
  });

  it("⭐ a non-sharing attacker gets +0: three Elves and a Bear, no changeling — each Elf +2, the Bear stays 2", () => {
    const ids = ["llan", "fynd", "warrior", "bears"];
    const s = attack(table([P("anim", ANIMOSITY), ...ELVES(), P("bears", BEARS)]), ids);
    expect(powers(s, ids)).toEqual({ llan: 3, fynd: 3, warrior: 4, bears: 2 });
  });

  it("two changelings share every creature type with each other (+1 each); a non-attacking Elf is not counted", () => {
    const s = attack(table([P("anim", ANIMOSITY), P("chg", CHANGELING), P("auto", AUTOMATON), P("llan", LLANOWAR)]), ["chg", "auto"]);
    expect(powers(s, ["chg", "auto", "llan"])).toEqual({ chg: 3, auto: 2, llan: 1 });
  });

  it("⭐ the bonus ends at end of turn (CR 514.2): after the cleanup step every attacker is back to its printed power", () => {
    const ids = ["llan", "fynd", "warrior"];
    let s = attack(table([P("anim", ANIMOSITY), ...ELVES()]), ids);
    const during = powers(s, ids);
    let g = 0;
    while (s.turn === 5 && g++ < 400) s = s.priorityHolder ? passPriority(s) : runStepActions(advanceStep(s)); // untap / cleanup grant no priority
    expect({ during, after: powers(s, ids), turn: s.turn }).toEqual({ during: { llan: 3, fynd: 3, warrior: 4 }, after: { llan: 1, fynd: 1, warrior: 2 }, turn: 6 });
  });

  it("⭐ counted as the trigger resolves (CR 608.2h): an Elf that leaves before the triggers resolve is not counted, and the bonus already given stays when another leaves after", () => {
    const ids = ["llan", "fynd", "warrior"];
    let s = declare(table([P("anim", ANIMOSITY), ...ELVES()]), ids);
    const stacked = s.stack.length;
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "fynd" });
    s = resolveAll(s);
    const resolved = powers(s, ["llan", "warrior"]);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "warrior" });
    expect({ stacked, resolved, locked: powers(s, ["llan"]) }).toEqual({ stacked: 3, resolved: { llan: 2, warrior: 3 }, locked: { llan: 2 } });
  });
});

describe("controls", () => {
  it("an opponent's Shared Animosity does not pump the user's attackers (\"a creature you control\")", () => {
    const ids = ["llan", "fynd", "warrior"];
    const s = attack(table(ELVES(), [P("oanim", ANIMOSITY, "ai")]), ids);
    expect(powers(s, ids)).toEqual({ llan: 1, fynd: 1, warrior: 2 });
  });

  it("without Shared Animosity the same attack changes nothing; a lone attacker gets +0", () => {
    expect(powers(attack(table(ELVES()), ["llan", "fynd", "warrior"]), ["llan", "fynd", "warrior"])).toEqual({ llan: 1, fynd: 1, warrior: 2 });
    expect(powers(attack(table([P("anim", ANIMOSITY), P("gob", RAGING_GOBLIN)]), ["gob"]), ["gob"])).toEqual({ gob: 1 });
  });
});
