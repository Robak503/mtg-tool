/**
 * stateTrigger.test.js — STATE TRIGGERS (CR 603.8), census slice 8.
 *
 * "When you control no Islands, sacrifice this creature." (Seasinger, Barbarian Outcast, Dandân,
 * Island Fish Jasconius — 19 corpus carriers, all one shape). Unlike every other trigger the condition
 * is not a discrete event: it is CHECKED CONTINUOUSLY and triggers whenever the state exists, so the
 * checker runs from the CR 704.3 state-based-action fixpoint (sba.js), after the board settles.
 *
 * THE LATCH is the whole design. checkAllStateBasedActions runs several times per priority window, so a
 * naive "condition is true → enqueue" would pile up a fresh trigger on EVERY pass — an unbounded-trigger
 * FP. CR 603.8 says a state trigger fires when the state becomes true and is eligible again only after
 * the state has been false, so the arm/disarm flag rides the permanent (`_stateTrigArmed`), mirroring
 * renown's `renowned` and monstrosity's `monstrous`.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkStateTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const OUTCAST = { name: "Barbarian Outcast", type: "Creature — Human Barbarian", mana: "{1}{B}", power: 2, toughness: 1,
  oracle: "When you control no Swamps, sacrifice this creature." };

function board({ swamps = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [createPermanent({ id: "oc", card: { id: "c-oc", ...OUTCAST }, controller: "user", summoningSick: false })];
  for (let i = 0; i < swamps; i++) {
    bf.push(createPermanent({ id: `sw${i}`, card: { id: `c-sw${i}`, name: "Swamp", type: "Basic Land — Swamp" }, controller: "user" }));
  }
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: bf } } };
}
const nFired = (s) => (s.pendingTriggers || []).filter((t) => t.descriptor?.event === "stateTrigger").length;
const armed = (s) => !!s.players.user.battlefield.find((p) => p.id === "oc")?._stateTrigArmed;

describe("detection", () => {
  it("'when you control no <X>' → a stateTrigger descriptor carrying the condition", () => {
    const d = detectTriggers(OUTCAST);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "stateTrigger", scope: "self", stateCondition: "you control no swamps" });
    expect(d[0].effectClause).toBe("sacrifice this creature");
    expect(triggerRoutesNatively(d[0])).toBe(true);
  });
  it("CREED: a condition interveningIf CANNOT read stays undetected → Arbiter", () => {
    // "you control no permanents that glorbulate" is outside the readable vocabulary; classifyCondition
    // gates on interveningIfParseable, so nothing is detected rather than a fail-open state trigger.
    const weird = { name: "X", type: "Creature", oracle: "When you control no creatures that glorbulate, sacrifice this creature." };
    expect(detectTriggers(weird).some((d) => d.event === "stateTrigger")).toBe(false);
  });
  it("real carriers flip; a carrier with an unmodeled sibling clause still parks", () => {
    expect(classifyCard(OUTCAST)).toBe("native-trigger");
    // Seasinger's "You may choose not to untap this creature…" half is unmodeled → whole card parks.
    expect(classifyCard({ name: "Seasinger", type: "Creature — Siren", mana: "{2}{U}",
      oracle: "When you control no Islands, sacrifice this creature.\nYou may choose not to untap this creature during your untap step.\nGain control of target creature for as long as you control this creature." })).toBe("body-only");
  });
});

describe("RUNTIME — firing and the CR 603.8 latch", () => {
  it("condition TRUE (no Swamps) → fires once and arms the latch", () => {
    const out = checkStateTriggers(board({ swamps: 0 }));
    expect(nFired(out)).toBe(1);
    expect(armed(out)).toBe(true);
  });

  it("condition FALSE (a Swamp is out) → does not fire", () => {
    const out = checkStateTriggers(board({ swamps: 1 }));
    expect(nFired(out)).toBe(0);
    expect(armed(out)).toBe(false);
  });

  it("THE LATCH: re-checking while the state stays true does NOT pile up more triggers", () => {
    // sba's fixpoint calls this several times per priority window — the FP this design prevents.
    let s = checkStateTriggers(board({ swamps: 0 }));
    expect(nFired(s)).toBe(1);
    s = checkStateTriggers(s);
    s = checkStateTriggers(s);
    s = checkStateTriggers(s);
    expect(nFired(s)).toBe(1); // still exactly one
  });

  it("re-arms after the state becomes FALSE, so a later re-entry triggers again (CR 603.8)", () => {
    let s = checkStateTriggers(board({ swamps: 0 }));   // fires, armed
    expect(armed(s)).toBe(true);
    // A Swamp arrives → condition false → disarm (no new trigger).
    const swamp = createPermanent({ id: "sw", card: { id: "c-sw", name: "Swamp", type: "Basic Land — Swamp" }, controller: "user" });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, swamp] } } };
    s = checkStateTriggers(s);
    expect(armed(s)).toBe(false);
    // The Swamp leaves → condition true again → fires a SECOND time.
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: s.players.user.battlefield.filter((p) => p.id !== "sw") } } };
    s = checkStateTriggers(s);
    expect(nFired(s)).toBe(2);
  });

  it("scoped per controller — an opponent's Swamps don't satisfy YOUR condition", () => {
    let s = board({ swamps: 0 });
    const oppSwamp = createPermanent({ id: "osw", card: { id: "c-osw", name: "Swamp", type: "Basic Land — Swamp" }, controller: "ai" });
    s = { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [oppSwamp] } } };
    expect(nFired(checkStateTriggers(s))).toBe(1); // still fires — YOU control no Swamps
  });
});
