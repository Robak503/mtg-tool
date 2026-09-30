/**
 * voidCondition.test.js — the Edge of Eternities void condition, "if a nonland permanent left the battlefield this turn or a
 * spell was warped this turn" (the 09-06 plan's stage ③, census row ⑪, 2026-09-30).
 *
 * The condition had no reader. The build is a GLOBAL turn stamp written at gameState.moveCardToZone — the one battlefield
 * exit — for any player's nonland permanent (a token included; land-ness read layer-aware as the permanent last existed),
 * and an interveningIf arm that compares it to the live turn. The warp half is exactly false: the engine never offers a
 * warp cast, so no spell is ever warped. The "Void —" ability word was already stripped.
 *
 * Flips (each run for real below): Insatiable Skittermaw, Kavaron Skywarden, Interceptor Mechan (+1/+1 counter at end step),
 * Voidforged Titan (draw and lose 1), Elegy Acolyte (a 2/2 Robot), and Decode Transmissions (the spell's "instead").
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { checkStepTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { evaluateInterveningIf } from "./interveningIf.js";
import { addContinuousEffect } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const VOID_IF = "a nonland permanent left the battlefield this turn or a spell was warped this turn";
const voidLine = (effect) => `Void — At the beginning of your end step, if ${VOID_IF}, ${effect}`;
const SKITTERMAW = { name: "Insatiable Skittermaw", type: "Creature — Insect Horror", mana: "{2}{B}", power: 2, toughness: 2, keywords: ["Menace", "Void"],
  oracle: `Menace (This creature can't be blocked except by two or more creatures.)\n${voidLine("put a +1/+1 counter on this creature.")}` };
const SKYWARDEN = { name: "Kavaron Skywarden", type: "Creature — Kavu Soldier", mana: "{4}{R}", power: 4, toughness: 5, keywords: ["Reach", "Void"],
  oracle: `Reach\n${voidLine("put a +1/+1 counter on this creature.")}` };
const MECHAN = { name: "Interceptor Mechan", type: "Artifact Creature — Robot", mana: "{2}{B}{R}", power: 2, toughness: 2, keywords: ["Flying", "Void"],
  oracle: `Flying\nWhen this creature enters, return target artifact or creature card from your graveyard to your hand.\n${voidLine("put a +1/+1 counter on this creature.")}` };
const TITAN = { name: "Voidforged Titan", type: "Artifact Creature — Robot Warrior", mana: "{4}{B}", power: 5, toughness: 4, keywords: ["Void"],
  oracle: voidLine("you draw a card and lose 1 life.") };
const ACOLYTE = { name: "Elegy Acolyte", type: "Creature — Human Cleric", mana: "{2}{B}{B}", power: 4, toughness: 4, keywords: ["Lifelink", "Void"],
  oracle: `Lifelink\nWhenever one or more creatures you control deal combat damage to a player, you draw a card and lose 1 life.\n${voidLine("create a 2/2 colorless Robot artifact creature token.")}` };
const DECODE = { id: "decode", name: "Decode Transmissions", type: "Sorcery", mana: "{2}{B}", keywords: ["Void"],
  oracle: `You draw two cards and lose 2 life.\nVoid — If ${VOID_IF}, instead you draw two cards and each opponent loses 2 life.` };
const BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" };
const SIGNET = { name: "Mind Stone", type: "Artifact", mana: "{2}", oracle: "{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card." };
const SOLDIER_TOKEN = { name: "Soldier", type: "Token Creature — Soldier", power: 1, toughness: 1, oracle: "", token: true };

const perm = (card, id, controller = "user") => createPermanent({ id, card, controller, summoningSick: false });
const library = (n) => Array.from({ length: n }, (_, i) => ({ id: `lib-${i}`, name: "Island", type: "Basic Land — Island", oracle: "({T}: Add {U}.)" }));

function game({ user = [], ai1 = [], hand = [], pool = {} } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, turn: 3, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [], pendingTriggers: [],
    players: { ...s.players,
      user: { ...s.players.user, battlefield: user, hand, library: library(5), manaPool: { ...s.players.user.manaPool, ...pool } },
      ai1: { ...s.players.ai1, battlefield: ai1 } } };
}
const voidHolds = (s) => evaluateInterveningIf(s, VOID_IF, "user");
const leave = (s, pid, id, toZone = "graveyard") => moveCardToZone(s, { playerId: pid, fromZone: "battlefield", toZone, cardId: id });
const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 40) s = resolveTopOfStack(s); return s; };
// Move to the user's end step and let its triggers fire and resolve.
const endStep = (s) => resolveAll(flushTriggers(checkStepTriggers({ ...s, phase: "ending", step: "end" }, "endStep"), { chooseTargets: chooseTriggerTargets }));
const plusCounters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;

describe("classification", () => {
  it("Insatiable Skittermaw, Kavaron Skywarden, Interceptor Mechan, Voidforged Titan, Elegy Acolyte → native-trigger; Decode Transmissions → native-spell", () => {
    for (const card of [SKITTERMAW, SKYWARDEN, MECHAN, TITAN, ACOLYTE]) expect(classifyCard(card), card.name).toBe("native-trigger");
    expect(classifyCard(DECODE)).toBe("native-spell");
  });
});

describe("the tracker — a nonland permanent left the battlefield this turn", () => {
  it("VACUITY CONTROL — nothing has left: the condition is false", () => {
    expect(voidHolds(game({ user: [perm(BEARS, "b")] }))).toBe(false);
  });

  it("⭐ a creature leaving (to the graveyard) makes it true; a LAND leaving does not", () => {
    expect(voidHolds(leave(game({ user: [perm(BEARS, "b")] }), "user", "b"))).toBe(true);
    expect(voidHolds(leave(game({ user: [perm(FOREST, "f")] }), "user", "f"))).toBe(false);
  });

  it("⭐ any player's, any way out, a token included: an opponent's artifact bounced, a token dying", () => {
    expect(voidHolds(leave(game({ ai1: [perm(SIGNET, "ms", "ai1")] }), "ai1", "ms", "hand"))).toBe(true);
    expect(voidHolds(leave(game({ user: [perm(SOLDIER_TOKEN, "t")] }), "user", "t"))).toBe(true);
  });

  it("⭐ land-ness is read as the permanent last existed: a creature made a LAND (a fixed layer-4 type add) leaving does not count", () => {
    const s = game({ user: [perm(BEARS, "b")] });
    const landed = addContinuousEffect(s, { layer: 4, op: { types: ["Land"] }, affects: { mode: "fixed", permanentIds: ["b"] }, duration: { kind: "permanent" } }).state;
    expect([voidHolds(leave(s, "user", "b")), voidHolds(leave(landed, "user", "b"))]).toEqual([true, false]);
  });

  it("⭐ it is THIS turn's: the same stamp reads false on the next turn", () => {
    const left = leave(game({ user: [perm(BEARS, "b")] }), "user", "b");
    expect([voidHolds(left), voidHolds({ ...left, turn: left.turn + 1 })]).toEqual([true, false]);
  });
});

describe("RUNTIME — the void end-step triggers", () => {
  it("VACUITY CONTROL — Insatiable Skittermaw at end step with nothing gone: no counter", () => {
    expect(plusCounters(endStep(game({ user: [perm(SKITTERMAW, "sk")] })), "sk")).toBe(0);
  });

  it("⭐ Insatiable Skittermaw, Kavaron Skywarden, Interceptor Mechan: after the Bears leave, each gets a +1/+1 counter", () => {
    const s = leave(game({ user: [perm(SKITTERMAW, "sk"), perm(SKYWARDEN, "kw"), perm(MECHAN, "im"), perm(BEARS, "b")] }), "user", "b");
    const out = endStep(s);
    expect(["sk", "kw", "im"].map((id) => plusCounters(out, id))).toEqual([1, 1, 1]);
    console.log(`WITNESS voidCounters ${JSON.stringify(["sk", "kw", "im"].map((id) => plusCounters(out, id)))}`);
  });

  it("⭐ Voidforged Titan: draw a card and lose 1 life — only when the condition holds", () => {
    const quiet = endStep(game({ user: [perm(TITAN, "vt")] }));
    const loud = endStep(leave(game({ user: [perm(TITAN, "vt"), perm(BEARS, "b")] }), "user", "b"));
    expect([quiet.players.user.hand.length, quiet.players.user.life]).toEqual([0, 40]);
    expect([loud.players.user.hand.length, loud.players.user.life]).toEqual([1, 39]);
  });

  it("⭐ Elegy Acolyte: a 2/2 colorless Robot artifact creature token — and none on a quiet turn", () => {
    const robotsOf = (s) => s.players.user.battlefield.filter((p) => /Robot/.test(String(p.card?.type || "")));
    const out = endStep(leave(game({ user: [perm(ACOLYTE, "ea"), perm(BEARS, "b")] }), "user", "b"));
    expect(robotsOf(out).map((p) => [String(p.card.power), String(p.card.toughness)])).toEqual([["2", "2"]]);
    expect(robotsOf(endStep(game({ user: [perm(ACOLYTE, "ea")] })))).toEqual([]);
  });
});

describe("RUNTIME — Decode Transmissions' void \"instead\"", () => {
  const cast = (s) => {
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "decode");
    expect(act).toBeTruthy();
    return resolveTopOfStack(dispatchAction(s, act));
  };
  const lives = (s) => ["user", "ai1", "ai2", "ai3"].map((pid) => s.players[pid].life);

  it("VACUITY CONTROL — nothing left: you draw two and lose 2", () => {
    const out = cast(game({ hand: [DECODE], pool: { B: 1, C: 2 } }));
    expect([out.players.user.hand.length, ...lives(out)]).toEqual([2, 38, 40, 40, 40]);
  });

  it("⭐ after a nonland permanent left: you draw two and EACH OPPONENT loses 2 instead", () => {
    const out = cast(leave(game({ user: [perm(BEARS, "b")], hand: [DECODE], pool: { B: 1, C: 2 } }), "user", "b"));
    expect([out.players.user.hand.length, ...lives(out)]).toEqual([2, 40, 38, 38, 38]);
    console.log(`WITNESS decodeInstead hand ${out.players.user.hand.length} · lives ${JSON.stringify(lives(out))}`);
  });
});
