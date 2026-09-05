/**
 * NORN'S ANNEX — the PHYREXIAN attack tax. SHELF-85 · Atraxa A2, 2026-09-05.
 * "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures."
 *
 * A {W/P} is a per-attacker CHOICE — {W} or 2 life (CR 107.4f) — and it is NOT a {1}. The parser returns a Phyrexian pip;
 * attackTaxDetail lists the pips beside the generic sum the existing pins read; BOTH consumers read the detail:
 * legalChoices withholds the declaration unless the all-mana plan can be paid OR the generic can be paid in mana and the
 * controller has 2 life per pip (CR 119.4 — life is paid only from a total at least that large); the dispatcher pays
 * all-mana when it can and otherwise the generic in mana and the pips in life through the one life-loss chokepoint.
 * The half-model law of attackTax.test.js holds: restriction and payment ship together.
 *
 * Mutation-checked: see the run ledger (docs-sk83).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAttackTax, isAttackTaxClause, attackTaxToDeclare, attackTaxDetail, attackTaxManaCost } from "./attackTax.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const ANNEX_TEXT = "Creatures can't attack you or planeswalkers you control unless their controller pays {W/P} for each of those creatures.";
const ANNEX = { id: "c-na", name: "Norn's Annex", type: "Artifact", mana: "{3}{W/P}{W/P}", keywords: [], oracle: `({W/P} can be paid with either {W} or 2 life.)\n${ANNEX_TEXT}` };
const PROPAGANDA = { id: "c-prop", name: "Propaganda", type: "Enchantment", mana: "{2}{U}", keywords: [], oracle: "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you." };

const land = (i, name, sub) => createPermanent({ id: `land${i}`, card: { id: `c-land${i}`, name, type: `Basic Land — ${sub}`, oracle: "" }, controller: "user" });
const bear = () => createPermanent({ id: "atk", controller: "user", summoningSick: false,
  card: { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [] } });

/** One attacker for the user with the given lands; `defenders` on the AI's battlefield; the user's life total. */
function combatBoard({ plains = 0, wastes = 0, defenders = [], life = 20 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const lands = [...Array.from({ length: plains }, (_, i) => land(i, "Plains", "Plains")), ...Array.from({ length: wastes }, (_, i) => land(100 + i, "Wastes", "Wastes"))];
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
    combat: { attackers: [], blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, life, battlefield: [bear(), ...lands] },
      ai: { ...s.players.ai, battlefield: defenders.map((c, i) => createPermanent({ id: `d${i}`, card: c, controller: "ai" })) },
    },
  };
}
const attackActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const untappedLands = (s) => s.players.user.battlefield.filter((p) => /Land/.test(p.card.type) && !p.tapped).length;
const declare = (s) => dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });

describe("the parser — the Phyrexian pip beside the generic and the counted forms", () => {
  it("Annex reads to a pip; the generic sum stays 0 for a pip-only board; the detail carries it; the clause gate admits the sentence", () => {
    const s = combatBoard({ defenders: [ANNEX] });
    const row = { parse: parseAttackTax(ANNEX), generic: attackTaxToDeclare(s, "ai"), detail: attackTaxDetail(s, "ai"), mana: attackTaxManaCost(attackTaxDetail(s, "ai")), clause: isAttackTaxClause(ANNEX_TEXT.replace(/\.$/, "")) };
    console.log("  WITNESS annexParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.parse).toEqual({ phyrexian: "W" });
    expect(row.generic).toBe(0);
    expect(row.detail).toEqual({ generic: 0, phyrexian: ["W"] });
    expect(row.mana).toEqual({ generic: 0, W: 1 });
    expect(row.clause).toBe(true);
    // CREED — a life-only tax and a hybrid-mana tax are not this pip
    expect(parseAttackTax({ oracle: "Creatures can't attack you unless their controller pays 2 life for each of those creatures." })).toBeNull();
    expect(parseAttackTax({ oracle: "Creatures can't attack you unless their controller pays {W/U} for each of those creatures." })).toBeNull();
  });

  it("classification — Norn's Annex flips native", () => {
    expect(classifyCard(ANNEX)).toMatch(/^native/);
  });
});

describe("RUNTIME — {W} when the mana is there, 2 life when it is not, and no attack from under 2 life", () => {
  it("a Plains funds the pip: the attack is offered and the Plains is tapped, no life leaves", () => {
    const s = combatBoard({ plains: 1, defenders: [ANNEX] });
    expect(attackActions(s)).toHaveLength(1);
    const after = declare(s);
    const row = { landsLeft: untappedLands(after), life: after.players.user.life, attackers: after.combat.attackers.length };
    console.log("  WITNESS annexMana", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ landsLeft: 0, life: 20, attackers: 1 });
  });

  it("no white source at 20 life: the attack is offered and costs 2 life; a colourless source pays nothing toward the pip", () => {
    const s = combatBoard({ wastes: 1, defenders: [ANNEX] });
    expect(attackActions(s)).toHaveLength(1);
    const after = declare(s);
    const row = { landsLeft: untappedLands(after), life: after.players.user.life, attackers: after.combat.attackers.length };
    console.log("  WITNESS annexLife", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ landsLeft: 1, life: 18, attackers: 1 });
    expect(after.log.some((e) => e.kind === "attack-tax-paid" && e.lifePaid === 2 && e.generic === 0)).toBe(true);
  });

  it("no white source at 1 life: withheld (CR 119.4); at exactly 2 life: offered, and the attacker goes to 0", () => {
    expect(attackActions(combatBoard({ defenders: [ANNEX], life: 1 }))).toHaveLength(0);
    const s = combatBoard({ defenders: [ANNEX], life: 2 });
    expect(attackActions(s)).toHaveLength(1);
    expect(declare(s).players.user.life).toBe(0);
  });

  it("Annex + Propaganda with two Wastes: {2} in mana and the pip in life; with a Plains as well, all in mana", () => {
    const s = combatBoard({ wastes: 2, defenders: [ANNEX, PROPAGANDA] });
    expect(attackActions(s)).toHaveLength(1);
    const after = declare(s);
    expect({ landsLeft: untappedLands(after), life: after.players.user.life }).toEqual({ landsLeft: 0, life: 18 });
    const s2 = combatBoard({ wastes: 2, plains: 1, defenders: [ANNEX, PROPAGANDA] });
    const after2 = declare(s2);
    expect({ landsLeft: untappedLands(after2), life: after2.players.user.life }).toEqual({ landsLeft: 0, life: 20 });
    // one Wastes only: {2} is unaffordable on either lane → withheld
    expect(attackActions(combatBoard({ wastes: 1, defenders: [ANNEX, PROPAGANDA] }))).toHaveLength(0);
  });
});
