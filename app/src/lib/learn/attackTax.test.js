/**
 * attackTax.test.js — THE ATTACK TAX (CR 508.1g): Propaganda #115 · Ghostly Prison #161 · Windborn Muse #1011.
 *
 *   "Creatures can't attack you unless their controller pays {2} for each creature they control
 *    that's attacking you."
 *
 * ⚠️ THE HALF-MODEL IS WORSE THAN NO MODEL, and every test below exists to hold that line. Reading the
 * restriction without charging for it would make all three cards classify native while the attacker
 * swings for FREE — a card that looks built and does nothing. Reading it as an unpayable prohibition
 * turns a {2} toll into Moat. So the classifier marker (staticAbilityParser), the withheld action
 * (legalChoices) and the actual payment (actionDispatcher) are one change; the pins here check all three
 * against each other rather than any one of them alone.
 *
 * SEQUENTIAL DECLARATION. The printed card charges {2} × (attacking creatures) once, as the declaration's
 * total. This engine declares attackers one at a time, so it charges {2} per declaration — same total,
 * reached one step at a time.
 *
 * THE ORDERING PIN (CR 508.1 f→h) is the subtle one: attackers TAP before mana abilities are activated,
 * so a non-vigilance attacker can't be tapped for mana to pay its own tax — but a VIGILANCE attacker
 * stays untapped and genuinely can. Both directions are pinned; getting this wrong offers attacks that
 * can't be funded, or refuses ones that can.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseAttackTax, attackTaxToDeclare } from "./attackTax.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const TAX = "Creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you.";
const PROPAGANDA = { name: "Propaganda", type: "Enchantment", mana: "{2}{U}", keywords: [], oracle: TAX };
const GHOSTLY_PRISON = { name: "Ghostly Prison", type: "Enchantment", mana: "{2}{W}", keywords: [], oracle: TAX };
const WINDBORN_MUSE = { name: "Windborn Muse", type: "Creature — Spirit", mana: "{3}{W}", power: 2, toughness: 3, keywords: ["Flying"], oracle: `Flying\n${TAX}` };

const island = (i) => createPermanent({ id: `land${i}`, card: { id: `c-land${i}`, name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user" });
const bear = (over = {}) => createPermanent({
  id: "atk", controller: "user", summoningSick: false,
  card: { id: "c-atk", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [], ...over },
});

/** `lands` untapped Islands + one attacker for the user; `taxers` on the AI's battlefield. */
function combatBoard({ lands = 0, taxers = [], attacker = bear() } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user",
    combat: { attackers: [], blockers: [] },
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: [attacker, ...Array.from({ length: lands }, (_, i) => island(i))] },
      ai: { ...s.players.ai, battlefield: taxers.map((c, i) => createPermanent({ id: `tax${i}`, card: c, controller: "ai" })) },
    },
  };
}
const attackActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const untappedLands = (s) => s.players.user.battlefield.filter((p) => /Land/.test(p.card.type) && !p.tapped).length;

describe("the parser — exactly the fixed-{N} sentence, nothing adjacent", () => {
  it("reads the tax off all three carriers", () => {
    expect(parseAttackTax(PROPAGANDA)).toEqual({ generic: 2 });
    expect(parseAttackTax(GHOSTLY_PRISON)).toEqual({ generic: 2 });
    expect(parseAttackTax(WINDBORN_MUSE)).toEqual({ generic: 2 }); // the Flying line above it doesn't interfere
  });

  it("CREED — the {X} and color-filtered variants are NOT claimed", () => {
    // Collective Restraint's tax is a domain count, Elephant Grass' applies only to nonblack creatures.
    // Mis-reading either amount or subject is a MIS-CHARGE, which is a false positive; refusing is safe.
    expect(parseAttackTax({ oracle: "Domain — Creatures can't attack you unless their controller pays {X} for each creature they control that's attacking you, where X is the number of basic land types among lands you control." })).toBeNull();
    expect(parseAttackTax({ oracle: "Nonblack creatures can't attack you unless their controller pays {2} for each creature they control that's attacking you." })).toBeNull();
  });

  it("two taxers stack — each is its own independent restriction", () => {
    const s = combatBoard({ taxers: [PROPAGANDA, GHOSTLY_PRISON] });
    expect(attackTaxToDeclare(s, "ai")).toBe(4);
  });

  it("no taxer → zero, the common case", () => {
    expect(attackTaxToDeclare(combatBoard({}), "ai")).toBe(0);
  });
});

