/**
 * persist.test.js — KW-PERSIST (BLITZ PS-1, CR 702.79a): undying's -1/-1 mirror, end to end.
 * "Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield
 * under its owner's control with a -1/-1 counter on it.)" — synthesized in detectTriggers (the undying
 * pipeline byte-for-byte: structural persistKeywordCount so grants never self-synthesize; the LKI
 * intervening-if off ctx.triggeringHadNoMinusCounters; the [persist] sentinel → persist-return). The
 * returned body carries the counter so the loop terminates; a 1-toughness persister returns 0/0 and
 * dies IMMEDIATELY to the in-resolver SBA (CR 704.5f) — and stays dead.
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, destroyLethalCreatures } from "./gameState.js";
import { detectTriggers, checkDiesTriggers, persistKeywordCount } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PERSIST_REMINDER =
  "Persist (When this creature dies, if it had no -1/-1 counters on it, return it to the battlefield under its owner's control with a -1/-1 counter on it.)";
const putridGoblin = (id = "pg-card") => ({
  id, name: "Putrid Goblin", type: "Creature — Zombie Goblin", power: "2", toughness: "2", mana: "{1}{B}",
  oracle: PERSIST_REMINDER,
});
const MARKER = "[persist] return it to the battlefield under its owner's control with a -1/-1 counter on it";

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
const withBattlefield = (state, pid, perms) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } });
const markLethal = (state, pid, permId) => ({ ...state, players: { ...state.players, [pid]: { ...state.players[pid],
  battlefield: state.players[pid].battlefield.map((p) => (p.id === permId ? { ...p, damageMarked: 99 } : p)) } } });
function resolveAll(state) {
  let s = flushTriggers(state, {});
  let guard = 0;
  while ((s.stack || []).length && guard++ < 20) s = resolveTopOfStack(s);
  return s;
}

describe("synthesis + routing + classify", () => {
  it("structural: the printed keyword counts; a grant never does (Cauldron of Souls)", () => {
    expect(persistKeywordCount(PERSIST_REMINDER)).toBe(1);
    expect(persistKeywordCount("Vigilance, persist")).toBe(1);
    expect(persistKeywordCount("Each of those creatures gains persist until end of turn.")).toBe(0);
  });
  it("the descriptor carries the LKI intervening-if + the marker, routes natively; the marker parses HIGH", () => {
    const [d] = detectTriggers(putridGoblin()).filter((t) => t.event === "dies");
    expect(d).toMatchObject({ event: "dies", scope: "self", interveningIf: "it had no -1/-1 counters on it" });
    expect(d.effectClause).toBe(MARKER);
    expect(triggerRoutesNatively(d)).toBe(true);
    expect(interveningIfParseable("it had no -1/-1 counters on it")).toBe(true);
    const p = parseEffectClause(MARKER, "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "persist-return" }]);
    const s = baseState();
    expect(evaluateInterveningIf(s, "it had no -1/-1 counters on it", "user", { triggeringHadNoMinusCounters: false })).toBe(false);
    expect(evaluateInterveningIf(s, "it had no -1/-1 counters on it", "user", {})).toBeNull();
  });
  it("classify: pure persist → native; Kitchen Finks (ETB gain + persist) → native-trigger", () => {
    expect(classifyCard(putridGoblin()).startsWith("native")).toBe(true);
    expect(classifyCard({ id: "kf", name: "Kitchen Finks", type: "Creature — Ouphe", power: "3", toughness: "2", mana: "{1}{G/W}{G/W}",
      oracle: "When this creature enters, you gain 2 life.\n" + PERSIST_REMINDER })).toBe("native-trigger");
  });
});

describe("engine (CREED core) — the persist loop", () => {
  it("dies with NO -1/-1 counters → returns with one; dies AGAIN → stays dead", () => {
    let s = baseState();
    s = withBattlefield(s, "user", [createPermanent({ id: "pg", card: putridGoblin(), controller: "user", summoningSick: false })]);
    s = markLethal(s, "user", "pg");
    let lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    const bf = s.players.user.battlefield.filter((p) => p.card?.name === "Putrid Goblin");
    expect(bf).toHaveLength(1);
    expect(bf[0].counters?.["-1/-1"]).toBe(1); // a 2/2 body returning as an effective 1/1
    s = markLethal(s, "user", bf[0].id);
    lethal = destroyLethalCreatures(s);
    expect(lethal.dead[0].counters).toEqual({ "-1/-1": 1 });
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Putrid Goblin")).toHaveLength(0);
    expect(s.players.user.graveyard.map((c) => c.name)).toContain("Putrid Goblin");
  });
  it("a 1-toughness persister returns 0/0 and dies IMMEDIATELY for good (CR 704.5f — no phantom body)", () => {
    let s = baseState();
    const wisp = { id: "ws-card", name: "Wisp Probe", type: "Creature — Spirit", power: "1", toughness: "1", mana: "{B}", oracle: PERSIST_REMINDER };
    s = withBattlefield(s, "user", [createPermanent({ id: "ws", card: wisp, controller: "user", summoningSick: false })]);
    s = markLethal(s, "user", "ws");
    const lethal = destroyLethalCreatures(s);
    s = checkDiesTriggers(lethal.state, lethal.dead);
    s = resolveAll(s);
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Wisp Probe")).toHaveLength(0); // never lingers
    expect(s.players.user.graveyard.filter((c) => c.name === "Wisp Probe")).toHaveLength(1);         // dead for good
  });
});
