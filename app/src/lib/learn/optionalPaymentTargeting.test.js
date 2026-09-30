/**
 * optionalPaymentTargeting.test.js — "you may pay {N}. If you do, <TARGETED payoff>": the target POOL (the 09-06 plan's stage
 * ③ · 39, 2026-09-30).
 *
 * The optional-mana-payment wrapper carries its payoff's `targetType` so the trigger enumerates and locks the target at flush
 * (CR 603.3d; optionalPaymentTargetedPayoff.test.js pins the thread, the intent delegation and the resolution). What nothing
 * pinned was the POOL: the enumerator read the spec off the WRAPPER, which has only `targetType`, so every other targeting
 * field of the payoff was dropped — a graveyard payoff's cardFilter and graveyard scope, a creature payoff's restrictions,
 * excludeSource, a multi-count. 13 native carriers were offering targets wider than printed (an illegal target — the forbidden
 * direction). targeting.targetingAtomOf now enumerates from the payoff's chosen-target atom.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30). Pools come from expandCastChoices — the function the trigger
 * flush (gameEngine.buildTriggerStack) calls — with the trigger's source threaded; one carrier runs end to end.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, gainLife } from "./gameState.js";
import { chooseTriggerTargets, flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { checkLifegainTriggers, detectTriggers } from "./triggers.js";
import { expandCastChoices } from "./effects/targeting.js";
import { parseEffectClause } from "./effects/parser.js";
import { resolveOptionalManaPaymentChoice } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const VEINWITCH = { id: "c-vw", name: "Veinwitch Coven", type: "Creature — Vampire Warlock", mana: "{2}{B}", power: "3", toughness: "3", keywords: ["Menace"],
  oracle: "Menace\nWhenever you gain life, you may pay {B}. If you do, return target creature card from your graveyard to your hand." };
const SHIELDGUARD = { id: "c-cs", name: "Consul's Shieldguard", type: "Creature — Dwarf Soldier", mana: "{3}{W}", power: "3", toughness: "4", keywords: [],
  oracle: "When this creature enters, you get {E}{E} (two energy counters).\nWhenever this creature attacks, you may pay {E}. If you do, another target attacking creature gains indestructible until end of turn." };
const CONDUIT = { id: "c-cg", name: "Conduit Goblin", type: "Creature — Goblin Warrior", mana: "{R}{W}", power: "2", toughness: "2", keywords: [],
  oracle: "When this creature enters, you get {E}{E} (two energy counters).\nAt the beginning of combat on your turn, you may pay {E}. If you do, another target creature you control gets +1/+0 and gains haste until end of turn." };
const MASCOT = { id: "c-jm", name: "Jubilant Mascot", type: "Creature — Homunculus", mana: "{2}{W}", power: "1", toughness: "1", keywords: ["Support"],
  oracle: "At the beginning of combat on your turn, you may pay {3}{W}. If you do, support 2. (Put a +1/+1 counter on each of up to two other target creatures.)" };
const BEARS = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", power: "2", toughness: "2", keywords: [], oracle: "" });
const PLAINS = (id) => ({ id, name: "Plains", type: "Basic Land — Plains", mana: "", keywords: [], oracle: "({T}: Add {W}.)" });
const BOLT = (id) => ({ id, name: "Lightning Bolt", type: "Instant", mana: "{R}", keywords: [], oracle: "Lightning Bolt deals 3 damage to any target." });

const perm = (id, card, controller) => createPermanent({ id, card: { ...card, id: `c-${id}` }, controller, summoningSick: false });
function board({ user = [], ai = [], userGy = [], attackers = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 4, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    ...(attackers.length && { phase: "combat", step: "declare-attackers", combat: { attackers: attackers.map((id) => ({ permanentId: id, attackingPlayer: "user", defender: "ai" })), blockers: [] } }),
    players: { ...s.players, user: { ...s.players.user, battlefield: user, graveyard: userGy, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }, ai: { ...s.players.ai, battlefield: ai } } };
}
// The pool the trigger flush enumerates: the card's trigger clause, parsed as the flush parses it, through expandCastChoices
// with the trigger's source threaded (exactly buildTriggerStack's call).
function pool(s, card, sourceId) {
  const [trig] = detectTriggers(card).filter((t) => /you may pay/i.test(t.effectClause || ""));
  const program = parseEffectClause(trig.effectClause, "Instant", { sourceScoped: true });
  const choices = expandCastChoices(s, "user", program, [], { sourceId }) || [];
  return choices.map((c) => c.targets.map((t) => t.id).sort().join("+")).sort();
}

describe("the pool is the PAYOFF's printed pool, not the wrapper's bare targetType", () => {
  it("⭐ Veinwitch Coven — 'target creature card from your graveyard': the Bears only, never the Plains or the Bolt", () => {
    expect(pool(board({ user: [perm("vw", VEINWITCH, "user")], userGy: [PLAINS("pl"), BEARS("gb"), BOLT("lb")] }), VEINWITCH, "vw")).toEqual(["gb"]);
  });
  it("⭐ Consul's Shieldguard — 'another target attacking creature': the other attacker only", () => {
    const s = board({ user: [perm("cs", SHIELDGUARD, "user"), perm("atk", BEARS(), "user"), perm("home", BEARS(), "user")], ai: [perm("theirs", BEARS(), "ai")], attackers: ["cs", "atk"] });
    expect(pool(s, SHIELDGUARD, "cs")).toEqual(["atk"]);
  });
  it("⭐ Conduit Goblin — 'another target creature you control': never itself, never an opponent's", () => {
    const s = board({ user: [perm("cg", CONDUIT, "user"), perm("mine", BEARS(), "user")], ai: [perm("theirs", BEARS(), "ai")] });
    expect(pool(s, CONDUIT, "cg")).toEqual(["mine"]);
  });
  it("⭐ Jubilant Mascot — support 2, 'each of up to two OTHER target creatures': pairs and singles, never the Mascot", () => {
    const s = board({ user: [perm("jm", MASCOT, "user"), perm("a", BEARS(), "user"), perm("b", BEARS(), "user")] });
    const choices = pool(s, MASCOT, "jm");
    expect(choices.some((c) => c.split("+").includes("jm"))).toBe(false);
    expect(choices).toContain("a+b");
    console.log(`WITNESS mascotChoices ${JSON.stringify(choices)}`);
  });
});

describe("end to end — Veinwitch Coven through the real lifegain trigger, the flush, the payment", () => {
  it("⭐ gain life → the trigger locks the Bears (not the Plains beside it) → pay {B} → the Bears comes back to hand", () => {
    let s = board({ user: [perm("vw", VEINWITCH, "user")], userGy: [PLAINS("pl"), BEARS("gb")], pool: { B: 1 } });
    s = checkLifegainTriggers(gainLife(s, { playerId: "user", amount: 2 }), "user", 2);
    s = flushTriggers(s, { chooseTargets: chooseTriggerTargets });
    const locked = (s.stack || []).flatMap((o) => (o.targets || []).map((t) => t.id));
    for (let i = 0; i < 6 && (s.stack || []).length && !s.pendingChoice; i++) s = resolveTopOfStack(s);
    expect(s.pendingChoice?.kind).toBe("optional-mana-payment");
    const paid = resolveOptionalManaPaymentChoice(s, true);
    const result = { locked, hand: paid.players.user.hand.map((c) => c.name), graveyard: paid.players.user.graveyard.map((c) => c.name) };
    expect(result).toEqual({ locked: ["gb"], hand: ["Grizzly Bears"], graveyard: ["Plains"] });
    console.log(`WITNESS veinwitchPays ${JSON.stringify(result)}`);
  });
});
