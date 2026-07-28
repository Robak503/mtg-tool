/**
 * drainMirror.test.js — THE DRAIN MIRROR: the two halves of Sanguine Bond ⇄ Exquisite Blood.
 *
 *   LIFEGAIN → LOSS  "Whenever you gain life, target opponent loses that much life."
 *                    Sanguine Bond #496 · Vito, Thorn of the Dusk Rose #492 · Defiant Bloodlord #5787
 *   LOSS → LIFEGAIN  "Whenever an opponent loses life, you gain that much life."
 *                    Exquisite Blood #508 · Bloodthirsty Conqueror #901
 *
 * BOTH events already existed (checkLifegainTriggers / checkLifeLossTriggers) and both already threaded their
 * magnitude (ctx.lifegainAmount / ctx.lifeLostAmount). What was missing was only the PAYOFF binding — and the
 * two halves were missing it in OPPOSITE ways, which is the whole reason they ship together:
 *
 *   - "target opponent loses that much life" parsed to NOTHING. The rewrite UNBLOCKS it.
 *   - "you gain that much life" already parsed — to countContext:"combatDamageAmount", because those exact
 *     words are Essence Sliver's combat-damage payoff. On a lifeLost trigger that referent is never set, so
 *     the atom would have gained ZERO. The rewrite RE-POINTS it. (What kept that from shipping as a broken
 *     native is combatDamageReferentSatisfied, which is why Exquisite Blood sat at body-only rather than
 *     silently gaining 0 — the gate earning its keep, so it gets a pin of its own below.)
 *
 * The engine-visible payoff is not the two cards but the PAIR: together they are the classic drain loop, and
 * a loop is exactly where a wrong magnitude stops being a rounding error. Pinned below: it converges, it
 * converges DOWNWARD, and it terminates without a cap (each pass moves real life, CR 104.3b).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkLifegainTriggers, checkLifeLossTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { isPlayerDead } from "./learnSession.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text (probed from the index), trimmed to the ability under test.
const SANGUINE_BOND = { name: "Sanguine Bond", type: "Enchantment", mana: "{3}{B}{B}",
  oracle: "Whenever you gain life, target opponent loses that much life." };
const EXQUISITE_BLOOD = { name: "Exquisite Blood", type: "Enchantment", mana: "{4}{B}{B}",
  oracle: "Whenever an opponent loses life, you gain that much life." };
const VITO = { name: "Vito, Thorn of the Dusk Rose", type: "Creature — Vampire Cleric", mana: "{2}{B}{B}", power: 1, toughness: 3,
  oracle: "Whenever you gain life, target opponent loses that much life.\n{3}{B}{B}: Creatures you control gain lifelink until end of turn." };
const EACH_FORM = { name: "Drain Font", type: "Enchantment", mana: "{3}{B}",
  oracle: "Whenever you gain life, each opponent loses that much life." };

function board(cards) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s.players,
      user: {
        ...s.players.user,
        battlefield: cards.map((c, i) => createPermanent({ id: `p${i}`, card: c, controller: "user", summoningSick: false })),
      },
    },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const life = (s, pid) => s.players[pid].life;

/**
 * Settle every pending trigger AND everything they spawn, STOPPING on a dead seat — which is what makes
 * this a faithful stand-in for the session pump rather than a raw drain. learnSession resolves one stack
 * object per tick and runs the player-loss SBA before every priority window (CR 704.3 / 104.3b), so a seat
 * at 0 life is removed between resolutions and the chain ends there. A pump WITHOUT that read runs forever
 * on the mirror board (verified: 400 passes, the opponent at -160) — the terminating condition is the SBA,
 * never the engine noticing a loop. `cap` is a hang detector for this test only.
 */
function settle(s, cap = 400) {
  let passes = 0;
  while ((s.stack.length || (s.pendingTriggers || []).length) && passes < cap) {
    if (Object.keys(s.players).some((pid) => isPlayerDead(s, pid))) break;
    s = flushTriggers(s);
    if (s.stack.length) s = resolveTopOfStack(s);
    passes++;
  }
  return { state: s, passes };
}

