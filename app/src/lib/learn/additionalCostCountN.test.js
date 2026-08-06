/**
 * BLITZ AC-1 — ADDITIONAL-COST count-of-N on the CAST path (CR 601.2f / 601.2h).
 *
 * Extends the N=1 additional-cost model (additionalCostCast.test.js) to N>1 for the two chosen-set cost
 * kinds — "sacrifice two/three/… <type>s" and "discard two/three/… cards" (pay-N-life was already numeric).
 * The whole card must be modeled: the count-N cost AND the remaining effect. Real count-N corpus cards:
 *   Bankrupt in Blood  {1}{B}  "sacrifice two creatures" → "Draw three cards."          → native-spell
 *   Phyrexian Tribute  {2}{B}  "sacrifice two creatures" → "Destroy target artifact."   → native-spell
 *   Cathartic Reunion  {1}{R}  "discard two cards"       → "Draw three cards."           → native-spell
 *   Gaea's Balance     {3}{G}  "sacrifice five lands"    → (unmodeled per-basic tutor)   → PARKS (arbiter)
 *
 * The N victims/cards are NOT enumerated combinatorially — the engine reuses the edict / each-player-discard
 * least-valuable policy (lowest MV, then power, then name, then id) to pick EXACTLY N, and offers ONE cast.
 * The CREED-critical assertions: exactly N leave play (never N-1 — the cardinal false positive), the cost is
 * UNPAYABLE (uncastable) when fewer than N are available, and the N=1 path is untouched.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// Verbatim real oracle text (Scryfall bulk, corpus scan 2026-07-17).
const BANKRUPT_IN_BLOOD = "As an additional cost to cast this spell, sacrifice two creatures.\nDraw three cards.";
const PHYREXIAN_TRIBUTE = "As an additional cost to cast this spell, sacrifice two creatures.\nDestroy target artifact.";
const CATHARTIC_REUNION = "As an additional cost to cast this spell, discard two cards.\nDraw three cards.";
const GAEAS_BALANCE = "As an additional cost to cast this spell, sacrifice five lands.\nSearch your library for a land card of each basic land type, put those cards onto the battlefield, then shuffle.";
const VILLAGE_RITES = "As an additional cost to cast this spell, sacrifice a creature.\nDraw two cards."; // N=1 baseline

const spell = (name, oracle, type = "Sorcery", mana = "{1}{B}") => ({ id: `card-${name}`, name, type, mana, oracle });

function creature(id, name, over = {}) {
  return createPermanent({ id, card: { id: `card-${id}`, name, type: "Creature — Goblin", power: over.power ?? 2, toughness: 2, oracle: over.oracle ?? "" }, controller: over.controller ?? "user", summoningSick: false });
}
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function setup({ userPerms = [], aiPerms = [], hand = [], mana = {}, library = [] } = {}) {
  let s = mainState();
  const user = { ...s.players.user, battlefield: userPerms, hand, library, manaPool: { ...s.players.user.manaPool, ...mana } };
  s = { ...s, players: { ...s.players, user, ai: { ...s.players.ai, battlefield: aiPerms } } };
  return s;
}
const casts = (state, pid = "user") => legalActionsForPlayer(state, pid).filter((a) => a.kind === "cast-spell");

// ═══ RECOGNITION — real oracle, count-of-N ════════════════════════════════════════════════════════════════
describe("AC-1 recognition — count-of-N additional costs flip when the effect is modeled", () => {
  it("Bankrupt in Blood (sacrifice two creatures → draw three) is native-spell", () => {
    expect(classifyCard(spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD, "Sorcery", "{1}{B}"))).toBe("native-spell");
  });
  it("Phyrexian Tribute (sacrifice two creatures → destroy target artifact) is native-spell", () => {
    expect(classifyCard(spell("Phyrexian Tribute", PHYREXIAN_TRIBUTE, "Sorcery", "{2}{B}"))).toBe("native-spell");
  });
  it("Cathartic Reunion (discard two cards → draw three) is native-spell", () => {
    expect(classifyCard(spell("Cathartic Reunion", CATHARTIC_REUNION, "Sorcery", "{1}{R}"))).toBe("native-spell");
  });

  // FN park guards — whole-card law: a count-N cost with an UNMODELED effect (or an unmodeled cost form) stays
  // Arbiter. A false NEGATIVE here is SAFE; a false POSITIVE would be the CREED breach.
  it("PARK: Gaea's Balance stays Arbiter — the per-basic-type tutor effect is unmodeled (cost done, effect isn't)", () => {
    expect(classifyCard(spell("Gaea's Balance", GAEAS_BALANCE, "Sorcery", "{3}{G}"))).not.toMatch(/^native/);
  });
  // ⚠️ GRADUATED 2026-08-07 (AC-MANA). This row asserted that "sacrifice two creatures OR pay {3}" was "a
  // compound we don't model". The count-N side was already modeled when the row was written; the `pay {N}`
  // side became a vetted cost kind in AC-MANA, and the AC-OR splitter composes any two vetted sides — so the
  // compound is now modeled by construction rather than by a special case.
  // ⛔ GRADUATED ONLY AFTER RUNNING BOTH PAYMENT OPTIONS, not on the parse: pay charges printed+extra
  // (pool 5 → 0) and leaves the creatures alone, sacrifice charges printed only (pool 2 → 0) and kills
  // exactly two, and with ONE creature on board the sacrifice option is not offered at all. A parse-level
  // check could not have distinguished "modeled" from "modeled and charging the wrong thing".
  it("⭐ a count-N cost with an 'or pay {N}' alternative is modeled — BOTH sides are vetted kinds", () => {
    const compound = "As an additional cost to cast this spell, sacrifice two creatures or pay {3}.\nDraw three cards.";
    expect(classifyCard(spell("Fake Compound", compound, "Sorcery", "{1}{B}"))).toBe("native-spell");
  });
  it("PARK: an OR whose OTHER side is unvetted still parks — one bad side sinks the card", () => {
    // The guard the row above used to provide, restated where it still bites: AC-OR requires BOTH sides to
    // be vetted, so a prose cost keeps the whole card at Arbiter.
    const halfBad = "As an additional cost to cast this spell, sacrifice two creatures or pay half your life.\nDraw three cards.";
    expect(classifyCard(spell("Fake HalfBad", halfBad, "Sorcery", "{1}{B}"))).not.toMatch(/^native/);
  });
  it("PARK: a self-referential count-N effect ('for each creature sacrificed') stays LOW", () => {
    const selfRef = "As an additional cost to cast this spell, sacrifice two creatures.\nDraw a card for each creature sacrificed this way.";
    expect(classifyCard(spell("Fake SelfRef", selfRef, "Sorcery", "{1}{B}"))).not.toMatch(/^native/);
  });
});

// ═══ PARSER — the count is attached; the N=1 descriptor is BYTE-IDENTICAL ══════════════════════════════════
describe("AC-1 parser — count attached for N>1, N=1 descriptor unchanged", () => {
  it("attaches {kind:'sacrifice', sacType:'creature', count:2} for 'sacrifice two creatures'", () => {
    const p = parseEffectProgram(spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD, "Sorcery", "{1}{B}"));
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature", count: 2 }]);
  });
  it("maps the plural type to the singular sacType key ('lands' → 'land', count:5)", () => {
    // Effect deliberately swapped for a modeled one so the program is HIGH and carries the cost — this pins the
    // COST parse in isolation (Gaea's Balance's real effect is LOW, so its program would be null).
    const p = parseEffectProgram(spell("FakeLandSac", "As an additional cost to cast this spell, sacrifice five lands.\nDraw a card.", "Sorcery", "{3}{G}"));
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "land", count: 5 }]);
  });
  it("attaches {kind:'discard', count:3} for 'discard three cards'", () => {
    const p = parseEffectProgram(spell("FakeDiscard3", "As an additional cost to cast this spell, discard three cards.\nDraw three cards.", "Sorcery", "{1}{R}"));
    expect(p.additionalCosts).toEqual([{ kind: "discard", count: 3 }]);
  });
  it("N=1 sacrifice descriptor is BYTE-IDENTICAL — {kind:'sacrifice', sacType:'creature'} with NO count field", () => {
    const p = parseEffectProgram(spell("Village Rites", VILLAGE_RITES, "Instant", "{B}"));
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "creature" }]);
    expect(p.additionalCosts[0]).not.toHaveProperty("count");
  });
  it("N=1 discard descriptor is BYTE-IDENTICAL — {kind:'discard', count:1}", () => {
    const p = parseEffectProgram(spell("FakeDiscard1", "As an additional cost to cast this spell, discard a card.\nDraw two cards.", "Instant", "{R}"));
    expect(p.additionalCosts).toEqual([{ kind: "discard", count: 1 }]);
  });
});

// ═══ RUNTIME — pay EXACTLY N (least-valuable policy), then resolve ═════════════════════════════════════════
describe("AC-1 runtime — count-N sacrifice pays exactly N (the cheapest N), then resolves", () => {
  it("Bankrupt in Blood sacrifices the two LEAST-valuable creatures (the expensive one survives) and draws three", () => {
    const cheapA = creature("cA", "Cheap A", { power: 1 });
    const cheapB = creature("cB", "Cheap B", { power: 1 });
    const bigC = creature("cC", "Big C", { power: 5 });
    const s = setup({ userPerms: [cheapA, cheapB, bigC], hand: [spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD)], mana: { B: 1, C: 1 }, library: [{ id: "L1" }, { id: "L2" }, { id: "L3" }, { id: "L4" }] });

    const acts = casts(s).filter((a) => a.name === "Bankrupt in Blood");
    expect(acts).toHaveLength(1);                                 // ONE policy-picked offer (no C(3,2) explosion)
    expect(acts[0].sacCountIds).toEqual(["cA", "cB"]);            // the two cheapest, per the least-valuable policy

    const afterCast = dispatchAction(s, acts[0]);
    // EXACTLY the two cheapest left play; the expensive creature survives (never N-1, never the wrong N).
    expect(afterCast.players.user.battlefield.map((p) => p.id)).toEqual(["cC"]);
    expect(afterCast.players.user.graveyard.filter((c) => ["card-cA", "card-cB"].includes(c.id))).toHaveLength(2);
    expect(afterCast.stack.some((o) => o.kind === "spell")).toBe(true);

    const afterResolve = resolveTopOfStack(afterCast);
    expect(afterResolve.players.user.hand.filter((c) => /^L/.test(c.id))).toHaveLength(3); // drew three
  });

  it("Phyrexian Tribute sacrifices two creatures AND destroys the target artifact", () => {
    const g1 = creature("g1", "Goblin 1", { power: 1 });
    const g2 = creature("g2", "Goblin 2", { power: 1 });
    const bomb = createPermanent({ id: "art1", card: { id: "card-art1", name: "Bomb", type: "Artifact", oracle: "" }, controller: "ai", summoningSick: false });
    const s = setup({ userPerms: [g1, g2], aiPerms: [bomb], hand: [spell("Phyrexian Tribute", PHYREXIAN_TRIBUTE, "Sorcery", "{2}{B}")], mana: { B: 1, C: 2 } });

    const acts = casts(s).filter((a) => a.name === "Phyrexian Tribute");
    expect(acts).toHaveLength(1);
    expect(acts[0].sacCountIds).toEqual(["g1", "g2"]);
    expect(acts[0].targets[0].id).toBe("art1");

    const afterCast = dispatchAction(s, acts[0]);
    expect(afterCast.players.user.battlefield).toHaveLength(0);   // both creatures gone as the cost
    const afterResolve = resolveTopOfStack(afterCast);
    expect(afterResolve.players.ai.battlefield.some((p) => p.id === "art1")).toBe(false); // artifact destroyed
  });

  it("does NOT sacrifice a creature the effect targets (CR 608.2b) — an artifact-creature target is excluded from the sac set", () => {
    // Phyrexian Tribute targets an artifact; make the ONLY two 'creatures' both artifact-creatures, one of which
    // is the destroy target. The targeted one must be excluded from the sac set — leaving only one legal victim,
    // so with just those two the spell is uncastable (can't sac 2 without sacrificing the target).
    const ac1 = createPermanent({ id: "ac1", card: { id: "card-ac1", name: "Golem A", type: "Artifact Creature — Golem", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    const ac2 = createPermanent({ id: "ac2", card: { id: "card-ac2", name: "Golem B", type: "Artifact Creature — Golem", power: 1, toughness: 1, oracle: "" }, controller: "user", summoningSick: false });
    const s = setup({ userPerms: [ac1, ac2], hand: [spell("Phyrexian Tribute", PHYREXIAN_TRIBUTE, "Sorcery", "{2}{B}")], mana: { B: 1, C: 2 } });
    // Every cast offer must have excluded its own target from the two sac victims; with only 2 creatures total,
    // no offer can sac 2 while sparing the target → some offers vanish. Assert no offer ever sacs its own target.
    for (const a of casts(s).filter((x) => x.name === "Phyrexian Tribute")) {
      expect(a.sacCountIds).not.toContain(a.targets[0].id);
    }
  });
});

describe("AC-1 runtime — count-N discard pays exactly N (the cheapest N), then resolves", () => {
  it("Cathartic Reunion discards two hand cards (not the spell itself) and draws three", () => {
    const h = (id, mana) => ({ id, name: id, type: "Instant", mana, oracle: "" });
    const s = setup({ hand: [spell("Cathartic Reunion", CATHARTIC_REUNION, "Sorcery", "{1}{R}"), h("h-cheap", "{R}"), h("h-mid", "{2}{R}"), h("h-pricey", "{5}{R}")], mana: { R: 1, C: 1 }, library: [{ id: "L1" }, { id: "L2" }, { id: "L3" }] });

    const acts = casts(s).filter((a) => a.name === "Cathartic Reunion");
    expect(acts).toHaveLength(1);
    expect(acts[0].discardIds).toEqual(["h-cheap", "h-mid"]);     // two cheapest; the spell + the pricey card kept
    expect(acts[0].discardIds).not.toContain("card-Cathartic Reunion");

    const afterCast = dispatchAction(s, acts[0]);
    expect(afterCast.players.user.graveyard.map((c) => c.id).sort()).toEqual(["h-cheap", "h-mid"]);
    expect(afterCast.players.user.hand.some((c) => c.id === "h-pricey")).toBe(true);
    const afterResolve = resolveTopOfStack(afterCast);
    expect(afterResolve.players.user.hand.filter((c) => /^L/.test(c.id))).toHaveLength(3);
  });
});

// ═══ CAN'T-PAY GATE — fewer than N available ⇒ uncastable (CR 601.2f) ══════════════════════════════════════
describe("AC-1 can't-pay gate — a cost you can't pay means you can't cast", () => {
  it("sacrifice-two is UNCASTABLE with only one creature", () => {
    const solo = creature("solo", "Solo", { power: 1 });
    const s = setup({ userPerms: [solo], hand: [spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD)], mana: { B: 1, C: 1 }, library: [{ id: "L1" }] });
    expect(casts(s).some((a) => a.name === "Bankrupt in Blood")).toBe(false);
  });
  it("sacrifice-two is UNCASTABLE with zero creatures", () => {
    const s = setup({ userPerms: [], hand: [spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD)], mana: { B: 1, C: 1 }, library: [{ id: "L1" }] });
    expect(casts(s).some((a) => a.name === "Bankrupt in Blood")).toBe(false);
  });
  it("discard-two is UNCASTABLE when only one OTHER card is in hand", () => {
    const only = { id: "only1", name: "only1", type: "Instant", oracle: "" };
    const s = setup({ hand: [spell("Cathartic Reunion", CATHARTIC_REUNION, "Sorcery", "{1}{R}"), only], mana: { R: 1, C: 1 }, library: [{ id: "L1" }] });
    expect(casts(s).some((a) => a.name === "Cathartic Reunion")).toBe(false);
  });
  it("count-N sacrifice is castable with exactly N (boundary)", () => {
    const a = creature("ba", "A", { power: 1 });
    const b = creature("bb", "B", { power: 1 });
    const s = setup({ userPerms: [a, b], hand: [spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD)], mana: { B: 1, C: 1 }, library: [{ id: "L1" }, { id: "L2" }, { id: "L3" }] });
    const acts = casts(s).filter((x) => x.name === "Bankrupt in Blood");
    expect(acts).toHaveLength(1);
    expect(acts[0].sacCountIds).toEqual(["ba", "bb"]);
  });
});

// ═══ FAIL-FAST — the dispatcher never casts having paid fewer than N ═══════════════════════════════════════
describe("AC-1 fail-fast — a malformed count-N action throws rather than underpaying", () => {
  it("dispatching a sacrifice-two with only one frozen victim throws (never sac N-1)", () => {
    const a = creature("fa", "A", { power: 1 });
    const b = creature("fb", "B", { power: 1 });
    const s = setup({ userPerms: [a, b], hand: [spell("Bankrupt in Blood", BANKRUPT_IN_BLOOD)], mana: { B: 1, C: 1 }, library: [{ id: "L1" }] });
    const action = casts(s).find((x) => x.name === "Bankrupt in Blood");
    const underpaid = { ...action, sacCountIds: ["fa"] }; // dropped one victim
    expect(() => dispatchAction(s, underpaid)).toThrow(/sacrific/i);
  });
  it("dispatching a discard-two with only one frozen card throws (never discard N-1)", () => {
    const h = (id) => ({ id, name: id, type: "Instant", oracle: "" });
    const s = setup({ hand: [spell("Cathartic Reunion", CATHARTIC_REUNION, "Sorcery", "{1}{R}"), h("d1"), h("d2")], mana: { R: 1, C: 1 }, library: [{ id: "L1" }] });
    const action = casts(s).find((x) => x.name === "Cathartic Reunion");
    const underpaid = { ...action, discardIds: ["d1"] };
    expect(() => dispatchAction(s, underpaid)).toThrow(/discard/i);
  });
});

// ═══ N=1 UNTOUCHED — the single-sac path still enumerates per-victim (sacCreatureId, not sacCountIds) ═══════
describe("AC-1 does not perturb the N=1 additional-cost path", () => {
  it("Village Rites (sacrifice A creature) still offers ONE cast per victim with sacCreatureId (not sacCountIds)", () => {
    const g1 = creature("v1", "Vic 1", { power: 1 });
    const g2 = creature("v2", "Vic 2", { power: 3 });
    const s = setup({ userPerms: [g1, g2], hand: [spell("Village Rites", VILLAGE_RITES, "Instant", "{B}")], mana: { B: 1 }, library: [{ id: "L1" }, { id: "L2" }] });
    const acts = casts(s).filter((a) => a.name === "Village Rites");
    expect(acts.map((a) => a.sacCreatureId).sort()).toEqual(["v1", "v2"]); // one per victim — a real choice
    for (const a of acts) expect(a.sacCountIds).toBeUndefined();           // never the count-N field
  });
});
