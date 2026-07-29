/**
 * sacrificeLandCount.test.js — "Sacrifice TWO lands." (Planar Engineering), the counted form of a
 * self-sacrifice that previously admitted only "sacrifice a land".
 *
 * N sacrifices are N entries on the chain queue that `advanceSacrificeChain` already drives "one permanent
 * apiece" — no new machinery, and the pause/resume into the following tutor is the path the single form has
 * always used. `setPendingSacrificeChoice` already accepted a `queue`; nothing about it needed inventing.
 *
 * ⛔ "ANY NUMBER of lands" (Scapeshift) IS STILL REFUSED and that is not laziness: its count is player-chosen
 * AND feeds a linked "up to THAT MANY" fetch, so crediting it needs a count threaded from one atom into the
 * next. A fixed count needs neither.
 *
 * ⚠️ ONE DOCUMENTED APPROXIMATION rides with this, in the fetch half. Planar Engineering prints the MANDATORY
 * "Search your library for FOUR basic land cards"; the engine models it on the same chain as "up to four".
 * The only divergence is whether the player MAY take fewer — strictly worse for them, so it can never make
 * the engine play a better card than printed. That is a choice-FIDELITY gap in the safe direction,
 * categorically unlike a dropped effect. No unread `mandatory` flag was stamped: a field nothing enforces is
 * the captured-but-unread trap in another costume.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const PLANAR = "sacrifice two lands. search your library for four basic land cards, put them onto the battlefield tapped, then shuffle";

function boardWith(nLands) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  const lands = Array.from({ length: nLands }, (_, i) => createPermanent({ id: `L${i}`, card: { id: `L${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" }));
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: lands } } };
}
const sacAtom = () => parseEffectClause(PLANAR, "Sorcery", { hasX: false }).atoms[0];
const run = (st) => resolveAtom(st, sacAtom(), { controller: "user", targets: [], cardName: "Planar Engineering", sourceId: null });

describe("parsing", () => {
  it("the counted sacrifice composes with the fetch", () => {
    const p = parseEffectClause(PLANAR, "Sorcery", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms.map((a) => a.op)).toEqual(["sacrifice-land", "tutor"]);
    expect(p.atoms[0].count).toBe(2);
  });

  it("the single form is unchanged (count 1)", () => {
    const p = parseEffectClause("sacrifice a land. search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle", "Sorcery", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "sacrifice-land", count: 1 });
  });

  it("Planar Engineering classifies native", () => {
    expect(classifyCard({ name: "Planar Engineering", type: "Sorcery", mana: "{3}{G}", oracle: "Sacrifice two lands. Search your library for four basic land cards, put them onto the battlefield tapped, then shuffle." })).toBe("native-spell");
  });

  it("⛔ CREED — Scapeshift stays refused (the LINKED-X FETCH is what holds it, not the sacrifice count)", () => {
    // ⚠️ MEASURED, not assumed: admitting "any number of lands" in the sacrifice arm does NOT make this pass
    // (mutation M38) — the "up to THAT MANY" fetch still fails, so the program is LOW either way. Labelled
    // for what it actually guards. The sacrifice arm keeps its own narrow anchor regardless, because a
    // player-chosen count there would still need threading into the fetch to mean anything.
    expect(parseEffectClause("sacrifice any number of lands. search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle", "Sorcery", { hasX: false }).confidence).toBe("low");
  });
});

describe("⭐ RUNTIME — N sacrifices ride the existing chain", () => {
  it("MORE lands than needed → pauses for a pick, with the REMAINING sacrifice queued", () => {
    const after = run(boardWith(5));
    expect(after.pendingChoice).toBeTruthy();
    expect(after.pendingChoice.queue).toHaveLength(1); // 2 total = this pick + 1 queued
    expect(after.players.user.battlefield).toHaveLength(5); // nothing sacrificed until the pick settles
  });

  it("EXACTLY as many lands as needed → both go, no pause (nothing to choose)", () => {
    const after = run(boardWith(2));
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield).toHaveLength(0);
  });

  it("⭐ CREED — FEWER lands than required sacrifices what there is, and never pauses on an empty pool", () => {
    const after = run(boardWith(1));
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield).toHaveLength(0);
  });

  it("no lands at all is a clean no-op", () => {
    const after = run(boardWith(0));
    expect(after.pendingChoice).toBeFalsy();
    expect(after.players.user.battlefield).toHaveLength(0);
  });
});
