/**
 * puzzleStore.test.js — P9 session-snapshot fidelity.
 *
 * The load-critical guarantee: a puzzle's captured session round-trips through
 * JSON (exactly what disk save/load does) and re-deriving the decision from the
 * restored state yields the SAME board — so loading a puzzle reproduces the
 * position bit-for-bit. Also pins the serialize guard (a live closure in state
 * is rejected, never silently corrupting a reload).
 */

import { describe, it, expect } from "vitest";

import { createLearnSession, advanceUntilDecision } from "../learn/learnSession.js";
import { boardSnapshot } from "../learn/boardSnapshot.js";
import { tableSnapshot } from "../learn/tableSnapshot.js";
import { puzzleFromSession } from "./puzzleStore.js";
import { engineBuild } from "../learn/engineBuild.js";
import { verifyChecksum } from "./learnSaveSchema.js";

function forest(i) {
  return { id: `forest-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}.", mana: "" };
}
function bear(i) {
  return { id: `bear-${i}`, name: "Grizzly Bears", type: "Creature — Bear", oracle: "", mana: "{1}{G}", cmc: 2, keywords: [] };
}
function deck(tag) {
  const out = [];
  for (let i = 0; i < 20; i++) out.push(forest(`${tag}-${i}`));
  for (let i = 0; i < 20; i++) out.push(bear(`${tag}-${i}`));
  return out;
}

function liveSession() {
  const built = createLearnSession({
    userDeck: deck("u"),
    opponentDeck: deck("o"),
    difficulty: "beginner",
    mode: "standard",
  });
  return advanceUntilDecision(built).session;
}

describe("puzzleFromSession — snapshot fidelity (P9 load path)", () => {
  it("builds a checksum-valid puzzle doc from a live session", () => {
    const built = puzzleFromSession(liveSession(), { goal: "win-this-turn", label: "Find lethal" });
    expect(built.ok).toBe(true);
    expect(built.doc.kind).toBe("learn-puzzle");
    expect(built.doc.goal).toEqual({ type: "win-this-turn" });
    expect(built.doc.label).toBe("Find lethal");
    expect(typeof built.doc.startTurn).toBe("number");
    expect(verifyChecksum(built.doc)).toBe(true); // session ↔ checksum agree
    expect(built.doc.engineVersion).toBe(engineBuild()); // the build stamp (release-readiness R2), not npm_package_version
  });

  it("round-trips through JSON and re-derives the SAME board (serialize → resume → same board)", () => {
    const session = liveSession();
    const { doc } = puzzleFromSession(session, { goal: "win-this-turn" });

    // Exactly what disk save/load does, then the resume path: advanceUntilDecision
    // on the deserialized state. Idempotent at a decision point → identical board.
    const restored = JSON.parse(JSON.stringify(doc.session));
    const reAdvanced = advanceUntilDecision(restored);

    expect(boardSnapshot(reAdvanced.session.state)).toEqual(boardSnapshot(session.state));
    expect(tableSnapshot(reAdvanced.session.state)).toEqual(tableSnapshot(session.state));
    expect(reAdvanced.session.state.turn).toBe(session.state.turn);
  });

  it("rejects a session carrying a live closure in state (would corrupt the reload)", () => {
    const session = liveSession();
    const poisoned = { ...session, state: { ...session.state, onResolve: () => 1 } };
    const built = puzzleFromSession(poisoned, { goal: "win-this-turn" });
    expect(built.ok).toBe(false);
    expect(built.reason).toBe("live-closure-in-state");
  });

  it("normalizes an unknown goal to the default", () => {
    const built = puzzleFromSession(liveSession(), { goal: "nonsense" });
    expect(built.doc.goal).toEqual({ type: "win-this-turn" });
  });
});
