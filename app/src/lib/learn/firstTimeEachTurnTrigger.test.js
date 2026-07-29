/**
 * firstTimeEachTurnTrigger.test.js — "…FOR THE FIRST TIME EACH TURN" as a TRIGGER limiter (CR 603.2).
 *
 * THE BUG THIS CLOSES IS AN OVER-FIRE, not a coverage gap. The once-per-turn latch has existed since the
 * Mirelurk Queen slice — `descriptor.oncePerTurnTrigger` + `state.onceTriggersFiredThisTurn`, keyed per
 * source permanent + event, cleared at the untap step, enforced at gameEngine.flushTriggers, the universal
 * chokepoint. What was missing was only the VOCABULARY: the flag was set ONLY from the trailing sentence
 * "This ability triggers only once each turn." A card that bakes the same limiter into its EVENT wording
 * instead — "Whenever ~ attacks FOR THE FIRST TIME EACH TURN" — was detected as a plain `attacks` trigger
 * with the latch OFF, so it fired on EVERY attack.
 *
 * ⛔ WHY THIS IS WORSE THAN A WRONG NUMBER: Aurelia, the Warleader is native (since the extra-combat slice)
 * and her payoff GRANTS AN ADDITIONAL COMBAT PHASE. Fire-every-attack + grant-a-combat is a turn that never
 * ends — she attacks in the extra combat, re-triggers, queues another. The engine's extra-combat
 * non-termination test proved ONE grant drains correctly; nothing proved the grant couldn't be re-issued.
 * That is the shape of a soft-lock: every part passing its own test, the loop living in the join.
 *
 * The fix is the strip, not a new mechanism — the same treatment the trailing sentence already gets, at the
 * same descriptor field, honored by the same latch.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers, checkAttackTriggers } from "./triggers.js";
import { flushTriggers, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const AURELIA = {
  id: "c-aur", name: "Aurelia, the Warleader", type: "Legendary Creature — Angel",
  mana: "{2}{R}{R}{W}{W}", power: 3, toughness: 4, keywords: [],
  oracle: "Flying, vigilance, haste\nWhenever Aurelia attacks for the first time each turn, untap all creatures you control. After this phase, there is an additional combat phase.",
};
// The CONTROL card: same event, same payoff shape, no limiter. It SHOULD fire on every attack.
const UNLIMITED = {
  id: "c-unl", name: "Battle Scribe", type: "Creature — Human", power: 1, toughness: 1, keywords: [],
  oracle: "Whenever this creature attacks, untap all creatures you control.",
};

describe("detection — the limiter is read off the EVENT wording", () => {
  it("⭐ Aurelia's descriptor carries the once-per-turn latch", () => {
    const d = detectTriggers(AURELIA);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "self", oncePerTurnTrigger: true });
  });

  it("⭐ and the limiter is STRIPPED from the effect clause, not left as residue", () => {
    // Residue would park the card; the payoff has to read as if the limiter were never printed.
    expect(detectTriggers(AURELIA)[0].effectClause).not.toMatch(/first time/i);
  });

  it("CONTROL — a trigger with no limiter does NOT get the latch", () => {
    expect(detectTriggers(UNLIMITED)[0].oncePerTurnTrigger).toBe(false);
  });

  it("⛔ 'for the first time during each of YOUR turns' keeps its OWN arm, untouched", () => {
    // A per-YOUR-turn window, not a per-turn one, and it already had a purpose-built arm (whose:"yours" +
    // the latch). The strip's trailing anchor is what keeps this condition out of its hands.
    //
    // ⚠️ THE ANCHOR IS LOAD-BEARING AND THIS IS WHERE THAT IS PROVEN. Drop the `$` and the match becomes
    // greedy-prefix: it captures "this creature becomes tapped", DISCARDS " during each of your turns", and
    // hands the truncated condition on — which detects as { whose: "any", oncePerTurnTrigger: false }. That
    // is an over-fire on BOTH axes at once (every turn, and every tap). Asserting the full descriptor rather
    // than "some other event didn't appear" is what makes the mutation die here.
    const d = detectTriggers({ ...UNLIMITED, oracle: "Whenever this creature becomes tapped for the first time during each of your turns, draw a card." });
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "becomesTapped", whose: "yours", oncePerTurnTrigger: true });
  });
});

describe("⭐ RUNTIME — the second attack in the same turn does NOT re-fire", () => {
  function attacking(card, { fired = null } = {}) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "combat", step: "declare-attackers", activePlayer: "user",
      ...(fired ? { onceTriggersFiredThisTurn: fired } : {}),
      combat: { attackers: [{ permanentId: "src", attackingPlayer: "user", defender: "ai" }], blockers: [] },
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [createPermanent({ id: "src", card, controller: "user", summoningSick: false, tapped: true })] },
      },
    };
  }
  const flushOnce = (st) => flushTriggers(checkAttackTriggers(st), { chooseTargets: chooseTriggerTargets });

  it("⭐ the FIRST attack fires and marks the latch", () => {
    const after = flushOnce(attacking(AURELIA));
    expect(Object.keys(after.onceTriggersFiredThisTurn || {})).toHaveLength(1);
    expect(after.stack.length + (after.pendingTriggers || []).length).toBeGreaterThan(0);
  });

  it("⛔ THE SOFT-LOCK — attacking again with the latch already set puts NOTHING on the stack", () => {
    // Aurelia's own extra combat is what makes a second attack happen at all. Before the fix this second
    // flush queued another combat, and another, forever.
    const latched = flushOnce(attacking(AURELIA)).onceTriggersFiredThisTurn;
    const second = flushOnce(attacking(AURELIA, { fired: latched }));
    expect(second.stack).toHaveLength(0);
    expect(second.pendingTriggers || []).toHaveLength(0);
  });

  it("CONTROL — the UNLIMITED card fires on the second attack, exactly as it should", () => {
    // The assertion that proves the latch is read from the card and not applied to every attack trigger.
    const latched = flushOnce(attacking(UNLIMITED)).onceTriggersFiredThisTurn;
    const second = flushOnce(attacking(UNLIMITED, { fired: latched }));
    expect(second.stack.length).toBeGreaterThan(0);
  });
});

describe("tier — the strip must not cost a card", () => {
  it("⭐ Aurelia stays native (now honestly so)", () => {
    expect(classifyCard({ name: AURELIA.name, type: AURELIA.type, mana: AURELIA.mana, power: "3", toughness: "4", oracle: AURELIA.oracle }))
      .toBe("native-trigger");
  });
});
