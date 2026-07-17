/**
 * groupNoUntap.test.js — BLITZ UT-1: the GROUP "doesn't untap" static (CR 302.6). The Winter-Orb / lock family
 * "<filter> don't untap during their controllers' untap steps." — a CONTINUOUS restriction that holds every
 * MATCHING permanent tapped through its controller's untap step, no matter who controls the static.
 *
 * Two wired pieces (metric mirrors runtime, CREED):
 *   1. RUNTIME — gameState.untapAll (groupPreventsUntap) SKIPS a matching permanent at the SAME untap-step
 *      chokepoint the stun / self (UP-1) / attached (PZ-1) machinery uses, reading the affected permanent's LIVE
 *      layer-aware type / power (not printed-only). Empty on a no-lock board (fast bail).
 *   2. METRIC — coverage.classifyGroupNoUntap flips a card native-static when its ONLY ability is a supported
 *      group no-untap static (all-or-nothing: any trigger/activated residue parks it).
 *
 * FAIL-CLOSED filter vocabulary (groupNoUntap.js): subtype Island / nonbasic land / creature power ≥N / ≤N. An
 * unsupported filter (Crackdown's "nonwhite", An-Zerrin's chosen type, "Nonland permanents", "Lands") yields NO
 * filter → the static is neither enforced nor credited (safe FN).
 *
 * Real current Oracle wording, verified against the bundled corpus (2026-07-17). Every GAINED below was audited
 * by name in the UT-1 flip-diff (5 GAINED — Choke / Back to Basics / Meekstone / Marble Titan / Juntu Stakes —
 * LOST=0).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, findPermanent, untapAll, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";
import { parseGroupNoUntapClause, groupNoUntapFiltersOf, groupNoUntapMatches } from "./groupNoUntap.js";

beforeEach(() => _resetIdsForTests());

// ─── REAL current Oracle wording (bundled Scryfall) ─────────────────────────────
const CHOKE = { name: "Choke", type: "Enchantment", mana: "{2}{G}",
  oracle: "Islands don't untap during their controllers' untap steps." };
const BACK_TO_BASICS = { name: "Back to Basics", type: "Enchantment", mana: "{2}{U}",
  oracle: "Nonbasic lands don't untap during their controllers' untap steps." };
const MEEKSTONE = { name: "Meekstone", type: "Artifact", mana: "{1}",
  oracle: "Creatures with power 3 or greater don't untap during their controllers' untap steps." };
const MARBLE_TITAN = { name: "Marble Titan", type: "Creature — Giant", mana: "{2}{W}", power: 2, toughness: 5,
  oracle: "Creatures with power 3 or greater don't untap during their controllers' untap steps." };
const JUNTU_STAKES = { name: "Juntu Stakes", type: "Artifact", mana: "{2}",
  oracle: "Creatures with power 1 or less don't untap during their controllers' untap steps." };
// PARK fixtures (unsupported filter OR extra unmodeled ability, CREED):
const CRACKDOWN = { name: "Crackdown", type: "Enchantment", mana: "{2}{W}{W}",
  oracle: "Nonwhite creatures with power 3 or greater don't untap during their controllers' untap steps." };
const AN_ZERRIN = { name: "An-Zerrin Ruins", type: "Enchantment", mana: "{2}{R}{R}",
  oracle: "As this enchantment enters, choose a creature type.\nCreatures of the chosen type don't untap during their controllers' untap steps." };
const CURSE_MARIT_LAGE = { name: "Curse of Marit Lage", type: "Enchantment", mana: "{3}{U}{U}",
  oracle: "When this enchantment enters, tap all Islands.\nIslands don't untap during their controllers' untap steps." };
const EMBARGO = { name: "Embargo", type: "Enchantment", mana: "{2}{U}",
  oracle: "Nonland permanents don't untap during their controllers' untap steps.\nAt the beginning of your upkeep, you lose 2 life." };

// ─── shared runtime harness ─────────────────────────────────────────────────────
// Build a battlefield: one lock SOURCE (its static) + a set of affected permanents, all under `owner`, all
// tapped. Runs untapAll for `owner` and returns the post-step state.
function runUntap({ source, perms, owner = "user", sourceOwner = owner } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const mk = (spec, controller) => {
    const p = createPermanent({ id: spec.id, card: { id: `c-${spec.id}`, ...spec.card }, controller });
    p.tapped = spec.tapped !== false;
    if (spec.counters) p.counters = { ...spec.counters };
    return p;
  };
  const ownerBf = (perms || []).filter((p) => (p.owner || owner) === owner).map((p) => mk(p, owner));
  const otherId = owner === "user" ? "ai" : "user";
  const otherBf = (perms || []).filter((p) => (p.owner || owner) === otherId).map((p) => mk(p, otherId));
  if (source) {
    const src = createPermanent({ id: "lock", card: { id: "c-lock", ...source }, controller: sourceOwner });
    (sourceOwner === owner ? ownerBf : otherBf).push(src);
  }
  const st = { ...s, activePlayer: owner, priorityHolder: owner,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: owner === "user" ? ownerBf : otherBf },
      ai: { ...s.players.ai, battlefield: owner === "user" ? otherBf : ownerBf } } };
  return untapAll(st, { playerId: owner });
}
const tappedOf = (state, id) => findPermanent(state, id).permanent.tapped;

// creature / land specs
const cre = (id, power, toughness = 3, extra = {}) => ({ id, card: { name: `C${id}`, type: "Creature — Beast", power, toughness }, ...extra });
const island = (id, basic = true) => ({ id, card: { name: basic ? "Island" : "Faerie Conclave", type: basic ? "Basic Land — Island" : "Land — Island" } });
const forest = (id) => ({ id, card: { name: "Forest", type: "Basic Land — Forest" } });
const nonbasic = (id) => ({ id, card: { name: "Command Tower", type: "Land" } });

// ─── 1. PARSER — the fail-closed filter vocabulary ──────────────────────────────
describe("UT-1 parser — parseGroupNoUntapClause recognizes exactly the supported filters", () => {
  it("Island subtype", () => {
    expect(parseGroupNoUntapClause("Islands don't untap during their controllers' untap steps.")).toEqual({ kind: "subtype", subtype: "Island" });
  });
  it("nonbasic land", () => {
    expect(parseGroupNoUntapClause("Nonbasic lands don't untap during their controllers' untap steps.")).toEqual({ kind: "nonbasicLand" });
  });
  it("creature power ≥ N / ≤ N", () => {
    expect(parseGroupNoUntapClause("Creatures with power 3 or greater don't untap during their controllers' untap steps.")).toEqual({ kind: "creaturePowerGte", n: 3 });
    expect(parseGroupNoUntapClause("Creatures with power 1 or less don't untap during their controllers' untap steps.")).toEqual({ kind: "creaturePowerLte", n: 1 });
  });
  it("FAIL-CLOSED — unsupported filters return null (nonwhite, chosen type, nonland permanents, plain lands/creatures)", () => {
    expect(parseGroupNoUntapClause("Nonwhite creatures with power 3 or greater don't untap during their controllers' untap steps.")).toBeNull();
    expect(parseGroupNoUntapClause("Creatures of the chosen type don't untap during their controllers' untap steps.")).toBeNull();
    expect(parseGroupNoUntapClause("Nonland permanents don't untap during their controllers' untap steps.")).toBeNull();
    expect(parseGroupNoUntapClause("Lands don't untap during their controllers' untap steps.")).toBeNull();
    expect(parseGroupNoUntapClause("Creatures don't untap during their controllers' untap steps.")).toBeNull();
  });
  it("FAIL-CLOSED — a mangled tail does not match (whole-clause anchor)", () => {
    expect(parseGroupNoUntapClause("Islands don't untap during your untap step.")).toBeNull();          // self/your form, not the group tail
    expect(parseGroupNoUntapClause("Islands don't untap during their controllers' untap steps this turn.")).toBeNull();
  });
  it("groupNoUntapFiltersOf pulls the static out of a multi-line body (Curse of Marit Lage) but ignores the ETB line", () => {
    expect(groupNoUntapFiltersOf(CURSE_MARIT_LAGE)).toEqual([{ kind: "subtype", subtype: "Island" }]);
    expect(groupNoUntapFiltersOf(EMBARGO)).toEqual([]); // "Nonland permanents" unsupported → nothing
  });
});

// ─── 2. RUNTIME — Choke (Island subtype) ────────────────────────────────────────
describe("UT-1 runtime — Choke locks Islands, leaves other lands alone", () => {
  it("a tapped Island stays tapped; a tapped Forest untaps (the lock is filtered)", () => {
    const after = runUntap({ source: CHOKE, perms: [island("isl"), forest("fst")] });
    expect(tappedOf(after, "isl")).toBe(true);   // Island locked
    expect(tappedOf(after, "fst")).toBe(false);  // Forest untaps
  });
  it("a nonbasic Island (Faerie Conclave) is also locked — the filter is the subtype, not the supertype", () => {
    const after = runUntap({ source: CHOKE, perms: [island("conc", false)] });
    expect(tappedOf(after, "conc")).toBe(true);
  });
  it("no lock on the board → the Island untaps normally (the skip is not universal)", () => {
    const after = runUntap({ perms: [island("isl")] });
    expect(tappedOf(after, "isl")).toBe(false);
  });
  it("the lock is CONTROLLER-agnostic — Choke on the opponent's battlefield still locks the active player's Islands", () => {
    const after = runUntap({ source: CHOKE, sourceOwner: "ai", perms: [island("isl")], owner: "user" });
    expect(tappedOf(after, "isl")).toBe(true);
  });
});

// ─── 3. RUNTIME — Back to Basics (nonbasic land) ────────────────────────────────
describe("UT-1 runtime — Back to Basics locks nonbasic lands only", () => {
  it("a tapped nonbasic land stays tapped; a tapped basic Forest untaps", () => {
    const after = runUntap({ source: BACK_TO_BASICS, perms: [nonbasic("nb"), forest("fst")] });
    expect(tappedOf(after, "nb")).toBe(true);
    expect(tappedOf(after, "fst")).toBe(false);
  });
});

// ─── 4. RUNTIME — Meekstone (creature power ≥ 3) & Juntu Stakes (≤ 1), LIVE power ──
describe("UT-1 runtime — power-filtered locks read LIVE power (layer/counter aware)", () => {
  it("Meekstone: a 3/3 stays tapped (boundary, ≥3); a 2/2 untaps", () => {
    const after = runUntap({ source: MEEKSTONE, perms: [cre("big", 3), cre("small", 2)] });
    expect(tappedOf(after, "big")).toBe(true);
    expect(tappedOf(after, "small")).toBe(false);
  });
  it("Meekstone reads LIVE power — a printed 2/2 with a +1/+1 counter (power 3) is locked", () => {
    const after = runUntap({ source: MEEKSTONE, perms: [cre("pumped", 2, 2, { counters: { "+1/+1": 1 } })] });
    expect(tappedOf(after, "pumped")).toBe(true); // effective power 3 ≥ 3 → locked (not the printed 2)
  });
  it("Meekstone does not lock a non-creature (an artifact with no power)", () => {
    const after = runUntap({ source: MEEKSTONE, perms: [{ id: "art", card: { name: "Signet", type: "Artifact" } }] });
    expect(tappedOf(after, "art")).toBe(false); // artifacts untap under Meekstone
  });
  it("Juntu Stakes: a 1/1 stays tapped (≤1); a 2/2 untaps", () => {
    const after = runUntap({ source: JUNTU_STAKES, perms: [cre("weak", 1, 1), cre("strong", 2)] });
    expect(tappedOf(after, "weak")).toBe(true);
    expect(tappedOf(after, "strong")).toBe(false);
  });
});

// ─── 5. RUNTIME — CREED — unsupported filter never enforces ──────────────────────
describe("UT-1 runtime — an unsupported-filter static does NOT lock anything (fail closed)", () => {
  it("Crackdown ('Nonwhite creatures…') on the board untaps a 3/3 normally — no partial enforcement", () => {
    const after = runUntap({ source: CRACKDOWN, perms: [cre("big", 3)] });
    expect(tappedOf(after, "big")).toBe(false);
  });
});

// ─── 6. PURE MATCHER — groupNoUntapMatches ──────────────────────────────────────
describe("UT-1 matcher — groupNoUntapMatches on resolved characteristics", () => {
  it("subtype / nonbasicLand / power gates", () => {
    expect(groupNoUntapMatches({ kind: "subtype", subtype: "Island" }, { subtypes: ["Island"], types: ["Land"] })).toBe(true);
    expect(groupNoUntapMatches({ kind: "subtype", subtype: "Island" }, { subtypes: ["Forest"], types: ["Land"] })).toBe(false);
    expect(groupNoUntapMatches({ kind: "nonbasicLand" }, { types: ["Land"] })).toBe(true);
    expect(groupNoUntapMatches({ kind: "nonbasicLand" }, { types: ["Basic", "Land"] })).toBe(false);
    expect(groupNoUntapMatches({ kind: "creaturePowerGte", n: 3 }, { isCreature: true, power: 3 })).toBe(true);
    expect(groupNoUntapMatches({ kind: "creaturePowerGte", n: 3 }, { isCreature: true, power: 2 })).toBe(false);
    expect(groupNoUntapMatches({ kind: "creaturePowerGte", n: 3 }, { isCreature: false, power: 9 })).toBe(false); // non-creature never matches a creature filter
    expect(groupNoUntapMatches({ kind: "creaturePowerLte", n: 1 }, { isCreature: true, power: 1 })).toBe(true);
    expect(groupNoUntapMatches({ kind: "creaturePowerLte", n: 1 }, { isCreature: true, power: 2 })).toBe(false);
  });
});

// ─── 7. COVERAGE — native flips + CREED park pins ───────────────────────────────
describe("UT-1 coverage — single-clause group locks flip native-static; riders/unsupported PARK", () => {
  it("the five shipped locks flip native-static", () => {
    expect(classifyCard(CHOKE)).toBe("native-static");
    expect(classifyCard(BACK_TO_BASICS)).toBe("native-static");
    expect(classifyCard(MEEKSTONE)).toBe("native-static");
    expect(classifyCard(MARBLE_TITAN)).toBe("native-static");
    expect(classifyCard(JUNTU_STAKES)).toBe("native-static");
  });
  it("CREED PARK — Crackdown stays body-only (nonwhite filter unsupported)", () => {
    expect(classifyCard(CRACKDOWN)).toBe("body-only");
  });
  it("CREED PARK — An-Zerrin Ruins stays body-only (chosen-type-on-enter is unmodeled)", () => {
    expect(classifyCard(AN_ZERRIN)).toBe("body-only");
  });
  it("CREED PARK — Curse of Marit Lage stays body-only (the 'tap all Islands' ETB trigger is unmodeled residue)", () => {
    expect(classifyCard(CURSE_MARIT_LAGE)).toBe("body-only");
  });
  it("CREED PARK — Embargo stays body-only (upkeep lose-life trigger + unsupported 'Nonland permanents' filter)", () => {
    expect(classifyCard(EMBARGO)).toBe("body-only");
  });
});
