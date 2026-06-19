/**
 * ward.test.js — KW-WARD enforcement (CR 702.21). The ward-cost parser + the spell-targeting tax
 * detector. The pay-or-be-countered RESOLUTION is the existing soft-counter machinery (softCounter.test.js);
 * the dispatcher integration (a cast targeting a ward permanent raises that soft-counter) is pinned in
 * wardWiring below.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseWardCost, wardTaxForSpell } from "./ward.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveSoftCounterChoice } from "./effects/runProgram.js";

describe("parseWardCost", () => {
  it("parses an all-generic mana ward to its generic amount", () => {
    expect(parseWardCost({ oracle: "Ward {2}" })).toEqual({ generic: 2 });
    expect(parseWardCost({ oracle: "Flying\nWard {1}" })).toEqual({ generic: 1 });
    expect(parseWardCost({ oracle: "Ward {4} (Whenever this creature becomes the target...)" })).toEqual({ generic: 4 });
  });

  it("returns null for a colored / hybrid ward — the soft-counter amount is generic-only (PR2)", () => {
    expect(parseWardCost({ oracle: "Ward {1}{U}" })).toBeNull();
    expect(parseWardCost({ oracle: "Ward {U}" })).toBeNull();
  });

  it("returns null for a non-mana ward (—Pay life / discard / sacrifice)", () => {
    expect(parseWardCost({ oracle: "Ward—Pay 3 life" })).toBeNull();
    expect(parseWardCost({ oracle: "Ward—Discard a card." })).toBeNull();
    expect(parseWardCost({ oracle: "Ward—Sacrifice a creature." })).toBeNull();
  });

  it("returns null when there is no ward", () => {
    expect(parseWardCost({ oracle: "Flying, vigilance" })).toBeNull();
    expect(parseWardCost({})).toBeNull();
  });

  it("does NOT swallow a following line's mana into the ward cost (Wilson / Pippin regression)", () => {
    // "Ward {2}" then a NEXT-line activated ability "{1}{R}{G}, Exile…" must NOT read as Ward {2}{1}{R}{G}.
    expect(parseWardCost({ oracle: "Double strike, reach, trample\nWard {2}\n{1}{R}{G}, Exile this: Do a thing." })).toEqual({ generic: 2 });
    expect(parseWardCost({ oracle: "Vigilance, ward {1}\n{T}: Another target creature gains protection." })).toEqual({ generic: 1 });
  });
});

describe("wardTaxForSpell", () => {
  const wardCreature = (name, controller, oracle = "Ward {2}") =>
    createPermanent({ card: { id: `${name}-card`, name, power: 2, toughness: 2, type_line: "Creature", oracle }, controller });
  const stateWith = (...perms) => {
    const players = { user: { battlefield: [] }, ai: { battlefield: [] } };
    for (const p of perms) players[p.controller].battlefield.push(p);
    return { players };
  };
  const spell = (controller, ...targetIds) => ({ controller, targets: targetIds.map((id) => ({ type: "creature", id })) });

  it("taxes a spell that targets a single OPPONENT ward permanent", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {2}");
    expect(wardTaxForSpell(stateWith(w), spell("user", w.id))).toEqual({ amount: 2, wardName: "Sphinx" });
  });

  it("does NOT tax the ward controller's OWN spell (ward fires only on an opponent's targeting, CR 702.21a)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {2}");
    expect(wardTaxForSpell(stateWith(w), spell("ai", w.id))).toBeNull();
  });

  it("does NOT tax when the targeted permanent has no ward", () => {
    const v = wardCreature("Bear", "ai", ""); // vanilla
    expect(wardTaxForSpell(stateWith(v), spell("user", v.id))).toBeNull();
  });

  it("leaves a spell targeting 2+ ward permanents unenforced (each ward is its own trigger — PR2)", () => {
    const w1 = wardCreature("S1", "ai", "Ward {2}");
    const w2 = wardCreature("S2", "ai", "Ward {1}");
    expect(wardTaxForSpell(stateWith(w1, w2), spell("user", w1.id, w2.id))).toBeNull();
  });

  it("leaves a colored-cost ward unenforced (safe false-negative)", () => {
    const w = wardCreature("Merc", "ai", "Ward {1}{U}");
    expect(wardTaxForSpell(stateWith(w), spell("user", w.id))).toBeNull();
  });

  it("a single ward target alongside a non-ward target still taxes (one ward = enforced)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {3}");
    const v = wardCreature("Bear", "ai", "");
    expect(wardTaxForSpell(stateWith(w, v), spell("user", w.id, v.id))).toEqual({ amount: 3, wardName: "Sphinx" });
  });
});

describe("KW-WARD wiring — a cast targeting a ward permanent raises the soft-counter (CR 702.21)", () => {
  beforeEach(() => _resetIdsForTests());
  it("an opponent's removal targeting a ward creature sets a soft-counter pendingChoice for the caster", () => {
    const ward = createPermanent({ card: { id: "sphinx-c", name: "Sphinx", power: 4, toughness: 4, type_line: "Creature", oracle: "Ward {2}" }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [removal], manaPool: { ...s.players.user.manaPool, B: 1 } },
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find(
      (a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === ward.id),
    );
    expect(cast).toBeTruthy();
    const out = dispatchAction(s, cast);
    // The spell is on the stack AND the ward has raised the pay-or-be-countered choice against the caster.
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(true);
    expect(out.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "user", amount: 2, spellName: "Doom Blade", sourceName: "Sphinx" });
  });

  it("the ward controller targeting its OWN ward creature raises NO ward tax", () => {
    const ward = createPermanent({ card: { id: "sphinx-c", name: "Sphinx", power: 4, toughness: 4, type_line: "Creature", oracle: "Ward {2}" }, controller: "user" });
    const buff = { id: "buff", name: "Giant Growth", type: "Instant", oracle: "Target creature gets +3/+3 until end of turn.", mana: "{G}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [buff], battlefield: [ward], manaPool: { ...s.players.user.manaPool, G: 1 } },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find(
      (a) => a.kind === "cast-spell" && a.cardId === "buff" && (a.targets || []).some((t) => t.id === ward.id),
    );
    expect(cast).toBeTruthy();
    const out = dispatchAction(s, cast);
    expect(out.pendingChoice == null || out.pendingChoice.kind !== "soft-counter").toBe(true); // own spell → no ward
  });

  // End-to-end through the existing soft-counter settle (resolveSoftCounterChoice): pay → the spell
  // survives and resolves; decline / can't pay → the spell is countered. The ward creature is the target.
  const wardRemovalState = (wardCost, userPool) => {
    _resetIdsForTests();
    const ward = createPermanent({ card: { id: "sphinx-c", name: "Sphinx", power: 4, toughness: 4, type_line: "Creature", oracle: `Ward ${wardCost}` }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [removal], manaPool: { ...s.players.user.manaPool, ...userPool } },
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === "sphinx-c-perm" || t.id === ward.id));
    return { state: dispatchAction(s, cast), wardId: ward.id };
  };

  it("paying the ward lets the spell resolve (the ward creature is destroyed)", () => {
    const { state } = wardRemovalState("{2}", { B: 1, C: 2 }); // {B} for Doom Blade + {2} for the ward
    expect(state.pendingChoice).toMatchObject({ kind: "soft-counter", amount: 2 });
    const paid = resolveSoftCounterChoice(state, true);   // user pays the ward
    expect(paid.pendingChoice).toBeFalsy();
    const resolved = resolveTopOfStack(paid);             // Doom Blade now resolves
    expect(resolved.players.ai.battlefield).toHaveLength(0);           // Sphinx destroyed
    expect(resolved.players.ai.graveyard.map((c) => c.name)).toContain("Sphinx");
  });

  it("declining the ward counters the spell (the ward creature survives)", () => {
    const { state } = wardRemovalState("{2}", { B: 1, C: 2 });
    const declined = resolveSoftCounterChoice(state, false); // user declines to pay
    expect(declined.players.ai.battlefield.map((p) => p.card.name)).toEqual(["Sphinx"]); // Sphinx survives
    expect(declined.players.user.graveyard.map((c) => c.name)).toContain("Doom Blade");   // removal countered → graveyard
    expect(declined.stack.some((o) => o.source?.name === "Doom Blade")).toBe(false);
  });
});
