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
  _internals,
} from "./gameApi.js";
import { PENDING_CHOICE_KINDS } from "./pendingChoice.js";
import { abandon } from "./learnSession.js";
import { lookupCard, lookupRulingsForCard } from "../server/cardIndex.js";

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

// ── Seam 1b: the cardIndex consultation rows (contract §2 — PS-5) ──
describe("consultation seam — cardIndex lookups Omnath's tools consume (contract §2)", () => {
  it("exports lookupCard + lookupRulingsForCard as functions", () => {
    expect(typeof lookupCard).toBe("function");
    expect(typeof lookupRulingsForCard).toBe("function");
  });

  it("lookupCard golden shape: Lightning Bolt is a named card — or the honest ENOENT when no oracle snapshot is on disk", () => {
    // INDEX-TOLERANT (the 07358ddd pattern): plain vitest may run with no bundled oracle
    // snapshot. The §2 contract row documents exactly this split: with a snapshot, a hit is
    // a card object and a MISS returns null (never a throw); with NO snapshot, the index
    // load throws an honest ENOENT — it never fabricates a card.
    let bolt;
    try {
      bolt = lookupCard("Lightning Bolt");
    } catch (err) {
      expect(err.code).toBe("ENOENT");
      return;
    }
    expect(bolt === null || typeof bolt.name === "string").toBe(true);
    if (bolt) expect(bolt.name.toLowerCase()).toContain("lightning bolt");
    expect(lookupCard("zzz-not-a-real-card-name-zzz")).toBeNull(); // a miss is null, never a throw
  });

  it("lookupRulingsForCard always returns an array — [] on no oracle_id / no rulings snapshot", () => {
    expect(lookupRulingsForCard(null)).toEqual([]);
    expect(lookupRulingsForCard({ name: "No Oracle Id" })).toEqual([]);
    expect(Array.isArray(lookupRulingsForCard({ oracle_id: "no-such-oracle-id" }))).toBe(true);
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

  it("the v1.2 decision vocabulary: all 20 pending kinds are present (removal = MAJOR; additive kinds pass)", () => {
    // Presence-pinned, NOT length-pinned (contract §1.1a + §5): a future additive kind is
    // MINOR and must pass; a removal/rename is MAJOR and must fire this canary.
    const V12_KINDS = [
      "tutor-search", "clone-search", "scry-surveil", "optional-effect", "commander-return",
      "hand-discard", "impulse-dig", "dig-land-to-battlefield", "sacrifice-choice", "discard",
      "divide-damage", "distribute-counters", "soft-counter", "optional-mana-payment",
      "optional-sac-payment", "optional-draw-discard", "optional-discard-payment",
      "sac-unless-pay", "taxed-payment", "edict-mode",
    ];
    for (const kind of V12_KINDS) expect(PENDING_CHOICE_KINDS).toContain(kind);
  });

  it("an ask carries metadata.suggestion — the engine's own, guaranteed-legal pick (contract §1.1b)", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard" });
    const first = nextDecision(session);
    expect(first.decision.kind).toBe("ask");
    const suggestion = first.decision.metadata?.suggestion;
    expect(suggestion).toBeTruthy();
    expect(typeof suggestion.kind).toBe("string");
    // The documented guarantee: suggestion ∈ options (the always-legal fallback answer).
    expect(first.decision.options.some((o) => _internals.actionsEqual(o, suggestion))).toBe(true);
    // §1.1b answering-seat derivation: with no mid-resolution window pending, the ask's
    // answering seat is exactly state.priorityHolder (asks carry NO seat field in v1.x).
    const s = first.session.state;
    expect(s.pendingDiscover ?? s.pendingFreeCast ?? s.pendingCascade ?? null).toBeNull();
    expect(s.priorityHolder).toBe("user");
  });

  it("session.status vocabulary (contract §1.1c): fresh = 'active'; abandon() = 'abandoned'", () => {
    const session = createGame({ userDeck: deck("u"), opponentDeck: deck("a"), difficulty: "beginner", mode: "standard" });
    expect(session.status).toBe("active");
    expect(abandon(session).status).toBe("abandoned");
    // (The game-over statuses — user-wins/ai-wins/draw/timeout — are pinned by the expert
    // drive-loop test above, matching the §1.1c list.)
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
