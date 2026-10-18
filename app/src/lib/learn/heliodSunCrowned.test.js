/**
 * heliodSunCrowned.test.js — the play-weighted program, #1028 Heliod, Sun-Crowned.
 *
 *   "Indestructible
 *    As long as your devotion to white is less than five, Heliod isn't a creature.
 *    Whenever you gain life, put a +1/+1 counter on target creature or enchantment you control.
 *    {1}{W}: Another target creature gains lifelink until end of turn."
 *
 * The keyword and the devotion static were modeled; two clauses were not:
 *   · "put a +1/+1 counter on target creature or enchantment you control" — the counter arm read "target artifact or creature you
 *     control" and "target creature or Vehicle you control" but not this union. It reads now as the `creatureOrEnchantment` pool
 *     (the enumerator's layer-aware predicate — a God below its devotion is an enchantment, not a creature) with the controller
 *     restriction, so only the controller's own permanents are legal (CR 115.1);
 *   · "Another target creature gains lifelink until end of turn" — the another-target keyword grant read "another target creature
 *     YOU CONTROL" only. The bare form is any player's creature other than the ability's own permanent ("another" — Heliod, once
 *     it is a creature, never targets itself). The same arm reads Trailblazing Historian, Hotfoot Gnome, Torch Courier, Gravity
 *     Negator and, through the subtype-target wrapper, Attended Healer's "another target Cleric".
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this slice).
 * The life gain is a real spell cast through the engine's offer (Revitalize); the activation is the engine's own offered action.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";
import { permanentHasKeyword, permanentIsCreature } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const HELIOD = {"name":"Heliod, Sun-Crowned","type":"Legendary Enchantment Creature — God","mana":"{2}{W}","cmc":3,"power":"5","toughness":"5","keywords":["Indestructible"],"colors":["W"],"oracle":"Indestructible\nAs long as your devotion to white is less than five, Heliod isn't a creature.\nWhenever you gain life, put a +1/+1 counter on target creature or enchantment you control.\n{1}{W}: Another target creature gains lifelink until end of turn."}; // body-only #1028
const REVITALIZE = {"name":"Revitalize","type":"Instant","mana":"{1}{W}","cmc":2,"keywords":[],"colors":["W"],"oracle":"You gain 3 life.\nDraw a card."}; // native-spell #4234
const LIONS = {"name":"Savannah Lions","type":"Creature — Cat","mana":"{W}","cmc":1,"power":"2","toughness":"1","keywords":[],"colors":["W"],"oracle":""}; // native-body #10723
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."}; // native-static #7248
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const GIANT = {"name":"Hill Giant","type":"Creature — Giant","mana":"{3}{R}","cmc":4,"power":"3","toughness":"3","keywords":[],"colors":["R"],"oracle":""}; // native-body
const PLAINS = {"name":"Plains","type":"Basic Land — Plains","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {W}.)"}; // land

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const plains = (n, owner = "user") => Array.from({ length: n }, (_, i) => P(`${owner}-pl${i}`, PLAINS, owner));
const libCards = (n, prefix) => Array.from({ length: n }, (_, i) => ({ ...BEARS, id: `${prefix}-lib${i}` }));
const COUNTER_CLAUSE = "put a +1/+1 counter on target creature or enchantment you control";

function table({ user = [], ai = [], hand = [], active = "user" } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s0.players };
  for (const pid of Object.keys(players)) players[pid] = { ...players[pid], battlefield: [], hand: [], graveyard: [], library: libCards(3, pid), life: 20 };
  players.user = { ...players.user, battlefield: user, hand };
  players.ai = { ...players.ai, battlefield: ai };
  return { ...s0, players, turn: 5, phase: "precombat-main", step: "main", activePlayer: active, priorityHolder: active, consecutivePasses: 0 };
}
function resolveAll(s) {
  let g = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && !s.pendingChoice && g++ < 200) s = passPriority(s);
  return s;
}
function castRevitalize(s) {
  const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === "rev");
  expect(a).toBeTruthy();
  return resolveAll(dispatchAction(s, a));
}
const counters = (s, id) => [...s.players.user.battlefield, ...s.players.ai.battlefield].find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;
const activations = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "heliod");
// Devotion to white five with Heliod (W) + two Savannah Lions (W, W) + Glorious Anthem (W W).
const devotionFive = () => [P("heliod", HELIOD, "user"), P("li1", LIONS, "user"), P("li2", LIONS, "user"), P("anthem", ANTHEM, "user")];

describe("PARSE + CLASSIFICATION", () => {
  it("the trigger's counter → the creature-or-enchantment pool restricted to its controller; the trigger routes natively", () => {
    const p = parseEffectClause(COUNTER_CLAUSE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureOrEnchantment", restrictions: [{ kind: "controller", who: "you" }] }]);
    const d = detectTriggers(HELIOD).find((x) => x.event === "lifegain");
    expect(triggerRoutesNatively(d)).toBe(true);
  });

  it("the activation → a lifelink grant on any creature but its source", () => {
    const p = parseEffectClause("Another target creature gains lifelink until end of turn.", "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "pump", targetType: "creature", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Lifelink"] }]);
  });

  it("⭐ Heliod, Sun-Crowned classifies native", () => {
    expect(isNativeTier(classifyCard(HELIOD))).toBe(true);
  });

  it("control — the \"you control\" grant keeps its own atom; CREED — a -1/-1 counter on the union stays unread", () => {
    expect(parseEffectClause("Another target creature you control gains lifelink until end of turn.", "Instant", { sourceScoped: true }).atoms)
      .toEqual([{ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Lifelink"] }]);
    expect(programConfidence(parseEffectClause("put a -1/-1 counter on target creature or enchantment you control", "Instant", { sourceScoped: true }))).toBe("low");
  });
});

describe("RUNTIME — whenever you gain life", () => {
  it("⭐ the user gains 3 (Revitalize) with only Heliod, a noncreature enchantment: the counter goes on Heliod", () => {
    let s = table({ user: [P("heliod", HELIOD, "user"), ...plains(2)], hand: [{ ...REVITALIZE, id: "rev" }] });
    expect(permanentIsCreature(s, "heliod")).toBe(false);
    s = castRevitalize(s);
    expect(s.players.user.life).toBe(23);
    expect(counters(s, "heliod")).toBe(1);
  });

  it("⭐ with the user's Grizzly Bears and the AI's Hill Giant: one counter on a permanent the user controls, never the Giant", () => {
    let s = table({ user: [P("heliod", HELIOD, "user"), P("bears", BEARS, "user"), ...plains(2)], ai: [P("giant", GIANT, "ai")], hand: [{ ...REVITALIZE, id: "rev" }] });
    s = castRevitalize(s);
    expect({ own: counters(s, "heliod") + counters(s, "bears"), giant: counters(s, "giant") }).toEqual({ own: 1, giant: 0 });
  });

  it("control — the AI gaining life does not trigger the user's Heliod", () => {
    let s = table({ user: [P("heliod", HELIOD, "user")], ai: plains(2, "ai"), active: "ai" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, hand: [{ ...REVITALIZE, id: "rev" }] } } };
    const a = legalActionsForPlayer(s, "ai").find((x) => x.kind === "cast-spell" && x.cardId === "rev");
    expect(a).toBeTruthy();
    s = resolveAll(dispatchAction(s, a));
    expect([s.players.ai.life, counters(s, "heliod")]).toEqual([23, 0]);
  });
});

describe("RUNTIME — {1}{W}: another target creature gains lifelink", () => {
  it("⭐ at devotion five Heliod is a creature: the activation offers both Savannah Lions and the AI's Hill Giant, never Heliod itself", () => {
    const s = table({ user: [...devotionFive(), ...plains(2)], ai: [P("giant", GIANT, "ai")] });
    expect(permanentIsCreature(s, "heliod")).toBe(true);
    const ids = activations(s).map((a) => a.targets.map((t) => t.id).join(",")).sort();
    expect(ids).toEqual(["giant", "li1", "li2"]);
  });

  it("⭐ the activation resolves: the chosen Savannah Lions gains lifelink until end of turn, the other does not", () => {
    let s = table({ user: [...devotionFive(), ...plains(2)], ai: [P("giant", GIANT, "ai")] });
    const a = activations(s).find((x) => x.targets[0]?.id === "li1");
    expect(a).toBeTruthy();
    s = resolveAll(dispatchAction(s, a));
    expect([permanentHasKeyword(s, "li1", "Lifelink"), permanentHasKeyword(s, "li2", "Lifelink")]).toEqual([true, false]);
  });

  it("below devotion five (a noncreature Heliod) the Bears are still a legal target", () => {
    const s = table({ user: [P("heliod", HELIOD, "user"), P("bears", BEARS, "user"), ...plains(2)] });
    expect(activations(s).map((a) => a.targets.map((t) => t.id).join(","))).toEqual(["bears"]);
  });
});

// ── the twins the same "another target creature gains" arm reads (each its whole oracle; tier BEFORE in the comment) ──
const HISTORIAN = {"name":"Trailblazing Historian","type":"Creature — Human Shaman","mana":"{1}{R}","cmc":2,"power":"1","toughness":"3","keywords":["Haste"],"colors":["R"],"oracle":"Haste\n{T}: Another target creature gains haste until end of turn."}; // body-only #18949
const GNOME = {"name":"Hotfoot Gnome","type":"Artifact Creature — Gnome","mana":"{2}{R}","cmc":3,"power":"3","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste\n{T}: Another target creature gains haste until end of turn."}; // body-only #19427
const COURIER = {"name":"Torch Courier","type":"Creature — Goblin","mana":"{R}","cmc":1,"power":"1","toughness":"1","keywords":["Haste"],"colors":["R"],"oracle":"Haste\nSacrifice this creature: Another target creature gains haste until end of turn."}; // body-only #7962
const HEALER = {"name":"Attended Healer","type":"Creature — Kor Cleric","mana":"{3}{W}","cmc":4,"power":"2","toughness":"3","keywords":[],"colors":["W"],"oracle":"Whenever you gain life for the first time each turn, create a 1/1 white Cat creature token.\n{2}{W}: Another target Cleric gains lifelink until end of turn."}; // body-only #12871
const NEGATOR = {"name":"Gravity Negator","type":"Creature — Eldrazi Drone","mana":"{3}{U}","cmc":4,"power":"2","toughness":"3","keywords":["Flying","Devoid"],"colors":[],"oracle":"Devoid (This card has no color.)\nFlying\nWhenever this creature attacks, you may pay {C}. If you do, another target creature gains flying until end of turn. ({C} represents colorless mana.)"}; // body-only #26080
const CLERIC = {"name":"Cleric of the Forward Order","type":"Creature — Human Cleric","mana":"{1}{W}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["W"],"oracle":"When this creature enters, you gain 2 life for each creature you control named Cleric of the Forward Order."}; // body-only (a Cleric to target)
const WASTES = {"name":"Wastes","type":"Basic Land","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"{T}: Add {C}."}; // land

describe("RUNTIME — the another-target twins", () => {
  const actsOf = (s, id) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === id);
  const targetIds = (s, id) => actsOf(s, id).map((a) => a.targets.map((t) => t.id).join(",")).sort();

  it("⭐ Trailblazing Historian, Hotfoot Gnome and Torch Courier classify native; each offers every creature but itself and grants haste", () => {
    for (const c of [HISTORIAN, GNOME, COURIER, HEALER, NEGATOR]) expect([c.name, isNativeTier(classifyCard(c))]).toEqual([c.name, true]);
    for (const card of [HISTORIAN, GNOME, COURIER]) {
      let s = table({ user: [P("src", card, "user"), P("bears", BEARS, "user", { summoningSick: true })], ai: [P("giant", GIANT, "ai")] });
      expect([card.name, targetIds(s, "src")]).toEqual([card.name, ["bears", "giant"]]);
      const a = actsOf(s, "src").find((x) => x.targets[0]?.id === "bears");
      s = resolveAll(dispatchAction(s, a));
      expect([card.name, permanentHasKeyword(s, "bears", "Haste")]).toEqual([card.name, true]);
    }
  });

  it("⭐ Attended Healer: \"another target Cleric\" — the other Cleric only, never the Healer (a Cleric) nor the Bears; it gains lifelink", () => {
    let s = table({ user: [P("healer", HEALER, "user"), P("cleric", CLERIC, "user"), P("bears", BEARS, "user"), ...plains(3)] });
    expect(targetIds(s, "healer")).toEqual(["cleric"]);
    s = resolveAll(dispatchAction(s, actsOf(s, "healer")[0]));
    expect(permanentHasKeyword(s, "cleric", "Lifelink")).toBe(true);
  });

  it("⭐ Gravity Negator attacks, the user pays {C}: another creature (the Bears) gains flying; declined, nothing", () => {
    const run = (pay) => {
      let s = table({ user: [P("neg", NEGATOR, "user"), P("bears", BEARS, "user"), P("wastes", WASTES, "user")] });
      s = { ...s, phase: "combat", step: "declare-attackers" };
      const atk = legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "neg");
      expect(atk).toBeTruthy();
      s = dispatchAction(s, atk);
      let g = 0;
      while (g++ < 40 && s.pendingChoice?.kind !== "optional-mana-payment" && (s.step === "declare-attackers")) s = passPriority(s);
      expect(s.pendingChoice?.kind).toBe("optional-mana-payment");
      s = resolveOptionalManaPaymentChoice(s, pay);
      return [permanentHasKeyword(s, "bears", "Flying"), permanentHasKeyword(s, "neg", "Flying"), s.players.user.battlefield.find((p) => p.id === "wastes").tapped];
    };
    expect(run(true)).toEqual([true, true, true]);   // the Negator flies anyway (printed); the Bears now too; the Wastes paid
    expect(run(false)).toEqual([false, true, false]);
  });
});
