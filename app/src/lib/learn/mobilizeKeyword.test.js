/**
 * mobilizeKeyword.test.js — MOBILIZE N (CR 702.174), census slice 31.
 *
 * "Whenever this creature attacks, create N tapped and attacking 1/1 red Warrior creature tokens.
 *  Sacrifice them at the beginning of the next end step."
 *
 * The ability lives entirely in reminder parens (and one printing omits the reminder — "Mobilize 1" bare),
 * so detectTriggers SYNTHESIZES the attacks descriptor from the keyword, exactly like renown.
 *
 * WHY THIS WAS PARKED FOR A DAY, and the thing every future reader needs: **"attacking" is not a property
 * of the permanent.** `atom.entersAttacking` sets `permanent.attacking`, which NOTHING reads — attacking-ness
 * is membership in `state.combat.attackers`. A token minted "tapped and attacking" without an entry there
 * sits inert: never dealing combat damage, never seen by an attacking selector. Crediting the card on that
 * basis would be a classification the runtime silently never honors, which is why the earlier scoping pass
 * refused the slice outright rather than shipping the parse half.
 *
 * The other half — "sacrifice them at the beginning of the next end step" — had no lane either until the
 * CR 603.7 delayed-trigger scheduler shipped the same day. Both halves exist now, so the card is buildable.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { detectTriggers, mobilizeKeywordValue } from "./triggers.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, moveCardToZone } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { advanceStep, runStepActions, resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const REM = (n, w) => `Mobilize ${n} (Whenever this creature attacks, create ${w} tapped and attacking 1/1 red Warrior creature token${n > 1 ? "s" : ""}. Sacrifice ${n > 1 ? "them" : "it"} at the beginning of the next end step.)`;
const ZURGO = { id: "c-z", name: "Zurgo Stormrender", type: "Creature — Goblin Soldier", mana: "{1}{R}",
  power: 2, toughness: 2, oracle: REM(2, "two") };

describe("keyword reading + synthesis", () => {
  it("reads N from the reminder printing and the BARE printing alike", () => {
    expect(mobilizeKeywordValue(REM(2, "two"))).toBe(2);
    expect(mobilizeKeywordValue("Mobilize 1")).toBe(1);
    expect(mobilizeKeywordValue("Mobilize 3 (…)")).toBe(3);
  });
  it("is not invented from unrelated text", () => {
    expect(mobilizeKeywordValue("Flying")).toBe(0);
    expect(mobilizeKeywordValue("Whenever this creature attacks, mobilize the troops.")).toBe(0);
  });
  it("synthesizes ONE self-scoped attacks descriptor carrying the kind-tagged sentinel", () => {
    const d = detectTriggers(ZURGO);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ event: "attacks", scope: "self", effectClause: "[mobilize] create 2 tapped attacking warrior tokens" });
  });
  it("the sentinel parses HIGH, and only this parser models it", () => {
    expect(parseEffectClause("[mobilize] create 2 tapped attacking warrior tokens", "Creature")).toMatchObject({
      confidence: "high", atoms: [{ op: "mobilize", amount: 2 }],
    });
    expect(parseEffectClause("[mobilize-sac] sacrifice the mobilized tokens", "Creature")).toMatchObject({
      confidence: "high", atoms: [{ op: "mobilize-sac" }],
    });
  });
  it("classification credits the keyword", () => {
    expect(classifyCard(ZURGO)).toMatch(/^native/);
    expect(classifyCard({ ...ZURGO, oracle: `Deathtouch\n${REM(1, "a")}` })).toMatch(/^native/);
  });
  it("CREED — an unmodeled sibling clause still parks the whole card", () => {
    expect(classifyCard({ ...ZURGO, oracle: `${REM(2, "two")}\nEach opponent glorbulates.` })).not.toMatch(/^native/);
  });
});

describe("RUNTIME — the tokens are REAL attackers, not inert permanents", () => {
  function attackingBoard() {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const z = createPermanent({ id: "z", card: ZURGO, controller: "user", summoningSick: false });
    let st = { ...s, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s.players, user: { ...s.players.user, battlefield: [z] } } };
    const atk = legalActionsForPlayer(st, "user").find((a) => a.kind === "declare-attacker" && a.permanentId === "z");
    st = dispatchAction(st, atk);
    // Attack triggers fire at DECLARE-BLOCKERS step entry, not on the declare action itself.
    st = runStepActions(advanceStep(st));
    let g = 0; while (st.stack.length && g++ < 10) st = resolveTopOfStack(st);
    return st;
  }

  it("mints N tapped Warrior tokens", () => {
    const s = attackingBoard();
    const warriors = s.players.user.battlefield.filter((p) => p.card?.name === "Warrior");
    expect(warriors).toHaveLength(2);
    expect(warriors.every((w) => w.tapped)).toBe(true);
  });

  it("REGISTERS them in combat.attackers against the SAME defender — the load-bearing half", () => {
    const s = attackingBoard();
    const ids = s.combat.attackers.map((a) => a.permanentId);
    expect(ids).toHaveLength(3);                       // the source + its two tokens
    const defenders = new Set(s.combat.attackers.map((a) => a.defender));
    expect(defenders.size).toBe(1);                    // all attacking the same player
  });

  it("and they actually DEAL combat damage (2 + 1 + 1 = 4)", () => {
    let s = attackingBoard();
    const before = s.players.ai1.life;
    let guard = 0;
    while (guard++ < 30 && s.step !== "end") {
      s = runStepActions(advanceStep(s));
      let h = 0; while (s.stack.length && h++ < 10) s = resolveTopOfStack(s);
    }
    expect(before - s.players.ai1.life).toBe(4);
  });

  it("schedules the CR 603.7 delayed sacrifice, which fires at the next end step and consumes itself", () => {
    let s = attackingBoard();
    expect(s.delayedTriggers).toHaveLength(1);
    expect(s.delayedTriggers[0]).toMatchObject({ fireStep: "end", effectClause: "[mobilize-sac] sacrifice the mobilized tokens" });

    let guard = 0;
    while (guard++ < 30 && s.step !== "end") {
      s = runStepActions(advanceStep(s));
      let h = 0; while (s.stack.length && h++ < 10) s = resolveTopOfStack(s);
    }
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Warrior")).toHaveLength(0);
    expect(s.delayedTriggers || []).toHaveLength(0);   // fired once, then ceased to exist
    expect(s.players.user.battlefield.map((p) => p.card?.name)).toContain("Zurgo Stormrender"); // source survives
  });
});

describe("ADVERSARIAL — the tokens are independent of their source", () => {
  /**
   * Checked because the whole slice rests on the tokens being REAL combat.attackers entries rather than
   * something owned by the source. If they were bookkeeping hung off the source, removing it mid-combat
   * would silently drop their damage or strand the delayed sacrifice.
   */
  it("the source leaving combat does NOT stop the Warriors dealing damage, and the sacrifice still fires", () => {
    const s0 = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const z = createPermanent({ id: "z", card: ZURGO, controller: "user", summoningSick: false });
    let s = { ...s0, phase: "combat", step: "declare-attackers", activePlayer: "user", priorityHolder: "user", turn: 5,
      players: { ...s0.players, user: { ...s0.players.user, battlefield: [z] } } };
    s = dispatchAction(s, legalActionsForPlayer(s, "user").find((a) => a.kind === "declare-attacker"));
    s = runStepActions(advanceStep(s));
    let g = 0; while (s.stack.length && g++ < 10) s = resolveTopOfStack(s);

    s = moveCardToZone(s, { playerId: "user", fromZone: "battlefield", toZone: "graveyard", cardId: "z" });
    const before = s.players.ai1.life;
    let h = 0;
    while (h++ < 30 && s.step !== "end") {
      s = runStepActions(advanceStep(s));
      let k = 0; while (s.stack.length && k++ < 10) s = resolveTopOfStack(s);
    }
    expect(before - s.players.ai1.life).toBe(2);   // the two 1/1s connected without their source
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Warrior")).toHaveLength(0);
  });
});
