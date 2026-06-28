/**
 * blockTriggers.test.js — SUBSYSTEM 2: BLOCK triggers (blocks / becomes-blocked).
 *
 * The engine detected "Whenever this creature blocks, …" but never FIRED it (no firing site), and left
 * "Whenever this creature becomes blocked, …" UNDETECTED. This wave adds `checkBlockTriggers` (fired at the
 * declare-blockers step) + the becomes-blocked condition, so both self block-triggers fire + resolve:
 *  - each BLOCKER fires its "Whenever this creature blocks, …" (CR 509.1a);
 *  - each ATTACKER that became blocked fires its "Whenever this creature becomes blocked, …" (CR 509.1h).
 *
 * CREED: only the BARE self forms are modeled — a COMPOUND ("blocks or becomes blocked" — bushido) or a
 * RESTRICTED form ("becomes blocked by one or more X creatures" — rampage) stays Arbiter (a 2nd event /
 * unenforceable restriction). Each creature fires AT MOST ONCE per combat (deduped by id).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { checkBlockTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const cr = (name, oracle) => ({ name, type: "Creature — Bear", power: 2, toughness: 2, oracle });
// One attacker (user) + one blocker (ai), at the declare-blockers step with the block declared.
function combatState(atkOracle, blkOracle = "") {
  const atk = createPermanent({ id: "atk", card: { name: "Atk", type: "Creature — Bear", power: 2, toughness: 2, oracle: atkOracle }, controller: "user" });
  const blk = createPermanent({ id: "blk", card: { name: "Blk", type: "Creature — Bear", power: 1, toughness: 3, oracle: blkOracle }, controller: "ai" });
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers",
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers: [{ attackerId: "atk", blockerId: "blk" }] },
    players: { ...s.players, user: { ...s.players.user, battlefield: [atk], life: 20 }, ai: { ...s.players.ai, battlefield: [blk], life: 20 } },
  };
}

describe("BLOCK triggers (subsystem 2) — recognition", () => {
  it("bare self 'becomes blocked' / 'blocks' → native-trigger", () => {
    expect(classifyCard(cr("Deeproot Warrior", "Whenever this creature becomes blocked, it gets +1/+1 until end of turn."))).toBe("native-trigger");
    expect(classifyCard(cr("Gainer", "Whenever this creature becomes blocked, you gain 2 life."))).toBe("native-trigger");
  });
  it("FN boundary — compound bushido / restricted rampage stay Arbiter", () => {
    expect(classifyCard(cr("Bushido", "Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn."))).toBe("body-only");
    expect(classifyCard(cr("Rampage", "Whenever this creature becomes blocked by one or more creatures, it gets +2/+2 until end of turn for each creature blocking it beyond the first."))).toBe("body-only");
  });
});

describe("BLOCK triggers (subsystem 2) — runtime fires at declare-blockers", () => {
  it("an attacker that becomes blocked fires its trigger (gain life)", () => {
    let s = combatState("Whenever this creature becomes blocked, you gain 2 life.");
    s = checkBlockTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveTopOfStack(flushTriggers(s));
    expect(s.players.user.life).toBe(22);                       // the attacker's controller gains
  });

  it("a becomes-blocked self-pump fires + pumps the attacker", () => {
    let s = combatState("Whenever this creature becomes blocked, it gets +1/+1 until end of turn.");
    s = resolveTopOfStack(flushTriggers(checkBlockTriggers(s)));
    expect(permanentPower(s, "atk")).toBe(3);
    expect(permanentToughness(s, "atk")).toBe(3);
  });

  it("a BLOCKER fires its own 'Whenever this creature blocks' (for the blocker's controller)", () => {
    let s = combatState("", "Whenever this creature blocks, you gain 3 life.");
    s = checkBlockTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = resolveTopOfStack(flushTriggers(s));
    expect(s.players.ai.life).toBe(23);                         // the BLOCKER's controller (ai) gains
  });

  it("fires AT MOST ONCE per creature even when multi-blocked", () => {
    let s = combatState("Whenever this creature becomes blocked, you gain 2 life.");
    // a second blocker on the same attacker — "becomes blocked" still fires once (CR 509.1h)
    const blk2 = createPermanent({ id: "blk2", card: { name: "Blk2", type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai" });
    s = { ...s, combat: { ...s.combat, blockers: [...s.combat.blockers, { attackerId: "atk", blockerId: "blk2" }] }, players: { ...s.players, ai: { ...s.players.ai, battlefield: [...s.players.ai.battlefield, blk2] } } };
    s = checkBlockTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);          // not 2
  });

  it("no blockers → no fire", () => {
    const s = { ...combatState("Whenever this creature becomes blocked, you gain 2 life."), combat: { attackers: [], blockers: [] } };
    expect((checkBlockTriggers(s).pendingTriggers || [])).toHaveLength(0);
  });
});

describe("BUSHIDO keyword (subsystem 2) — synthesis + firing", () => {
  const BUSHIDO2 = "Bushido 2 (Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn.)";
  it("recognition: the Bushido N keyword classifies native (keyword-only / + modeled riders)", () => {
    expect(classifyCard(cr("Devoted Retainer", "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)"))).toBe("native-body");
    expect(classifyCard(cr("Numai Outcast", BUSHIDO2 + "\n{B}, Pay 5 life: Regenerate this creature."))).toBe("native-activated");
  });
  it("FN boundary: RAMPAGE (per-blocker scaling) stays Arbiter", () => {
    expect(classifyCard(cr("Craw Giant", "Trample\nRampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)"))).toBe("body-only");
  });
  it("runtime: a bushido ATTACKER that becomes blocked gets +N/+N", () => {
    let s = combatState(BUSHIDO2);
    s = resolveTopOfStack(flushTriggers(checkBlockTriggers(s)));
    expect(permanentPower(s, "atk")).toBe(4);     // 2/2 + Bushido 2
    expect(permanentToughness(s, "atk")).toBe(4);
  });
  it("runtime: a bushido BLOCKER gets +N/+N (fires in the blocker role too)", () => {
    let s = combatState("", "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)");
    s = resolveTopOfStack(flushTriggers(checkBlockTriggers(s)));
    expect(permanentPower(s, "blk")).toBe(2);     // 1/3 blocker + Bushido 1
    expect(permanentToughness(s, "blk")).toBe(4);
  });
});
