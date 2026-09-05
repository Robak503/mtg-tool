/**
 * ENDLESS FOOT ASSAULT — per-opponent tapped-and-attacking tokens. SHELF-85 · Halfshell Q4, 2026-09-05.
 * "Whenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player."
 *
 * The tapped-and-attacking token existed on a COUNT (Otharri's mobilize shape) but every minted token joined combat against
 * the TRIGGER's single defender; this card names each token's OWN defender. One parser arm (`perOpponent`) and two runtime
 * reads: the count is the live opponent count at resolution (CR 608.2h), and the i-th minted token is appended to
 * combat.attackers against the i-th opponent. The trigger's defender is never consulted for this shape.
 *
 * Mutation-checked: see the run ledger (docs-sk103).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { checkAttackTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const EFA = { id: "c-efa", name: "Endless Foot Assault", type: "Enchantment", mana: "{2}{W}", keywords: ["Squad"],
  oracle: "Squad {1}{W} (As an additional cost to cast this spell, you may pay {1}{W} any number of times. When this enchantment enters, create that many tokens that are copies of it.)\nWhenever you attack, for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player." };
const CLAUSE = "for each opponent, create a 1/1 black Ninja creature token that's tapped and attacking that player";

describe("the parser", () => {
  it("the clause reads to one per-opponent tapped-and-attacking token atom; Adeline's planeswalker-choice form parks; the card flips native", () => {
    const p = parseEffectClause(CLAUSE, "Enchantment");
    const adeline = parseEffectClause("for each opponent, create a 1/1 white Human creature token that's tapped and attacking that player or a planeswalker that player controls", "Creature");
    const row = { conf: programConfidence(p), atom: p.atoms[0], adeline: programConfidence(adeline), tier: classifyCard(EFA) };
    console.log("  WITNESS endlessFootAssault", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.conf).toBe("high");
    expect(row.atom).toEqual({ op: "create-token", power: 1, toughness: 1, descriptor: "black ninja", perOpponent: true, tapped: true, entersAttacking: true, targetType: null });
    expect(row.adeline).toBe("low");
    expect(row.tier).toBe("native-trigger");
  });
});

const resolveAll = (s) => { let st = s, g = 0; while ((st.stack || []).length && !st.pendingChoice && g++ < 40) st = resolveTopOfStack(st); return st; };
/** A table with `seats` players (user + ai + ai2…), the user attacking the first opponent with one bear; the attack trigger fires. */
function attack(seats) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...b.players };
  const order = ["user", "ai"];
  if (seats === 3) { players.ai2 = { ...b.players.ai }; order.push("ai2"); }
  const efa = createPermanent({ id: "efa", card: EFA, controller: "user" });
  const bear = createPermanent({ id: "bear", card: { id: "c-bear", name: "Bear", type: "Creature — Bear", mana: "{1}{G}", power: 2, toughness: 2, keywords: [], oracle: "" }, controller: "user", summoningSick: false });
  let s = { ...b, turnOrder: order, activePlayer: "user", priorityHolder: "user", phase: "combat", step: "declare-attackers",
    players: { ...players, user: { ...players.user, battlefield: [efa, bear] } },
    combat: { attackers: [{ permanentId: "bear", attackingPlayer: "user", defender: "ai" }], blockers: [] } };
  s = checkAttackTriggers(s);
  const pending = (s.pendingTriggers || []).filter((t) => t.source?.permanentId === "efa").length;
  return { pending, out: resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets })) };
}
function ninjas(out) {
  const toks = out.players.user.battlefield.filter((p) => p.card?.token && /Ninja/.test(String(p.card?.type || "")));
  const defenders = toks.map((t) => (out.combat?.attackers || []).find((a) => a.permanentId === t.id)?.defender ?? null).sort();
  return { count: toks.length, tapped: toks.every((t) => t.tapped), defenders };
}

describe("RUNTIME — one tapped Ninja per opponent, each attacking ITS player", () => {
  it("three seats: the trigger fires once and mints two Ninjas, tapped, one in combat against EACH opponent — none against the caster", () => {
    const { pending, out } = attack(3);
    const row = { pending, ...ninjas(out), bearStillAttacking: (out.combat.attackers || []).some((a) => a.permanentId === "bear") };
    console.log("  WITNESS endlessFootAssaultThree", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: 1, count: 2, tapped: true, defenders: ["ai", "ai2"], bearStillAttacking: true });
  });

  it("two seats: one Ninja, attacking the lone opponent", () => {
    const { pending, out } = attack(2);
    const row = { pending, ...ninjas(out) };
    console.log("  WITNESS endlessFootAssaultTwo", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ pending: 1, count: 1, tapped: true, defenders: ["ai"] });
  });
});
