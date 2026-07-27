/**
 * backupKeyword.test.js — BACKUP N (CR 702.166), census slice 34.
 *
 * "When this creature enters, put N +1/+1 counters on target creature. If that's another creature, it gains
 * the following ability until end of turn." The whole ability lives in reminder parens, so it is synthesized
 * from the printed keyword exactly like renown and mobilize.
 *
 * THE DELIBERATE NARROWING, stated plainly because it is a judgement and not an oversight: only the
 * SELF-TARGET line is modeled. Self-target is one of the card's own legal choices — and the forced one when
 * it is your only creature — and choosing it makes the "if that's another creature" grant vacuous, so the
 * engine plays a real, legal line faithfully. What it never does is offer backup on a DIFFERENT creature,
 * because "the following ability" is card-specific text that would have to be threaded onto another
 * permanent. That is an UNDER-offer, the safe direction, and the same shape as not offering an awaken or
 * bestow mode. The reverse — offering the grant without modeling it — would be the forbidden one.
 *
 * No new resolver: the synthesized effectClause is ordinary modeled text, so it rides the existing
 * self-scoped add-counter atom whose runtime path was already proven.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, backupKeywordValue, checkEnterTriggers } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const BK = (n, w) => `Backup ${n} (When this creature enters, put ${w} +1/+1 counter${n > 1 ? "s" : ""} on target creature. If that's another creature, it gains the following ability until end of turn.)`;
const SAIBA = { name: "Saiba Cryptomancer", type: "Creature — Human Wizard", mana: "{1}{U}", power: 1, toughness: 1,
  oracle: `Flash\n${BK(1, "a")}\nHexproof` };

describe("keyword reading + synthesis", () => {
  it("reads N", () => {
    expect(backupKeywordValue(BK(2, "two"))).toBe(2);
    expect(backupKeywordValue("Backup 1")).toBe(1);
    expect(backupKeywordValue("Flying")).toBe(0);
  });

  it("synthesizes ONE self-scoped ETB whose clause is ORDINARY modeled text (no new sentinel)", () => {
    const d = detectTriggers(SAIBA);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "etb", scope: "self", effectClause: "put 1 +1/+1 counters on this creature" });
    // …and that text parses on the pre-existing atom, which is the point of not inventing a sentinel.
    expect(parseEffectClause(d[0].effectClause, "Creature")).toMatchObject({
      confidence: "high", atoms: [{ op: "add-counter", amount: 1, target: "self" }],
    });
  });

  it("classification credits the keyword", () => {
    expect(classifyCard(SAIBA)).toMatch(/^native/);
  });

  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ name: "T", type: "Creature — Ogre", mana: "{2}{R}", power: 2, toughness: 2,
      oracle: `${BK(1, "a")}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the counters actually land", () => {
  function entered(oracle) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const card = { id: "c-gm", name: "Gloomfang Mauler", type: "Creature — Vampire", mana: "{3}{B}", power: 3, toughness: 3, oracle };
    const perm = createPermanent({ id: "gm", card, controller: "user" });
    let st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
    st = checkEnterTriggers(st, perm);
    st = runStepActions(st);
    let g = 0; while (st.stack.length && g++ < 8) st = resolveTopOfStack(st);
    return st.players.user.battlefield.find((p) => p.id === "gm");
  }

  it("Backup 2 puts exactly two +1/+1 counters on the entering creature", () => {
    expect(entered(`${BK(2, "two")}\nMenace`).counters).toEqual({ "+1/+1": 2 });
  });

  it("Backup 1 puts exactly one", () => {
    expect(entered(`${BK(1, "a")}\nMenace`).counters).toEqual({ "+1/+1": 1 });
  });

  it("a creature with NO backup keyword gets none — the trigger is never invented", () => {
    expect(entered("Menace").counters || {}).toEqual({});
  });
});
