/**
 * GLIMMER LENS — SHELF-85 · Otharri O6 (2026-09-05). "Whenever equipped creature and at least one other creature attack,
 * draw a card." The equipped-creature attack trigger with a COMPANY condition: the attack checker drops the firing when the
 * declaration held a single attacker (one declaration, one batch — CR 508.1). On the way: the trigger splitter and the
 * attack block both knew only the singular "attacks" — the plural form never reached the classifier.
 *
 * Mutation-checked: see the run ledger (docs-sk55).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { checkAttackTriggers, detectTriggers } from "./triggers.js";
import { resolveTopOfStack, finalizeStackResolution } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const LENS = { name: "Glimmer Lens", type: "Artifact — Equipment", mana: "{1}{W}", oracle: "For Mirrodin! (When this Equipment enters, create a 2/2 red Rebel creature token, then attach this to it.)\nWhenever equipped creature and at least one other creature attack, draw a card.\nEquip {1}{W}" };
const perm = (id, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller: "user", summoningSick: false }), ...extra });
function state(attackerIds) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const bear = (id) => perm(id, { name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
  const lens = perm("lens", LENS, { attachedTo: "b1" });
  const b1 = { ...bear("b1"), attachments: ["lens"] };
  const bf = [lens, b1, bear("b2"), bear("b3")];
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    combat: { attackers: attackerIds.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })) },
    players: { ...s.players, user: { ...s.players.user, battlefield: bf, library: [{ id: "L1", name: "L1", type: "Sorcery", cmc: 1 }, { id: "L2", name: "L2", type: "Sorcery", cmc: 1 }] } },
  };
}
const lensPending = (s) => (s.pendingTriggers || []).filter((t) => t.descriptor?.withCompany).length;
const settle = (s) => { let n = finalizeStackResolution(s); while (n.stack.length && !n.pendingChoice) n = finalizeStackResolution(resolveTopOfStack(n)); return n; };

describe("classify + detect", () => {
  it("the company form is the equipped-creature attack trigger with withCompany; native-equipment", () => {
    const row = { d: detectTriggers(LENS).map((x) => [x.event, x.scope, x.withCompany]), tier: classifyCard({ ...LENS, keywords: [] }) };
    console.log("  WITNESS lensDetect", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toEqual([["attacks", "equippedCreature", true]]);
    expect(row.tier).toBe("native-equipment");
  });

  it("the base-form attack in the SPLITTER is load-bearing for Temmet / Boosted Sloop (\"Whenever you attack, draw a card, then discard a card.\" — the second comma): both triggers found, native-trigger", () => {
    const TEMMET = { name: "Temmet, Naktamun's Will", type: "Legendary Creature — Zombie Wizard", mana: "{2}{W}{U}{B}", keywords: [], oracle: `Vigilance, menace
Whenever you attack, draw a card, then discard a card.
Whenever you draw a card, Zombies you control get +1/+1 until end of turn.` };
    const row = { d: detectTriggers(TEMMET).map((x) => [x.event, x.scope]), tier: classifyCard(TEMMET) };
    console.log("  WITNESS temmetSplit", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.d).toEqual([["youAttack", "you"], ["cardDrawn", "you"]]);
    expect(row.tier).toBe("native-trigger");
  });
});

describe("the company condition", () => {
  it("the equipped bear attacking WITH another creature fires it (one trigger, one draw); the equipped bear attacking ALONE does not; two others attacking without the equipped bear does not", () => {
    const withCompany = checkAttackTriggers(state(["b1", "b2"]));
    const alone = checkAttackTriggers(state(["b1"]));
    const others = checkAttackTriggers(state(["b2", "b3"]));
    const drew = settle(withCompany);
    const row = { withCompany: lensPending(withCompany), alone: lensPending(alone), others: lensPending(others), hand: drew.players.user.hand.length };
    console.log("  WITNESS lensCompany", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.withCompany).toBe(1);
    expect(row.alone).toBe(0);
    expect(row.others).toBe(0);
    expect(row.hand).toBe(1);
  });

  it("the SELF + COMPANY twins (the flip-diff caught them firing alone): Sokka fires only with another attacker; Paired Tactician only with another WARRIOR attacker", () => {
    const mk = (self, others) => {
      const s = createGameState({ userDeck: [], aiDeck: [] });
      const bf = [self, ...others];
      return { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, combat: { attackers: bf.map((p) => ({ permanentId: p.id, attackingPlayer: "user", defender: "ai" })) }, players: { ...s.players, user: { ...s.players.user, battlefield: bf, library: [{ id: "L1", name: "L1", type: "Sorcery", cmc: 1 }] } } };
    };
    const sokka = () => perm("sokka", { name: "Sokka, Lateral Strategist", type: "Legendary Creature — Human Warrior Ally", power: 2, toughness: 2, oracle: "Vigilance\nWhenever Sokka and at least one other creature attack, draw a card." });
    const tact = () => perm("tact", { name: "Paired Tactician", type: "Creature — Human Warrior", power: 2, toughness: 2, oracle: "Whenever this creature and at least one other Warrior attack, put a +1/+1 counter on this creature." });
    const bear = (id) => perm(id, { name: `Bear ${id}`, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
    const warrior = (id) => perm(id, { name: `Warrior ${id}`, type: "Creature — Human Warrior", power: 2, toughness: 2, oracle: "" });
    const count = (s) => (s.pendingTriggers || []).filter((t) => t.descriptor?.withCompany).length;
    const row = {
      sokkaAlone: count(checkAttackTriggers(mk(sokka(), []))),
      sokkaWithBear: count(checkAttackTriggers(mk(sokka(), [bear("b")]))),
      tactAlone: count(checkAttackTriggers(mk(tact(), []))),
      tactWithBear: count(checkAttackTriggers(mk(tact(), [bear("b")]))),
      tactWithWarrior: count(checkAttackTriggers(mk(tact(), [warrior("w")]))),
    };
    console.log("  WITNESS companyTwins", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ sokkaAlone: 0, sokkaWithBear: 1, tactAlone: 0, tactWithBear: 0, tactWithWarrior: 1 });
  });
});