describe("classification — the three staples this unblocks", () => {
  it("Propaganda and Ghostly Prison flip", () => {
    expect(classifyCard(PROPAGANDA)).toBe("native-static");
    expect(classifyCard(GHOSTLY_PRISON)).toBe("native-static");
  });

  it("Windborn Muse flips (Flying + the tax, both modeled)", () => {
    expect(classifyCard(WINDBORN_MUSE)).toMatch(/^native/);
  });
});

describe("THE RESTRICTION HALF — the action is withheld when the tax can't be funded", () => {
  it("no taxer: the attack is offered with no lands at all", () => {
    expect(attackActions(combatBoard({ lands: 0 }))).toHaveLength(1);
  });

  it("THE LOAD-BEARING ONE — a taxed attack with ZERO mana available is NOT offered", () => {
    expect(attackActions(combatBoard({ lands: 0, taxers: [PROPAGANDA] }))).toHaveLength(0);
  });

  it("one land is still short of {2} — still not offered", () => {
    expect(attackActions(combatBoard({ lands: 1, taxers: [PROPAGANDA] }))).toHaveLength(0);
  });

  it("two lands funds it — offered", () => {
    expect(attackActions(combatBoard({ lands: 2, taxers: [PROPAGANDA] }))).toHaveLength(1);
  });

  it("two taxers demand {4}: three lands is short, four is enough", () => {
    expect(attackActions(combatBoard({ lands: 3, taxers: [PROPAGANDA, GHOSTLY_PRISON] }))).toHaveLength(0);
    expect(attackActions(combatBoard({ lands: 4, taxers: [PROPAGANDA, GHOSTLY_PRISON] }))).toHaveLength(1);
  });
});

describe("THE PAYMENT HALF — declaring actually spends the mana", () => {
  it("declaring a taxed attacker taps two lands; the attack still happens", () => {
    const s = combatBoard({ lands: 3, taxers: [PROPAGANDA] });
    expect(untappedLands(s)).toBe(3);
    const after = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });
    expect(after.combat.attackers).toHaveLength(1);
    expect(untappedLands(after)).toBe(1); // {2} paid — THE assertion the whole slice turns on
  });

  it("an untaxed attack spends nothing (no behavior change on an ordinary board)", () => {
    const s = combatBoard({ lands: 3 });
    const after = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });
    expect(untappedLands(after)).toBe(3);
  });

  it("the payment is logged, not silent", () => {
    const s = combatBoard({ lands: 2, taxers: [PROPAGANDA] });
    const after = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });
    expect(after.log.some((e) => e.kind === "attack-tax-paid" && e.generic === 2)).toBe(true);
  });

  it("an unpayable tax at dispatch THROWS — it never declares a free attacker", () => {
    // legalChoices withholds this action, so reaching here means the board moved underneath. Swallowing
    // it would reinstate exactly the false positive this slice removes.
    const s = combatBoard({ lands: 0, taxers: [PROPAGANDA] });
    expect(() => dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" }))
      .toThrow(/attack tax is unpayable/);
  });

  it("SEQUENTIAL TOTAL — two attackers cost {4} between them, the printed total one step at a time", () => {
    let s = combatBoard({ lands: 5, taxers: [PROPAGANDA] });
    const second = createPermanent({ id: "atk2", controller: "user", summoningSick: false,
      card: { id: "c-atk2", name: "Wolf", type: "Creature — Wolf", power: 2, toughness: 2, oracle: "", keywords: [] } });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, second] } } };
    s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk" });
    s = dispatchAction(s, { kind: "declare-attacker", playerId: "user", permanentId: "atk2" });
    expect(s.combat.attackers).toHaveLength(2);
    expect(untappedLands(s)).toBe(1); // 5 − 4
  });
});

describe("THE ORDERING PIN (CR 508.1 f→h) — an attacker can't fund itself unless it has vigilance", () => {
  const dork = (keywords) => createPermanent({
    id: "atk", controller: "user", summoningSick: false,
    card: { id: "c-dork", name: "Mana Bear", type: "Creature — Bear", power: 2, toughness: 2, keywords, oracle: `${keywords.join(", ")}\n{T}: Add {G}{G}.`.trim() },
  });

  it("a NON-vigilance mana creature is not offered — it taps to attack before it could pay", () => {
    // Its own {T} ability is the only mana on the board, and CR 508.1f has already tapped it by the time
    // costs are paid. Counting it would offer an attack the dispatcher then can't fund.
    expect(attackActions(combatBoard({ lands: 0, taxers: [PROPAGANDA], attacker: dork([]) }))).toHaveLength(0);
  });

  it("a VIGILANCE mana creature IS offered — it stays untapped and can pay with itself", () => {
    expect(attackActions(combatBoard({ lands: 0, taxers: [PROPAGANDA], attacker: dork(["Vigilance"]) }))).toHaveLength(1);
  });
});
