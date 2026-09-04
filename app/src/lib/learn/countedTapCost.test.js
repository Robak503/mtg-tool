/**
 * countedTapCost.test.js — SHELF-85 runbook V6 slice 2 (2026-09-04): "Tap N untapped creatures you control:" as an
 * activation cost — Kirol, Attentive First-Year (Otharri) and the eleven twins the flip-diff surfaced (Sandsower,
 * Nullmage Shepherd, Larder Zombie, Diversionary Tactics, Skaab Wrangler, Root-Kin Ally, Prosperous Partnership,
 * Siege Zombie, Skirsdag High Priest, Tradewind Rider, Grove of the Guardian — every effect already modeled, the cost
 * lane was the whole gap).
 *
 * The COUNTED form of the single "Tap an untapped creature you control" cost, built like the counted sacrifice:
 *   · parseAbilityCost reads the count (two / three / four) onto `tapCreature.count` — a subtype filter still defers;
 *   · legalChoices freezes ONE action with N untapped creatures on `tapCountIds` (summoning-sick bodies first — a
 *     written policy; the {T} source is never in its own set); fewer than N → not offered; the frozen set can't ALSO
 *     tap for the {mana} part (offer and dispatcher agree);
 *   · the dispatcher taps every frozen victim before the ability goes on the stack, hard-erroring on a tapped one;
 *   · the AI's safe picker skips a counted tap cost (it taps real bodies — never auto-spent).
 *
 * Real oracle fixtures (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const KIROL = { id: "c-kirol", name: "Kirol, Attentive First-Year", type: "Legendary Creature — Vampire Cleric", mana: "{1}{R/W}{R/W}", power: 2, toughness: 2, keywords: [],
  oracle: "Tap two untapped creatures you control: Copy target triggered ability you control. You may choose new targets for the copy. Activate only once each turn." };
const SIEGE_ZOMBIE = { id: "c-sz", name: "Siege Zombie", type: "Creature — Zombie", mana: "{1}{B}", power: 2, toughness: 3, keywords: [], oracle: "Tap three untapped creatures you control: Each opponent loses 1 life." };
const TRADEWIND = { id: "c-twr", name: "Tradewind Rider", type: "Creature — Spirit", mana: "{3}{U}", power: 1, toughness: 4, keywords: ["Flying"], oracle: "Flying\n{T}, Tap two untapped creatures you control: Return target permanent to its owner's hand." };
const GROVE = { id: "c-grove", name: "Grove of the Guardian", type: "Land", keywords: [], oracle: "{T}: Add {C}.\n{3}{G}{W}, {T}, Tap two untapped creatures you control, Sacrifice this land: Create an 8/8 green and white Elemental creature token with vigilance." };
const PROBE_DRAW = { id: "c-pd", name: "Probe Draw", type: "Enchantment", mana: "{1}", keywords: [], oracle: "{G}, Tap two untapped creatures you control: Draw a card." };
const ELVES = (id) => ({ id: "c-" + id, name: "Llanowar Elves", type: "Creature — Elf Druid", power: 1, toughness: 1, oracle: "{T}: Add {G}." });

const bear = (id, controller = "user", sick = false) => ({ ...createPermanent({ id, card: { id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", power: 2, toughness: 2 }, controller }), summoningSick: sick });
const lib = (n, tag = "u") => Array.from({ length: n }, (_, i) => ({ id: `${tag}-${i}`, name: "Card", type: "Instant", oracle: "" }));
const upkeepTrigger = (controller) => ({ event: "upkeep", source: { name: "Probe", permanentId: "src" }, controller, descriptor: { event: "upkeep", scope: "you", whose: "any", effectClause: "draw a card", interveningIf: null }, context: {}, targets: [], payload: {} });
const offers = (s, pid, permId) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "activate-ability" && a.permanentId === permId);
const tapped = (s, pid, id) => !!s.players[pid].battlefield.find((p) => p.id === id)?.tapped;
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };

function offTurn(userPerms) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  s = { ...s, phase: "beginning", step: "upkeep", activePlayer: "ai", priorityHolder: "user", consecutivePasses: 0, turn: 2,
    players: { ...s.players, user: { ...s.players.user, library: lib(6), battlefield: userPerms }, ai: { ...s.players.ai, library: lib(6, "a") } },
    pendingTriggers: [upkeepTrigger("user")] };
  return flushTriggers(s, { chooseTargets: chooseTriggerTargets });
}
function mainPhase(pid, perms, other = []) {
  let s = createGameState({ userDeck: [], aiDeck: [] });
  const opp = pid === "user" ? "ai" : "user";
  return { ...s, phase: "precombat-main", step: "main", activePlayer: pid, priorityHolder: pid, consecutivePasses: 0, turn: 3,
    players: { ...s.players, [pid]: { ...s.players[pid], library: lib(6), battlefield: perms }, [opp]: { ...s.players[opp], library: lib(6, "o"), battlefield: other } } };
}

describe("parser — the counted tap cost", () => {
  it("reads two / three onto tapCreature.count; the once-per-turn limit rides", () => {
    const k = parseActivatedAbilities(KIROL)[0];
    expect(k.costModeled).toBe(true);
    expect(k.tapCreature).toEqual({ another: false, count: 2 });
    expect(k.activationLimit).toBe(1);
    expect(k.modeled).toBe(true);
    expect(parseActivatedAbilities(SIEGE_ZOMBIE)[0].tapCreature).toEqual({ another: false, count: 3 });
  });
  it("CREED near-miss: a subtype-filtered count still defers", () => {
    const ab = parseActivatedAbilities({ id: "c-x", name: "Probe", type: "Creature — Elf", oracle: "Tap two untapped Elves you control: Draw a card." })[0];
    expect(ab?.costModeled ?? false).toBe(false);
  });
});

describe("the offer — a frozen set of N, sick bodies first, the {T} source excluded", () => {
  it("Kirol on the opponent's upkeep: one action, two frozen tappers, the summoning-sick Bear first", () => {
    const s = offTurn([{ ...createPermanent({ id: "KIR", card: KIROL, controller: "user" }), summoningSick: false }, bear("B1"), bear("B2", "user", true)]);
    const acts = offers(s, "user", "KIR");
    expect(acts).toHaveLength(1);
    expect(acts[0].tapCountIds).toHaveLength(2);
    expect(acts[0].tapCountIds[0]).toBe("B2");
    expect(acts[0].targets[0].type).toBe("stackAbility");
  });
  it("fewer than N untapped creatures → not offered", () => {
    const s = offTurn([{ ...createPermanent({ id: "KIR", card: KIROL, controller: "user" }), summoningSick: false }, { ...bear("B1"), tapped: true }]);
    expect(offers(s, "user", "KIR")).toHaveLength(0);
  });
  it("Tradewind Rider's {T} keeps it out of its own tap set", () => {
    const s = mainPhase("user", [{ ...createPermanent({ id: "TWR", card: TRADEWIND, controller: "user" }), summoningSick: false }, bear("B1"), bear("B2")], [bear("AIB", "ai")]);
    const acts = offers(s, "user", "TWR");
    expect(acts.length).toBeGreaterThan(0);
    for (const a of acts) expect(a.tapCountIds).toEqual(["B1", "B2"]);
  });
});

describe("the dispatcher — pays the whole cost, once per turn, and the copy resolves", () => {
  it("Kirol: both frozen creatures tap, the third stays untapped, the copy draws a second card, no re-offer this turn", () => {
    let s = offTurn([{ ...createPermanent({ id: "KIR", card: KIROL, controller: "user" }), summoningSick: false }, bear("B1"), bear("B2", "user", true)]);
    const act = offers(s, "user", "KIR")[0];
    s = dispatchAction(s, act);
    for (const id of act.tapCountIds) expect(tapped(s, "user", id)).toBe(true);
    const untouched = ["KIR", "B1", "B2"].filter((id) => !act.tapCountIds.includes(id));
    expect(untouched).toHaveLength(1);
    expect(tapped(s, "user", untouched[0])).toBe(false);
    expect(offers(s, "user", "KIR")).toHaveLength(0);
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(2);
  });
  it("Tradewind Rider taps itself AND the two Bears, then bounces the opponent's creature", () => {
    let s = mainPhase("user", [{ ...createPermanent({ id: "TWR", card: TRADEWIND, controller: "user" }), summoningSick: false }, bear("B1"), bear("B2")], [bear("AIB", "ai")]);
    const act = offers(s, "user", "TWR").find((a) => a.targets?.[0]?.id === "AIB");
    expect(act).toBeTruthy();
    s = dispatchAction(s, act);
    expect(tapped(s, "user", "TWR")).toBe(true);
    expect(tapped(s, "user", "B1")).toBe(true);
    expect(tapped(s, "user", "B2")).toBe(true);
    s = resolveAll(s);
    expect(s.players.ai.battlefield.find((p) => p.id === "AIB")).toBeUndefined();
    expect(s.players.ai.hand.some((c) => c.id === "c-AIB")).toBe(true);
  });
  it("a frozen victim that is already tapped is a hard error, never a silent under-payment", () => {
    let s = offTurn([{ ...createPermanent({ id: "KIR", card: KIROL, controller: "user" }), summoningSick: false }, bear("B1"), bear("B2", "user", true)]);
    const act = offers(s, "user", "KIR")[0];
    const pre = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.map((p) => (p.id === act.tapCountIds[0] ? { ...p, tapped: true } : p)) } } };
    expect(() => dispatchAction(pre, act)).toThrow(/already tapped/i);
  });
});

describe("mana — the frozen tappers never also pay the {mana} part (offer and dispatcher agree)", () => {
  const elf = (id) => ({ ...createPermanent({ id, card: ELVES(id), controller: "user" }), summoningSick: false });
  it("two Elves and no land: {G} is unpayable once both Elves are the tappers → not offered", () => {
    const s = mainPhase("user", [createPermanent({ id: "PD", card: PROBE_DRAW, controller: "user" }), elf("E1"), elf("E2")]);
    expect(offers(s, "user", "PD")).toHaveLength(0);
  });
  it("with a Forest the activation is offered, the Forest pays {G}, both Elves tap for the cost, a card is drawn", () => {
    let s = mainPhase("user", [createPermanent({ id: "PD", card: PROBE_DRAW, controller: "user" }), elf("E1"), elf("E2"), createPermanent({ id: "F1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" })]);
    const act = offers(s, "user", "PD")[0];
    expect(act).toBeTruthy();
    expect(act.tapCountIds).toEqual(["E1", "E2"]);
    s = dispatchAction(s, act);
    expect(tapped(s, "user", "F1")).toBe(true);
    expect(tapped(s, "user", "E1")).toBe(true);
    expect(tapped(s, "user", "E2")).toBe(true);
    s = resolveAll(s);
    expect(s.players.user.hand).toHaveLength(1);
  });
});

describe("the AI never auto-spends a counted tap cost", () => {
  it("Siege Zombie with three untapped bodies in the AI's main phase is not activated by the safe picker", () => {
    const s = mainPhase("ai", [{ ...createPermanent({ id: "SZ", card: SIEGE_ZOMBIE, controller: "ai" }), summoningSick: false }, bear("A1", "ai"), bear("A2", "ai")]);
    expect(offers(s, "ai", "SZ")).toHaveLength(1); // the offer exists (a human may take it) …
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick && pick.kind === "activate-ability" && pick.permanentId === "SZ").toBe(false); // … the AI never does
  });
  it("nor a MANA-costed one with a 'safe' payoff — the counted tap cost itself is the reason (not the zero-mana bound)", () => {
    // "{1}, Tap two untapped creatures you control: Draw a card." — draw is on the picker's safe list and the {1} clears
    // its termination bound, so ONLY the counted-tap skip keeps the AI from tapping its two Bears for a card.
    const PROBE_AI = { id: "c-pai", name: "Probe Tapper", type: "Enchantment", mana: "{1}", keywords: [], oracle: "{1}, Tap two untapped creatures you control: Draw a card." };
    const s = mainPhase("ai", [createPermanent({ id: "PAI", card: PROBE_AI, controller: "ai" }), bear("A1", "ai"), bear("A2", "ai"), createPermanent({ id: "AF", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "ai" })]);
    expect(offers(s, "ai", "PAI")).toHaveLength(1);
    const pick = pickAction(s, "ai", legalActionsForPlayer(s, "ai"));
    expect(pick && pick.kind === "activate-ability" && pick.permanentId === "PAI").toBe(false);
  });
});

describe("classifier — whole cards", () => {
  it("Kirol, Siege Zombie and Tradewind Rider are native-activated; Grove of the Guardian is a land", () => {
    expect(classifyCard(KIROL)).toBe("native-activated");
    expect(classifyCard(SIEGE_ZOMBIE)).toBe("native-activated");
    expect(classifyCard(TRADEWIND)).toBe("native-activated");
    expect(classifyCard(GROVE)).toBe("land");
  });
});
