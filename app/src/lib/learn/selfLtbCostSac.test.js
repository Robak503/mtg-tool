/**
 * selfLtbCostSac.test.js — `sacrificeDropsTrigger`'s LTB flag, narrowed to NON-SELF shapes.
 *
 * The guard exists so a sac-as-cost ability is never credited when paying that cost would DROP a
 * trigger. It flagged every "leaves the battlefield" clause — but the SELF form is fired by the
 * cost-sac path on BOTH branches, which is why the identical narrowing was already earned for the
 * "…is put into a graveyard from the battlefield" sibling (2026-07-25). Probed the same way here,
 * at the runtime rather than by reading, and PINNED below as the runtime half of this slice:
 *
 *   non-creature → moveCardToZone (queues the leave event) + checkLeavesTriggers
 *   creature     → moveCardToZone + checkDiesTriggers, whose first line drains the same queue
 *
 * Both mint the token. A NON-SELF LTB watcher ("whenever ANOTHER permanent you control leaves…")
 * stays flagged — that is the shape the fail-safe was written for and it was not re-verified.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { checkLeavesTriggers, checkDiesTriggers, detectTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { sacrificeDropsTrigger, sacrificeDropsTriggerIgnoringSelfLtb } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LTB_LINE = "When this artifact enters or leaves the battlefield, create a 1/1 colorless Robot artifact creature token.";
const MOUSER_FOUNDRY = { id: "mf-card", name: "Mouser Foundry", type: "Artifact", mana: "{3}{R}",
  oracle: `${LTB_LINE}\n{4}{R}, Sacrifice this artifact: It deals 3 damage to target creature.` };
const SYNTHESIZER = { id: "es-card", name: "Experimental Synthesizer", type: "Artifact", mana: "{1}{R}",
  oracle: "When this artifact enters or leaves the battlefield, exile the top card of your library. Until end of turn, you may play that card.\n{2}{R}, Sacrifice this artifact: Create a 2/2 white Samurai creature token with vigilance. Activate only as a sorcery." };

function boardWith(perm) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: [perm] } } };
}
function settle(s) {
  s = flushTriggers(s, {});
  let g = 0;
  while ((s.stack || []).length && g++ < 20) s = resolveTopOfStack(s);
  return s;
}
const tokens = (s) => s.players.user.battlefield.filter((p) => p.card?.token);

describe("the SAC-SCOPED self-LTB exception (the card-level guard is UNCHANGED)", () => {
  it("⛔ the blanket guard still flags every LTB clause — exile-self and remove-counter costs keep it", () => {
    // Scope is the safety argument: only the SACRIFICE path was probed, so only it gets the exception.
    expect(sacrificeDropsTrigger(LTB_LINE)).toBe(true);
    expect(sacrificeDropsTrigger("When this creature leaves the battlefield, draw a card.")).toBe(true);
  });
  it("the sac-scoped variant clears a SELF LTB clause…", () => {
    expect(sacrificeDropsTriggerIgnoringSelfLtb(LTB_LINE)).toBe(false);
    expect(sacrificeDropsTriggerIgnoringSelfLtb("When this creature leaves the battlefield, draw a card.")).toBe(false);
  });
  it("…and CREED — it still refuses every shape the fail-safe was written for", () => {
    expect(sacrificeDropsTriggerIgnoringSelfLtb("Whenever another permanent you control leaves the battlefield, draw a card.")).toBe(true);
    expect(sacrificeDropsTriggerIgnoringSelfLtb("Whenever a creature leaves the battlefield, each opponent loses 1 life.")).toBe(true);
    expect(sacrificeDropsTriggerIgnoringSelfLtb("When you sacrifice a Clue, draw a card.")).toBe(true);
    expect(sacrificeDropsTriggerIgnoringSelfLtb("When another creature is put into a graveyard from the battlefield, gain 1 life.")).toBe(true);
    // A self-LTB clause does NOT launder a second, genuinely-unsafe trigger on the same card (an OTHER-object sacrifice).
    expect(sacrificeDropsTriggerIgnoringSelfLtb(`${LTB_LINE}\nWhen you sacrifice a Clue, draw a card.`)).toBe(true);
    // INVERTED 2026-09-05 (Heaped Harvest, heapedHarvest.test.js — verified by RUNTIME probe): the SELF-sacrifice head
    // ("When you sacrifice this artifact / it") is the one trigger a self-sac cost cannot drop — the cost path's
    // sacrifice chokepoint fires youSacrificeThis from the sacrificed card — so the sac-scoped guard now admits it.
    expect(sacrificeDropsTriggerIgnoringSelfLtb(`${LTB_LINE}\nWhen you sacrifice this artifact, draw a card.`)).toBe(false);
  });
});

describe("RUNTIME — the cost-sac path really fires a SELF LTB (both branches, law 6)", () => {
  it("NON-CREATURE: moveCardToZone + checkLeavesTriggers mints the token", () => {
    const perm = createPermanent({ id: "mf", card: { ...MOUSER_FOUNDRY, oracle: LTB_LINE }, controller: "user" });
    let s = boardWith(perm);
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "mf" });
    s = checkLeavesTriggers(s);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = settle(s);
    expect(tokens(s).map((t) => t.card?.name)).toEqual(["Robot"]);
  });
  it("CREATURE: moveCardToZone + checkDiesTriggers drains the same leave queue and mints it too", () => {
    const CREATURE = { id: "pb-card", name: "Probe Beast", type: "Creature — Beast", power: 2, toughness: 2,
      oracle: "When this creature enters or leaves the battlefield, create a 1/1 colorless Robot artifact creature token." };
    const perm = createPermanent({ id: "pb", card: CREATURE, controller: "user", summoningSick: false });
    let s = boardWith(perm);
    expect(detectTriggers(CREATURE).map((d) => d.event)).toContain("leavesSelf");
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "pb" });
    s = checkDiesTriggers(s, [{ controller: "user", id: "pb", name: CREATURE.name, card: CREATURE, counters: {}, power: 2, basePower: 2 }]);
    expect((s.pendingTriggers || []).length).toBe(1);
    s = settle(s);
    expect(tokens(s).map((t) => t.card?.name)).toEqual(["Robot"]);
  });
});

describe("classification — the two-flip composition unblocks", () => {
  it("both carriers compose (trigger + sac-activated) instead of parking", () => {
    expect(classifyCard(MOUSER_FOUNDRY)).toBe("native-mixed");
    expect(classifyCard(SYNTHESIZER)).toBe("native-mixed");
  });
  it("CREED — a sac ability beside a NON-SELF LTB watcher still parks", () => {
    expect(classifyCard({ name: "SYNTH Watcher", type: "Artifact", mana: "{2}",
      oracle: "Whenever another permanent you control leaves the battlefield, create a 1/1 colorless Robot artifact creature token.\n{2}, Sacrifice this artifact: Draw a card." })).not.toMatch(/^native/);
  });
});
