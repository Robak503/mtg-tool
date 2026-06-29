/**
 * ===== REVEAL-TOP-DRAIN-BY-MV (Yuriko, the Tiger's Shadow) ===== the commander-trigger native.
 *
 * "Whenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put
 * that card into your hand. Each opponent loses life equal to that card's mana value." The NOVEL part is the
 * drain magnitude: a value generated MID-RESOLUTION (the revealed card's mana value), threaded from the
 * reveal-top-to-hand atom (which stamps state.revealedCardMV, mirroring roll-d20 → state.diceRoll) into a
 * lose-life eachOpponent atom that reads it via amountCount:{kind:"revealedCardMV"} (countForSpec). The drain
 * uses the EXACT drawn card's MV (never a guess / board count), and EACH OPPONENT (not the controller) loses
 * it — correct in 1v1 AND multiplayer.
 *
 * Detection already worked (combatDamageToPlayer + subtypeYouControl, Ninja filter — the KW-NINJUTSU keyword
 * is modeled keyword-only and doesn't block native); this slice adds the EFFECT so the whole card flips native.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "../../triggers.js";
import { parseEffectClause, parseEffectProgram, programConfidence, programNeedsChosenTarget } from "../parser.js";
import { classifyCard, isNativeTier, permanentTriggersCovered } from "../../coverage.js";
import { applyRevealTopToHand } from "./library.js";
import { _resetIdsForTests, createGameState, createPermanent, opponentsOf } from "../../gameState.js";
import { checkCombatDamageTriggers } from "../../triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "../../gameEngine.js";

beforeEach(() => _resetIdsForTests());

const YURIKO_ORACLE =
  "Commander ninjutsu {U}{B} ({U}{B}, Return an unblocked attacker you control to hand: Put this card onto the battlefield from your hand or the command zone tapped and attacking.)\n" +
  "Whenever a Ninja you control deals combat damage to a player, reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card’s mana value.";
const YURIKO = {
  name: "Yuriko, the Tiger’s Shadow",
  type_line: "Legendary Creature — Human Ninja",
  oracle_text: YURIKO_ORACLE,
  mana_cost: "{1}{U}{B}",
  cmc: 3,
};

describe("REVEAL-TOP-DRAIN-BY-MV — classification + parse", () => {
  it("Yuriko classifies NATIVE (was body-only — the combat-damage trigger is the only blocker; ninjutsu is keyword-only)", () => {
    // The whole card flips into a NATIVE tier (the exact tier — native-body vs native-trigger — depends on
    // enrichment fields, but native-tier membership is what "the commander is native" means). The trigger's
    // effect routing is the load-bearing piece: permanentTriggersCovered must now hold (it was false before).
    expect(isNativeTier(classifyCard(YURIKO))).toBe(true);
    expect(permanentTriggersCovered({ ...YURIKO, oracle: YURIKO.oracle_text, type: YURIKO.type_line })).toBe(true);
  });

  it("the trigger detects (combatDamageToPlayer / subtypeYouControl / Ninja) and its effect parses HIGH to the two-atom sequence", () => {
    const trigs = detectTriggers(YURIKO);
    expect(trigs).toHaveLength(1);
    expect(trigs[0]).toMatchObject({ event: "combatDamageToPlayer", scope: "subtypeYouControl", subtypeFilter: "Ninja" });
    const p = parseEffectClause(trigs[0].effectClause, YURIKO.type_line);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toMatchObject([
      { op: "reveal-top-to-hand", targetType: null },
      { op: "lose-life", who: "eachOpponent", amountCount: { kind: "revealedCardMV", per: 1 }, targetType: null },
    ]);
    // Non-targeted (each-opponent + reveal-to-hand) → routes natively on the trigger flush (no chosen target).
    expect(programNeedsChosenTarget(p)).toBe(false);
  });

  it("the two-sentence effect parses identically as a standalone clause (collapsed matcher, not the splitter)", () => {
    const p = parseEffectProgram({
      type: "Instant",
      oracle: "Reveal the top card of your library and put that card into your hand. Each opponent loses life equal to that card’s mana value.",
    });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["reveal-top-to-hand", "lose-life"]);
  });
});

// ── runtime helpers (mirroring cdmgPayoff.test.js's combat-damage flush pattern) ──
function twoPlayerWith(over = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user",
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: over.user || [], library: over.lib || [], hand: [], life: 40 },
      ai: { ...s.players.ai, battlefield: [], library: [], hand: [], life: 40 },
    },
  };
}
function makeYurikoPerm(id = "yuriko", controller = "user") {
  return createPermanent({
    id,
    card: { id: "c-" + id, name: "Yuriko, the Tiger’s Shadow", type: "Legendary Creature — Human Ninja", power: 1, toughness: 3, oracle: YURIKO_ORACLE },
    controller, summoningSick: false,
  });
}
// A Ninja that is NOT Yuriko (proves the trigger fires off ANY Ninja the controller controls, not just the source).
function makeOtherNinja(id = "ninja2", controller = "user") {
  return createPermanent({
    id,
    card: { id: "c-" + id, name: "Ingenious Infiltrator", type: "Creature — Faerie Ninja", power: 1, toughness: 4, oracle: "" },
    controller, summoningSick: false,
  });
}
function runCombatDamage(s, attackerId, attackingPlayer, defender, amount) {
  let next = checkCombatDamageTriggers(s, [{ kind: "combat-damage-player", attackerId, attackingPlayer, defender, amount }]);
  next = flushTriggers(next, { chooseTargets: chooseTriggerTargets });
  let g = 0;
  while ((next.stack || []).length && g++ < 30) next = resolveTopOfStack(next);
  return next;
}

describe("REVEAL-TOP-DRAIN-BY-MV — runtime (1v1)", () => {
  it("Yuriko connects → top card (MV 5) to hand AND the opponent loses exactly 5 (the drawn card's MV)", () => {
    const top = { id: "top5", name: "Big Spell", type: "Sorcery", mana_cost: "{3}{U}{B}", cmc: 5 };
    const filler = Array.from({ length: 4 }, (_, i) => ({ id: `f${i}`, name: `F${i}`, type: "Instant" }));
    let s = twoPlayerWith({ user: [makeYurikoPerm()], lib: [top, ...filler] });
    s = runCombatDamage(s, "yuriko", "user", "ai", 1);

    expect(s.revealedCardMV).toBe(5);                         // captured mid-resolution
    expect(s.players.user.hand.some((c) => c.id === "top5")).toBe(true); // the revealed card went to hand
    expect(s.players.user.hand).toHaveLength(1);
    expect(s.players.ai.life).toBe(35);                       // 40 − 5 (the EXACT drawn card's MV)
    expect(s.players.user.life).toBe(40);                     // each OPPONENT loses — never the controller
  });

  it("the drain reads the ACTUAL drawn card's MV, not a guess: a 0-MV top card drains 0 (clean no-op)", () => {
    const top0 = { id: "land", name: "Wastes", type: "Basic Land", mana_cost: "", cmc: 0 };
    let s = twoPlayerWith({ user: [makeYurikoPerm()], lib: [top0, { id: "f", name: "F", type: "Instant" }] });
    s = runCombatDamage(s, "yuriko", "user", "ai", 1);
    expect(s.revealedCardMV).toBe(0);
    expect(s.players.user.hand.some((c) => c.id === "land")).toBe(true); // still drawn to hand
    expect(s.players.ai.life).toBe(40);                                  // MV 0 → no life lost
  });

  it("fires off ANOTHER Ninja the controller controls (subtype scope, not just the source) and an empty library is a clean no-op", () => {
    // Empty library: reveal nothing → MV 0 → no drain, no draw (never a fabricated value).
    let s = twoPlayerWith({ user: [makeYurikoPerm(), makeOtherNinja()], lib: [] });
    s = runCombatDamage(s, "ninja2", "user", "ai", 1); // the OTHER Ninja connects
    expect((s.pendingTriggers || []).length).toBe(0);  // (already flushed) — sanity: it did flush
    expect(s.revealedCardMV).toBe(0);
    expect(s.players.user.hand).toHaveLength(0);
    expect(s.players.ai.life).toBe(40);
  });

  it("a non-Ninja attacker does NOT fire Yuriko's trigger (subtype gate)", () => {
    const goblin = createPermanent({
      id: "gob", card: { id: "c-gob", name: "Goblin", type: "Creature — Goblin", power: 2, toughness: 2, oracle: "" }, controller: "user", summoningSick: false,
    });
    const top = { id: "t", name: "Spell", type: "Sorcery", mana_cost: "{2}", cmc: 2 };
    let s = twoPlayerWith({ user: [makeYurikoPerm(), goblin], lib: [top] });
    s = runCombatDamage(s, "gob", "user", "ai", 2); // the GOBLIN connects, not a Ninja
    expect(s.players.user.hand).toHaveLength(0);     // no reveal
    expect(s.players.ai.life).toBe(40);              // no drain
  });
});

describe("REVEAL-TOP-DRAIN-BY-MV — runtime (multiplayer pod)", () => {
  it("in a 4-player pod EACH of the 3 opponents loses the drawn card's MV; the controller never self-drains", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []], startingLife: 40 });
    const p0 = s.turnOrder[0];
    const opps = s.turnOrder.slice(1);
    expect(opponentsOf(s, p0)).toEqual(opps); // 3 opponents
    const top = { id: "top3", name: "Mid Spell", type: "Sorcery", mana_cost: "{1}{R}{G}", cmc: 3 };
    s = { ...s, activePlayer: p0, players: { ...s.players, [p0]: { ...s.players[p0], battlefield: [makeYurikoPerm("yuriko", p0)], library: [top], hand: [] } } };
    s = runCombatDamage(s, "yuriko", p0, opps[0], 1);

    expect(s.revealedCardMV).toBe(3);
    for (const opp of opps) expect(s.players[opp].life).toBe(37); // 40 − 3, EACH opponent
    expect(s.players[p0].life).toBe(40);                          // controller untouched
    expect(s.players[p0].hand.some((c) => c.id === "top3")).toBe(true);
  });
});

describe("REVEAL-TOP-DRAIN-BY-MV — CREED guards", () => {
  it("a near-miss effect (drain by a DIFFERENT magnitude phrasing) stays LOW → Arbiter (no fabricated MV)", () => {
    // "each opponent loses 3 life" is a FIXED drain (handled separately) — proves the collapsed matcher is
    // anchored to the MV form, not a blanket reveal+drain. And a reveal with an UNMODELED rider stays low.
    const p = parseEffectProgram({
      type: "Instant",
      oracle: "Reveal the top card of your library and put that card into your hand. Each opponent loses life equal to twice that card’s mana value.",
    });
    expect(programConfidence(p)).toBe("low"); // "twice that card's mana value" is not modeled → Arbiter
  });

  it("the standalone reveal-top-to-hand atom stamps state.revealedCardMV (the mid-resolution capture channel)", () => {
    let s = twoPlayerWith({ user: [], lib: [{ id: "c", name: "C", type: "Sorcery", mana_cost: "{4}{U}", cmc: 5 }] });
    s = applyRevealTopToHand(s, { op: "reveal-top-to-hand" }, { controller: "user" });
    expect(s.revealedCardMV).toBe(5);
    expect(s.players.user.hand.some((c) => c.id === "c")).toBe(true);
    expect(s.players.user.library).toHaveLength(0);
  });
});
