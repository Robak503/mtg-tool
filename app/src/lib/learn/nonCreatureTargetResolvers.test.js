/**
 * nonCreatureTargetResolvers.test.js — THE DRIFT GUARD for a bug class that bit three times in one run.
 *
 * ⭐ THE PATTERN. A parser learns a non-creature noun ("untap this artifact", "regenerate target permanent",
 * "target permanent you control gains …"). The card starts classifying native. And the RUNTIME does nothing,
 * because the resolver's loop ends with `t.type === "creature"` and the cast path tags every chosen
 * non-creature target `type: "permanent"`. No classification test can see this: the tier is right, the
 * flip-diff is right, the suite is green, and the effect never happens.
 *
 * Found three times in one run — untap-self, regenerate, and pump/keyword-grant — each time only because a
 * RUNTIME assertion was written alongside the tier assertion. This file makes that habit structural: for
 * every op the parser can emit with a non-creature targetType, resolve it against a permanent-tagged target
 * and require that SOMETHING HAPPENED.
 *
 * ⚠️ HONEST LIMIT: the case list is a snapshot, taken from a corpus sweep
 * (`npm run sweep:noncreature-gates`, committed beside measure-coverage). A brand-new (op, targetType) pair
 * is NOT auto-covered — run the sweep when adding one. The sweep is the discovery tool; this is the ratchet.
 *
 * ⭐ AND THE SWEEP'S CLEAN RESULT WAS POSITIVE-CONTROLLED BEFORE BEING BELIEVED. Reverting the pump gate made
 * the probe report `pump/permanent *** NO-OP ***`, so the zero it returns is a measurement and not an
 * artifact of a probe that cannot fail — the lesson the Planar Bridge "0 of 36,068 cards affected" incident
 * cost a shipped regression to learn.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// One clause per (op, non-creature targetType) family the parser emits, from the corpus sweep.
const CASES = [
  ["destroy · artifact", "Destroy target artifact.", "Instant"],
  ["destroy · permanent", "Destroy target permanent.", "Sorcery"],
  ["destroy · nonlandPermanent", "Destroy target nonland permanent.", "Instant"],
  ["destroy · artifactOrEnchantment", "Destroy target artifact or enchantment.", "Instant"],
  ["bounce · permanent", "Return target permanent to its owner's hand.", "Instant"],
  ["bounce · nonlandPermanent", "Return target nonland permanent to its owner's hand.", "Instant"],
  ["exile · permanent", "Exile target permanent.", "Instant"],
  ["exile · artifact", "Exile target artifact.", "Instant"],
  ["tuck · permanent", "Put target permanent on top of its owner's library.", "Instant"],
  ["untap · permanent", "Untap target permanent.", "Instant"],
  ["regenerate · permanent", "Regenerate target permanent.", "Instant"],
  ["pump · permanent", "Target permanent you control gains hexproof until end of turn.", "Instant"],
];

function board() {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const ring = createPermanent({ id: "ring", card: { id: "c-ring", name: "Sol Ring", type: "Artifact", oracle: "{T}: Add {C}{C}." }, controller: "user" });
  ring.tapped = true; // so an UNTAP has something to change
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [ring] } } };
}

/** Did the resolver do ANYTHING to the permanent-tagged target? */
function acted(before, after) {
  const lk = findPermanent(after, "ring");
  if (!lk) return "left-battlefield";
  if (lk.permanent.tapped !== true || (lk.permanent.regenShields || 0) > 0) return "flags-changed";
  if ((after.continuousEffects || []).length > (before.continuousEffects || []).length) return "layer-effect";
  return null;
}

describe("⭐ every non-creature-target op ACTS on a permanent-tagged target", () => {
  for (const [label, clause, type] of CASES) {
    it(label, () => {
      const atoms = parseEffectClause(clause, type)?.atoms || [];
      expect(atoms.length, `"${clause}" no longer parses — the case list is stale`).toBeGreaterThan(0);
      const atom = atoms[0];
      // The cast path tags a chosen NON-creature target `type:"permanent"` — this is the exact shape that a
      // `t.type === "creature"` loop guard silently drops.
      const before = board();
      const after = ATOM_RESOLVERS[atom.op](before, atom, {
        controller: "user", targets: [{ type: "permanent", id: "ring", controller: "user" }], cardName: "Drift Guard",
      });
      expect(acted(before, after), `${atom.op}/${atom.targetType} resolved to a NO-OP — the card would classify native and do nothing`).not.toBeNull();
    });
  }
});

describe("⛔ the guard is not vacuous", () => {
  it("`acted` returns null for a resolver that genuinely does nothing", () => {
    const before = board();
    expect(acted(before, before)).toBeNull(); // an untouched state must read as NO-OP, or every case above passes for free
  });

  it("a creature-scoped atom handed a permanent-tagged target is still a no-op (the gates that SHOULD hold, do)", () => {
    // The three fixes opened their gates for permanent-SCOPED atoms only. A creature-scoped pump must still
    // drop a permanent-tagged target — if this ever starts acting, a gate was opened too wide.
    const before = board();
    const after = ATOM_RESOLVERS.pump(before, { op: "pump", targetType: "creature", ptDelta: { p: 1, t: 1 } },
      { controller: "user", targets: [{ type: "permanent", id: "ring" }], cardName: "Drift Guard" });
    expect(acted(before, after)).toBeNull();
  });
});
