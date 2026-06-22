/**
 * Tests for UPKEEP-WIN + WIN-GAME atom (Wave 3b, branch wave3b-win).
 *
 * Two pieces:
 *   (a) a win-game atom + resolver that ENDS the game via the existing termination SBA
 *       (learnSession.recordOutcomeIfChanged): "you win the game" (controller wins) and
 *       "target player loses the game" (Door to Nothingness).
 *   (b) the upkeep-win intervening-if family (Revel in Riches / Felidar Sovereign / Knuckles the
 *       Echidna): "At the beginning of your upkeep, IF <threshold>, you win the game" — the condition
 *       checked at BOTH the trigger event AND on resolution (CR 603.4), STRICTLY (never fail-open a win).
 *
 * CREED FP landmines under test:
 *   - a spelled-out threshold ("thirty artifacts", "ten Treasures") must be evaluated, not fail-open.
 *   - a condition NOT met at the upkeep → the trigger NEVER goes on the stack (CR 603.4 first check).
 *   - a condition met at the event but UNMET at resolution (Treasure sac'd in response) → NO win (second check).
 *   - an UNPARSEABLE condition → route to Arbiter, never an instant fake win.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { detectTriggers } from "./triggers.js";
import { runStepActions, resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPlayerState } from "./gameState.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { winGameClauseParser, evaluateWinThreshold, applyWinGame } from "./effects/atoms/winGame.js";
import { createLearnSession, advanceUntilDecision } from "./learnSession.js";

beforeEach(() => _resetIdsForTests());

// ─── helpers ─────────────────────────────────────────────────────────────────────
function permObj(card, controller, id, over = {}) {
  return { id, card, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null, ...over };
}
function stateWith(over = {}) {
  return { ...createGameState({ userDeck: [], aiDeck: [] }), activePlayer: "user", priorityHolder: "user", ...over };
}
function placePerms(state, perms) {
  const players = { ...state.players };
  for (const p of perms) players[p.controller] = { ...players[p.controller], battlefield: [...players[p.controller].battlefield, p] };
  return { ...state, players };
}
function triggerOnStack(state) {
  return (state.stack || []).find((s) => s.kind === "triggered-ability");
}
function pendingCount(state) {
  return (state.pendingTriggers || []).length;
}
function treasure(id) {
  return { id, name: "Treasure", type: "Artifact — Treasure", oracle: "{T}, Sacrifice this artifact: Add one mana of any color." };
}

// An upkeep state with the source on the battlefield, `user` the active player (their upkeep).
function upkeepState(perms, over = {}) {
  let state = placePerms(
    stateWith({ phase: "beginning", step: "upkeep", activePlayer: "user", priorityHolder: "user" }),
    perms,
  );
  return { ...state, ...over };
}

// Real corpus cards (verified against the bundled oracle index 2026-06-22).
const REVEL = { id: "c-revel", name: "Revel in Riches", type: "Enchantment", oracle: "Whenever a creature an opponent controls dies, create a Treasure token.\nAt the beginning of your upkeep, if you control ten or more Treasures, you win the game." };
const FELIDAR = { id: "c-fel", name: "Felidar Sovereign", type: "Creature — Cat Beast", power: 4, toughness: 6, oracle: "Vigilance\nLifelink\nAt the beginning of your upkeep, if you have 40 or more life, you win the game." };
const KNUCKLES = { id: "c-knux", name: "Knuckles the Echidna", type: "Legendary Creature — Echidna Warrior", power: 4, toughness: 4, oracle: "Double strike, trample, haste\nWhenever one or more creatures you control deal combat damage to a player, create a Treasure token.\nTreasure Hunter — At the beginning of your upkeep, if you control thirty or more artifacts, you win the game." };
const DOOR = { id: "c-door", name: "Door to Nothingness", type: "Artifact", oracle: "This artifact enters tapped.\n{W}{W}{U}{U}{B}{B}{R}{R}{G}{G}, {T}, Sacrifice this artifact: Target player loses the game." };

// ─── 1. clause parser ──────────────────────────────────────────────────────────────
describe("winGameClauseParser", () => {
  it("parses 'you win the game' → win-game / controller, non-targeted", () => {
    expect(winGameClauseParser("You win the game.")).toEqual({ op: "win-game", who: "controller", targetType: null });
  });
  it("parses 'target player loses the game' → win-game / target / lose", () => {
    expect(winGameClauseParser("Target player loses the game.")).toEqual({ op: "win-game", who: "target", outcome: "lose", targetType: "player" });
  });
  it("rejects a conditional inline win (Coalition Victory) → null (stays LOW → Arbiter)", () => {
    expect(winGameClauseParser("You win the game if you control a land of each basic land type and a creature of each color")).toBeNull();
  });
  it("rejects unrelated text → null", () => {
    expect(winGameClauseParser("Draw a card.")).toBeNull();
  });
});

// ─── 2. strict threshold evaluator (the fail-open FP guard) ────────────────────────
describe("evaluateWinThreshold (STRICT — never fail-open a win)", () => {
  function withBattlefield(controllerId, perms) {
    return { players: { [controllerId]: { ...createPlayerState({ library: [] }), battlefield: perms } } };
  }

  it("spelled cardinal 'ten Treasures' is evaluated (NOT fail-open) — false below the count", () => {
    const st = withBattlefield("user", [permObj(treasure("t1"), "user", "t1"), permObj(treasure("t2"), "user", "t2")]);
    expect(evaluateWinThreshold(st, "you control ten or more Treasures", "user")).toBe(false);
  });
  it("spelled cardinal 'ten Treasures' → true at ten", () => {
    const perms = Array.from({ length: 10 }, (_, i) => permObj(treasure(`t${i}`), "user", `t${i}`));
    const st = withBattlefield("user", perms);
    expect(evaluateWinThreshold(st, "you control ten or more Treasures", "user")).toBe(true);
  });
  it("spelled cardinal 'thirty artifacts' evaluated by type-line containment", () => {
    const arts = Array.from({ length: 30 }, (_, i) => permObj({ id: `a${i}`, name: "Rock", type: "Artifact" }, "user", `a${i}`));
    const st = withBattlefield("user", arts);
    expect(evaluateWinThreshold(st, "you control thirty or more artifacts", "user")).toBe(true);
    expect(evaluateWinThreshold(withBattlefield("user", arts.slice(0, 29)), "you control thirty or more artifacts", "user")).toBe(false);
  });
  it("'you have N or more life' (numeric)", () => {
    const st = { players: { user: { ...createPlayerState({ library: [], life: 40 }) } } };
    expect(evaluateWinThreshold(st, "you have 40 or more life", "user")).toBe(true);
    const st2 = { players: { user: { ...createPlayerState({ library: [], life: 39 }) } } };
    expect(evaluateWinThreshold(st2, "you have 40 or more life", "user")).toBe(false);
  });
  it("an UNMODELED condition returns null (NOT true) — the win must NOT fire", () => {
    const st = withBattlefield("user", []);
    expect(evaluateWinThreshold(st, "you have drawn your second card this turn", "user")).toBeNull();
    // A count word outside the allowlist (e.g. "thirteen") is unparsed → null, never fail-open.
    expect(evaluateWinThreshold(st, "you control thirteen or more artifacts", "user")).toBeNull();
  });
  it("a missing controller → false (no win)", () => {
    expect(evaluateWinThreshold({ players: {} }, "you have 40 or more life", "user")).toBe(false);
  });
});

// ─── 3. resolver: applyWinGame ─────────────────────────────────────────────────────
describe("applyWinGame resolver", () => {
  it("'you win the game' stamps wonGame on the controller", () => {
    const st = { players: { user: createPlayerState({ library: [] }) }, log: [] };
    const out = applyWinGame(st, { op: "win-game", who: "controller" }, { controller: "user" });
    expect(out.players.user.wonGame).toBe(true);
  });
  it("'target player loses the game' stamps lostGame on the chosen target", () => {
    const st = { players: { user: createPlayerState({ library: [] }), ai: createPlayerState({ library: [] }) }, log: [] };
    const out = applyWinGame(st, { op: "win-game", who: "target", outcome: "lose" }, { controller: "user", targets: [{ type: "player", id: "ai" }] });
    expect(out.players.ai.lostGame).toBe(true);
    expect(out.players.user.wonGame).toBeUndefined();
  });
  it("CR 603.4 resolution re-check — a bound condition no longer met → NO win (premature-win FP guard)", () => {
    // Two Treasures on board but the atom carries a 'ten or more' condition → not met at resolution.
    const st = { players: { user: { ...createPlayerState({ library: [] }), battlefield: [permObj(treasure("t1"), "user", "t1")] } }, log: [] };
    const out = applyWinGame(st, { op: "win-game", who: "controller", condition: "you control ten or more Treasures" }, { controller: "user" });
    expect(out.players.user.wonGame).toBeUndefined();
  });
  it("CR 603.4 resolution re-check — condition STILL met → win applies", () => {
    const perms = Array.from({ length: 10 }, (_, i) => permObj(treasure(`t${i}`), "user", `t${i}`));
    const st = { players: { user: { ...createPlayerState({ library: [] }), battlefield: perms } }, log: [] };
    const out = applyWinGame(st, { op: "win-game", who: "controller", condition: "you control ten or more Treasures" }, { controller: "user" });
    expect(out.players.user.wonGame).toBe(true);
  });
});

// ─── 4. detection — the upkeep-win trigger is detected (incl. Knuckles' ability-word label) ─────────
describe("detectTriggers — upkeep-win family", () => {
  it("Revel in Riches: detects the upkeep win trigger with the intervening-if peeled off", () => {
    const trig = detectTriggers(REVEL).find((t) => t.event === "upkeep");
    expect(trig).toMatchObject({ event: "upkeep", whose: "yours" });
    expect(trig.interveningIf).toBe("you control ten or more Treasures");
    expect(trig.effectClause).toBe("you win the game");
  });
  it("Felidar Sovereign: detects the life-threshold upkeep win", () => {
    const trig = detectTriggers(FELIDAR).find((t) => t.event === "upkeep");
    expect(trig.interveningIf).toBe("you have 40 or more life");
  });
  it("Knuckles the Echidna: the 'Treasure Hunter —' ability-word label is stripped so the trigger is detected", () => {
    const trig = detectTriggers(KNUCKLES).find((t) => t.event === "upkeep");
    expect(trig).toBeTruthy();
    expect(trig.interveningIf).toBe("you control thirty or more artifacts");
  });
});

// ─── 5. full pipeline — upkeep-win fires natively when the threshold is MET (CR 603.4 first check) ──
describe("upkeep-win pipeline (Revel in Riches)", () => {
  it("threshold MET at upkeep → trigger goes on the stack as effect-program, resolves to a win", () => {
    const perms = [permObj(REVEL, "user", "p-revel")];
    for (let i = 0; i < 10; i++) perms.push(permObj(treasure(`t${i}`), "user", `t${i}`));
    const out = runStepActions(upkeepState(perms));
    const trig = triggerOnStack(out);
    expect(trig, "trigger fires at upkeep when threshold met").toBeTruthy();
    expect(trig.payload.resolver).toBe("effect-program");
    const resolved = resolveTopOfStack(out);
    expect(resolved.players.user.wonGame).toBe(true);
  });

  it("threshold NOT met at upkeep → the ability NEVER goes on the stack (CR 603.4 first check)", () => {
    const perms = [permObj(REVEL, "user", "p-revel"), permObj(treasure("t1"), "user", "t1")]; // only 1 Treasure
    const out = runStepActions(upkeepState(perms));
    expect(triggerOnStack(out)).toBeFalsy();
    expect(pendingCount(out)).toBe(0);
    expect(out.players.user.wonGame).toBeUndefined();
  });

  it("premature-win FP — met at event, Treasure removed before resolution → NO win (CR 603.4 second check)", () => {
    const perms = [permObj(REVEL, "user", "p-revel")];
    for (let i = 0; i < 10; i++) perms.push(permObj(treasure(`t${i}`), "user", `t${i}`));
    const out = runStepActions(upkeepState(perms));
    expect(triggerOnStack(out)).toBeTruthy();
    // Simulate a Treasure sacrificed in response (drop below ten) BEFORE the trigger resolves.
    const drained = { ...out, players: { ...out.players, user: { ...out.players.user, battlefield: out.players.user.battlefield.filter((p) => p.id !== "t0" && p.id !== "t1") } } };
    const resolved = resolveTopOfStack(drained);
    expect(resolved.players.user.wonGame).toBeUndefined();
  });
});

describe("upkeep-win pipeline (Felidar Sovereign — life threshold)", () => {
  it("40+ life → win; below 40 → no trigger", () => {
    let st = upkeepState([permObj(FELIDAR, "user", "p-fel")]);
    st = { ...st, players: { ...st.players, user: { ...st.players.user, life: 40 } } };
    const out = runStepActions(st);
    expect(triggerOnStack(out)).toBeTruthy();
    expect(resolveTopOfStack(out).players.user.wonGame).toBe(true);

    let low = upkeepState([permObj(FELIDAR, "user", "p-fel")]);
    low = { ...low, players: { ...low.players, user: { ...low.players.user, life: 39 } } };
    expect(triggerOnStack(runStepActions(low))).toBeFalsy();
  });
});

// ─── 5b. termination — the wonGame/lostGame flag ENDS the game via the SBA ──────────
describe("termination SBA (recordOutcomeIfChanged) reads wonGame/lostGame", () => {
  function aggroDeck(prefix) {
    const cards = [];
    for (let i = 0; i < 25; i++) cards.push({ id: `${prefix}-f${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" });
    for (let i = 0; i < 25; i++) cards.push({ id: `${prefix}-b${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2 });
    return cards;
  }
  function setFlag(session, playerId, flag) {
    return { ...session, state: { ...session.state, players: { ...session.state.players, [playerId]: { ...session.state.players[playerId], [flag]: true } } } };
  }

  it("user wonGame → status user-wins", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = setFlag(sess, "user", "wonGame");
    const { session: out, decision } = advanceUntilDecision(sess);
    expect(out.status).toBe("user-wins");
    expect(decision.kind).toBe("game-over");
  });

  it("opponent wonGame → status ai-wins (the user lost)", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = setFlag(sess, "ai", "wonGame");
    const { session: out } = advanceUntilDecision(sess);
    expect(out.status).toBe("ai-wins");
  });

  it("the SOLE opponent lostGame (Door to Nothingness) → user-wins", () => {
    let sess = createLearnSession({ userDeck: aggroDeck("u"), opponentDeck: aggroDeck("a"), difficulty: "expert" });
    sess = setFlag(sess, "ai", "lostGame");
    const { session: out } = advanceUntilDecision(sess);
    expect(out.status).toBe("user-wins");
  });
});

describe("upkeep-win pipeline (Knuckles the Echidna — artifact threshold + ability-word label)", () => {
  it("thirty+ artifacts → win; below thirty → no trigger", () => {
    const perms = [permObj(KNUCKLES, "user", "p-knux")];
    for (let i = 0; i < 30; i++) perms.push(permObj({ id: `a${i}`, name: "Rock", type: "Artifact" }, "user", `a${i}`));
    const out = runStepActions(upkeepState(perms));
    expect(triggerOnStack(out)).toBeTruthy();
    expect(resolveTopOfStack(out).players.user.wonGame).toBe(true);

    const few = [permObj(KNUCKLES, "user", "p-knux2")];
    for (let i = 0; i < 29; i++) few.push(permObj({ id: `b${i}`, name: "Rock", type: "Artifact" }, "user", `b${i}`));
    expect(triggerOnStack(runStepActions(upkeepState(few)))).toBeFalsy();
  });
});

// ─── 6. the win-game atom parses HIGH on a bare win spell (for the cast path) ───────
describe("parseEffectProgram — bare win-game", () => {
  it("a trigger effect 'you win the game' parses to a HIGH single win-game atom", () => {
    // The effect clause as it reaches buildTriggerStack (type Instant, per the rich-trigger contract).
    const prog = parseEffectProgram({ type: "Instant", oracle: "You win the game." });
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "win-game", who: "controller", targetType: null }]);
  });
});

// ─── 7. WIN-GAME atom (a) — "target player loses the game" (Door to Nothingness) ────
describe("Door to Nothingness — 'target player loses the game'", () => {
  it("the activated-ability effect clause parses HIGH to the targeted lose-game atom", () => {
    // The colon-separated effect on Door's activated ability is "Target player loses the game."
    const effect = DOOR.oracle.split(": ").pop();
    const prog = parseEffectProgram({ type: "Instant", oracle: effect });
    expect(programConfidence(prog)).toBe("high");
    expect(prog.atoms).toEqual([{ op: "win-game", who: "target", outcome: "lose", targetType: "player" }]);
  });
});
