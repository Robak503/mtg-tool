/**
 * attackTaxPlaneswalkers.test.js — ④-AM (2026-09-03 night): the "creatures can't attack you OR PLANESWALKERS YOU CONTROL
 * unless their controller pays {N} for each of THOSE creatures" printing of the attack tax (CR 508.1g) — Baird, Steward of
 * Argive; Archon of Absolution. The same tax as Ghostly Prison's wording: the declare action's `defender` is the PLAYER
 * whether the attack is at them or at their planeswalker, so attackTaxToDeclare already charges both; only the regex (one
 * copy for the parser and the clause check) needed the second printing. Real oracle fixtures (bundled Scryfall snapshot,
 * read in-session 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseAttackTax, isAttackTaxClause, attackTaxToDeclare } from "./attackTax.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const BAIRD = { name: "Baird, Steward of Argive", type: "Legendary Creature — Human Soldier", mana: "{2}{W}{W}", cmc: 4, power: 2, toughness: 4, keywords: ["Vigilance"],
  oracle: "Vigilance\nCreatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures." };
const ARCHON = { name: "Archon of Absolution", type: "Creature — Archon", mana: "{3}{W}", cmc: 4, power: 3, toughness: 2, keywords: ["Flying", "Protection"],
  oracle: "Flying\nProtection from white\nCreatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures." };
const SPHERE = { name: "Sphere of Safety", type: "Enchantment", mana: "{4}{W}", cmc: 5, keywords: [],
  oracle: "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control." };
const SIVITRI_LINE = "Until your next turn, creatures can't attack you or planeswalkers you control unless their controller pays 2 life for each of those creatures.";

const island = (i) => createPermanent({ id: `land${i}`, card: { id: `c-land${i}`, name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user" });
const bear = () => createPermanent({ id: "atk", controller: "user", summoningSick: false, card: { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [] } });
function combatBoard({ lands = 0, taxers = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", combat: { attackers: [], blockers: [] },
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [bear(), ...Array.from({ length: lands }, (_, i) => island(i))] },
      ai: { ...s.players.ai, battlefield: taxers.map((c, i) => createPermanent({ id: `tax${i}`, card: { id: `c-tax${i}`, ...c }, controller: "ai" })) } } };
}
const attackActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const untappedLands = (s) => s.players.user.battlefield.filter((p) => /Land/.test(p.card.type) && !p.tapped).length;

describe("the parser — the second printing reads as the same tax", () => {
  it("⭐ 'or planeswalkers you control … for each of those creatures' → the fixed {N}", () => {
    expect(parseAttackTax(BAIRD)).toEqual({ generic: 1 });
    expect(parseAttackTax(ARCHON)).toEqual({ generic: 1 });
    expect(isAttackTaxClause("Creatures can't attack you or planeswalkers you control unless their controller pays {1} for each of those creatures.".replace(/\.$/, ""))).toBe(true);
  });
  it("GRADUATED 2026-09-05 (sphereOfSafety.test.js): the counted {X} form is a modelled countSource now — resolved live against the defender's board; the life-payment form is still NOT claimed", () => {
    expect(parseAttackTax(SPHERE)).toEqual({ countSource: { kind: "permanentsYouControl", cardType: "enchantment" } });
    expect(classifyCard(SPHERE)).toMatch(/^native/);
    // CREED — the refusal class lives on: a tax paid in LIFE has no payment lane, and a domain {X} is not a plain permanent count
    expect(parseAttackTax({ oracle: SIVITRI_LINE })).toBeNull();
    expect(parseAttackTax({ oracle: "Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you, where X is the number of basic land types among lands you control." })).toBeNull();
  });
  it("the tiers", () => {
    expect(classifyCard(BAIRD)).toBe("native-static");
    expect(classifyCard(ARCHON)).toBe("native-static");
  });
});

describe("runtime — Baird taxes the attack exactly like Ghostly Prison", () => {
  it("⭐ with no mana the attack is withheld; with one land it is offered and declaring taps the land", () => {
    expect(attackTaxToDeclare(combatBoard({ taxers: [BAIRD] }), "ai")).toBe(1);
    expect(attackActions(combatBoard({ lands: 0, taxers: [BAIRD] }))).toHaveLength(0);
    const s = combatBoard({ lands: 1, taxers: [BAIRD] });
    const acts = attackActions(s);
    expect(acts).toHaveLength(1);
    const after = dispatchAction(s, acts[0]);
    expect(after.combat.attackers.map((a) => a.permanentId)).toEqual(["atk"]);
    expect(untappedLands(after)).toBe(0);
  });
});
