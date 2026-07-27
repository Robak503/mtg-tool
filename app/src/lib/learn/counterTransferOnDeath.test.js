/**
 * counterTransferOnDeath.test.js — "put its counters on target creature you control" (census slice 37).
 *
 * Star Pupil, Essence Channeler, Spiteful Squad, Broodguard Elite, Dockworker Drone, Enduring Bondwarden.
 *
 * The destination half already parsed ("put a +1/+1 counter on target creature you control" is HIGH). What
 * was missing is the "ITS counters" referent — the DYING object's whole counter bag, which only exists as
 * CR 603.6e last-known information because the source has left the battlefield by resolution.
 *
 * DISTINCT FROM MODULAR. The modular payoff ("put its +1/+1 counters on target artifact creature") moves a
 * single magnitude and already rides `triggeringPlusCounterCount`. This moves EVERY counter type the
 * creature had, so it needs the BAG, not a number — which is exactly what the shield-counter assertion
 * below proves. A +1/+1-only implementation would pass every other test in this file.
 *
 * Three seams, and the third is the one that is easy to miss: the clause parser, the resolver, and
 * `atomTargetIntent` — the trigger-flush chooser refuses to route an op whose target SIDE it can't name,
 * so a new targeted op stays on the Arbiter until its intent is declared. Here it is unambiguously "own":
 * the printed subject is already "creature you control".
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { atomTargetIntent } from "./effects/programQueries.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers, checkDiesTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const DIES = "When this creature dies, put its counters on target creature you control.";
const PUPIL = { id: "c-sp", name: "Star Pupil", type: "Creature — Human Wizard", mana: "{W}", power: 0, toughness: 1,
  oracle: `This creature enters with a +1/+1 counter on it.\n${DIES}` };

describe("parse + routing", () => {
  it("the clause yields a transfer-counters atom restricted to your own creatures", () => {
    expect(parseEffectClause("put its counters on target creature you control", "Creature")).toMatchObject({
      confidence: "high",
      atoms: [{ op: "transfer-counters", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }],
    });
  });

  it("its target intent is OWN — without this the trigger never routes", () => {
    expect(atomTargetIntent({ op: "transfer-counters", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] })).toBe("own");
  });

  it("so the dies trigger routes natively", () => {
    const d = detectTriggers({ name: "T", type: "Creature — Human Wizard", oracle: DIES });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "dies", scope: "self" });
    expect(triggerRoutesNatively(d[0])).toBe(true);
  });

  it("Star Pupil flips native-trigger", () => {
    expect(classifyCard(PUPIL)).toBe("native-trigger");
  });
});

describe("RUNTIME — the dying creature's LAST-KNOWN bag moves", () => {
  function killPupilWith(counters) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const pupil = { ...createPermanent({ id: "sp", card: PUPIL, controller: "user", summoningSick: false }), counters };
    const heir = createPermanent({ id: "heir", card: { name: "Heir", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    let st = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 6,
      players: { ...s.players, user: { ...s.players.user, battlefield: [pupil, heir] } } };
    const dying = { ...pupil };
    st = moveCardToZone(st, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "sp" });
    st = checkDiesTriggers(st, [dying]);
    st = runStepActions(st);
    let g = 0; while (st.stack.length && g++ < 10) st = resolveTopOfStack(st);
    return st.players.user.battlefield.find((p) => p.id === "heir").counters || {};
  }

  it("moves +1/+1 counters onto the chosen creature", () => {
    expect(killPupilWith({ "+1/+1": 3 })).toMatchObject({ "+1/+1": 3 });
  });

  it("moves EVERY counter type, not just +1/+1 — the whole point versus modular", () => {
    // A +1/+1-only implementation passes the test above and fails this one.
    expect(killPupilWith({ "+1/+1": 3, shield: 1 })).toEqual({ "+1/+1": 3, shield: 1 });
  });

  it("a creature that died with NO counters moves nothing — never a fabricated counter", () => {
    expect(killPupilWith({})).toEqual({});
  });
});
