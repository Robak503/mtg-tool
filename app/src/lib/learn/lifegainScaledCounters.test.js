/**
 * BLITZ EC-1b — LIFEGAIN-SCALED SELF COUNTERS (Sunbond / Light of Promise):
 * "Whenever you gain life, put that many +1/+1 counters on this creature."
 *
 * "that many" = the amount of life just gained (CR 603.2 — each gain event triggers separately with its own
 * amount). The raw clause is byte-identical to the ENRAGE payoff (Hungering Hydra binds the same words to
 * ctx.combatDamageAmount), so detectTriggers rewrites the LIFEGAIN-event payoff to the event-specific
 * sentinel "put that many lifegain +1/+1 counters on this creature" (a phrase in ZERO printed oracle text —
 * the counters-placed discipline); the counter parser maps it to countContext:"lifegainAmount" (target:"self");
 * checkLifegainTriggers threads lifegainAmount per gain event; combatDamageReferentSatisfied pins the
 * countContext to the lifegain event so no other event/spell can read an absent referent.
 *
 * Pinned here: the classify flips on the REAL carriers (both aura grants AND the printed-creature form), the
 * granted trigger firing ON THE HOST with the gained amount, per-event amounts (two gains → two separate
 * counts), the grant lifting when the Aura leaves, and the FN guards (rider → parked; the ENRAGE form still
 * binds combat damage; a lifegain "that many" on the WRONG event never routes).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, checkLifegainTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { resolveTopOfStack, flushTriggers } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// The real bundled oracle (probed) — Sunbond and Light of Promise carry the identical grant body.
const SUNBOND = { name: "Sunbond", type: "Enchantment — Aura", mana: "{3}{W}",
  oracle: 'Enchant creature\nEnchanted creature has "Whenever you gain life, put that many +1/+1 counters on this creature."' };
const LIGHT_OF_PROMISE = { name: "Light of Promise", type: "Enchantment — Aura", mana: "{2}{W}",
  oracle: 'Enchant creature\nEnchanted creature has "Whenever you gain life, put that many +1/+1 counters on this creature."' };
const PRINTED = { id: "card-printed", name: "Scaled Gainer", type: "Creature — Cat", power: "2", toughness: "2", mana: "{1}{W}",
  oracle: "Whenever you gain life, put that many +1/+1 counters on this creature." };

function hostWithAura(auraCard) {
  const host = createPermanent({ id: "host", card: { name: "Host Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false });
  const a = createPermanent({ id: "aura", card: auraCard, controller: "user" });
  a.attachedTo = "host";
  host.attachments = ["aura"];
  return [host, a];
}
function board(userBf) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, battlefield: userBf } },
  };
}
const resolveAll = (s) => { while (s.stack.length) s = resolveTopOfStack(s); return s; };
const counterOn = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] || 0;

describe("EC-1b — recognition", () => {
  it("Sunbond and Light of Promise (real oracles) → native-trigger", () => {
    expect(classifyCard(SUNBOND)).toBe("native-trigger");
    expect(classifyCard(LIGHT_OF_PROMISE)).toBe("native-trigger");
  });
  it("the PRINTED creature form flips too (the shared parser serves both)", () => {
    expect(classifyCard(PRINTED)).toBe("native-trigger");
  });
  it("detection: the lifegain payoff is rewritten to the event-specific sentinel", () => {
    const trigs = detectTriggers(PRINTED);
    expect(trigs).toHaveLength(1);
    expect(trigs[0].event).toBe("lifegain");
    expect(trigs[0].effectClause).toBe("put that many lifegain +1/+1 counters on this creature");
    expect(triggerRoutesNatively(trigs[0])).toBe(true);
  });
  it("FN guard: a rider on the payoff stays unrewritten → parked (CREED all-or-nothing)", () => {
    const rider = { ...PRINTED, oracle: "Whenever you gain life, put that many +1/+1 counters on this creature, then draw a card." };
    expect(classifyCard(rider)).toBe("body-only");
  });
  it("FN guard: the ENRAGE 'that many' (dealt-damage event) still binds combat damage, not lifegain", () => {
    const enrage = { ...PRINTED, oracle: "Whenever this creature is dealt damage, put that many +1/+1 counters on it." };
    const trigs = detectTriggers(enrage);
    expect(trigs).toHaveLength(1);
    expect(trigs[0].effectClause).toBe("put that many +1/+1 counters on this creature"); // the enrage lane, no lifegain sentinel
  });
  it("FN guard: a lifegainAmount atom on the WRONG event never routes (the referent gate)", () => {
    expect(triggerRoutesNatively({ event: "etb", effectClause: "put that many lifegain +1/+1 counters on this creature" })).toBe(false);
  });
});

describe("EC-1b — runtime: the granted trigger fires ON THE HOST with the gained amount", () => {
  it("gain 3 → three +1/+1 counters on the HOST (a 2/2 becomes 5/5-sized)", () => {
    let s = board(hostWithAura(SUNBOND));
    s = checkLifegainTriggers(s, "user", 3);
    expect(s.pendingTriggers).toHaveLength(1);
    s = flushTriggers(s);
    expect(s.stack[0].payload.resolver).toBe("effect-program");
    s = resolveAll(s);
    expect(counterOn(s, "host")).toBe(3);
  });
  it("per-event amounts: two separate gains (2, then 5) place 2 then 5 counters (CR 603.2)", () => {
    let s = board(hostWithAura(LIGHT_OF_PROMISE));
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 2)));
    expect(counterOn(s, "host")).toBe(2);
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 5)));
    expect(counterOn(s, "host")).toBe(7);
  });
  it("the grant lifts when the Aura leaves (no attachment → no trigger fires)", () => {
    const [host] = hostWithAura(SUNBOND);
    host.attachments = [];
    let s = board([host]); // aura gone
    s = checkLifegainTriggers(s, "user", 4);
    expect(s.pendingTriggers || []).toHaveLength(0);
  });
  it("an OPPONENT's life gain never fires the user's granted trigger (per-gainer, CR 119.3)", () => {
    let s = board(hostWithAura(SUNBOND));
    s = checkLifegainTriggers(s, "ai", 3);
    expect(s.pendingTriggers || []).toHaveLength(0);
  });
  it("the PRINTED form resolves identically (shared runtime)", () => {
    let s = board([createPermanent({ id: "pg", card: PRINTED, controller: "user", summoningSick: false })]);
    s = resolveAll(flushTriggers(checkLifegainTriggers(s, "user", 4)));
    expect(counterOn(s, "pg")).toBe(4);
  });
});
