/**
 * gishathReveal.test.js — the REVEAL-THAT-MANY-PUT-FILTERED combat-damage payoff (Gishath, Sun's Avatar).
 * "Whenever ~ deals combat damage to a player, reveal that many cards from the top of your library. Put any
 * number of <SUBTYPE> creature cards from among them onto the battlefield and the rest on the bottom of your
 * library in a random order." → ONE reveal-put-filtered atom (count = ctx.combatDamageAmount; put every matching
 * creature onto the battlefield; bottom the rest in a random order). The effect SPANS two sentences, so the
 * classifier needs a residue-strip for the "Put any number …" follow-up (mirrors the dice-roll / Junk Winder /
 * Surrak span-two-sentence strips) — otherwise the put sentence reads as unmodeled residue and the card stays
 * body-only. The countContext:"combatDamageAmount" referent gate keeps the trigger native ONLY on a combat-damage
 * event (a non-combat trigger's referent is unset → it would silently drop → SAFE false-negative, stays Arbiter).
 */
import { describe, it, expect } from "vitest";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { parseEffectClause } from "./effects/parser.js";
import { applyRevealPutFiltered } from "./effects/atoms/library.js";

const gishath = (over = {}) => ({
  name: "Gishath, Sun's Avatar",
  type: "Creature — Dinosaur Avatar",
  mana: "{5}{R}{G}{W}",
  power: 7,
  toughness: 6,
  oracle:
    "Vigilance, trample, haste\nWhenever Gishath, Sun's Avatar deals combat damage to a player, " +
    "reveal that many cards from the top of your library. Put any number of Dinosaur creature cards from among them onto the battlefield and the rest on the bottom of your library in a random order.",
  ...over,
});

const dino = (id) => ({ id: `D${id}`, name: `Dino${id}`, type: "Creature — Dinosaur", power: 3, toughness: 3 });
const bear = (id) => ({ id: `B${id}`, name: `Bear${id}`, type: "Creature — Bear", power: 2, toughness: 2 });
const isl = (id) => ({ id: `I${id}`, name: `Isl${id}`, type: "Land — Island" });
const mkState = (library) => ({ rngSeed: 12345, players: { user: { battlefield: [], library, graveyard: [], hand: [] } }, log: [] });
const bfNames = (s) => s.players.user.battlefield.map((p) => p.card?.name || p.name);
const libNames = (s) => s.players.user.library.map((c) => c.name);

const parsedAtom = () => {
  const cd = detectTriggers(gishath()).find((t) => t.event === "combatDamageToPlayer");
  return parseEffectClause(cd.effectClause, "Instant", {}).atoms[0];
};

describe("Gishath / reveal-that-many-put-filtered — classification", () => {
  it("Gishath flips native-trigger (the two-sentence effect is fully modeled + residue-stripped)", () => {
    expect(classifyCard(gishath())).toBe("native-trigger");
  });
  it("the combat-damage trigger routes natively with the correct atom shape", () => {
    const cd = detectTriggers(gishath()).find((t) => t.event === "combatDamageToPlayer");
    expect(cd).toBeTruthy();
    expect(triggerRoutesNatively(cd)).toBe(true);
    const atom = parseEffectClause(cd.effectClause, "Instant", {}).atoms[0];
    expect(atom).toMatchObject({ op: "reveal-put-filtered", countContext: "combatDamageAmount", filter: { groups: [["dinosaur", "creature"]] } });
  });
  it("CREED: a DIFFERENT disposition ('into your graveyard') is not this shape → stays body-only", () => {
    const g = gishath({
      oracle:
        "Vigilance, trample, haste\nWhenever Gishath, Sun's Avatar deals combat damage to a player, reveal that many cards from the top of your library. Put any number of Dinosaur creature cards from among them onto the battlefield and the rest into your graveyard.",
    });
    expect(classifyCard(g)).not.toMatch(/^native/);
  });
});

describe("Gishath / reveal-that-many-put-filtered — resolution", () => {
  it("reveals combatDamageAmount, puts every matching creature, bottoms the rest (random order)", () => {
    // lib top→bottom: Dino1, Bear1, Dino2, Isl1, Dino3. dmg=4 → reveal top 4 [Dino1,Bear1,Dino2,Isl1];
    // put Dino1+Dino2; bottom Bear1+Isl1; Dino3 (the 5th card) untouched.
    let s = mkState([dino(1), bear(1), dino(2), isl(1), dino(3)]);
    s = applyRevealPutFiltered(s, parsedAtom(), { controller: "user", combatDamageAmount: 4 });
    expect(bfNames(s).sort()).toEqual(["Dino1", "Dino2"]);
    expect(s.players.user.library.length).toBe(3);
    expect(libNames(s)[0]).toBe("Dino3");            // the un-revealed card stays on top
    expect(libNames(s).slice(1).sort()).toEqual(["Bear1", "Isl1"]); // Bear1 + Isl1 bottomed (order random)
  });
  it("the count is capped by the reveal window — a Dino BELOW the window is not put", () => {
    // dmg=2 → reveal top 2 [Dino1,Bear1]; put Dino1 only; Dino2 (3rd card) is NOT revealed, so NOT put.
    let s = mkState([dino(1), bear(1), dino(2), isl(1), dino(3)]);
    s = applyRevealPutFiltered(s, parsedAtom(), { controller: "user", combatDamageAmount: 2 });
    expect(bfNames(s)).toEqual(["Dino1"]);
    expect(s.players.user.library.length).toBe(4);   // Dino2, Isl1, Dino3 untouched + Bear1 bottomed
    expect(libNames(s)[3]).toBe("Bear1");
  });
  it("0 combat damage → a clean no-op (nothing revealed, library intact) — never fabricated", () => {
    let s = mkState([dino(9)]);
    s = applyRevealPutFiltered(s, parsedAtom(), { controller: "user", combatDamageAmount: 0 });
    expect(bfNames(s)).toEqual([]);
    expect(s.players.user.library.length).toBe(1);
  });
  it("no matching creature in the reveal window → all bottomed, none put", () => {
    let s = mkState([bear(1), isl(1), bear(2)]);
    s = applyRevealPutFiltered(s, parsedAtom(), { controller: "user", combatDamageAmount: 3 });
    expect(bfNames(s)).toEqual([]);
    expect(s.players.user.library.length).toBe(3);   // all three bottomed, none removed
  });
});
