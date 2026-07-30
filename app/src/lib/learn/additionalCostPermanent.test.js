/**
 * additionalCostPermanent.test.js — AC-PERMANENT (CR 601.2f): the additional cost of a spell that resolves
 * as a PERMANENT. Demon of Catastrophes · Makeshift Mauler · Sparkhunter Masticore.
 *
 * ⛔⛔ THIS WAS A LIVE FREE CAST, not a missing feature. The cast-path additional-cost block reads
 * `program.additionalCosts`, and a permanent has NO effect program — parseEffectClause finds no atom in
 * "Flying, trample", so parseEffectProgram returns null and the cost sentence goes with it. Driven live
 * before the fix: Demon of Catastrophes was offered, cast, and the sacrifice victim was STILL on the
 * battlefield. A spell cast cheaper than printed — the forbidden direction, in the shipped runtime.
 *
 * ⛔ THE PROGRAM MUST STAY NULL. actionDispatcher's resolution chain tests `else if (program)` BEFORE
 * `else if (isPermanentSpell(castCard))`. Synthesising a cost-carrying program for a creature would route it
 * to EFFECT_PROGRAM: the cost gets paid and NOTHING enters the battlefield — the card is eaten. So the costs
 * travel BESIDE the program, never inside it. The "enters the battlefield" assertion below is what pins that.
 *
 * ⚠️ SCOPE, STATED PLAINLY: this fixes the 16 carriers whose cost the parser VETS. 235 more carry a cost it
 * does not vet (Torgaar's "you may sacrifice any number of creatures", "behold an X", "reveal an Elf card")
 * and are STILL cast for free. They are parked, not fixed, and the last describe() below pins that they stay
 * parked — so no future widening can quietly claim them.
 *
 * Oracle text is copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const DEMON = { name: "Demon of Catastrophes", type: "Creature — Demon", mana: "{2}{B}{B}", power: "6", toughness: "6",
  oracle: "As an additional cost to cast this spell, sacrifice a creature.\nFlying, trample" };
const MAULER = { name: "Makeshift Mauler", type: "Creature — Zombie Horror", mana: "{3}{U}", power: "4", toughness: "5",
  oracle: "As an additional cost to cast this spell, exile a creature card from your graveyard." };
const TORGAAR = { name: "Torgaar, Famine Incarnate", type: "Legendary Creature — Avatar", mana: "{6}{B}{B}", power: "7", toughness: "6",
  oracle: "As an additional cost to cast this spell, you may sacrifice any number of creatures. This spell costs {2} less to cast for each creature sacrificed this way.\nWhen Torgaar enters, up to one target player's life total becomes half their starting life total, rounded down." };

// ⚠️ THE LAND COLOUR IS DERIVED FROM THE CARD'S OWN PIPS. An all-Swamp board reported "Makeshift Mauler:
// not offered", which reads exactly like a broken feature — the third time that harness trap has bitten this
// run. Never hard-code the basic.
const PIP2LAND = { W: "Plains", U: "Island", B: "Swamp", R: "Mountain", G: "Forest" };
function board({ fodder = 1, gyCreature = true } = {}, card = DEMON) {
  const pips = [...new Set(card.mana.match(/[WUBRG]/g) || ["B"])];
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < 9; i++) {
    const pip = pips[i % pips.length];
    bf.push(createPermanent({ id: `L${i}`, card: { id: `cl${i}`, name: PIP2LAND[pip], type: `Basic Land — ${PIP2LAND[pip]}`, oracle: `{T}: Add {${pip}}.` }, controller: "user" }));
  }
  for (let i = 0; i < fodder; i++) bf.push(createPermanent({ id: `F${i}`, card: { id: `cf${i}`, name: "Fodder", type: "Creature — Rat", power: "1", toughness: "1", oracle: "" }, controller: "user" }));
  const s = { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand: [{ id: "spell", ...card }],
      graveyard: gyCreature ? [{ id: "gyc", name: "Dead Thing", type: "Creature — Zombie", oracle: "" }] : [], life: 20 } } };
  return s;
}
const st_ = (out) => out?.state || out;   // dispatchAction returns the state itself
const castsOf = (s, name) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "cast-spell" && a.name === name);

describe("⭐⭐ the cost is CHARGED — the free cast is closed", () => {
  it("Demon of Catastrophes really sacrifices the creature", () => {
    const s = board();
    const acts = castsOf(s, "Demon of Catastrophes");
    expect(acts.length).toBe(1);
    const after = st_(dispatchAction(s, acts[0]));
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Fodder")).toBe(false);
    expect(after.players.user.graveyard.some((g) => (g.name || g.card?.name) === "Fodder")).toBe(true);
  });

  it("Makeshift Mauler really exiles the creature card from the graveyard", () => {
    const s = board({ fodder: 0 }, MAULER);
    const acts = castsOf(s, "Makeshift Mauler");
    expect(acts.length).toBe(1);
    const after = st_(dispatchAction(s, acts[0]));
    expect(after.players.user.graveyard.some((g) => (g.name || g.card?.name) === "Dead Thing")).toBe(false);
  });

  it("⛔ no legal way to pay → the spell is NOT OFFERED (never a free cast)", () => {
    expect(castsOf(board({ fodder: 0 }), "Demon of Catastrophes")).toHaveLength(0);      // nothing to sacrifice
    expect(castsOf(board({ fodder: 0, gyCreature: false }, MAULER), "Makeshift Mauler")).toHaveLength(0);
  });

  it("one cast is offered per legal victim", () => {
    expect(castsOf(board({ fodder: 3 }), "Demon of Catastrophes")).toHaveLength(3);
  });
});

describe("⛔ THE ROUTING PIN — the permanent must still ENTER THE BATTLEFIELD", () => {
  it("the cast action carries a NULL program, so resolution routes to the permanent path, not EFFECT_PROGRAM", () => {
    // If the costs were ever attached INSIDE the program, `else if (program)` would win over
    // `else if (isPermanentSpell(castCard))` in the dispatcher and the creature would be eaten.
    const act = castsOf(board(), "Demon of Catastrophes")[0];
    expect(act.program).toBeFalsy();
  });

  it("the creature is on the stack after the cast and reaches the battlefield when it resolves", () => {
    const s = board();
    let st = st_(dispatchAction(s, castsOf(s, "Demon of Catastrophes")[0]));
    expect(st.stack.some((o) => o.source?.name === "Demon of Catastrophes")).toBe(true);
    // Resolve it the way the sim does — both players pass priority on the top object (CR 117.4).
    st = st_(dispatchAction(st, { kind: "pass-priority", playerId: "user" }));
    if (st.stack.length) st = st_(dispatchAction(st, { kind: "pass-priority", playerId: "ai" }));
    expect(st.players.user.battlefield.some((p) => p.card?.name === "Demon of Catastrophes")).toBe(true);
  });
});

describe("the metric credits exactly what the runtime charges", () => {
  it("vetted-cost carriers flip", () => {
    expect(classifyCard(DEMON)).toBe("native-body");
    expect(classifyCard(MAULER)).toBe("native-body");
  });

  it("⛔ AN UNVETTED COST STAYS PARKED — those 235 cards are still cast for free and must not be claimed", () => {
    expect(classifyCard(TORGAAR)).toBe("body-only");
    expect(classifyCard({ ...DEMON, name: "Behold-carrier", oracle: "As an additional cost to cast this spell, behold a Dragon.\nFlying" })).toBe("body-only");
  });

  it("⛔ the reminder-text guard survives: a card that only MENTIONS the phrase in parens is untouched", () => {
    // A real additional cost is never inside reminder parens; the phrase appears in several keywords'
    // reminder text on permanents that print no such cost.
    const c = { name: "Reminder-only", type: "Creature — Human", mana: "{1}{G}", power: "2", toughness: "2",
      oracle: "Flying (As an additional cost to cast this spell, do a thing.)" };
    expect(classifyCard(c)).toBe(classifyCard({ ...c, oracle: "Flying" }));
  });
});
