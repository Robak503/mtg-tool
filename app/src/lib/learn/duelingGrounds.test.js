/**
 * DUELING GROUNDS — the GLOBAL combat cap. SHELF-85 · Atraxa, 2026-09-05.
 * "No more than one creature can attack each combat. / No more than one creature can block each combat."
 *
 * A headcount on the whole combat (CR 508.1a / 509.1a), whoever controls the source. The static parser reads the
 * sentence to a `combatCap` descriptor; a board reader takes the LOWEST cap of its kind across every battlefield; the
 * attacker enumeration returns nothing once that many attackers stand declared, the blocker enumeration once that many
 * creatures block. The defender-scoped "can attack YOU each combat" (Crawlspace) is a different restriction and parks.
 *
 * Mutation-checked: see the run ledger (docs-sk84).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseStaticAbilities, combatCapFor } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const DG = { id: "c-dg", name: "Dueling Grounds", type: "Enchantment", mana: "{1}{G}{W}", keywords: [],
  oracle: "No more than one creature can attack each combat.\nNo more than one creature can block each combat." };
const ARBITER = { id: "c-sa", name: "Silent Arbiter", type: "Artifact Creature — Construct", mana: "{4}", power: 1, toughness: 5, keywords: [],
  oracle: "No more than one creature can attack each combat.\nNo more than one creature can block each combat." };
const TWO_CAP = { id: "c-two", name: "Wide Arena", type: "Enchantment", mana: "{2}{W}", keywords: [],
  oracle: "No more than two creatures can attack each combat.\nNo more than two creatures can block each combat." };
const CRAWLSPACE = { id: "c-cs", name: "Crawlspace", type: "Artifact", mana: "{3}", keywords: [], oracle: "No more than two creatures can attack you each combat." };
const bear = (id, controller) => createPermanent({ id, controller, summoningSick: false, card: { id: `c-${id}`, name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "", keywords: [] } });

function attackBoard({ statics = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", combat: { attackers: [], blockers: [] },
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [bear("a1", "user"), bear("a2", "user"), bear("a3", "user")] },
      ai: { ...s.players.ai, battlefield: statics.map((c, i) => createPermanent({ id: `st${i}`, card: c, controller: "ai" })) } } };
}
function blockBoard({ statics = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "combat", step: "declare-blockers", activePlayer: "ai", priorityHolder: "user",
    combat: { attackers: [{ permanentId: "x1", attackingPlayer: "ai", defender: "user" }, { permanentId: "x2", attackingPlayer: "ai", defender: "user" }], blockers: [] },
    players: { ...s.players,
      user: { ...s.players.user, battlefield: [bear("b1", "user"), bear("b2", "user"), ...statics.map((c, i) => createPermanent({ id: `st${i}`, card: c, controller: "user" }))] },
      ai: { ...s.players.ai, battlefield: [bear("x1", "ai"), bear("x2", "ai")] } } };
}
const attacks = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-attacker");
const blocks = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "declare-blocker");

describe("the parser and the board reader", () => {
  it("reads one/two × attack/block; the defender-scoped Crawlspace form is refused; Dueling Grounds and Silent Arbiter flip native", () => {
    const row = { dg: parseStaticAbilities(DG).map((d) => d.combatCap), two: parseStaticAbilities(TWO_CAP).map((d) => d.combatCap), cs: parseStaticAbilities(CRAWLSPACE),
      dgTier: classifyCard(DG), saTier: classifyCard(ARBITER), csTier: classifyCard(CRAWLSPACE) };
    console.log("  WITNESS duelingGrounds", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.dg).toEqual([{ kind: "attack", max: 1 }, { kind: "block", max: 1 }]);
    expect(row.two).toEqual([{ kind: "attack", max: 2 }, { kind: "block", max: 2 }]);
    expect(row.cs.some((d) => d.combatCap)).toBe(false);
    expect(row.dgTier).toBe("native-static");
    expect(row.saTier).toMatch(/^native/);
    expect(row.csTier).not.toMatch(/^native/);
  });

  it("the reader takes the LOWEST cap across every battlefield, and null when none is out", () => {
    expect(combatCapFor(attackBoard(), "attack")).toBeNull();
    expect(combatCapFor(attackBoard({ statics: [TWO_CAP] }), "attack")).toBe(2);
    expect(combatCapFor(attackBoard({ statics: [TWO_CAP, DG] }), "attack")).toBe(1);
    expect(combatCapFor(attackBoard({ statics: [DG] }), "block")).toBe(1);
  });
});

describe("RUNTIME — the declarations stop at the cap", () => {
  it("attackers: three ready creatures under the opponent's Dueling Grounds — three declares offered, none after the first lands; without it two remain", () => {
    const s = attackBoard({ statics: [DG] });
    expect(attacks(s)).toHaveLength(3);
    const after = dispatchAction(s, attacks(s)[0]);
    expect(after.combat.attackers).toHaveLength(1);
    expect(attacks(after)).toHaveLength(0);
    const free = dispatchAction(attackBoard(), attacks(attackBoard())[0]);
    expect(attacks(free)).toHaveLength(2);
  });

  it("attackers: under the two-cap the second declare is offered and the third is not; a one-cap beside it reads one", () => {
    let s = attackBoard({ statics: [TWO_CAP] });
    s = dispatchAction(s, attacks(s)[0]);
    expect(attacks(s)).toHaveLength(2);
    s = dispatchAction(s, attacks(s)[0]);
    expect(attacks(s)).toHaveLength(0);
    let t = attackBoard({ statics: [TWO_CAP, DG] });
    t = dispatchAction(t, attacks(t)[0]);
    expect(attacks(t)).toHaveLength(0);
  });

  it("blockers: two ready blockers against two attackers under the user's own Dueling Grounds — one block, then none; without it the second blocker is still offered", () => {
    const s = blockBoard({ statics: [DG] });
    const first = blocks(s);
    expect(first.length).toBeGreaterThan(0);
    const after = dispatchAction(s, first[0]);
    expect(after.combat.blockers).toHaveLength(1);
    expect(blocks(after)).toHaveLength(0);
    const open = blockBoard();
    const afterOpen = dispatchAction(open, blocks(open)[0]);
    expect(blocks(afterOpen).length).toBeGreaterThan(0);
  });
});
