/**
 * vihaan.test.js — Vihaan, Goldwaker (TIER-2 Mardu Treasure-aristocrats commander) made fully native.
 *
 * TWO abilities, BOTH genuinely resolving at runtime:
 *   1. OUTLAW ANTHEM — "Other outlaws you control have vigilance and haste." A layer-6 keyword grant scoped to
 *      the outlaw meta-type {Assassin, Mercenary, Pirate, Rogue, Warlock}. The parser emits subtypes:["Outlaw"];
 *      layers.js matchesSelector expands "Outlaw" → the five subtypes at the match chokepoint, so every outlaw
 *      the controller controls actually gains both keywords (and a non-outlaw / opponent's outlaw / the source
 *      itself do NOT).
 *   2. BEGIN-COMBAT MASS-ANIMATE — "At the beginning of combat on your turn, you may have Treasures you control
 *      become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn." The
 *      begin-combat TRIGGER is detected (triggerScheduler → combatBegin); its mass/optional/subject-scoped
 *      layer-4 animate effect rides a DEDICATED hook (gameEngine → applyVihaanCombatAnimate, vihaanAnimate.js)
 *      that REUSES the shipped WALT-ANIMATE layer framework (#274/#277/#281) — layer-4 ADD Creature + the named
 *      types/subtypes (additive — still artifacts) + layer-7b SET 3/3, all until end of turn (worn off at
 *      cleanup, CR 514.2).
 *
 * THE COMBO — an animated Treasure BECOMES an Assassin (an outlaw), so it ALSO gains vigilance + haste from
 * ability 1 the same turn (CR 613's layer-4-before-layer-6 dependency) → it can attack the turn it's made. The
 * layer-aware matchesSelector (printed ∪ fixed layer-4 type/subtype grants) is what makes this hold.
 *
 * CREED: whole card or PARK. classifyVihaan is all-or-nothing (returns native-mixed only when BOTH abilities
 * parse AND no residue remains); the anti-FP pins below prove the boundaries (a non-Treasure isn't animated; a
 * non-outlaw isn't anthem'd; the animate wears off EOT; a near-miss card stays body-only).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { parseVihaanCombatAnimate, applyVihaanCombatAnimate } from "./vihaanAnimate.js";
import { nextStep } from "./gameEngine.js";
import {
  permanentIsCreature,
  permanentHasKeyword,
  permanentPower,
  permanentToughness,
  permanentTypes,
  expireContinuousEffects,
} from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text (verified against the engine's card index).
const VIHAAN = {
  name: "Vihaan, Goldwaker",
  type: "Legendary Creature — Dwarf Warlock",
  mana: "{1}{R}{W}",
  power: 2,
  toughness: 2,
  oracle:
    "Other outlaws you control have vigilance and haste. (Assassins, Mercenaries, Pirates, Rogues, and Warlocks are outlaws.)\nAt the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn.",
};

const vihaanPerm = (controller = "user") =>
  createPermanent({ id: "vih", card: { ...VIHAAN, id: "c-vih" }, controller, summoningSick: false });
const treasure = (id, controller = "user") =>
  createPermanent({
    id,
    card: { id: `c-${id}`, name: "Treasure", type: "Token Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color.", token: true },
    controller,
    summoningSick: true,
  });
const outlawPerm = (id, subtype, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: subtype, type: `Creature — Human ${subtype}`, power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });
const bearPerm = (id, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller, summoningSick: false });

function stateWith(battlefields, extra = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...s.players };
  for (const [pid, bf] of Object.entries(battlefields)) players[pid] = { ...s.players[pid], battlefield: bf };
  return { ...s, players, ...extra };
}

// ─── CLASSIFICATION ─────────────────────────────────────────────────────────────────────────────────────
describe("Vihaan, Goldwaker — classification", () => {
  it("classifies native-mixed with the real bundled oracle (both abilities modeled)", () => {
    expect(classifyCard(VIHAAN)).toBe("native-mixed");
  });
  it("the begin-combat trigger is detected (combatBegin / whose 'yours' / optional)", () => {
    const tr = detectTriggers(VIHAAN);
    expect(tr.length).toBe(1);
    expect(tr[0]).toMatchObject({ event: "combatBegin", whose: "yours", optional: true });
  });
  it("parseVihaanCombatAnimate reads 3/3 + Artifact card type + Construct/Assassin subtypes", () => {
    expect(parseVihaanCombatAnimate(VIHAAN)).toEqual({ power: 3, toughness: 3, cardTypes: ["Artifact"], subtypes: ["Construct", "Assassin"] });
  });
});

// ─── ABILITY 2: OUTLAW ANTHEM (runtime) ─────────────────────────────────────────────────────────────────
describe("OUTLAW ANTHEM — vigilance + haste to the five outlaw subtypes you control", () => {
  it("a printed outlaw (Pirate / Rogue / Assassin / Mercenary / Warlock) you control gains BOTH keywords", () => {
    const s = stateWith({
      user: [vihaanPerm(), outlawPerm("pir", "Pirate"), outlawPerm("rog", "Rogue"), outlawPerm("asn", "Assassin"), outlawPerm("mrc", "Mercenary"), outlawPerm("wlk", "Warlock")],
    });
    for (const id of ["pir", "rog", "asn", "mrc", "wlk"]) {
      expect(permanentHasKeyword(s, id, "vigilance")).toBe(true);
      expect(permanentHasKeyword(s, id, "haste")).toBe(true);
    }
  });
  it("a NON-outlaw you control (Bear) gains NEITHER keyword (CREED — the anthem is scoped)", () => {
    const s = stateWith({ user: [vihaanPerm(), bearPerm("bear")] });
    expect(permanentHasKeyword(s, "bear", "vigilance")).toBe(false);
    expect(permanentHasKeyword(s, "bear", "haste")).toBe(false);
  });
  it("an OPPONENT's outlaw is NOT granted (you-control scope)", () => {
    const s = stateWith({ user: [vihaanPerm()], ai: [outlawPerm("opir", "Pirate", "ai")] });
    expect(permanentHasKeyword(s, "opir", "vigilance")).toBe(false);
    expect(permanentHasKeyword(s, "opir", "haste")).toBe(false);
  });
  it("Vihaan does NOT grant to itself ('Other' excludes the source)", () => {
    const s = stateWith({ user: [vihaanPerm()] });
    expect(permanentHasKeyword(s, "vih", "vigilance")).toBe(false);
    expect(permanentHasKeyword(s, "vih", "haste")).toBe(false);
  });
});

// ─── ABILITY 1: BEGIN-COMBAT MASS-ANIMATE (runtime) ─────────────────────────────────────────────────────
describe("BEGIN-COMBAT ANIMATE — Treasures become 3/3 Construct Assassin artifact creatures, still artifacts", () => {
  it("at beginning-of-combat, every Treasure you control becomes a 3/3 Construct Assassin Creature (still an Artifact)", () => {
    let s = stateWith({ user: [vihaanPerm(), treasure("t1"), treasure("t2")] }, { turn: 3, activePlayer: "user", step: "beginning-of-combat" });
    expect(permanentIsCreature(s, "t1")).toBe(false);
    s = applyVihaanCombatAnimate(s);
    for (const id of ["t1", "t2"]) {
      expect(permanentIsCreature(s, id)).toBe(true);
      expect(permanentPower(s, id)).toBe(3);
      expect(permanentToughness(s, id)).toBe(3);
      const ty = permanentTypes(s, id);
      expect(ty.types).toContain("Creature");
      expect(ty.types).toContain("Artifact"); // "in addition to their other types" — still an artifact
      expect(ty.subtypes).toContain("Construct");
      expect(ty.subtypes).toContain("Assassin");
      expect(ty.subtypes).toContain("Treasure"); // additive — original subtype kept
    }
  });
  it("the animate wears off at cleanup (until end of turn, CR 514.2) — back to a non-creature artifact", () => {
    let s = stateWith({ user: [vihaanPerm(), treasure("t1")] }, { turn: 3, activePlayer: "user", step: "beginning-of-combat" });
    s = applyVihaanCombatAnimate(s);
    expect(permanentIsCreature(s, "t1")).toBe(true);
    s = expireContinuousEffects(s, { atCleanupOfTurn: 3 });
    expect(permanentIsCreature(s, "t1")).toBe(false);
    expect(permanentTypes(s, "t1").types).toContain("Artifact"); // still an artifact (the Treasure itself persists)
  });
  it("fires through the real game-engine step advance (nextStep into beginning-of-combat)", () => {
    let s = stateWith({ user: [vihaanPerm(), treasure("t1")] }, { turn: 3, activePlayer: "user", phase: "beginning", step: "upkeep" });
    let guard = 0;
    while (s.step !== "beginning-of-combat" && guard++ < 12) s = nextStep(s);
    expect(s.step).toBe("beginning-of-combat");
    expect(permanentIsCreature(s, "t1")).toBe(true);
    expect(permanentPower(s, "t1")).toBe(3);
  });
  it("CREED — a NON-Treasure permanent you control is NOT animated (only Treasures)", () => {
    let s = stateWith({ user: [vihaanPerm(), bearPerm("bear")] }, { turn: 3, activePlayer: "user", step: "beginning-of-combat" });
    const beforeP = permanentPower(s, "bear");
    s = applyVihaanCombatAnimate(s);
    expect(permanentPower(s, "bear")).toBe(beforeP); // a Bear is untouched (not a 3/3)
  });
  it("CREED — the animate fires only on YOUR turn: an opponent's combat does NOT animate your Treasures", () => {
    let s = stateWith({ user: [vihaanPerm(), treasure("t1")] }, { turn: 4, activePlayer: "ai", step: "beginning-of-combat" });
    s = applyVihaanCombatAnimate(s);
    expect(permanentIsCreature(s, "t1")).toBe(false); // active player is "ai" — Vihaan's controller isn't active
  });
});

// ─── THE COMBO — an animated Treasure (now an Assassin = outlaw) ALSO gains the anthem ────────────────────
describe("COMBO — an animated Treasure becomes an Assassin → it ALSO gains vigilance + haste (layer 4 → layer 6)", () => {
  it("after the begin-combat animate, the now-Assassin Treasure has haste + vigilance from the anthem", () => {
    let s = stateWith({ user: [vihaanPerm(), treasure("t1")] }, { turn: 3, activePlayer: "user", phase: "beginning", step: "upkeep" });
    let guard = 0;
    while (s.step !== "beginning-of-combat" && guard++ < 12) s = nextStep(s);
    const ty = permanentTypes(s, "t1");
    expect(ty.subtypes).toContain("Assassin");
    // it BECAME an outlaw via layer 4, so the layer-6 anthem (which depends on layer 4) now grants to it.
    expect(permanentHasKeyword(s, "t1", "haste")).toBe(true);     // can attack the turn it's animated
    expect(permanentHasKeyword(s, "t1", "vigilance")).toBe(true);
  });
});

// ─── CREED — near-miss cards stay body-only (no over-claim) ──────────────────────────────────────────────
describe("Vihaan-shaped CREED guards — only the exact card flips", () => {
  it("the Vihaan hook does NOT fire for a begin-combat trigger that isn't the mass-Treasure-animate", () => {
    // parseVihaanCombatAnimate is anchored to the EXACT "Treasures you control become N/N … creatures …"
    // templating — a different begin-combat effect (make a token / sacrifice) is not matched, so the dedicated
    // hook never touches such a card. (Whether such a card classifies native via the GENERAL compiler is a
    // separate, legitimate path — what matters for CREED here is the hook can't fabricate an animate.)
    expect(parseVihaanCombatAnimate({ oracle: "At the beginning of combat on your turn, create a Treasure token." })).toBeNull();
    expect(parseVihaanCombatAnimate({ oracle: "At the beginning of combat on your turn, you may have Treasures you control become 1/1 creatures." })).toBeNull(); // no "in addition … until end of turn" tail
  });
  it("a card with the animate but an EXTRA unmodeled ability stays body-only (residue → Arbiter)", () => {
    expect(classifyCard({
      name: "Fake Vihaan 2", type: "Legendary Creature — Dwarf Warlock", mana: "{1}{R}{W}",
      oracle: "Other outlaws you control have vigilance and haste.\nAt the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn.\n{T}, Sacrifice five Treasures: Draw three cards.",
    })).toBe("body-only");
  });
  it("parseVihaanCombatAnimate returns null for a non-Vihaan card (no false hook)", () => {
    expect(parseVihaanCombatAnimate({ oracle: "At the beginning of combat on your turn, create a Treasure token." })).toBeNull();
    expect(parseVihaanCombatAnimate({ oracle: "Treasures you control have haste." })).toBeNull();
  });
});
