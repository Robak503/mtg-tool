/**
 * doubleCountersTriggering.test.js — DOUBLE-COUNTERS on the TRIGGERING creature (CR 121 + 608.2c).
 * Byrke, Long Ear of the Law: "Whenever a creature you control with a +1/+1 counter on it attacks, double
 * the number of +1/+1 counters ON IT."
 *
 * ⭐ BOTH HALVES ALREADY SHIPPED AND HAD NEVER MET. Counter-doubling is modeled (Primordial Hydra's
 * "on this creature", Kalonian Hydra's board-wide "on each creature you control"), and the "on it" → "on the
 * triggering creature" sentinel rewrite is modeled (Railway Brawler). The rewrite gate was simply written
 * around the verb "PUT", so the DOUBLE phrasing never reached the sentinel and arrived at the clause parser
 * carrying a raw "on it" that parser is forbidden (CREED) to bind — so the card parked.
 *
 * ⛔⛔ THE SUBJECT IS THE ATTACKER, NOT BYRKE. The tempting reuse — DOUBLE_COUNTERS_SELF's
 * countFor:{kind:"countersOnSource"} — reads ctx.sourceId, which is the WATCHER. On this card that would
 * double Byrke's own counters (usually zero, so a silent no-op) while the attacker got nothing: a card that
 * classifies native and does nothing, the exact FP class this project keeps finding. So the atom carries
 * `perTargetDouble` (the field the board-wide form already uses), which applyAddCounter resolves against each
 * RECIPIENT's own pre-mutation counter bag. The runtime tests below are what tell those two apart —
 * classification alone cannot.
 *
 * Oracle text copied from the bundled Scryfall corpus, never from memory.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { checkAttackTriggers } from "./triggers.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack } from "./gameEngine.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BYRKE = "Vigilance\nWhen Byrke enters, put a +1/+1 counter on each of up to two target creatures.\nWhenever a creature you control with a +1/+1 counter on it attacks, double the number of +1/+1 counters on it.";

const resolveAll = (s) => { let st = s; for (let i = 0; i < 12 && st.stack?.length; i++) st = resolveTopOfStack(st); return st; };

function attackBoard(counters, { watcherCounters = {} } = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const watcher = createPermanent({ id: "byrke", card: { name: "Byrke, Long Ear of the Law", type: "Legendary Creature — Rabbit Soldier", power: 4, toughness: 4, oracle: BYRKE }, controller: "user" });
  watcher.counters = { ...watcherCounters };
  const atk = createPermanent({ id: "atk", card: { name: "Atk", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
  atk.counters = { ...counters }; atk.summoningSick = false;
  return {
    ...s, phase: "combat", step: "declare-attackers", activePlayer: "user",
    combat: { attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai1" }], blockers: [] },
    players: { ...s.players, user: { ...s.players.user, battlefield: [watcher, atk] } },
  };
}
const run = (s) => resolveAll(flushTriggers(checkAttackTriggers(s)));
const countersOf = (s, id) => s.players.user.battlefield.find((p) => p.id === id)?.counters?.["+1/+1"] ?? 0;

describe("⭐⭐ RUNTIME — the ATTACKER's counters double, and Byrke's do not", () => {
  it("3 counters on the attacker → 6", () => {
    const s = run(attackBoard({ "+1/+1": 3 }));
    expect(countersOf(s, "atk")).toBe(6);
  });

  it("⛔ Byrke is NOT the subject — its own counters are untouched", () => {
    // This is the assertion that separates the correct binding from countersOnSource. With the wrong
    // referent Byrke would gain counters (or the attacker would gain Byrke's count) instead.
    const s = run(attackBoard({ "+1/+1": 3 }, { watcherCounters: { "+1/+1": 5 } }));
    expect(countersOf(s, "atk")).toBe(6);
    expect(countersOf(s, "byrke")).toBe(5);
  });

  it("1 counter → 2, and 5 → 10 (it is a double, not a fixed bonus)", () => {
    expect(countersOf(run(attackBoard({ "+1/+1": 1 })), "atk")).toBe(2);
    expect(countersOf(run(attackBoard({ "+1/+1": 5 })), "atk")).toBe(10);
  });

  it("⛔ no counter on the attacker → the trigger's own predicate fails, nothing happens", () => {
    const s = run(attackBoard({}));
    expect(countersOf(s, "atk")).toBe(0);
    expect(countersOf(s, "byrke")).toBe(0);
  });
});

describe("recognition", () => {
  it("Byrke flips", () => {
    expect(classifyCard({ name: "Byrke, Long Ear of the Law", type: "Legendary Creature — Rabbit Soldier", mana: "{4}{G}{W}", power: "4", toughness: "4", oracle: BYRKE })).toBe("native-trigger");
  });

  it("⛔ the vetted siblings are unchanged — this widened a gate, it did not rewrite them", () => {
    expect(classifyCard({ name: "Kalonian Hydra", type: "Creature — Hydra", mana: "{3}{G}{G}", power: "5", toughness: "5",
      oracle: "Trample\nWhenever this creature attacks, double the number of +1/+1 counters on each creature you control." })).toBe("native-trigger");
    expect(classifyCard({ name: "Primordial Hydra", type: "Creature — Hydra", mana: "{X}{G}{G}", power: "0", toughness: "0",
      oracle: "This creature enters with X +1/+1 counters on it.\nAt the beginning of your upkeep, double the number of +1/+1 counters on this creature.\nThis creature has trample as long as it has ten or more +1/+1 counters on it." })).toBe("native-mixed");
  });

  it("⛔ a SPELL's raw 'it' is still never bound — the sentinel is trigger-only (CREED)", () => {
    // "the triggering creature" is a phrase in zero printed oracle text; only detectTriggers writes it, and
    // only for the non-self triggering scopes. A sorcery's anaphor must stay unmodeled.
    expect(classifyCard({ name: "Raw Anaphor", type: "Sorcery", mana: "{2}{G}",
      oracle: "Double the number of +1/+1 counters on it." })).not.toMatch(/^native/);
  });

  it("⛔ a rider on the clause leaves residue → still parked (anchored ^…$)", () => {
    expect(classifyCard({ name: "Rider", type: "Creature — Rabbit", mana: "{2}{G}", power: "2", toughness: "2",
      oracle: "Whenever a creature you control with a +1/+1 counter on it attacks, double the number of +1/+1 counters on it and it gains flying until end of turn." })).not.toMatch(/^native/);
  });
});
