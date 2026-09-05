/**
 * SPHERE OF SAFETY — SHELF-85 · Atraxa A2, 2026-09-05. "Creatures can't attack you or planeswalkers you control unless
 * their controller pays {X} for each of those creatures, where X is the number of enchantments you control."
 *
 * The attack-tax module read a FIXED digit only and refused every {X} on purpose — a mis-read amount is a mis-charge.
 * This one carrier's X is a count the shared count-source parser already reads, so parseAttackTax returns a
 * `countSource` descriptor and attackTaxToDeclare — the ONE gatherer legalChoices withholds on and the dispatcher pays
 * through — resolves it against the DEFENDER's live battlefield at every declaration (the Sphere counts itself). The
 * half-model law of attackTax.test.js holds unchanged: restriction and payment ship together.
 *
 * Mutation-checked: see the run ledger (docs-sk79).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAttackTax, isAttackTaxClause, attackTaxToDeclare } from "./attackTax.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPHERE_TEXT = "Creatures can't attack you or planeswalkers you control unless their controller pays {X} for each of those creatures, where X is the number of enchantments you control.";
const SPHERE = { id: "c-sos", name: "Sphere of Safety", type: "Enchantment", mana: "{4}{W}", keywords: [], oracle: SPHERE_TEXT };
const PROPAGANDA = { id: "c-prop", name: "Propaganda", type: "Enchantment", mana: "{2}{U}", keywords: [], oracle: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you." };
const ENCH = (i) => ({ id: `c-e${i}`, name: `Plain Glory ${i}`, type: "Enchantment", mana: "{W}", keywords: [], oracle: "" });
const ROCK = { id: "c-rock", name: "Stone Rock", type: "Artifact", mana: "{1}", keywords: [], oracle: "" };

const island = (i) => createPermanent({ id: `land${i}`, card: { id: `c-land${i}`, name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user" });
const bear = () => createPermanent({ id: "atk", controller: "user", summoningSick: false,
  card: { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [] } });

/** `lands` untapped Islands + one attacker (+ `userEnch` plain enchantments) for the user; `defenders` on the AI's battlefield. */
function combatBoard({ lands = 0, defenders = [], userEnch = 0 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
    combat: { attackers: [], blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [bear(), ...Array.from({ length: lands }, (_, i) => island(i)),
        ...Array.from({ length: userEnch }, (_, i) => createPermanent({ id: `ue${i}`, card: ENCH(100 + i), controller: "user" }))] },
      ai: { ...s.players.ai, battlefield: defenders.map((c, i) => createPermanent({ id: `d${i}`, card: c, controller: "ai" })) },
    },
  };
}
const attackActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const untappedLands = (s) => s.players.user.battlefield.filter((p) => /Land/.test(p.card.type) && !p.tapped).length;

describe("the parser — the counted {X} joins the fixed digit", () => {
  it("Sphere of Safety reads to a countSource; the fixed carriers are unchanged; the domain {X} stays refused", () => {
    const row = { sphere: parseAttackTax(SPHERE), propaganda: parseAttackTax(PROPAGANDA), clause: isAttackTaxClause(SPHERE_TEXT.replace(/\.$/, "")) };
    console.log("  WITNESS sphereParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.sphere).toEqual({ countSource: { kind: "permanentsYouControl", cardType: "enchantment" } });
    expect(row.propaganda).toEqual({ generic: 2 });
    expect(row.clause).toBe(true);
    expect(parseAttackTax({ oracle: "Domain — Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you, where X is the number of basic land types among lands you control." })).toBeNull();
    expect(isAttackTaxClause("creatures can't attack you unless their controller pays {x} for each of those creatures, where x is the number of lands you control")).toBe(false);
  });

  it("classification — Sphere of Safety flips native", () => {
    expect(classifyCard(SPHERE)).toMatch(/^native/);
  });
});

describe("RUNTIME — the amount is the DEFENDER's live enchantment count, resolved at declaration", () => {
  it("the Sphere plus two other enchantments taxes {3}; the Sphere alone {1}; an artifact never counts", () => {
    expect(attackTaxToDeclare(combatBoard({ defenders: [SPHERE, ENCH(1), ENCH(2), ROCK] }), "ai")).toBe(3);
    expect(attackTaxToDeclare(combatBoard({ defenders: [SPHERE] }), "ai")).toBe(1);
  });

  it("the ATTACKER's own enchantments never count toward the defender's Sphere", () => {
    expect(attackTaxToDeclare(combatBoard({ defenders: [SPHERE], userEnch: 4 }), "ai")).toBe(1);
  });

  it("stacks with a fixed taxer — Sphere (two others) + Propaganda = {5}", () => {
    expect(attackTaxToDeclare(combatBoard({ defenders: [SPHERE, ENCH(1), ENCH(2), PROPAGANDA] }), "ai")).toBe(4 + 2); // Propaganda is an enchantment too: X = 4
  });

  it("withheld on two lands, offered on three, and dispatching it pays the three", () => {
    const defenders = [SPHERE, ENCH(1), ENCH(2)];
    expect(attackActions(combatBoard({ lands: 2, defenders }))).toEqual([]);
    const s = combatBoard({ lands: 3, defenders });
    const acts = attackActions(s);
    expect(acts.length).toBeGreaterThan(0);
    const after = dispatchAction(s, acts[0]);
    const row = { landsLeft: untappedLands(after), attackers: after.combat.attackers.length };
    console.log("  WITNESS sphereRuntime", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ landsLeft: 0, attackers: 1 });
  });
});
