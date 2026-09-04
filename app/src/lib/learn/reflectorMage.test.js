/**
 * reflectorMage.test.js — SHELF-85 runbook Phase 2 · B4 (2026-09-04): Reflector Mage (Brago).
 *
 *   "When this creature enters, return target creature an opponent controls to its owner's hand. That creature's
 *    owner can't cast spells with the same name as that creature until your next turn."
 *
 * The bounce parsed; the second sentence is a RIDER (the owner and the name are the bounced card's) that the sentence
 * split orphaned. The splitter folds the pair to a sentinel single clause; the bounce parser emits
 * `nameLockUntilNextTurn`; the resolver bounces and records a per-player NAME cast lock (state.nameCastLocks — owner,
 * name, who set it, on which turn); legalChoices' main cast loop refuses the named spell beside the noncreature lock;
 * the setter's next untap step expires it (CR 611.2b).
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { splitClauses } from "./effects/splitClauses.js";
import { detectTriggers } from "./triggers.js";
import { enterPermanent } from "./resolvers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, nameCastLocked, expireNameCastLocks } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const MAGE = { id: "c-rm", name: "Reflector Mage", type: "Creature — Human Wizard", mana: "{1}{W}{U}", cmc: 3, power: 2, toughness: 3, keywords: [],
  oracle: "When this creature enters, return target creature an opponent controls to its owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn." };
const BEAR = { id: "card-bear", name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" };
const ELF = { id: "card-elf", name: "Llanowar Elves", type: "Creature — Elf Druid", mana: "{G}", cmc: 1, power: 1, toughness: 1, oracle: "{T}: Add {G}." };
const forest = (id, ctrl) => createPermanent({ id, card: { id: "card-" + id, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: ctrl });

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 6,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [], hand: [], library: [] },
      ai: { ...s.players.ai, battlefield: [createPermanent({ id: "BEAR", card: BEAR, controller: "ai" }), forest("F1", "ai"), forest("F2", "ai"), forest("F3", "ai")], hand: [{ ...ELF }], library: [] } } };
}
/** The AI's turn with priority in its main phase, everything untapped. */
const aiMain = (s, turn) => ({ ...s, turn, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main", consecutivePasses: 0,
  players: { ...s.players, ai: { ...s.players.ai, battlefield: s.players.ai.battlefield.map((p) => ({ ...p, tapped: false })) } } });
const castNames = (s, pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell").map((a) => a.name || a.cardName || s.players[pid].hand.find((c) => c.id === a.cardId)?.name);

describe("parse", () => {
  it("the two sentences fold to one bounce carrying the name-lock rider", () => {
    const d = detectTriggers(MAGE);
    expect(d.map((x) => x.event)).toEqual(["etb"]);
    expect(splitClauses(d[0].effectClause)).toHaveLength(1);
    const r = parseEffectClause(d[0].effectClause, "Creature");
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], nameLockUntilNextTurn: true }]);
  });
  it("the plain opponent bounce is byte-identical (no rider, no lock)", () => {
    expect(parseEffectClause("Return target creature an opponent controls to its owner's hand.", "Creature").atoms).toEqual([{ op: "bounce", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }] }]);
  });
  it("seen-to-fail: the rider on any other bounce shape stays orphaned (parks)", () => {
    expect(parseEffectClause("Return target creature to its owner's hand. That creature's owner can't cast spells with the same name as that creature until your next turn.", "Creature").atoms).toEqual([]);
  });
});

describe("runtime — the bounce, the lock, the refusal, the expiry", () => {
  it("the Bear goes home and its owner can't recast it until the Mage's controller's next turn", () => {
    let s = board();
    s = enterPermanent(s, MAGE, "user");
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    expect(s.stack.find((o) => o.kind === "triggered-ability").targets.map((t) => t.id)).toEqual(["BEAR"]);
    while (s.stack.length && !s.pendingChoice) s = resolveTopOfStack(s);
    expect(s.players.ai.battlefield.some((p) => p.id === "BEAR")).toBe(false);
    expect(s.players.ai.hand.map((c) => c.name).sort()).toEqual(["Grizzly Bears", "Llanowar Elves"]);
    expect(s.nameCastLocks).toEqual([{ playerId: "ai", name: "Grizzly Bears", lockedBy: "user", setTurn: 6 }]);
    expect(nameCastLocked(s, "ai", "Grizzly Bears")).toBe(true);
    expect(nameCastLocked(s, "user", "Grizzly Bears")).toBe(false); // the lock is the owner's alone
    // The AI's turn: the Bear is not offered; the Elves still are.
    const aiTurn = aiMain(s, 7);
    const names = castNames(aiTurn, "ai");
    expect(names).toContain("Llanowar Elves");
    expect(names).not.toContain("Grizzly Bears");
    // The AI's own untap does NOT clear it (the lock is the user's "until YOUR next turn").
    expect(expireNameCastLocks(aiTurn, "ai").nameCastLocks).toHaveLength(1);
    // The user's next turn begins: the lock expires and the Bear is castable again.
    const userNext = expireNameCastLocks({ ...aiTurn, turn: 8, activePlayer: "user" }, "user");
    expect(userNext.nameCastLocks).toEqual([]);
    expect(castNames(aiMain(userNext, 9), "ai")).toContain("Grizzly Bears");
  });
  it("the same-turn untap of the setter does not expire a lock set this turn", () => {
    const s = { ...board(), nameCastLocks: [{ playerId: "ai", name: "Grizzly Bears", lockedBy: "user", setTurn: 6 }] };
    expect(expireNameCastLocks(s, "user").nameCastLocks).toHaveLength(1);
  });
});

describe("classifier", () => {
  it("Reflector Mage is native-trigger", () => {
    expect(classifyCard(MAGE)).toBe("native-trigger");
  });
});