describe("recognition — both halves flip, and the sentinels are event-specific", () => {
  it("Sanguine Bond → native-trigger", () => {
    expect(classifyCard(SANGUINE_BOND)).toBe("native-trigger");
  });

  it("Exquisite Blood → native-trigger", () => {
    expect(classifyCard(EXQUISITE_BLOOD)).toBe("native-trigger");
  });

  it("Vito flips too — the drain half is identical, the lifelink pump is separately modeled", () => {
    expect(classifyCard(VITO)).toMatch(/^native/);
  });

  it("the lifegain payoff is rewritten to the lifegain-specific sentinel", () => {
    const [t] = detectTriggers(SANGUINE_BOND);
    expect(t.event).toBe("lifegain");
    expect(t.effectClause).toBe("target opponent loses that much lifegain life");
    expect(triggerRoutesNatively(t)).toBe(true);
  });

  it("the life-loss payoff is rewritten to the loss-specific sentinel", () => {
    const [t] = detectTriggers(EXQUISITE_BLOOD);
    expect(t.event).toBe("lifeLost");
    expect(t.effectClause).toBe("you gain that much life-lost life");
    expect(triggerRoutesNatively(t)).toBe(true);
  });

  it("THE COLLISION PIN — the combat-damage carrier's identical words still bind COMBAT damage", () => {
    // "gain that much life" is one phrase serving two referents (this is Essence Sliver's payoff, in the
    // printed self form). If the lifeLost rewrite ever widened past its event gate, this card would start
    // reading an absent lifeLostAmount and gain 0 on combat damage — a silently dropped payoff.
    const [t] = detectTriggers({ name: "Blood Sliver", type: "Creature — Sliver", mana: "{3}{W}", power: 3, toughness: 3,
      oracle: "Whenever this creature deals combat damage to a player, you gain that much life." });
    expect(t.event).toBe("combatDamageToPlayer");
    expect(t.effectClause).toBe("you gain that much life"); // unrewritten — the combat lane, not the drain lane
  });

  it("THE REFERENT GATE — a lifeLostAmount payoff on any other event refuses to route", () => {
    expect(triggerRoutesNatively({ event: "etb", effectClause: "you gain that much life-lost life" })).toBe(false);
    expect(triggerRoutesNatively({ event: "lifegain", effectClause: "you gain that much life-lost life" })).toBe(false);
  });

  it("FN guard — a rider on the drain leaves residue → unrewritten → parked (CREED all-or-nothing)", () => {
    expect(classifyCard({ ...SANGUINE_BOND, oracle: "Whenever you gain life, target opponent loses that much life and you draw a card." })).toBe("body-only");
  });
});

describe("RUNTIME — each half moves the right amount", () => {
  it("Sanguine Bond: gaining 3 drains the targeted opponent for exactly 3", () => {
    let s = board([SANGUINE_BOND]);
    const before = life(s, "ai");
    s = checkLifegainTriggers(s, "user", 3);
    expect(s.pendingTriggers).toHaveLength(1);
    s = resolveAll(flushTriggers(s));
    expect(life(s, "ai")).toBe(before - 3);
  });

  it("THE MAGNITUDE PIN — the drain tracks the gain, it is not a flat 1", () => {
    // The failure this catches is the quiet one: an atom that binds the wrong (absent) referent resolves to
    // 0, and an atom that falls back to a printed default resolves to 1. Only the real binding gives 7.
    let s = board([SANGUINE_BOND]);
    const before = life(s, "ai");
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 7)));
    expect(life(s, "ai")).toBe(before - 7);
  });

  it("per-event, not per-turn: two gains of 2 and 5 drain 2 then 5 (CR 603.2)", () => {
    let s = board([SANGUINE_BOND]);
    const before = life(s, "ai");
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 2)));
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 5)));
    expect(life(s, "ai")).toBe(before - 7);
  });

  it("Exquisite Blood: an opponent losing 4 gains its controller exactly 4", () => {
    let s = board([EXQUISITE_BLOOD]);
    const before = life(s, "user");
    s = checkLifeLossTriggers(s, { playerId: "ai", amount: 4 });
    expect(s.pendingTriggers).toHaveLength(1);
    s = resolveAll(flushTriggers(s));
    expect(life(s, "user")).toBe(before + 4);
  });

  it("Exquisite Blood does NOT fire on its own controller's life loss (whose:'opponent')", () => {
    let s = board([EXQUISITE_BLOOD]);
    s = checkLifeLossTriggers(s, { playerId: "user", amount: 4 });
    expect(s.pendingTriggers || []).toHaveLength(0);
  });

  it("the 'each opponent' form drains without targeting", () => {
    let s = board([EACH_FORM]);
    const before = life(s, "ai");
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 3)));
    expect(life(s, "ai")).toBe(before - 3);
  });
});

describe("THE MIRROR — both halves on one board", () => {
  it("the loop runs, drains the opponent to exactly 0, and hands the SBA a dead seat", () => {
    // Sanguine Bond + Exquisite Blood is the canonical drain loop, and it is NOT a rules-infinite: every
    // pass moves the opponent's life strictly downward by exactly 1, so the loss SBA (CR 104.3b) catches it
    // at 0. Landing on 0 EXACTLY — not below — is the real claim: it says each half read its own event's
    // magnitude, since a half binding a stale or absent referent would over- or under-shoot.
    let s = board([SANGUINE_BOND, EXQUISITE_BLOOD]);
    const oppStart = life(s, "ai");
    const meStart = life(s, "user");
    s = checkLifegainTriggers(s, "user", 1);
    const { state, passes } = settle(s);
    expect(life(state, "ai")).toBe(0);
    expect(isPlayerDead(state, "ai")).toBe(true);
    // Every point drained came back as life gained, less the ONE still in flight: the pump stops at the SBA
    // boundary, so the final life-loss trigger is on the stack unresolved (resolveTopOfStack flushes what a
    // resolution spawns, so it lands on the stack rather than in pendingTriggers). Pinning the boundary
    // rather than a round number keeps the test honest about where this harness stops and the session
    // takes over.
    expect(life(state, "user")).toBe(meStart + oppStart - 1);
    expect(state.stack).toHaveLength(1);
    expect(passes).toBeLessThan(400);
  });

  it("one half alone does not loop — a single drain, then quiet", () => {
    let s = board([SANGUINE_BOND]);
    const oppStart = life(s, "ai");
    const { state, passes } = settle(checkLifegainTriggers(s, "user", 2));
    expect(life(state, "ai")).toBe(oppStart - 2);
    expect(passes).toBeLessThanOrEqual(2);
  });
});
