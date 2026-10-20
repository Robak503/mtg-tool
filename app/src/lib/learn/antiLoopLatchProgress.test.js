/**
 * antiLoopLatchProgress.test.js — antiLoopLatch.actionChangedGame, the anti-loop latch's question: did an auto-decided
 * non-pass action change the game? The progress signature first, then the whole state outside the bookkeeping fields
 * (the log, the priority holder, the pass count, the id / timestamp / PRNG counters), with exact repeats in arrays folded.
 * The session-driver witnesses are antiLoopLatch.test.js.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { actionChangedGame, progressSignature } from "./antiLoopLatch.js";

beforeEach(() => _resetIdsForTests());

const SLEEK_SCHOONER = { name: "Sleek Schooner", type: "Artifact — Vehicle", mana: "{3}", cmc: 3, colors: [], power: "4", toughness: "3", keywords: [],
  oracle: "Crew 1 (Tap any number of creatures you control with total power 1 or more: This Vehicle becomes an artifact creature until end of turn.)" };
const GRIZZLY_BEARS = { name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, colors: ["G"], power: "2", toughness: "2", keywords: [], oracle: "" };
const FOREST = { name: "Forest", type: "Basic Land — Forest", mana: "", cmc: 0, colors: [], keywords: [], oracle: "({T}: Add {G}.)" };
const onField = (card, id) => ({ ...createPermanent({ id, card: { ...card, id: `${id}-card` }, controller: "ai", summoningSick: false }), enteredOnTurn: 2 });

describe("actionChangedGame — what counts as a change", () => {
  const base = () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    return { ...g, turn: 6, activePlayer: "ai", phase: "combat", step: "declare-attackers", priorityHolder: "ai", consecutivePasses: 0,
      players: { ...g.players, ai: { ...g.players.ai, battlefield: [onField(SLEEK_SCHOONER, "schooner"), onField(GRIZZLY_BEARS, "bears")],
        library: Array.from({ length: 5 }, (_, i) => ({ ...FOREST, id: `lib-${i}` })) } },
      combat: { attackers: [{ permanentId: "bears", attackingPlayer: "ai", defender: "user" }], blockers: [] } };
  };
  const editAi = (s, fn) => ({ ...s, players: { ...s.players, ai: fn(s.players.ai) } });
  const editPerm = (s, id, fn) => editAi(s, (ai) => ({ ...ai, battlefield: ai.battlefield.map((p) => (p.id === id ? fn(p) : p)) }));

  it("changes the signature cannot see are changes: a tap, a face-down flag, a continuous effect, a counter, damage, an attachment, a library order, a second block by the same blocker, a pending window closing", () => {
    const s = { ...base(), pendingCastFromAmong: { controller: "ai", candidates: [{ cardId: "lib-0", ownerId: "ai" }], sourceName: "Etali, Primal Storm" } };
    const blocking = { ...s, combat: { ...s.combat, blockers: [{ blockerId: "bears", attackerId: "x1" }] } };
    const { pendingCastFromAmong: _closed, ...windowClosed } = s;
    const cases = {
      tap: editPerm(s, "bears", (p) => ({ ...p, tapped: true })),
      faceUp: editPerm(s, "bears", (p) => ({ ...p, faceDown: true })),
      effect: { ...s, continuousEffects: [...s.continuousEffects, { id: "ce1", layer: 4, addTypes: ["Creature"], targetId: "schooner", duration: "endOfTurn", timestamp: 1 }] },
      counter: editPerm(s, "bears", (p) => ({ ...p, counters: { "+1/+1": 1 } })),
      damage: editPerm(s, "bears", (p) => ({ ...p, damageMarked: 2 })),
      attach: editPerm(s, "schooner", (p) => ({ ...p, attachedTo: "bears" })),
      libraryOrder: editAi(s, (ai) => ({ ...ai, library: [...ai.library.slice(1), ai.library[0]] })),
      windowClosed,
    };
    const secondBlock = { ...blocking, combat: { ...blocking.combat, blockers: [...blocking.combat.blockers, { blockerId: "bears", attackerId: "x2" }] } };
    for (const after of Object.values(cases)) expect(progressSignature(after)).toBe(progressSignature(s));
    expect(progressSignature(secondBlock)).toBe(progressSignature(blocking));
    expect({ ...Object.fromEntries(Object.entries(cases).map(([k, after]) => [k, actionChangedGame(s, after)])), secondBlock: actionChangedGame(blocking, secondBlock) })
      .toEqual({ tap: true, faceUp: true, effect: true, counter: true, damage: true, attach: true, libraryOrder: true, windowClosed: true, secondBlock: true });
  });

  it("bookkeeping, rebuilt objects, undefined-valued keys and exact repeats are not changes", () => {
    const s = base();
    const angelMemo = editPerm(s, "bears", (p) => ({ ...p, attackedPlayersThisTurn: ["user"] }));
    const cases = {
      bookkeeping: { ...s, log: [...s.log, { kind: "x" }], priorityHolder: "user", consecutivePasses: 2, idSeq: s.idSeq + 3, timestampCounter: s.timestampCounter + 1, rngSeed: 99 },
      rebuilt: { ...s, players: Object.fromEntries(Object.entries(s.players).map(([k, v]) => [k, { ...v, battlefield: v.battlefield.map((p) => ({ ...p })) }])) },
      undefinedKey: { ...s, pendingChoice: undefined },
      repeatedAttacker: { ...s, combat: { ...s.combat, attackers: [...s.combat.attackers, { ...s.combat.attackers[0] }] } },
    };
    const redeclared = editPerm({ ...angelMemo, combat: { ...angelMemo.combat, attackers: [...angelMemo.combat.attackers, { ...angelMemo.combat.attackers[0] }] } },
      "bears", (p) => ({ ...p, attackedPlayersThisTurn: ["user", "user"] }));
    expect({ ...Object.fromEntries(Object.entries(cases).map(([k, after]) => [k, actionChangedGame(s, after)])), redeclared: actionChangedGame(angelMemo, redeclared) })
      .toEqual({ bookkeeping: false, rebuilt: false, undefinedKey: false, repeatedAttacker: false, redeclared: false });
    // …but a second, different attacker is.
    expect(actionChangedGame(s, { ...s, combat: { ...s.combat, attackers: [...s.combat.attackers, { permanentId: "schooner", attackingPlayer: "ai", defender: "user" }] } })).toBe(true);
  });
});
