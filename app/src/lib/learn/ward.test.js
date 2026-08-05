/**
 * ward.test.js — KW-WARD enforcement (CR 702.21). The ward-cost parser + the spell/ability-targeting tax
 * detector. The pay-or-be-countered RESOLUTION is the soft-counter machinery (softCounter.test.js); the
 * dispatcher integration (a cast OR an ability targeting a ward permanent raises that soft-counter) is
 * pinned in the wiring blocks below.
 *
 * PR2 (this slice) additions: colored/hybrid mana ward, life ward ("Ward—Pay N life"), and an opponent's
 * ABILITY (not only a spell) targeting a ward permanent raising the tax.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { parseWardCost, wardTaxForSpell, wardTaxForStackObject } from "./ward.js";
import { dispatchAction } from "./actionDispatcher.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { resolveSoftCounterChoice } from "./effects/runProgram.js";

const manaCost = (overrides = {}) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...overrides });

describe("parseWardCost", () => {
  it("parses an all-generic mana ward to a structured mana cost", () => {
    expect(parseWardCost({ oracle: "Ward {2}" })).toEqual({ kind: "mana", mana: manaCost({ generic: 2 }) });
    expect(parseWardCost({ oracle: "Flying\nWard {1}" })).toEqual({ kind: "mana", mana: manaCost({ generic: 1 }) });
    expect(parseWardCost({ oracle: "Ward {4} (Whenever this creature becomes the target...)" })).toEqual({ kind: "mana", mana: manaCost({ generic: 4 }) });
  });

  it("PR2: parses a COLORED / HYBRID mana ward to its full mana cost (no generic approximation)", () => {
    expect(parseWardCost({ oracle: "Ward {1}{U}" })).toEqual({ kind: "mana", mana: manaCost({ generic: 1, U: 1 }) });
    expect(parseWardCost({ oracle: "Ward {U}" })).toEqual({ kind: "mana", mana: manaCost({ U: 1 }) });
    expect(parseWardCost({ oracle: "Ward {W/U}" })).toEqual({ kind: "mana", mana: manaCost({ hybrid: [["W", "U"]] }) });
  });

  it("PR2: parses a LIFE ward ('Ward—Pay N life'), em-dash or hyphen", () => {
    expect(parseWardCost({ oracle: "Ward—Pay 3 life" })).toEqual({ kind: "life", life: 3 });
    expect(parseWardCost({ oracle: "Menace\nWard—Pay 3 life. (Whenever this creature becomes the target...)" })).toEqual({ kind: "life", life: 3 });
    expect(parseWardCost({ oracle: "Ward — Pay 5 life" })).toEqual({ kind: "life", life: 5 });
  });

  it("returns null for {X} ward (attacker-chosen value, unmodeled)", () => {
    expect(parseWardCost({ oracle: "Ward {X}" })).toBeNull();
  });

  it("⭐ DISCARD ward is PAYABLE now; SACRIFICE ward still refuses (guard job intact)", () => {
    // ⭐ UPDATED 2026-08-05. The old note read "needs a payer choice — safe FN", and that reasoning was
    // sound until the unlock: unlike mana, a discard with a non-empty hand ALWAYS succeeds, so the SPELL'S
    // fate is settled at the "pay?" answer and the card pick is a follow-up that cannot change it.
    // See wardDiscard.test.js for the stack drive.
    expect(parseWardCost({ oracle: "Ward—Discard a card." })).toEqual({ kind: "discard", n: 1 });
    expect(parseWardCost({ oracle: "Ward—Discard two cards." })).toEqual({ kind: "discard", n: 2 });
    // ⛔ THE GUARD'S JOB, UNCHANGED: sacrifice has no equivalent "always succeeds" shortcut — WHICH
    // permanent you sacrifice can matter enormously — so it stays a safe FN.
    expect(parseWardCost({ oracle: "Ward—Sacrifice a creature." })).toBeNull();
  });

  it("returns null when there is no ward", () => {
    expect(parseWardCost({ oracle: "Flying, vigilance" })).toBeNull();
    expect(parseWardCost({})).toBeNull();
  });

  it("does NOT swallow a following line's mana into the ward cost (Wilson / Pippin regression)", () => {
    // "Ward {2}" then a NEXT-line activated ability "{1}{R}{G}, Exile…" must NOT read as Ward {2}{1}{R}{G}.
    expect(parseWardCost({ oracle: "Double strike, reach, trample\nWard {2}\n{1}{R}{G}, Exile this: Do a thing." })).toEqual({ kind: "mana", mana: manaCost({ generic: 2 }) });
    expect(parseWardCost({ oracle: "Vigilance, ward {1}\n{T}: Another target creature gains protection." })).toEqual({ kind: "mana", mana: manaCost({ generic: 1 }) });
  });
});

describe("wardTaxForSpell / wardTaxForStackObject", () => {
  const wardCreature = (name, controller, oracle = "Ward {2}") =>
    createPermanent({ card: { id: `${name}-card`, name, power: 2, toughness: 2, type_line: "Creature", oracle }, controller });
  const stateWith = (...perms) => {
    const players = { user: { battlefield: [] }, ai: { battlefield: [] } };
    for (const p of perms) players[p.controller].battlefield.push(p);
    return { players };
  };
  const spell = (controller, ...targetIds) => ({ controller, targets: targetIds.map((id) => ({ type: "creature", id })) });

  it("taxes a spell that targets a single OPPONENT ward permanent (structured mana cost)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {2}");
    expect(wardTaxForSpell(stateWith(w), spell("user", w.id))).toEqual({ cost: { kind: "mana", mana: manaCost({ generic: 2 }) }, wardName: "Sphinx" });
  });

  it("PR2: taxes with a LIFE cost when the ward is 'Ward—Pay N life'", () => {
    const w = wardCreature("Witch", "ai", "Menace\nWard—Pay 3 life.");
    expect(wardTaxForSpell(stateWith(w), spell("user", w.id))).toEqual({ cost: { kind: "life", life: 3 }, wardName: "Witch" });
  });

  it("PR2: taxes with the full colored cost for a colored ward", () => {
    const w = wardCreature("Merc", "ai", "Ward {1}{U}");
    expect(wardTaxForSpell(stateWith(w), spell("user", w.id))).toEqual({ cost: { kind: "mana", mana: manaCost({ generic: 1, U: 1 }) }, wardName: "Merc" });
  });

  it("does NOT tax the ward controller's OWN spell (ward fires only on an opponent's targeting, CR 702.21a)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {2}");
    expect(wardTaxForSpell(stateWith(w), spell("ai", w.id))).toBeNull();
  });

  it("does NOT tax when the targeted permanent has no ward", () => {
    const v = wardCreature("Bear", "ai", ""); // vanilla
    expect(wardTaxForSpell(stateWith(v), spell("user", v.id))).toBeNull();
  });

  it("leaves a spell targeting 2+ ward permanents unenforced (each ward is its own trigger — CR 702.21c)", () => {
    const w1 = wardCreature("S1", "ai", "Ward {2}");
    const w2 = wardCreature("S2", "ai", "Ward {1}");
    expect(wardTaxForSpell(stateWith(w1, w2), spell("user", w1.id, w2.id))).toBeNull();
  });

  it("⭐ a DISCARD ward now TAXES; {X} and sacrifice stay unenforced (safe false-negative)", () => {
    expect(wardTaxForSpell(stateWith(wardCreature("Minthara", "ai", "Ward {X}")), spell("user", "Minthara-card-perm"))).toBeNull();
    // ⭐ The discard ward was SILENTLY IGNORED before — an opponent targeted these creatures for free.
    const d = wardCreature("Pitcher", "ai", "Ward—Discard a card.");
    expect(wardTaxForSpell(stateWith(d), spell("user", d.id))).toEqual({ cost: { kind: "discard", n: 1 }, wardName: "Pitcher" });
    // ⛔ Guard re-armed on the form that genuinely still parks.
    const sac = wardCreature("Butcher", "ai", "Ward—Sacrifice a creature.");
    expect(wardTaxForSpell(stateWith(sac), spell("user", sac.id))).toBeNull();
  });

  it("a single ward target alongside a non-ward target still taxes (one ward = enforced)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {3}");
    const v = wardCreature("Bear", "ai", "");
    expect(wardTaxForSpell(stateWith(w, v), spell("user", w.id, v.id))).toEqual({ cost: { kind: "mana", mana: manaCost({ generic: 3 }) }, wardName: "Sphinx" });
  });

  it("wardTaxForStackObject is identical to wardTaxForSpell on a stack object (an ability IS a stack object)", () => {
    const w = wardCreature("Sphinx", "ai", "Ward {2}");
    const ability = { controller: "user", targets: [{ type: "creature", id: w.id }] };
    expect(wardTaxForStackObject(stateWith(w), ability)).toEqual(wardTaxForSpell(stateWith(w), ability));
  });
});

describe("KW-WARD wiring — a cast targeting a ward permanent raises the soft-counter (CR 702.21)", () => {
  beforeEach(() => _resetIdsForTests());
  it("an opponent's removal targeting a ward creature sets a soft-counter pendingChoice carrying the cost", () => {
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
    expect(out.stack.some((o) => o.source?.name === "Doom Blade")).toBe(true);
    expect(out.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "user", spellName: "Doom Blade", sourceName: "Sphinx" });
    expect(out.pendingChoice.cost).toEqual({ kind: "mana", mana: manaCost({ generic: 2 }) });
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

  // End-to-end through the soft-counter settle (resolveSoftCounterChoice): pay → the spell survives and
  // resolves; decline / can't pay → countered. The ward creature is the target.
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
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === ward.id));
    return { state: dispatchAction(s, cast), wardId: ward.id };
  };

  it("paying the ward lets the spell resolve (the ward creature is destroyed)", () => {
    const { state } = wardRemovalState("{2}", { B: 1, C: 2 }); // {B} for Doom Blade + {2} for the ward
    expect(state.pendingChoice).toMatchObject({ kind: "soft-counter" });
    expect(state.pendingChoice.cost).toEqual({ kind: "mana", mana: manaCost({ generic: 2 }) });
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

  it("PR2: a LIFE ward is paid out of life (the spell resolves, payer loses the life)", () => {
    _resetIdsForTests();
    const ward = createPermanent({ card: { id: "witch-c", name: "Witch", power: 3, toughness: 2, type_line: "Creature", oracle: "Ward—Pay 3 life." }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [removal], life: 20, manaPool: { ...s.players.user.manaPool, B: 1 } },
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === ward.id));
    const out = dispatchAction(s, cast);
    expect(out.pendingChoice.cost).toEqual({ kind: "life", life: 3 });
    const paid = resolveSoftCounterChoice(out, true); // pay 3 life
    expect(paid.players.user.life).toBe(17);
    const resolved = resolveTopOfStack(paid);
    expect(resolved.players.ai.battlefield).toHaveLength(0); // Witch destroyed
  });

  it("PR2: an opponent's ACTIVATED ABILITY targeting a ward creature raises the same ward tax (CR 702.21a)", () => {
    _resetIdsForTests();
    const pinger = createPermanent({ id: "perm-p", card: { id: "pinger-c", name: "Prodigal Sorcerer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{T}: This creature deals 1 damage to target creature." }, controller: "user", summoningSick: false });
    const ward = createPermanent({ id: "perm-w", card: { id: "sphinx-c", name: "Sphinx", power: 4, toughness: 4, type_line: "Creature", oracle: "Ward {2}" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [pinger], manaPool: { ...s.players.user.manaPool, C: 2 } },
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-p" && (a.targets || []).some((t) => t.id === "perm-w"));
    expect(act).toBeTruthy();
    const out = dispatchAction(s, act);
    // The ability is on the stack AND the ward raised the pay-or-be-countered choice against the activator.
    expect(out.stack.some((o) => o.kind === "activated-ability")).toBe(true);
    expect(out.pendingChoice).toMatchObject({ kind: "soft-counter", controller: "user", sourceName: "Sphinx" });
    expect(out.pendingChoice.cost).toEqual({ kind: "mana", mana: manaCost({ generic: 2 }) });
  });

  it("PR2: declining the ward on an ABILITY removes the ability from the stack with NO graveyard move (it's not a card)", () => {
    _resetIdsForTests();
    const pinger = createPermanent({ id: "perm-p", card: { id: "pinger-c", name: "Prodigal Sorcerer", type: "Creature — Wizard", power: 1, toughness: 1, oracle: "{T}: This creature deals 1 damage to target creature." }, controller: "user", summoningSick: false });
    const ward = createPermanent({ id: "perm-w", card: { id: "sphinx-c", name: "Sphinx", power: 4, toughness: 4, type_line: "Creature", oracle: "Ward {2}" }, controller: "ai" });
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: [pinger], graveyard: [], manaPool: { ...s.players.user.manaPool, C: 0 } }, // can't pay the {2} ward
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const act = legalActionsForPlayer(s, "user").find((a) => a.kind === "activate-ability" && a.permanentId === "perm-p" && (a.targets || []).some((t) => t.id === "perm-w"));
    const out = dispatchAction(s, act);
    const declined = resolveSoftCounterChoice(out, false); // can't / won't pay → ability countered
    expect(declined.stack.some((o) => o.kind === "activated-ability")).toBe(false); // off the stack
    expect(declined.players.user.graveyard).toHaveLength(0); // an ability is not a card — nothing to the graveyard
    expect(declined.players.ai.battlefield).toHaveLength(1); // Sphinx took no damage (the ability never resolved)
  });

  it("PR2: a LIFE ward the payer can't afford (life < N) counters the spell — life unchanged", () => {
    _resetIdsForTests();
    const ward = createPermanent({ card: { id: "witch-c", name: "Witch", power: 3, toughness: 2, type_line: "Creature", oracle: "Ward—Pay 5 life." }, controller: "ai" });
    const removal = { id: "removal", name: "Doom Blade", type: "Instant", oracle: "Destroy target creature.", mana: "{B}" };
    let s = createGameState({ userDeck: [], aiDeck: [] });
    s = {
      ...s,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...s.players,
        user: { ...s.players.user, hand: [removal], life: 4, manaPool: { ...s.players.user.manaPool, B: 1 } }, // only 4 life, ward is 5
        ai: { ...s.players.ai, battlefield: [ward] },
      },
    };
    const cast = legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === "removal" && (a.targets || []).some((t) => t.id === ward.id));
    const out = dispatchAction(s, cast);
    const settled = resolveSoftCounterChoice(out, true); // tries to pay but can't afford 5 life
    expect(settled.players.user.life).toBe(4); // CR 119.4 — never paid life it doesn't have
    expect(settled.players.ai.battlefield.map((p) => p.card.name)).toEqual(["Witch"]); // Witch survives (countered)
    expect(settled.players.user.graveyard.map((c) => c.name)).toContain("Doom Blade");
  });
});
