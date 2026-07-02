/**
 * OMNATH SEAM CANARY (overhaul pass, P3) — the engine-side tripwire for the two seams the
 * Omnath brain consumes. If a wave breaks anything here, MY gate fails before Omnath's tools do.
 *
 * Seam 1 — the CONSULTATION surface (omnath-tools/engine.mjs imports these via MTG_APP_ROOT):
 *   classifyCard / isNativeTier (the trust gate) · parseEffectProgram / programConfidence (atoms)
 *   — pinned with the SAME golden cards Omnath's engine.mjs selftest uses (Lightning Bolt /
 *   Sol Ring / Cyclonic Rift), so both canaries fire on the same drift.
 *
 * Seam 2 — the PLAY-API v1 (gameApi: the pilot drive loop). Contract: PLAY-API-CONTRACT.md.
 * Version bumps: PLAY_API_VERSION is semver; breaking changes bump MAJOR + post to memory/COMMS.md.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { _resetIdsForTests } from "./gameState.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import {
  PLAY_API_VERSION, createGame, nextDecision, act,
  legalActions, applyAction, isLegalAction, gameStatus, observe,
} from "./gameApi.js";

beforeEach(() => _resetIdsForTests());

// ── Seam 1: consultation surface (golden cards mirror omnath-tools/engine.mjs selftest) ──
describe("consultation seam — the classify/parse surface Omnath's gate consumes", () => {
  it("golden cards classify to their pinned tiers", () => {
    expect(classifyCard({ name: "Lightning Bolt", type: "Instant", mana: "{R}", oracle: "Lightning Bolt deals 3 damage to any target." })).toBe("native-spell");
    expect(classifyCard({ name: "Sol Ring", type: "Artifact", mana: "{1}", oracle: "{T}: Add {C}{C}." })).toBe("native-mana");
    // Cyclonic Rift: the overload rider keeps it an Arbiter spell — the honesty pin.
    const rift = classifyCard({ name: "Cyclonic Rift", type: "Instant", mana: "{1}{U}", oracle: "Return target nonland permanent you don't control to its owner's hand.\nOverload {6}{U} (You may cast this spell for its overload cost. If you do, change its text by replacing all instances of \"target\" with \"each.\")" });
    expect(isNativeTier(rift) || rift === "arbiter-spell").toBe(true); // tier may improve, but never silently vanish
    expect(typeof rift).toBe("string");
  });
  it("parseEffectProgram + programConfidence keep their contract shape", () => {
    const prog = parseEffectProgram({ name: "Divination", type: "Sorcery", mana: "{2}{U}", oracle: "Draw two cards." });
    expect(Array.isArray(prog.atoms)).toBe(true);
    expect(["high", "low"]).toContain(programConfidence(prog));
  });
});

// ── Seam 2: the play-API v1 drive loop ──
function deck(prefix) {
  const out = [];
  for (let i = 0; i < 24; i++) out.push({ id: `${prefix}-f-${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." });
  for (let i = 0; i < 16; i++) out.push({ id: `${prefix}-b-${i}`, name: "Grizzly Bears", type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, oracle: "" });
  return out;
}

describe("play-API v1 — the pilot drive loop (PLAY-API-CONTRACT.md)", () => {
  it("exports a semver version", () => {
    expect(PLAY_API_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("an expert game drives to game-over through createGame → nextDecision alone", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "expert", mode: "standard" });
    const { session: done, decision } = nextDecision(session, { timePressure: true });
    expect(decision.kind).toBe("game-over");
    expect(["user-wins", "ai-wins", "draw", "timeout"]).toContain(done.status);
    const verdict = gameStatus(done.state);
    expect(typeof verdict.over).toBe("boolean"); // v0 surface still coheres with the session verdict
  });

  it("a beginner ask round-trips through act() (validated, never fabricated)", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard" });
    const first = nextDecision(session);
    expect(first.decision.kind).toBe("ask");
    expect(Array.isArray(first.decision.options)).toBe(true);
    expect(first.decision.options.length).toBeGreaterThan(0);
    const next = act(first.session, first.decision, first.decision.options[0]);
    expect(next.session).toBeTruthy();
    expect(next.decision.kind).not.toBe("dispatch-error"); // a legal offered answer always applies
    // An OUT-OF-SET answer is rejected with an unchanged session — the security boundary.
    const garbage = act(first.session, first.decision, { kind: "cast-spell", playerId: "user", cardId: "not-real" });
    expect(garbage.decision.kind).toBe("dispatch-error");
    expect(garbage.session).toBe(first.session);
  });

  it("act() surfaces an unknown decision kind honestly (the contract failsafe)", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard" });
    const out = act(session, { kind: "not-a-kind" }, null);
    expect(out.decision.kind).toBe("dispatch-error");
    expect(out.decision.code).toBe("UNKNOWN_DECISION_KIND");
  });

  it("v0 pure layer keeps its shape (legalActions/isLegalAction/applyAction/observe)", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard" });
    const { session: s } = nextDecision(session);
    const acts = legalActions(s.state, s.state.priorityHolder ?? s.state.activePlayer);
    expect(Array.isArray(acts)).toBe(true);
    if (acts.length) {
      expect(isLegalAction(s.state, acts[0])).toBe(true);
      const applied = applyAction(s.state, acts[0]);
      expect(applied).toBeTruthy();
    }
    expect(observe(s.state, "user")).toBe(s.state); // v1 = perfect information (documented)
  });
});
