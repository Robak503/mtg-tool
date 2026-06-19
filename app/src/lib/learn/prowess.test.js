/**
 * TRIG-PROWESS (CR 702.108) — prowess fires as a real cast-trigger self-pump.
 *
 * Prowess is a printed keyword ("Whenever you cast a noncreature spell, this creature gets +1/+1
 * until end of turn"). It's enforced in checkCastTriggers via the canonical descriptor → the same
 * flush → #238 self-pump path, with NO change to detectTriggers (so the coverage classifiers don't
 * churn). Engine-first: the pump must actually apply, or the keyword is a false positive.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { checkCastTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower, findPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

function stateWith(userBf, aiBf = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: userBf }, ai: { ...s.players.ai, battlefield: aiBf } } };
}
function resolveAll(s) {
  let st = s, guard = 0;
  while ((st.stack || []).length && guard++ < 25) st = resolveTopOfStack(st);
  return st;
}
const prowess = (name) => ({ id: `c-${name}`, name, type: "Creature — Monk", power: 1, toughness: 1, oracle: "Prowess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)" });
const vanilla = (name) => ({ id: `c-${name}`, name, type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
const pending = (s, spellCard, casterId) => checkCastTriggers(s, { spellCard, casterId }).pendingTriggers || [];

describe("TRIG-PROWESS — checkCastTriggers detection", () => {
  it("fires for the CASTER's prowess creature on a NONCREATURE cast only", () => {
    const s = stateWith([createPermanent({ id: "swift", card: prowess("Monastery Swiftspear"), controller: "user", summoningSick: false })]);
    expect(pending(s, { name: "Bolt", type: "Instant" }, "user")).toHaveLength(1);   // noncreature, own cast → fires
    expect(pending(s, { name: "Opt", type: "Sorcery" }, "user")).toHaveLength(1);     // sorcery is noncreature too
    expect(pending(s, { name: "Bear", type: "Creature" }, "user")).toHaveLength(0);   // creature spell → no
    expect(pending(s, { name: "Bolt", type: "Instant" }, "ai")).toHaveLength(0);      // not the controller's cast
  });

  it("does NOT fire for a non-prowess creature, and prowess is per-caster (only your own casts)", () => {
    const s = stateWith(
      [createPermanent({ id: "bear", card: vanilla("Bear"), controller: "user", summoningSick: false })],
      [createPermanent({ id: "ep", card: prowess("Enemy Monk"), controller: "ai", summoningSick: false })],
    );
    expect(pending(s, { name: "Bolt", type: "Instant" }, "user")).toHaveLength(0); // user has no prowess; ai's monk is the opponent's
    expect(pending(s, { name: "Bolt", type: "Instant" }, "ai")).toHaveLength(1);   // ai's monk fires on ai's own cast
  });
});

describe("TRIG-PROWESS — engine-first: the pump actually applies", () => {
  it("a noncreature cast pumps the prowess creature +1/+1", () => {
    let s = stateWith([createPermanent({ id: "swift", card: prowess("Monastery Swiftspear"), controller: "user", summoningSick: false })]);
    expect(creaturePower(findPermanent(s, "swift").permanent, s)).toBe(1);
    s = checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "user" });
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(creaturePower(findPermanent(s, "swift").permanent, s)).toBe(2); // self-pump landed on the prowess creature
  });

  it("two noncreature casts stack two +1/+1 pumps", () => {
    let s = stateWith([createPermanent({ id: "swift", card: prowess("Monastery Swiftspear"), controller: "user", summoningSick: false })]);
    for (let i = 0; i < 2; i++) {
      s = checkCastTriggers(s, { spellCard: { name: "Bolt", type: "Instant" }, casterId: "user" });
      s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    }
    expect(creaturePower(findPermanent(s, "swift").permanent, s)).toBe(3); // 1 + 1 + 1
  });
});

describe("TRIG-PROWESS — classification (unchanged: prowess body stays native-body, now honest)", () => {
  it("a prowess keyword body is native-body", () => {
    expect(classifyCard({ type: "Creature — Monk", name: "Monastery Swiftspear", oracle: "Haste\nProwess (Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.)" })).toBe("native-body");
    expect(classifyCard({ type: "Creature — Monk", name: "Pure Prowess", oracle: "Prowess" })).toBe("native-body");
  });
});
