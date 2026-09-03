/**
 * cavernOfSouls.test.js — CAP-CAVERN (2026-09-03): CAVERN OF SOULS — "As this land enters, choose a creature type.
 * {T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type,
 * and that spell can't be countered."
 * Three pieces: the chosen type is stamped on the land as it enters (the play-land drop now stamps it like every
 * other entry path — CR 614.12); the restricted any-colour line is an EXTRA mana record whose `chosenType`
 * restriction resolves per permanent into the conjunctive "<chosen> creature" spend entry (a land that never
 * chose is offered to nothing); and the payment plan carries `uncounterableIfSpent` to the cast site, which
 * stamps the spell `uncounterable` — the mark the counter-target enumeration already honours (CR 106.6).
 *
 * Real oracle fixture (bundled Scryfall snapshot, read in-session 2026-09-03). The creatures and the counterspell
 * are SYNTHETIC fixtures (named as such).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { enumerateTargets } from "./spellEffects.js";
import { manaProduction, manaSources, parseSpendRestriction, extraManaLineProducts, spendRestrictionAllows, resolveSourceRestriction } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CAVERN = { id: "c-cav", name: "Cavern of Souls", type: "Land", mana: "", keywords: [], oracle: "As this land enters, choose a creature type.\n{T}: Add {C}.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type, and that spell can't be countered." };
const FOREST = { id: "c-for", name: "Forest", type: "Basic Land — Forest", mana: "", keywords: [], oracle: "({T}: Add {G}.)" };
const SQUIRREL = { id: "h-sq", name: "Synthetic Squirrel", type: "Creature — Squirrel", mana: "{G}", mana_cost: "{G}", cmc: 1, power: 1, toughness: 1, keywords: [], oracle: "" };
const BEAR = { id: "h-bear", name: "Synthetic Bear", type: "Creature — Bear", mana: "{G}", mana_cost: "{G}", cmc: 1, power: 2, toughness: 2, keywords: [], oracle: "" };
const CANCEL = { id: "h-cx", name: "Synthetic Cancel", type: "Instant", mana: "{U}{U}", mana_cost: "{U}{U}", cmc: 2, keywords: [], oracle: "Counter target spell." };

function board({ chosen = "Squirrel", land = "cavern", hand = [SQUIRREL, BEAR] } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const cav = { ...createPermanent({ id: "cav", card: CAVERN, controller: "user" }), ...(chosen ? { chosenType: chosen } : {}) };
  const forest = createPermanent({ id: "forest", card: FOREST, controller: "user" });
  return {
    ...s0, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: {
      ...s0.players,
      user: { ...s0.players.user, life: 20, hand, graveyard: [], library: [], battlefield: land === "cavern" ? [cav] : [forest], manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 } },
      ai: { ...s0.players.ai, life: 20, hand: [CANCEL], graveyard: [], library: [], battlefield: [], manaPool: { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } },
    },
  };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.cardId === cardId);
const counterTargets = (s) => enumerateTargets({ ...s, priorityHolder: "ai" }, "ai", { targetType: "spell", spellFilter: "any" }).filter((t) => t.type === "spell").map((t) => t.id);

describe("the parse + the tier", () => {
  it("the restriction reads the chosen-type form with its uncounterable tail; the line rides as an extra record", () => {
    expect(parseSpendRestriction(CAVERN.oracle)).toEqual({ castTypes: ["creature"], chosenType: true, uncounterableIfSpent: true });
    expect(parseSpendRestriction("{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type.")).toEqual({ castTypes: ["creature"], chosenType: true });
    expect(parseSpendRestriction("{T}: Add one mana of any color. Spend this mana only to cast a wombat spell of the chosen type.")).toBeNull();
    const main = manaProduction(CAVERN);
    expect(main).toMatchObject({ colors: ["C"], amount: 1 });
    const extras = extraManaLineProducts(CAVERN, main);
    expect(extras.length).toBe(1);
    expect(extras[0]).toMatchObject({ colors: ["W", "U", "B", "R", "G"], amount: 1, restriction: { castTypes: ["creature"], chosenType: true, uncounterableIfSpent: true } });
  });
  it("resolution: the chosen type becomes the conjunctive entry; no chosen type → offered to nothing (never unrestricted)", () => {
    const r = parseSpendRestriction(CAVERN.oracle);
    const resolved = resolveSourceRestriction(r, { chosenType: "Squirrel" });
    expect(resolved.castTypes).toEqual(["squirrel creature"]);
    expect(spendRestrictionAllows(resolved, SQUIRREL)).toBe(true);
    expect(spendRestrictionAllows(resolved, BEAR)).toBe(false);
    const unresolved = resolveSourceRestriction(r, { chosenType: null });
    expect(unresolved).toMatchObject({ castTypes: [], unresolvedChosenType: true });
    expect(spendRestrictionAllows(unresolved, SQUIRREL)).toBe(false);
    expect(resolveSourceRestriction(null, { chosenType: "Squirrel" })).toBeNull();
    expect(resolveSourceRestriction({ castTypes: ["dragon"] }, { chosenType: "Squirrel" })).toEqual({ castTypes: ["dragon"] });
  });
  it("Cavern of Souls is a fully covered land", () => {
    expect(classifyCard(CAVERN)).toBe("land");
  });
});

describe("runtime — the sources and the cast", () => {
  it("⭐ with a chosen type the land offers both lines, the any-colour one restricted to that type; without one, only {C}", () => {
    const withType = manaSources(board(), "user").filter((s) => s.permanentId === "cav");
    expect(withType.length).toBe(2);
    const any = withType.find((s) => s.colors.length === 5);
    expect(any.restriction).toMatchObject({ castTypes: ["squirrel creature"], uncounterableIfSpent: true });
    expect(withType.find((s) => s.colors.length === 1).restriction ?? null).toBeNull();
    const noType = manaSources(board({ chosen: null }), "user").filter((s) => s.permanentId === "cav");
    const anyNoType = noType.find((s) => s.colors.length === 5);
    expect(anyNoType.restriction).toMatchObject({ castTypes: [], unresolvedChosenType: true });
  });

  it("⭐ the Squirrel is castable off the Cavern and enters the stack UNCOUNTERABLE; the Bear is not castable; a Forest-paid Squirrel can be countered", () => {
    const s = board();
    expect(castOf(s, "h-bear").length).toBe(0);
    const acts = castOf(s, "h-sq");
    expect(acts.length).toBeGreaterThan(0);
    const cast = dispatchAction(s, acts[0]);
    const spell = cast.stack.find((o) => o.kind === "spell");
    expect(spell.uncounterable).toBe(true);
    expect(cast.players.user.battlefield.find((p) => p.id === "cav").tapped).toBe(true);
    expect(counterTargets(cast)).not.toContain(spell.id);
    // Control: the same Squirrel paid with a Forest is an ordinary spell.
    const f = board({ land: "forest" });
    const castF = dispatchAction(f, castOf(f, "h-sq")[0]);
    const spellF = castF.stack.find((o) => o.kind === "spell");
    expect(spellF.uncounterable ?? false).toBe(false);
    expect(counterTargets(castF)).toContain(spellF.id);
  });

  it("a land whose ONLY mana line is the chosen-type line resolves on the MAIN record too (synthetic fixture — no corpus card prints this alone yet)", () => {
    const SOLO = { id: "c-solo", name: "Synthetic Chosen Hall", type: "Land", mana: "", keywords: [], oracle: "As this land enters, choose a creature type.\n{T}: Add one mana of any color. Spend this mana only to cast a creature spell of the chosen type." };
    const s = board();
    const mk = (chosenType) => ({ ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...createPermanent({ id: "solo", card: SOLO, controller: "user" }), ...(chosenType ? { chosenType } : {}) }] } } });
    const chosen = manaSources(mk("Squirrel"), "user").find((x) => x.permanentId === "solo");
    expect(chosen.restriction).toMatchObject({ castTypes: ["squirrel creature"] });
    expect(spendRestrictionAllows(chosen.restriction, BEAR)).toBe(false);
    const unchosen = manaSources(mk(null), "user").find((x) => x.permanentId === "solo");
    expect(unchosen.restriction).toMatchObject({ castTypes: [], unresolvedChosenType: true });
  });

  it("without a chosen type nothing is castable off the Cavern's coloured line", () => {
    expect(castOf(board({ chosen: null }), "h-sq").length).toBe(0);
  });

  it("⭐ a Cavern played from hand chooses its type as it enters (the land-drop path stamps it)", () => {
    const s = board({ chosen: null, hand: [{ ...CAVERN, id: "h-cav" }, SQUIRREL] });
    const withBoard = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "sq-on-board", card: { ...SQUIRREL, id: "c-sq2" }, controller: "user" })] } } };
    const play = legalActionsForPlayer(withBoard, "user").find((a) => a.kind === "play-land" && a.cardId === "h-cav");
    expect(play).toBeTruthy();
    const out = dispatchAction(withBoard, play);
    const entered = out.players.user.battlefield.find((p) => p.card?.name === "Cavern of Souls");
    expect(entered.chosenType).toBe("Squirrel");
    // …and its coloured line is live for the Squirrel right away.
    expect(castOf({ ...out, priorityHolder: "user" }, "h-sq").length).toBeGreaterThan(0);
  });
});
