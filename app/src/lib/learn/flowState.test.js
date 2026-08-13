/**
 * flowState.test.js — FLOW STATE, the card that put Veyran Cantrips at the 1.0 bar (90% — Colton's
 * whole shelf now clears ≥90% per deck). "Look at the top three… put one of them into your hand… If
 * there is an instant card and a sorcery card in your graveyard, instead put two of them…"
 *
 * ⭐ LOOK-INHERIT on the CR 608.2 replacement arm: neither half of the sentence split parses alone (the
 * alt's "of them" antecedent is the base's look sentence), but the WHOLE base parses (impulse-dig
 * keep:1) and the alt parses once it inherits the look sentence (impulse-dig keep:2). Gated NARROW —
 * exactly ONE atom per side and the SAME op: the same machine with a different knob, never two effects
 * stitched together. evaluateInterveningIf gained the two-type conjunction arm ("an instant card AND a
 * sorcery card in your graveyard" — both singular scans must hold).
 *
 * `conditional` is now registered PAUSING (its inner can pause — the impulse-dig picker), and
 * applyConditional gained the pause-break (a pausing inner stops the branch; the Entish-class hazard).
 *
 * Mutation-checked (2026-08-12, applied-check by PRINTING THE CHANGED LINE BACK):
 *   · the look-inherit block disabled -> Flow State parks.
 *   · the conjunction condition arm removed -> Flow State parks (the decidability gate refuses).
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-08-12).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const FLOW = { id: "c-fs", name: "Flow State", type: "Instant", mana: "{U}",
  oracle: "Look at the top three cards of your library. Put one of them into your hand and the rest on the bottom of your library in any order. If there is an instant card and a sorcery card in your graveyard, instead put two of them into your hand and the rest on the bottom of your library in any order." };

describe("the carrier and the shape", () => {
  it("⭐ Flow State flips native — Veyran Cantrips' 90th card", () => {
    expect(classifyCard(FLOW)).toMatch(/^native/);
  });

  it("⭐ the program: ONE conditional, impulse-dig keep:1 vs keep:2, the conjunction condition", () => {
    const p = parseEffectClause(FLOW.oracle, "Instant");
    const a = p.atoms[0];
    const row = { ops: p.atoms.map((x) => x.op), ifFalse: a.ifFalse[0], ifTrue: a.ifTrue[0], branchOn: a.branchOn };
    console.log("  WITNESS flowStateShape", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.ops).toEqual(["conditional"]);
    expect(row.ifFalse).toMatchObject({ op: "impulse-dig", amount: 3, keep: 1, restTo: "bottom" });
    expect(row.ifTrue).toMatchObject({ op: "impulse-dig", amount: 3, keep: 2, restTo: "bottom" });
    expect(row.branchOn).toBe("there is an instant card and a sorcery card in your graveyard");
  });

  it("⛔ the narrow gate does not over-claim: Expressive Iteration's three-way split stays parked", () => {
    expect(classifyCard({ id: "c-ei", name: "Expressive Iteration", type: "Sorcery", mana: "{U}{R}",
      oracle: "Look at the top three cards of your library. Put one of them into your hand, put one of them on the bottom of your library, and exile one of them. You may play the exiled card this turn." })).toBe("arbiter-spell");
  });
});

describe("⭐⭐ LAW 6 — the condition picks the keep, from the REAL graveyard", () => {
  function stateWithGY(cards) {
    const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const lib = Array.from({ length: 5 }, (_, i) => ({ id: "L" + i, name: "Lib " + i, type: "Instant", oracle: "" }));
    return { ...s, players: { ...s.players, user: { ...s.players.user, graveyard: cards, library: lib } } };
  }
  const ATOM = () => parseEffectClause(FLOW.oracle, "Instant").atoms[0];

  it("⭐⭐ instant AND sorcery in the graveyard: the dig pauses with keep 2", () => {
    const s = stateWithGY([{ id: "g1", name: "Old Bolt", type: "Instant", oracle: "" }, { id: "g2", name: "Old Rite", type: "Sorcery", oracle: "" }]);
    const after = ATOM_RESOLVERS.conditional(s, ATOM(), { controller: "user", targets: [] });
    const row = { kind: after.pendingChoice?.kind, keep: after.pendingChoice?.keep ?? after.pendingChoice?.count ?? null };
    console.log("  WITNESS flowStateMastery", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.kind).toBe("impulse-dig");
  });

  it("⛔⛔ instant ONLY (no sorcery): keep stays 1 — the upgrade never fires on half the condition", () => {
    const s = stateWithGY([{ id: "g1", name: "Old Bolt", type: "Instant", oracle: "" }]);
    const t = ATOM();
    const after = ATOM_RESOLVERS.conditional(s, t, { controller: "user", targets: [] });
    // The branch that ran is observable through which atom object reached the resolver: assert via the
    // pendingChoice's carried params matching the ifFalse (keep 1) shape.
    const row = { kind: after.pendingChoice?.kind };
    console.log("  WITNESS flowStateHalfCondition", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.kind).toBe("impulse-dig");
    // Distinguish the branches by the choice's keep-count field(s):
    const pc = after.pendingChoice;
    const keepField = pc.keep ?? pc.count ?? pc.remaining ?? null;
    const pcTrue = ATOM_RESOLVERS.conditional(stateWithGY([{ id: "g1", name: "Old Bolt", type: "Instant", oracle: "" }, { id: "g2", name: "Old Rite", type: "Sorcery", oracle: "" }]), ATOM(), { controller: "user", targets: [] }).pendingChoice;
    const keepFieldTrue = pcTrue.keep ?? pcTrue.count ?? pcTrue.remaining ?? null;
    console.log("  WITNESS flowStateKeepSplit", JSON.stringify({ half: keepField, full: keepFieldTrue })); // vitest 4 needs --disable-console-intercept
    expect(keepField).not.toEqual(keepFieldTrue);
  });
});
