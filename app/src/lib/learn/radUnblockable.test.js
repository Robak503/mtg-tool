/**
 * radUnblockable.test.js — RAD-CONDITIONAL UNBLOCKABLE (Nightkin Ambusher, CR 509.1b + CR 728).
 *
 * Nightkin Ambusher = Ward {2} (keyword, modeled) + "When this creature enters, target player gets four rad
 * counters" (ETB rad trigger, modeled by the RAD subsystem) + "This creature can't be blocked as long as
 * defending player has a rad counter" (a conditional evasion static). The third clause was the SOLE blocker
 * keeping the card body-only — without it the card already classifies native-trigger. This subsystem makes the
 * static REAL (engine-first, THE CREED: a classifier flip is honest only because canBlockAttacker enforces it):
 *
 *   - isRadConditionalUnblockable(card) — the corpus-UNIQUE self-subject matcher (Nightkin Ambusher only).
 *   - canBlockAttacker — the attacker is unblockable WHILE the DEFENDING player has ≥1 rad counter, read LIVE
 *     per-defender (4P-correct), so it turns OFF the moment the defender's rad counters are gone.
 *   - isEnforcedEvasionClause credits the clause so the body classifies native-trigger (metric == runtime).
 *
 * CREED: only the exact "defending player has a rad counter" shape flips — every other conditional-unblockable
 * rider ("as long as you control …", "this turn", etc.) stays a SAFE false-negative (body-only), and the rad
 * gate is read LIVE so the card is never unblockable against an opponent who has no rad counter.
 */
import { describe, it, expect, beforeEach } from "vitest";

import { classifyCard } from "./coverage.js";
import { canBlockAttacker, isRadConditionalUnblockable, isEnforcedEvasionClause } from "./combatEvasion.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { createGameState, addRadCounters, removeRadCounters, _resetIdsForTests } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const NIGHTKIN_ORACLE =
  "Ward {2} (Whenever this creature becomes the target of a spell or ability an opponent controls, counter it unless that player pays {2}.)\n" +
  "When this creature enters, target player gets four rad counters.\n" +
  "This creature can't be blocked as long as defending player has a rad counter.";

const nightkinCard = (extra = {}) => ({ name: "Nightkin Ambusher", type: "Creature — Mutant Warrior", power: 4, toughness: 3, oracle: NIGHTKIN_ORACLE, ...extra });

function cr(name, id, controller, { power = 2, toughness = 2, oracle = "", type = "Creature — Bear" } = {}) {
  return { id, card: { name, type, power, toughness, oracle }, controller, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null };
}

// Combat state with an explicit per-seat rad map. `radByPlayer` seeds each player's radCounters.
function st({ userBf = [], aiBf = [], attackers = [], blockers = [], radByPlayer = {}, mode } = {}) {
  const base = mode === "commander"
    ? createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] })
    : createGameState({ userDeck: [], aiDeck: [] });
  const players = { ...base.players };
  for (const pid of Object.keys(players)) {
    players[pid] = { ...players[pid], radCounters: radByPlayer[pid] || 0 };
  }
  if (userBf.length) players.user = { ...players.user, battlefield: userBf };
  if (aiBf.length) players.ai = { ...players.ai, battlefield: aiBf };
  return { ...base, step: "declare-blockers", phase: "combat", activePlayer: "user", combat: { attackers, blockers }, players };
}

// ─── predicate ────────────────────────────────────────────────────────────────────
describe("isRadConditionalUnblockable — corpus-unique self matcher", () => {
  it("matches Nightkin Ambusher (name-form and templated 'this creature' form)", () => {
    expect(isRadConditionalUnblockable({ name: "Nightkin Ambusher", oracle: "Nightkin Ambusher can't be blocked as long as defending player has a rad counter." })).toBe(true);
    expect(isRadConditionalUnblockable({ name: "X", oracle: "This creature can't be blocked as long as defending player has a rad counter." })).toBe(true);
  });
  it("does NOT match a bare unblockable or an unrelated conditional (safe FN)", () => {
    expect(isRadConditionalUnblockable({ name: "X", oracle: "This creature can't be blocked." })).toBe(false);
    expect(isRadConditionalUnblockable({ name: "X", oracle: "This creature can't be blocked as long as you control an artifact." })).toBe(false);
    expect(isRadConditionalUnblockable({ name: "X", oracle: "This creature can't be blocked as long as defending player controls a Swamp." })).toBe(false);
    expect(isRadConditionalUnblockable({ name: "X", oracle: "" })).toBe(false);
  });
});

