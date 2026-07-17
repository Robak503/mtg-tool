/**
 * ===== COUNTER-COST ACTIVATED — "Remove N <kind> counters from this" (BLITZ CC-2, census vein #11) =====
 *
 * One thin extension to the γ1c remove-counter activation cost (effects/abilities.js parseAbilityCost):
 * the count may be PLURAL — "Remove three spore counters from this creature: Create a … Saproling …"
 * (the 16-card Thallid class), "Remove three charge counters from this artifact: …" (Lux Cannon / Golem
 * Foundry / Magistrate's Scepter), "Remove two +1/+1 counters from this creature: Draw a card."
 * (Mindless Automaton), up to the printed digit extremes ("Remove 100 charge counters…", Vexing
 * Puzzlebox — parses, but its dice-roll body parks the card). The parsed shape is `removeCounter:
 * { type, count }`, riding the ALREADY-SHIPPED singular seam end to end:
 *
 *   • OFFER (legalChoices.actionsActivateAbility): payable ONLY while the source HAS ≥ count counters
 *     of that kind (CR 118.3 — a player can't pay a cost without the necessary resources to pay it
 *     fully). The gate — with the pay-life / pay-energy gates — now sits ABOVE the γ1f costX expansion,
 *     so no enumeration path can bypass it.
 *   • PAYMENT (actionDispatcher.applyActivateAbility): removes EXACTLY count counters at activation
 *     time (CR 601.2h via 602.2b — costs are paid before the ability goes on the stack), through the
 *     SAME per-permanent counter pile the layer system reads — a +1/+1 payment drops derived P/T
 *     IMMEDIATELY, and a payment that drops toughness to 0 kills the source by SBA (CR 704.5f) while
 *     the ability still resolves from the stack.
 *   • AI (opponentAI.pickSafeAbilityActivation): the existing conservative guard EXCLUDES every
 *     removeCounter action from the AI's safe-activation whitelist (a shrink-yourself / spend-finite-
 *     counters cost has no general value model), so the AI never suicides a creature pointlessly.
 *     Plural inherits the guard structurally (the same `a.removeCounter` field). Documented choice:
 *     conservative gating, matching the sacSelf/payLife precedent.
 *
 * CREED (CLAUDE.md §1.2/§8): whole-card or PARK; whole-item anchors fail closed. Still UNMODELED →
 * Arbiter: an X-count ("Remove X storage counters" — Dreadship Reef), "any number" / "all", an UNTYPED
 * "Remove a counter" (a which-kind choice — Loch Mare), a from-among / other-permanent form (Ooze Flux,
 * Power Conduit), a COMPOUND item ("…from Trenzalore Clocktower and exile it"), and a number/noun
 * AGREEMENT mismatch (no printed oracle shape → never guess a count). Oracle fixtures below are the
 * REAL bundled text (verified via cardIndex.lookupCard, 2026-07-17).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, creatureToughness } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBf(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
function withLib(state, playerId, cards) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], library: cards } } };
}
const activateActions = (state, playerId = "user") =>
  legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");

// ────────────────────────────────────────────────────────────────────────────
// 1. parseAbilityCost — the plural remove-N shape (γ1c/CC-2)
// ────────────────────────────────────────────────────────────────────────────
describe("COUNTER-COST — plural cost parsing (CC-2)", () => {
  it("'Remove three spore counters from this creature' → removeCounter(spore, 3)", () => {
    expect(parseAbilityCost("Remove three spore counters from this creature"))
      .toMatchObject({ removeCounter: { type: "spore", count: 3 } });
  });
  it("'{T}, Remove three charge counters from this artifact' → {T} + removeCounter(charge, 3) (Lux Cannon)", () => {
    expect(parseAbilityCost("{T}, Remove three charge counters from this artifact"))
      .toMatchObject({ tapSelf: true, removeCounter: { type: "charge", count: 3 } });
  });
  it("'Remove two +1/+1 counters from this creature' keeps the +1/+1 key verbatim, count 2", () => {
    expect(parseAbilityCost("Remove two +1/+1 counters from this creature"))
      .toMatchObject({ removeCounter: { type: "+1/+1", count: 2 } });
  });
  it("a DIGIT count parses ('Remove 100 charge counters…', Vexing Puzzlebox)", () => {
    expect(parseAbilityCost("{T}, Remove 100 charge counters from this artifact"))
      .toMatchObject({ tapSelf: true, removeCounter: { type: "charge", count: 100 } });
  });
  it("the singular form still parses with count 1, incl. the Vehicle noun (Reckoner Bankbuster)", () => {
    expect(parseAbilityCost("Remove a charge counter from this artifact"))
      .toMatchObject({ removeCounter: { type: "charge", count: 1 } });
    expect(parseAbilityCost("{2}, {T}, Remove a charge counter from this Vehicle"))
      .toMatchObject({ tapSelf: true, removeCounter: { type: "charge", count: 1 } });
  });

  // CREED — the fail-closed park set (null = the whole cost stays unmodeled → Arbiter)
  it("an X-count stays unmodeled ('{1}, Remove X storage counters from this land' — Dreadship Reef)", () => {
    expect(parseAbilityCost("{1}, Remove X storage counters from this land")).toBeNull();
  });
  it("'any number' / 'all' stay unmodeled (Fountain of Cho / Jar of Eyeballs)", () => {
    expect(parseAbilityCost("Remove any number of storage counters from this land")).toBeNull();
    expect(parseAbilityCost("{T}, Remove all eyeball counters from this artifact")).toBeNull();
  });
  it("an UNTYPED remove stays unmodeled — which kind to remove is a real choice (Loch Mare)", () => {
    expect(parseAbilityCost("{1}{U}, Remove a counter from this creature")).toBeNull();
    expect(parseAbilityCost("{2}{U}, Remove two counters from this creature")).toBeNull();
  });
  it("a from-among / other-permanent form stays unmodeled (Ooze Flux / Power Conduit)", () => {
    expect(parseAbilityCost("Remove one or more +1/+1 counters from among creatures you control")).toBeNull();
    expect(parseAbilityCost("{T}, Remove a counter from a permanent you control")).toBeNull();
  });
  it("a COMPOUND item never prefix-matches ('Remove twelve time counters from Trenzalore Clocktower and exile it')", () => {
    expect(parseAbilityCost("{1}{U}, {T}, Remove twelve time counters from Trenzalore Clocktower and exile it")).toBeNull();
  });
  it("number/noun AGREEMENT is enforced fail-closed (no printed oracle shape → never guess)", () => {
    expect(parseAbilityCost("Remove three charge counter from this artifact")).toBeNull();  // plural count, singular noun
    expect(parseAbilityCost("Remove a charge counters from this artifact")).toBeNull();     // singular article, plural noun
    expect(parseAbilityCost("Remove 0 charge counters from this artifact")).toBeNull();     // zero-count digit
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. classification — real-oracle flips + CREED pins (bundled Scryfall text)
// ────────────────────────────────────────────────────────────────────────────
describe("COUNTER-COST — classification flips (real bundled oracle)", () => {
  it("Thallid → native-mixed (upkeep spore trigger + remove-3-spores Saproling maker)", () => {
    expect(classifyCard({
      name: "Thallid", type: "Creature — Fungus", mana: "{G}", power: 1, toughness: 1,
      oracle: "At the beginning of your upkeep, put a spore counter on this creature.\nRemove three spore counters from this creature: Create a 1/1 green Saproling creature token.",
    })).toBe("native-mixed");
  });
  it("Lux Cannon → native-activated (charge {T} + remove-3-charges destroy target permanent)", () => {
    expect(classifyCard({
      name: "Lux Cannon", type: "Artifact", mana: "{4}",
      oracle: "{T}: Put a charge counter on this artifact.\n{T}, Remove three charge counters from this artifact: Destroy target permanent.",
    })).toBe("native-activated");
  });
  it("Golem Foundry → native-mixed (artifact-cast charge trigger + remove-3-charges Golem maker)", () => {
    expect(classifyCard({
      name: "Golem Foundry", type: "Artifact", mana: "{3}",
      oracle: "Whenever you cast an artifact spell, you may put a charge counter on this artifact.\nRemove three charge counters from this artifact: Create a 3/3 colorless Golem artifact creature token.",
    })).toBe("native-mixed");
  });
  it("Mindless Automaton → native-activated (enters-with-2 + discard-loot + remove-2 draw)", () => {
    expect(classifyCard({
      name: "Mindless Automaton", type: "Artifact Creature — Construct", mana: "{4}", power: 0, toughness: 0,
      oracle: "This creature enters with two +1/+1 counters on it.\n{1}, Discard a card: Put a +1/+1 counter on this creature.\nRemove two +1/+1 counters from this creature: Draw a card.",
    })).toBe("native-activated");
  });
});

describe("COUNTER-COST — CREED: unmodeled carriers STAY parked (no over-claim)", () => {
  it("Vexing Puzzlebox (dice-roll body; the 100-count cost parses but the card parks whole) stays body-only", () => {
    expect(classifyCard({
      name: "Vexing Puzzlebox", type: "Artifact", mana: "{3}",
      oracle: "Whenever you roll one or more dice, put a number of charge counters on this artifact equal to the result.\n{T}: Add one mana of any color. Roll a d20.\n{T}, Remove 100 charge counters from this artifact: Search your library for an artifact card, put that card onto the battlefield, then shuffle.",
    })).toBe("body-only");
  });
  it("Loch Mare (UNTYPED remove — a which-kind choice) stays body-only", () => {
    expect(classifyCard({
      name: "Loch Mare", type: "Creature — Horse Serpent", mana: "{1}{U}", power: 4, toughness: 4,
      oracle: "This creature enters with three -1/-1 counters on it.\n{1}{U}, Remove a counter from this creature: Draw a card.\n{2}{U}, Remove two counters from this creature: Tap target creature. Put a stun counter on it.",
    })).toBe("body-only");
  });
  it("a plural remove-counter source with an LTB trigger stays unmodeled (the γ1 leave-trigger fail-safe)", () => {
    const abilities = parseActivatedAbilities({
      name: "T", type: "Creature — Spirit",
      oracle: "When this creature leaves the battlefield, each opponent loses 3 life.\nRemove two +1/+1 counters from this creature: Draw a card.",
    });
    expect(abilities.find((a) => a.removeCounter)?.modeled ?? false).toBe(false);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. RUNTIME — blocked at N-1, legal at N, pays EXACTLY N, layers read it immediately
// ────────────────────────────────────────────────────────────────────────────
describe("COUNTER-COST — runtime (legalChoices → dispatch → resolve)", () => {
  // Mindless Automaton's remove-2 draw, in isolation (real oracle line; base P/T 0/0).
  const AUTOMATON = {
    id: "c-au", name: "Mindless Automaton", type: "Artifact Creature — Construct", power: 0, toughness: 0,
    oracle: "Remove two +1/+1 counters from this creature: Draw a card.",
  };
  const THALLID = {
    id: "c-th", name: "Thallid", type: "Creature — Fungus", power: 1, toughness: 1,
    oracle: "Remove three spore counters from this creature: Create a 1/1 green Saproling creature token.",
  };
  const automatonWith = (n) => ({
    ...createPermanent({ id: "au", card: AUTOMATON, controller: "user", summoningSick: false }),
    counters: { "+1/+1": n },
  });

  it("CREED — at N-1 counters (1 of 2) the activation is NOT offered (CR 118.3, a cost we can't pay)", () => {
    const s = withBf(mainState(), "user", [automatonWith(1)]);
    expect(activateActions(s).filter((a) => a.removeCounter)).toHaveLength(0);
  });

  it("at exactly N (2) it IS offered; payment removes exactly 2 and the SOURCE DIES by SBA (0/0) while the draw still resolves", () => {
    let s = withBf(mainState(), "user", [automatonWith(2)]);
    s = withLib(s, "user", [{ id: "L0", name: "Card" }]);
    const act = activateActions(s).find((a) => a.removeCounter);
    expect(act).toMatchObject({ removeCounter: { type: "+1/+1", count: 2 } });
    const after = dispatchAction(s, act);
    // Paying the last two +1/+1 counters drops the 0/0 body to toughness 0 → graveyard (CR 704.5f);
    // the ability is already on the stack and resolves independently of its source (CR 113.7a).
    expect(after.players.user.battlefield.find((p) => p.id === "au")).toBeUndefined();
    expect(after.players.user.graveyard.map((c) => c.name)).toContain("Mindless Automaton");
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.hand.map((c) => c.id)).toContain("L0"); // the draw still happened
  });

  it("with 4 counters, payment removes EXACTLY 2 and derived P/T drops 4/4 → 2/2 IMMEDIATELY (the layer pile)", () => {
    let s = withBf(mainState(), "user", [automatonWith(4)]);
    s = withLib(s, "user", [{ id: "L0", name: "Card" }]);
    const before = s.players.user.battlefield.find((p) => p.id === "au");
    expect([creaturePower(before, s), creatureToughness(before, s)]).toEqual([4, 4]);
    const act = activateActions(s).find((a) => a.removeCounter);
    const after = dispatchAction(s, act);
    const perm = after.players.user.battlefield.find((p) => p.id === "au");
    expect(perm.counters["+1/+1"]).toBe(2);                                   // exactly N removed, not all
    expect([creaturePower(perm, after), creatureToughness(perm, after)]).toEqual([2, 2]); // layers read it NOW
    expect(resolveTopOfStack(after).players.user.hand.map((c) => c.id)).toContain("L0");
  });

  it("Thallid pays 3 spores exactly and resolves into a Saproling token (the source survives)", () => {
    const thallid = {
      ...createPermanent({ id: "th", card: THALLID, controller: "user", summoningSick: false }),
      counters: { spore: 4 },
    };
    const s = withBf(mainState(), "user", [thallid]);
    const act = activateActions(s).find((a) => a.removeCounter);
    expect(act).toMatchObject({ removeCounter: { type: "spore", count: 3 } });
    const after = dispatchAction(s, act);
    expect(after.players.user.battlefield.find((p) => p.id === "th").counters.spore).toBe(1); // 4 → 1
    const resolved = resolveTopOfStack(after);
    expect(resolved.players.user.battlefield.some((p) => /Saproling/.test(p.card?.name || ""))).toBe(true);
    expect(resolved.players.user.battlefield.find((p) => p.id === "th")).toBeTruthy();
  });

  it("CREED — Thallid at 2 spores (N-1) is not offered; the singular seam still pays exactly 1", () => {
    const thallid = {
      ...createPermanent({ id: "th", card: THALLID, controller: "user", summoningSick: false }),
      counters: { spore: 2 },
    };
    expect(activateActions(withBf(mainState(), "user", [thallid])).filter((a) => a.removeCounter)).toHaveLength(0);
    // Singular regression pin (the pre-CC-2 shape rides the same field with count 1):
    const single = {
      ...createPermanent({
        id: "sg", controller: "user", summoningSick: false,
        card: { id: "c-sg", name: "Engine", type: "Creature — Construct", power: 2, toughness: 2, oracle: "Remove a +1/+1 counter from this creature: You gain 2 life." },
      }),
      counters: { "+1/+1": 3 },
    };
    let s = withBf(mainState(), "user", [single]);
    const act = activateActions(s).find((a) => a.removeCounter);
    expect(act).toMatchObject({ removeCounter: { type: "+1/+1", count: 1 } });
    expect(dispatchAction(s, act).players.user.battlefield.find((p) => p.id === "sg").counters["+1/+1"]).toBe(2);
  });
});
