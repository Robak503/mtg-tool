/**
 * rosieCotton.test.js — SHELF-85 runbook V7 (2026-09-04): Rosie Cotton of South Lane (Otharri · Bumble).
 *
 *   "When Rosie Cotton enters, create a Food token.
 *    Whenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton."
 *
 * The token-created event, the Food token and the own-creature counter gift all existed; two cells were missing:
 *   ① the SELF-NAME. A "<Name> of <Place>" legend (the Middle-earth naming) calls itself by the part before " of " —
 *      one more exact candidate for detectTriggers' anchored self-name rewrites (never a global rename), plus a new
 *      whole-clause arm for the trailing "… other than <Name>" exclusion → "… other than this creature";
 *   ② the counter parser's "target creature you control other than this creature" form — the printed twin of
 *      "another target creature you control", the same atom with excludeSource (CR 109.5).
 * The exclusion is enforced at enumeration: Rosie is never a legal target of her own gift, so with no other creature
 * the trigger has no target and she stays uncountered.
 *
 * Real oracle fixture (bundled Scryfall snapshot, verified in-session 2026-09-04).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyCreateNamedToken } from "./effects/atoms/tokens.js";
import { resolveTopOfStack, flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ROSIE = { id: "c-rosie", name: "Rosie Cotton of South Lane", type: "Legendary Creature — Halfling Peasant", mana: "{2}{W}", power: 1, toughness: 1, keywords: [],
  oracle: "When Rosie Cotton enters, create a Food token. (It's an artifact with \"{2}, {T}, Sacrifice this token: You gain 3 life.\")\nWhenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton." };

function board(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 3,
    players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const rosie = () => createPermanent({ id: "ROSIE", card: ROSIE, controller: "user", summoningSick: false });
const bear = (id) => createPermanent({ id, card: { id: "c-" + id, name: "Bear " + id, type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
const counters = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const flush = (s) => resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));

describe("① the self-name — 'other than Rosie Cotton' becomes 'other than this creature'", () => {
  it("detectTriggers rewrites the trailing exclusion on the token-created half", () => {
    const d = detectTriggers(ROSIE);
    expect(d.map((x) => x.event)).toEqual(["etb", "tokenChange"]);
    expect(d[1].effectClause).toBe("put a +1/+1 counter on target creature you control other than this creature");
    expect(d[1].onCreate).toBe(true);
  });
  it("the rewrite is anchored: a different name, or a rider, is left alone", () => {
    const other = { ...ROSIE, oracle: "Whenever you create a token, put a +1/+1 counter on target creature you control other than Sam Gamgee." };
    expect(detectTriggers(other).find((x) => x.event === "tokenChange").effectClause).toBe("put a +1/+1 counter on target creature you control other than Sam Gamgee");
    const rider = { ...ROSIE, oracle: "Whenever you create a token, put a +1/+1 counter on target creature you control other than Rosie Cotton. It gains flying until end of turn." };
    expect(detectTriggers(rider).find((x) => x.event === "tokenChange").effectClause).toMatch(/other than Rosie Cotton/);
  });
});

describe("② the counter arm — the printed exclusion is the excludeSource atom", () => {
  it("parses HIGH with excludeSource, byte-identical to the 'another target' form", () => {
    const a = parseEffectClause("put a +1/+1 counter on target creature you control other than this creature.", "Instant").atoms;
    const b = parseEffectClause("put a +1/+1 counter on another target creature you control.", "Instant").atoms;
    expect(a).toEqual([{ op: "add-counter", counterType: "+1/+1", amount: 1, targetType: "creatureYouControl", excludeSource: true }]);
    expect(a).toEqual(b);
  });
});

describe("end to end — creating a token grows another creature, never Rosie", () => {
  it("a Food token created with a Bear beside Rosie: the Bear gets the counter", () => {
    let s = board([rosie(), bear("B1")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "food", count: 1 }, { controller: "user" });
    expect((s.pendingTriggers || []).filter((t) => t.event === "tokenChange")).toHaveLength(1);
    s = flush(s);
    expect(counters(s, "B1")).toBe(1);
    expect(counters(s, "ROSIE")).toBe(0);
  });
  it("two tokens → two triggers → two counters", () => {
    let s = board([rosie(), bear("B1")]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "treasure", count: 2 }, { controller: "user" });
    s = flush(s);
    expect(counters(s, "B1")).toBe(2);
  });
  it("Rosie alone: no legal target, no counter on Rosie (the exclusion holds at enumeration)", () => {
    let s = board([rosie()]);
    s = applyCreateNamedToken(s, { op: "create-named-token", token: "food", count: 1 }, { controller: "user" });
    s = flush(s);
    expect(counters(s, "ROSIE")).toBe(0);
  });
});

describe("classifier", () => {
  it("Rosie Cotton of South Lane is native-trigger", () => {
    expect(classifyCard(ROSIE)).toBe("native-trigger");
  });
});