// ─── classifier flip ────────────────────────────────────────────────────────────────
describe("coverage — Nightkin Ambusher flips native-trigger; the static is credited", () => {
  it("the full Nightkin Ambusher is native-trigger (Ward + ETB rad + the conditional static all modeled)", () => {
    expect(classifyCard(nightkinCard({ mana: "{2}{B}" }))).toBe("native-trigger");
  });
  it("isEnforcedEvasionClause credits the exact clause, rejects near-misses", () => {
    expect(isEnforcedEvasionClause("this creature can't be blocked as long as defending player has a rad counter")).toBe(true);
    expect(isEnforcedEvasionClause("can't be blocked as long as defending player has a rad counter")).toBe(true);
    expect(isEnforcedEvasionClause("this creature can't be blocked as long as defending player controls a swamp")).toBe(false);
  });
});

// ─── enforcement ──────────────────────────────────────────────────────────────────
describe("canBlockAttacker — unblockable iff the DEFENDING player has ≥1 rad counter", () => {
  const attacker = () => cr("Nightkin Ambusher", "atk", "user", { power: 4, toughness: 3, oracle: NIGHTKIN_ORACLE, type: "Creature — Mutant Warrior" });
  const blocker = () => cr("Bear", "blk", "ai");

  it("defender HAS a rad counter → can't be blocked", () => {
    const s = st({ userBf: [attacker()], aiBf: [blocker()], radByPlayer: { ai: 1 } });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);
  });
  it("defender has NO rad counter → blockable normally (the condition is off)", () => {
    const s = st({ userBf: [attacker()], aiBf: [blocker()], radByPlayer: { ai: 0 } });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);
  });
  it("multiple rad counters still just gate on ≥1 (blockable=false)", () => {
    const s = st({ userBf: [attacker()], aiBf: [blocker()], radByPlayer: { ai: 5 } });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);
  });

  it("4P pod — PER-DEFENDER: unblockable only for the rad-bearing seat (CR per-defender)", () => {
    // ai1 has rad, ai2 does not. Each opponent has its own blocker.
    const blk1 = cr("Bear1", "b1", "ai1");
    const blk2 = cr("Bear2", "b2", "ai2");
    const s = st({
      mode: "commander",
      userBf: [attacker()],
      radByPlayer: { ai1: 1, ai2: 0 },
    });
    s.players.ai1 = { ...s.players.ai1, battlefield: [blk1] };
    s.players.ai2 = { ...s.players.ai2, battlefield: [blk2] };
    expect(canBlockAttacker(s, "b1", "atk", "ai1")).toBe(false); // ai1 has rad → can't block
    expect(canBlockAttacker(s, "b2", "atk", "ai2")).toBe(true);  // ai2 has no rad → can block
  });

  it("a NORMAL attacker (no rad-conditional clause) is unaffected even when defender has rad", () => {
    const s = st({ userBf: [cr("Grizzly", "atk", "user")], aiBf: [blocker()], radByPlayer: { ai: 3 } });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);
  });
});

// ─── declare-blocker enumeration (the real legalChoices path) ───────────────────────
describe("declare-blocker enumeration honors the rad-conditional exclusion", () => {
  it("defender with rad is offered NO block on Nightkin Ambusher; defender without rad IS", () => {
    const attacker = cr("Nightkin Ambusher", "atk", "user", { power: 4, toughness: 3, oracle: NIGHTKIN_ORACLE, type: "Creature — Mutant Warrior" });
    const blocker = cr("Bear", "blk", "ai");

    const withRad = st({ userBf: [attacker], aiBf: [blocker], attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], radByPlayer: { ai: 1 } });
    const blocksWith = filterActions(legalActionsForPlayer(withRad, "ai"), "declare-blocker").filter((a) => a.attackerId === "atk");
    expect(blocksWith).toHaveLength(0);

    const noRad = st({ userBf: [attacker], aiBf: [blocker], attackers: [{ permanentId: "atk", attackingPlayer: "user", defender: "ai" }], radByPlayer: { ai: 0 } });
    const blocksNo = filterActions(legalActionsForPlayer(noRad, "ai"), "declare-blocker").filter((a) => a.attackerId === "atk");
    expect(blocksNo).toHaveLength(1);
  });
});

// ─── dynamic: the gate is read LIVE (rad arriving arms it, rad leaving disarms it) ──
describe("dynamic — the rad gate tracks the defender's CURRENT rad total (read live, layer-correct)", () => {
  it("rad granted → unblockable; rad later removed (e.g. milled by radiation) → blockable again", () => {
    const attacker = cr("Nightkin Ambusher", "atk", "user", { power: 4, toughness: 3, oracle: NIGHTKIN_ORACLE, type: "Creature — Mutant Warrior" });
    let s = st({ userBf: [attacker], aiBf: [cr("Bear", "blk", "ai")], radByPlayer: { ai: 0 } });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);    // no rad yet → blockable
    s = addRadCounters(s, { playerId: "ai", amount: 2 });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(false);   // rad present → unblockable
    s = removeRadCounters(s, { playerId: "ai", amount: 2 });
    expect(canBlockAttacker(s, "blk", "atk", "ai")).toBe(true);    // rad gone → blockable again (off, not cached)
  });
});
