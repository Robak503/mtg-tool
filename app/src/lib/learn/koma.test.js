/**
 * KOMA, COSMOS SERPENT — full-card native coverage.
 *
 * Real bundled oracle (oracle_id 6ba0656f — the functional-erratum printing):
 *   This spell can't be countered.
 *   At the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.
 *   Sacrifice another Serpent: Choose one —
 *   • Tap target permanent. Its activated abilities can't be activated this turn.
 *   • Koma gains indestructible until end of turn.
 *
 * Four subsystems, each verified at RUNTIME (the metric must agree with the engine — CREED):
 *   1. can't-be-countered (static marker; enumerateTargets never offers the spell as a counter target)
 *   2. each-upkeep token (EVERY player's upkeep → a real 3/3 Serpent named "Koma's Coil" for the active seat)
 *   3. subtype sac cost ("Sacrifice another Serpent" — needs ANOTHER Serpent; never the source, never a non-Serpent)
 *   4. modal activated ability:
 *      (i)  Tap target permanent + lock its activated abilities this turn (legalChoices suppresses them; auto-expires)
 *      (ii) Koma gains indestructible until end of turn
 *
 * Plus a CREED anti-FP pin (a near-miss subtype-sac variant the engine must NOT mis-model).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack, runStepActions } from "./gameEngine.js";
import { enumerateTargets } from "./spellEffects.js";
import { permanentHasKeyword, expireContinuousEffects } from "./layers.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseActivatedAbilities, parseAbilityCost } from "./effects/abilities.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// The exact bundled oracle text.
const KOMA_ORACLE =
  "This spell can't be countered.\n" +
  "At the beginning of each upkeep, create a 3/3 blue Serpent creature token named Koma's Coil.\n" +
  "Sacrifice another Serpent: Choose one —\n" +
  "• Tap target permanent. Its activated abilities can't be activated this turn.\n" +
  "• Koma gains indestructible until end of turn.";
const KOMA_CARD = { id: "c-koma", name: "Koma, Cosmos Serpent", type: "Legendary Creature — Serpent", mana: "{3}{G}{G}{U}{U}", power: 6, toughness: 6, oracle: KOMA_ORACLE };

function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
function activateActions(state, playerId = "user") {
  return legalActionsForPlayer(state, playerId).filter((a) => a.kind === "activate-ability");
}
const isSerpentToken = (p) => p.card?.token && /\bSerpent\b/.test(String(p.card?.type || ""));

// ─── 1. Classification: the whole card is NATIVE ──────────────────────────────────────────────
describe("KOMA — classification", () => {
  it("classifies native (native-mixed) with the real bundled oracle", () => {
    const tier = classifyCard({ type: KOMA_CARD.type, oracle: KOMA_ORACLE, mana: KOMA_CARD.mana, name: KOMA_CARD.name });
    expect(tier).toBe("native-mixed");
    expect(isNativeTier(tier)).toBe(true);
  });

  it("the modal activated ability parses modeled with the subtype sac cost + 2 modes", () => {
    const [ab, ...rest] = parseActivatedAbilities(KOMA_CARD);
    expect(rest).toHaveLength(0); // exactly one activated ability (the trigger + static aren't activated)
    expect(ab).toMatchObject({ modeled: true });
    // A subtype sac is scoped to ANY permanent with that subtype (so a Serpent LAND/artifact would qualify too,
    // CR 701.16) — the runtime narrows on the subtype filter, not a base card type.
    expect(ab.sacOther).toEqual({ type: "permanent", subtype: "serpent", another: true });
    expect(ab.program.structure).toBe("modal");
    expect(ab.program.modal.modes).toHaveLength(2);
  });

  it("parseAbilityCost models 'Sacrifice another Serpent' as a subtype-scoped permanent sac", () => {
    expect(parseAbilityCost("Sacrifice another Serpent")).toMatchObject({
      sacOther: { type: "permanent", subtype: "serpent", another: true },
    });
  });

  it("a LAND-subtype sac ('Sacrifice a Swamp') scopes to permanent+subtype, not creature (CREED: payable)", () => {
    // A bug-class pin: forcing type:"creature" would make Strands of Night / Wand of the Elements unpayable
    // (a Swamp/Island is a LAND) yet still count native — a metric over-claim. permanent+subtype is correct.
    expect(parseAbilityCost("Sacrifice a Swamp")).toMatchObject({
      sacOther: { type: "permanent", subtype: "swamp", another: false },
    });
  });
});

// ─── 2. can't-be-countered ─────────────────────────────────────────────────────────────────────
describe("KOMA — this spell can't be countered (CR 701.5e)", () => {
  it("enumerateTargets never offers Koma on the stack as a counter target", () => {
    let s = mainState();
    // Koma is on the stack as a creature spell (CR 405 — a cast spell is a stack object of kind "spell").
    s = { ...s, stack: [{ id: "stk-koma", kind: "spell", controller: "user", source: KOMA_CARD }] };
    const counterTargets = enumerateTargets(s, "ai", { kind: "counter", targetType: "spell", spellFilter: "any" });
    expect(counterTargets.some((t) => t.id === "stk-koma")).toBe(false);
  });

  it("a normal (counterable) spell IS offered — proves the guard is specific to Koma's text", () => {
    let s = mainState();
    s = { ...s, stack: [{ id: "stk-bear", kind: "spell", controller: "user", source: { id: "c-bear", name: "Bear", type: "Creature — Bear", oracle: "" } }] };
    const counterTargets = enumerateTargets(s, "ai", { kind: "counter", targetType: "spell", spellFilter: "any" });
    expect(counterTargets.some((t) => t.id === "stk-bear")).toBe(true);
  });
});

// ─── 3. each-upkeep token — EVERY player's upkeep mints a real 3/3 Serpent named Koma's Coil ────
describe("KOMA — at the beginning of EACH upkeep, create a 3/3 Serpent token", () => {
  function podWithKoma(activePlayer) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    let s = { ...base, turn: 5, phase: "beginning", step: "upkeep", activePlayer, priorityHolder: activePlayer };
    s = withBattlefield(s, "user", [permObj(KOMA_CARD, "user", "p-koma")]);
    return s;
  }

  // The trigger is "each upkeep" (whose:any) so it FIRES on every player's upkeep; the token's controller is
  // ALWAYS Koma's controller (CR 111.1 — the effect makes the token under its controller's control), regardless
  // of whose upkeep it is. So both seats' upkeeps mint a Koma's Coil for USER.
  for (const upkeepSeat of ["user", "ai"]) {
    it(`fires on ${upkeepSeat}'s upkeep and mints a 3/3 blue Serpent named "Koma's Coil" for Koma's controller (user)`, () => {
      let s = podWithKoma(upkeepSeat);
      const before = s.players.user.battlefield.length;
      s = runStepActions(s);            // enqueue the upkeep trigger (fires on each seat)
      s = resolveTopOfStack(s);          // resolve it → mint the token for the controller
      const tokens = s.players.user.battlefield.filter(isSerpentToken);
      expect(tokens).toHaveLength(1);
      const tok = tokens[0];
      expect(tok.card.name).toBe("Koma's Coil");
      expect(tok.card.power).toBe(3);
      expect(tok.card.toughness).toBe(3);
      expect(/\bSerpent\b/.test(tok.card.type)).toBe(true);
      expect(s.players.user.battlefield.length).toBe(before + 1);
      // The non-controller seat never gets the token, even on its own upkeep.
      expect(s.players.ai.battlefield.filter(isSerpentToken)).toHaveLength(0);
    });
  }
});

// ─── 4a. modal mode (i): Tap target permanent + lock its activated abilities this turn ──────────
describe("KOMA — Sacrifice another Serpent: mode (i) tap + lock", () => {
  // A Serpent to feed the cost + a target permanent that has its own activated ability.
  function setup() {
    const coil = permObj({ id: "c-coil", name: "Koma's Coil", type: "Token Creature — Serpent", token: true, power: 3, toughness: 3, oracle: "" }, "user", "p-coil");
    const enemyRock = permObj({ id: "c-rock", name: "Manalith", type: "Artifact", oracle: "{T}: Add one mana of any color." }, "ai", "p-rock", { summoningSick: false });
    let s = withBattlefield(mainState(), "user", [permObj(KOMA_CARD, "user", "p-koma"), coil]);
    s = withBattlefield(s, "ai", [enemyRock]);
    return s;
  }

  it("offers the sac-modal action paying a Serpent, mode (i) targeting the enemy permanent", () => {
    const s = setup();
    const acts = activateActions(s).filter((a) => a.permanentId === "p-koma");
    // The Coil (a Serpent) is the only legal victim; mode (i) can target any permanent.
    expect(acts.every((a) => a.sacCreatureId === "p-coil")).toBe(true);
    const modeI = acts.filter((a) => a.targets?.length); // mode (i) needs a target; mode (ii) is target-less
    expect(modeI.length).toBeGreaterThanOrEqual(1);
    expect(modeI.some((a) => a.targets[0].id === "p-rock")).toBe(true);
  });

  it("dispatch sacrifices the Coil, taps the target, and LOCKS its activated abilities this turn", () => {
    const s = setup();
    const act = activateActions(s).find((a) => a.permanentId === "p-koma" && a.targets?.[0]?.id === "p-rock");
    expect(act).toBeTruthy();
    let after = dispatchAction(s, act);
    // Cost paid: the Coil is gone (sacrificed).
    expect(after.players.user.battlefield.find((p) => p.id === "p-coil")).toBeUndefined();
    after = resolveTopOfStack(after);
    // The targeted permanent is tapped.
    const rock = after.players.ai.battlefield.find((p) => p.id === "p-rock");
    expect(rock.tapped).toBe(true);
    // …and its activated abilities are locked: the AI can't activate the rock this turn.
    expect(permanentHasKeyword(after, "p-rock", "activatedAbilitiesLocked")).toBe(true);
    const aiActs = legalActionsForPlayer({ ...after, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main" }, "ai")
      .filter((a) => a.kind === "activate-ability" && a.permanentId === "p-rock");
    expect(aiActs).toHaveLength(0);
  });

  it("the lock is a one-turn continuous effect — it expires at cleanup (CR 514.2)", () => {
    const s = setup();
    const act = activateActions(s).find((a) => a.permanentId === "p-koma" && a.targets?.[0]?.id === "p-rock");
    let after = resolveTopOfStack(dispatchAction(s, act));
    expect(permanentHasKeyword(after, "p-rock", "activatedAbilitiesLocked")).toBe(true);
    after = expireContinuousEffects(after, { atCleanupOfTurn: after.turn });
    expect(permanentHasKeyword(after, "p-rock", "activatedAbilitiesLocked")).toBe(false);
  });
});

// ─── 4b. modal mode (ii): Koma gains indestructible until end of turn ──────────────────────────
describe("KOMA — Sacrifice another Serpent: mode (ii) indestructible", () => {
  function setup() {
    const coil = permObj({ id: "c-coil", name: "Koma's Coil", type: "Token Creature — Serpent", token: true, power: 3, toughness: 3, oracle: "" }, "user", "p-coil");
    return withBattlefield(mainState(), "user", [permObj(KOMA_CARD, "user", "p-koma"), coil]);
  }

  it("dispatch + resolve grants Koma indestructible until end of turn", () => {
    const s = setup();
    // Mode (ii) is the target-less modal choice; identify it by chosenMode === 1 (second mode).
    const act = activateActions(s).find((a) => a.permanentId === "p-koma" && a.chosenMode === 1);
    expect(act).toBeTruthy();
    expect(permanentHasKeyword(s, "p-koma", "indestructible")).toBe(false);
    const after = resolveTopOfStack(dispatchAction(s, act));
    expect(permanentHasKeyword(after, "p-koma", "indestructible")).toBe(true);
    // The Coil was paid as the cost.
    expect(after.players.user.battlefield.find((p) => p.id === "p-coil")).toBeUndefined();
  });
});

// ─── 5. subtype sac cost — needs ANOTHER Serpent ───────────────────────────────────────────────
describe("KOMA — the sac cost requires another Serpent (CREED: a payable cost)", () => {
  it("NOT offered when Koma is the only Serpent (no OTHER Serpent to sacrifice)", () => {
    const s = withBattlefield(mainState(), "user", [permObj(KOMA_CARD, "user", "p-koma")]);
    expect(activateActions(s).filter((a) => a.permanentId === "p-koma")).toHaveLength(0);
  });

  it("NOT offered when the only other creature is a non-Serpent", () => {
    const bear = permObj({ id: "c-bear", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, "user", "p-bear");
    const s = withBattlefield(mainState(), "user", [permObj(KOMA_CARD, "user", "p-koma"), bear]);
    expect(activateActions(s).filter((a) => a.permanentId === "p-koma")).toHaveLength(0);
  });

  it("never sacrifices Koma itself ('another' excludes the source)", () => {
    const coil = permObj({ id: "c-coil", name: "Koma's Coil", type: "Token Creature — Serpent", token: true, power: 3, toughness: 3, oracle: "" }, "user", "p-coil");
    const s = withBattlefield(mainState(), "user", [permObj(KOMA_CARD, "user", "p-koma"), coil]);
    const acts = activateActions(s).filter((a) => a.permanentId === "p-koma");
    expect(acts.length).toBeGreaterThanOrEqual(2); // mode (i)×target(s) + mode (ii)
    expect(acts.every((a) => a.sacCreatureId === "p-coil")).toBe(true); // never p-koma
  });
});

// ─── 6. CREED anti-FP pins ─────────────────────────────────────────────────────────────────────
describe("KOMA — CREED anti-false-positive pins", () => {
  it("a subtype sac cost with a COUNT ('Sacrifice two Serpents') is NOT modeled", () => {
    expect(parseAbilityCost("Sacrifice two Serpents")).toBeNull();
  });

  it("a bare two-word subtype phrase is not mis-read as a sac of a base type", () => {
    // "Sacrifice another Serpent" → subtype scoped (creature + serpent), NOT a bare 'creature' sac.
    const cost = parseAbilityCost("Sacrifice another Serpent");
    expect(cost.sacOther.subtype).toBe("serpent");
  });

  it("tap-target-permanent WITHOUT the lock rider parses HIGH but grants NO lock (no fabricated restriction)", () => {
    const [ab] = parseActivatedAbilities({ name: "Tapper", type: "Artifact", oracle: "{T}: Tap target permanent." });
    expect(ab.modeled).toBe(true);
    expect(ab.program.atoms[0]).toMatchObject({ op: "tap", targetType: "permanent" });
    expect(ab.program.atoms[0].lockActivated).toBeUndefined();
  });

  it("a modal activated ability with an UNMODELED mode stays body-only (all-or-nothing)", () => {
    // Mode 2 ("Scry then reveal…") is unmodeled → the whole ability is not modeled.
    const [ab] = parseActivatedAbilities({
      name: "Faker", type: "Creature — Wizard",
      oracle: "Sacrifice another Serpent: Choose one —\n• Tap target permanent.\n• Each player reveals their hand, then you choose a noncreature card from it.",
    });
    expect(ab.modeled).toBe(false);
  });
});
