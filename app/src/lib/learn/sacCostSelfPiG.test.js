/**
 * sacCostSelfPiG.test.js — narrowing the γ1 sacrifice-drops-a-trigger fail-safe (census slice 9).
 *
 * `sacrificeDropsTrigger` marks a self-sac activated ability UNMODELED when the card carries a trigger
 * that sacrificing the source would silently drop — a correct and important CREED guard. One of its
 * clauses ("put into … from the battlefield", commented "zone-LTB the detector misses") had gone STALE
 * for the SELF form: detectTriggers maps "When this artifact is put into a graveyard from the
 * battlefield, …" to the `ltb` event, and the cost-sac path fires it —
 * actionDispatcher.sacrificePermanentForCost calls moveCardToZone (queuing the leave event) then
 * checkLeavesTriggers (non-creature) / checkDiesTriggers (creature, which drains the same queue first).
 *
 * That was verified at RUNTIME before the guard was narrowed, and this file pins the verification so the
 * narrowing can never rest on reading alone. Every OTHER subject stays flagged — those watcher shapes are
 * what the fail-safe was really written for and none were re-verified.
 *
 * Flips the Spellbomb / Implement cycles (10 cards) to native-mixed.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { sacrificeDropsTrigger, parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { checkLeavesTriggers } from "./triggers.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const IMPLEMENT = {
  name: "Implement of Examination", type: "Artifact", mana: "{3}",
  oracle: "{U}, Sacrifice this artifact: Draw a card.\nWhen this artifact is put into a graveyard from the battlefield, draw a card.",
};

describe("the fail-safe still guards everything it was written for", () => {
  it("a LEAVES-the-battlefield trigger still flags (the dies path won't fire it)", () => {
    expect(sacrificeDropsTrigger("When this creature leaves the battlefield, draw a card.")).toBe(true);
  });
  it("a 'whenever you sacrifice' trigger still flags", () => {
    expect(sacrificeDropsTrigger("Whenever you sacrifice a permanent, draw a card.")).toBe(true);
  });
  it("a NON-self 'put into a graveyard from the battlefield' watcher still flags", () => {
    // Only the SELF form was re-verified; a watcher on OTHER permanents stays conservatively flagged.
    expect(sacrificeDropsTrigger("Whenever another creature you control is put into a graveyard from the battlefield, draw a card.")).toBe(true);
  });
  it("a compound embedded when-clause still flags", () => {
    expect(sacrificeDropsTrigger("When this artifact enters and whenever you draw a card, gain 1 life.")).toBe(true);
  });
});

describe("the SELF form is exempt — and the exemption is earned at runtime", () => {
  it("no longer flags the self 'put into a graveyard from the battlefield' shape", () => {
    expect(sacrificeDropsTrigger(IMPLEMENT.oracle)).toBe(false);
  });
  it("so its self-sac activated ability parses MODELED, and the card flips native-mixed", () => {
    expect(parseActivatedAbilities(IMPLEMENT)[0].modeled).toBe(true);
    expect(classifyCard(IMPLEMENT)).toBe("native-mixed");
  });
  it("RUNTIME PROOF: sacrificing the source really does fire its own PiG trigger (the exemption's basis)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const perm = createPermanent({ id: "imp", card: { id: "c-imp", ...IMPLEMENT }, controller: "user" });
    let s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [perm], library: [{ id: "l1", name: "A", type: "Instant" }], hand: [] } } };
    // The exact move sacrificePermanentForCost performs when paying a "Sacrifice this artifact" cost.
    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "imp" });
    expect((s.pendingLeaveEvents || []).length).toBe(1);   // the leave event was queued…
    s = checkLeavesTriggers(s);
    const fired = (s.pendingTriggers || []).filter((t) => t.descriptor?.event === "ltb");
    expect(fired).toHaveLength(1);                          // …and the card's own trigger fired
    expect(fired[0].descriptor.effectClause).toBe("draw a card");
  });
});
