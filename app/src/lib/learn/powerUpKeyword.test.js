/**
 * powerUpKeyword.test.js — POWER-UP, an ABILITY WORD (CR 207.2c) on an activated ability.
 * 37 corpus carriers, ZERO native before this slice; 14 flip.
 *
 * ⭐ Same shape as BOAST, which is the precedent this follows exactly: the label carries no rules meaning,
 * and the whole restriction lives in the reminder text — "(Activate each power-up ability only once. Reduce
 * the cost by its mana cost if it entered this turn.)" So the label is stripped for the cost parse, and the
 * restriction is carried as an ENFORCED fact rather than stripped and forgotten.
 *
 * ⛔⛔ THE LIMIT IS ONCE PER **GAME**, NOT PER TURN, and that one word is the whole safety property. The
 * existing ONCE-1 ledger is deliberately self-expiring — its own comment says "a record from an earlier turn
 * counts as ZERO uses" — which is right for every other carrier and exactly wrong here: reusing it unchanged
 * would hand out one free activation EVERY TURN, an engine strictly more permissive than the card. Hence
 * activationLimitScope:"game", read by BOTH the offer gate and the dispatcher stamp so they cannot drift.
 * The "still refused on a LATER TURN" test below is the only one that can tell the two scopes apart.
 *
 * ⚠️ The reminder's second clause (reduce the cost if it entered this turn) is NOT modelled. Not applying a
 * discount makes the ability cost MORE — an under-offer, the safe direction. Stated rather than hidden.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SERPENT = { name: "Serpent Specialist", type: "Creature — Human Snake Villain", mana: "{G}", power: "1", toughness: "1",
  oracle: "Deathtouch\nPower-up — {3}{G}: Put two +1/+1 counters on this creature. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" };

const st_ = (out) => out?.state || out;
function board(card = SERPENT) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < 8; i++) bf.push(createPermanent({ id: `L${i}`, card: { id: `cl${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user" }));
  const me = createPermanent({ id: "me", card: { id: "cme", ...card }, controller: "user" });
  me.summoningSick = false;
  return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", turn: 3,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: [...bf, me] } } };
}
const powerUps = (s) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "activate-ability" && a.permanentId === "me");
const countersOf = (s) => s.players.user.battlefield.find((p) => p.id === "me")?.counters?.["+1/+1"] ?? 0;

describe("the ability word is stripped and the limit is carried", () => {
  it("the cost parses without the label, limit 1, scope game", () => {
    const abs = parseActivatedAbilities(SERPENT);
    expect(abs).toHaveLength(1);
    expect(abs[0]).toMatchObject({ costStr: "{3}{G}", activationLimit: 1, activationLimitScope: "game" });
  });

  it("⛔ a plain once-each-TURN ability is untouched — no scope stamped", () => {
    const abs = parseActivatedAbilities({ name: "Plain", type: "Creature — Bear", oracle: "{1}: Draw a card. Activate only once each turn." });
    expect(abs[0].activationLimit).toBe(1);
    expect(abs[0].activationLimitScope).toBeUndefined();
  });
});

describe("⭐⭐ RUNTIME — offered once, then never again", () => {
  it("it is offered, and activating it really adds the counters", () => {
    const s = board();
    expect(powerUps(s)).toHaveLength(1);
    const after = st_(dispatchAction(s, powerUps(s)[0]));
    // The ability goes on the stack; resolve everything pending.
    let st = after;
    for (let i = 0; i < 8 && st.stack?.length; i++) st = st_(dispatchAction(st, { kind: "pass-priority", playerId: "user" }));
    expect(countersOf(st)).toBe(2);
  });

  it("⛔ NOT offered again in the SAME turn", () => {
    const s = board();
    const after = st_(dispatchAction(s, powerUps(s)[0]));
    expect(powerUps(after)).toHaveLength(0);
  });

  it("⛔⛔ NOT offered on a LATER TURN either — this is what 'only once' means (game scope)", () => {
    // The assertion that separates game scope from the per-turn ledger. With the turn-scoped reading this
    // returns 1 and the engine hands out a free activation every single turn.
    const s = board();
    const after = st_(dispatchAction(s, powerUps(s)[0]));
    const nextTurn = { ...after, turn: after.turn + 1 };
    expect(powerUps(nextTurn)).toHaveLength(0);
    const muchLater = { ...after, turn: after.turn + 9 };
    expect(powerUps(muchLater)).toHaveLength(0);
  });

  it("⛔ a per-TURN limit still re-arms next turn (the existing behaviour is untouched)", () => {
    const PLAIN = { name: "Plain Pumper", type: "Creature — Bear", mana: "{G}", power: "2", toughness: "2",
      oracle: "{3}{G}: Put two +1/+1 counters on this creature. Activate only once each turn." };
    const s = board(PLAIN);
    const after = st_(dispatchAction(s, powerUps(s)[0]));
    expect(powerUps(after)).toHaveLength(0);
    expect(powerUps({ ...after, turn: after.turn + 1 })).toHaveLength(1);   // re-armed — correct for per-turn
  });
});

describe("recognition", () => {
  it("the carriers flip", () => {
    expect(classifyCard(SERPENT)).toBe("native-activated");
    expect(classifyCard({ name: "Bold Biochemist", type: "Creature — Human Scientist", mana: "{1}{U}", power: "1", toughness: "3",
      oracle: "Power-up — {5}{U}: Put a +1/+1 counter on this creature and draw two cards. (Activate each power-up ability only once. Reduce the cost by its mana cost if it entered this turn.)" })).toBe("native-activated");
  });

  it("⛔ an unmodeled sibling clause still parks the card (whole-card CREED)", () => {
    expect(classifyCard({ ...SERPENT, name: "Ridered", oracle: `${SERPENT.oracle}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});
