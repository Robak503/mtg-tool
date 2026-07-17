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
import { flushTriggers, resolveTopOfStack, nextStep } from "./gameEngine.js";
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
  it("FN boundary — the bare compound is now native (BLITZ TR-2); restricted rampage stays Arbiter", () => {
    // The bare "blocks or becomes blocked" compound previously parked (naming a second event the spine
    // couldn't attribute). BLITZ TR-2 classifies it onto the blocksOrBecomesBlocked event checkBlockTriggers
    // already fires for bushido (once per role, deduped — both-events/once-each pinned in
    // triggerScopes.test.js), so the printed form now honestly routes native. The RESTRICTED forms keep
    // the park: rampage's per-blocker scaling and any "by one or more <filter> creatures" wording fail the
    // whole-clause subject anchor → UNDETECTED → Arbiter (a SAFE false-negative).
    expect(classifyCard(cr("Bushido", "Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn."))).toBe("native-trigger");
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

describe("BLOCK triggers (subsystem 2) — fire through the REAL loop (nextStep) [ISSUE 2 regression]", () => {
  // The unit tests above call checkBlockTriggers() directly — but the SIM loop never does. Combat advances
  // through nextStep (passPriority's chokepoint). Before the fix, nextStep never called checkBlockTriggers,
  // so every block trigger was a HOLLOW flip: recognized native, but inert in a real game. These tests drive
  // the actual chokepoint so a regression that stops firing on the real path fails loudly.
  it("leaving declare-blockers fires the becomes-blocked trigger onto the stack + holds priority", () => {
    const s0 = combatState("Whenever this creature becomes blocked, it gets +1/+1 until end of turn.");
    const s1 = nextStep(s0);
    expect(s1.step).toBe("declare-blockers");             // HELD for resolution, not advanced past
    expect((s1.stack || []).length).toBe(1);              // the trigger is on the stack
    expect(s1.priorityHolder).toBe(s1.activePlayer);      // priority back to active so it resolves before damage
    expect(s1.combat._blockTriggersFired).toBe(true);     // fire-once guard set
    const s2 = resolveTopOfStack(s1);
    expect(permanentPower(s2, "atk")).toBe(3);            // +1/+1 actually landed
    expect(permanentToughness(s2, "atk")).toBe(3);
  });

  it("a plain combat (no block trigger) advances past declare-blockers with an empty stack", () => {
    const s1 = nextStep(combatState("", ""));
    expect(s1.step).not.toBe("declare-blockers");          // advanced
    expect((s1.stack || []).length).toBe(0);
  });

  it("does NOT re-fire — a second nextStep after resolution advances instead of re-triggering (no infinite loop, no double effect)", () => {
    const s0 = combatState("Whenever this creature becomes blocked, you gain 2 life.");
    const s1 = nextStep(s0);                               // fires, holds in declare-blockers
    const s2 = resolveTopOfStack(s1);                      // life 22, stack empty, flag still set
    const s3 = nextStep(s2);                               // flag set → must advance, not re-fire
    expect(s3.step).not.toBe("declare-blockers");
    expect((s3.stack || []).length).toBe(0);
    expect(s3.players.user.life).toBe(22);                // no double gain
  });
});

describe("BUSHIDO keyword (subsystem 2) — synthesis + firing", () => {
  const BUSHIDO2 = "Bushido 2 (Whenever this creature blocks or becomes blocked, it gets +2/+2 until end of turn.)";
  it("recognition: the Bushido N keyword classifies native (keyword-only / + modeled riders)", () => {
    expect(classifyCard(cr("Devoted Retainer", "Bushido 1 (Whenever this creature blocks or becomes blocked, it gets +1/+1 until end of turn.)"))).toBe("native-body");
    expect(classifyCard(cr("Numai Outcast", BUSHIDO2 + "\n{B}, Pay 5 life: Regenerate this creature."))).toBe("native-activated");
  });
  it("FN boundary: a still-unmodeled combat keyword (banding) stays Arbiter", () => {
    // (RAMPAGE is modeled — see the RAMPAGE describe block. FLANKING graduated in BLITZ FL-1 — the
    // fire-time -1/-1 onto each non-flanking blocker, pinned in selfHitAndPerBlockerPump.test.js.
    // BANDING's attack-band / damage-assignment rules (CR 702.22) remain genuinely unmodeled.)
    expect(classifyCard(cr("Bander", "Banding (Any creatures with banding, and up to one without, can attack in a band. Bands are blocked as a group.)"))).toBe("body-only");
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

describe("RAMPAGE keyword (subsystem 2) — dynamic per-blocker pump", () => {
  const RAMP2 = "Trample\nRampage 2 (Whenever this creature becomes blocked, it gets +2/+2 until end of turn for each creature blocking it beyond the first.)";
  // a Rampage attacker blocked by `n` creatures
  function rampCombat(n) {
    const atk = createPermanent({ id: "atk", card: { name: "Craw", type: "Creature — Giant", power: 6, toughness: 4, oracle: RAMP2 }, controller: "user" });
    const bf = [], blockers = [];
    for (let i = 0; i < n; i++) { bf.push(createPermanent({ id: `b${i}`, card: { name: `B${i}`, type: "Creature — Bear", power: 1, toughness: 1, oracle: "" }, controller: "ai" })); blockers.push({ attackerId: "atk", blockerId: `b${i}` }); }
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-blockers", combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], blockers }, players: { ...s.players, user: { ...s.players.user, battlefield: [atk] }, ai: { ...s.players.ai, battlefield: bf } } };
  }
  it("recognition: Rampage N → native (Trample + Rampage both modeled keywords)", () => {
    expect(classifyCard({ name: "Craw Giant", type: "Creature — Giant", power: 6, toughness: 4, oracle: RAMP2 })).toBe("native-body");
  });
  it("blocked by exactly ONE → no creature beyond the first → no trigger (CR 702.23a)", () => {
    expect((checkBlockTriggers(rampCombat(1)).pendingTriggers || [])).toHaveLength(0);
  });
  it("blocked by TWO → +N×1 (6/4 → 8/6)", () => {
    let s = resolveTopOfStack(flushTriggers(checkBlockTriggers(rampCombat(2))));
    expect(permanentPower(s, "atk")).toBe(8);
    expect(permanentToughness(s, "atk")).toBe(6);
  });
  it("blocked by THREE → +N×2 (6/4 → 10/8)", () => {
    let s = resolveTopOfStack(flushTriggers(checkBlockTriggers(rampCombat(3))));
    expect(permanentPower(s, "atk")).toBe(10);
    expect(permanentToughness(s, "atk")).toBe(8);
  });
});
