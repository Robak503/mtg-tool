/**
 * defenseOfTheHeart.test.js — the compound upkeep-trigger multi-fetch slice (Defense of the Heart).
 *
 * "At the beginning of your upkeep, if an opponent controls three or more creatures, sacrifice this
 * enchantment, search your library for up to two creature cards, put those cards onto the battlefield,
 * then shuffle."
 *
 * Four pieces wired into ONE upkeep trigger, all reusing shipped infra:
 *   1. INTERVENING-IF (interveningIf.js) — a NEW absolute per-opponent board threshold: "an opponent
 *      controls N or more <filter>" (distinct from the compare-vs-you "…more … than you"). CR 104.3a
 *      existential over opponents; reuses parseFilter / permMatchesFilter (type/subtype/token/tapped).
 *   2. SELF-SAC (removal.sacrificeEdictClauseParser) — "sacrifice this <noun>" generalized from "creature"
 *      to every printed permanent-type noun ("enchantment", …). CR 113.7: "this" = the source; target:"self"
 *      moves ANY permanent to the graveyard (dies-triggers only for a creature).
 *   3. MULTI-FETCH CREATURES → BATTLEFIELD (library.js mf matcher) — the land-only RAMP-MULTI up-to-N fetch
 *      opened to a single UNQUALIFIED "creature" filter (the corpus's only such card). resolveTutorChoice's
 *      battlefield path enters each via enterCardFromZone (ETB fires), chaining `remaining` picks.
 *   4. SEQUENCE FOLD (parser.splitClauses) — the comma-joined "sacrifice this <noun>, search your library…"
 *      head is cut to a period so the self-sac clause and the (kept-whole) tutor clause parse separately.
 *
 * CREED near-misses (each stays NON-native — an unmodeled variant is a SAFE false-negative, never a
 * confident wrong play): opponent BELOW the threshold (2 creatures) drops the trigger at flush; a SUBTYPED
 * creature multi-fetch ("up to two Dragon cards") stays LOW; a non-card-type opponent threshold ("three or
 * more commanders") stays unparseable → Arbiter.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";

beforeEach(() => _resetIdsForTests());

const DEFENSE = {
  name: "Defense of the Heart",
  type: "Enchantment",
  mana: "{3}{G}",
  keywords: [],
  oracle: "At the beginning of your upkeep, if an opponent controls three or more creatures, sacrifice this enchantment, search your library for up to two creature cards, put those cards onto the battlefield, then shuffle.",
};
const EFFECT = "sacrifice this enchantment, search your library for up to two creature cards, put those cards onto the battlefield, then shuffle";

// ─── 1. Parse ──────────────────────────────────────────────────────────────────────
describe("Defense of the Heart — parse (self-sac + multi-fetch sequence)", () => {
  it("the compound effect parses HIGH → [sacrifice-self, tutor(creature, remaining:2, battlefield)]", () => {
    const cp = parseEffectClause(EFFECT, "Instant", { hasX: false });
    expect(programConfidence(cp)).toBe("high");
    expect(cp.structure).toBe("sequence");
    expect(cp.atoms).toEqual([
      { op: "sacrifice", target: "self" },
      { op: "tutor", filter: { groups: [["creature"]] }, filterLabel: "creature card", destination: "battlefield", entersTapped: false, remaining: 2, targetType: null },
    ]);
  });
  it("detectTriggers yields ONE upkeep trigger with the intervening-if + full effect, and it routes natively", () => {
    const dt = detectTriggers(DEFENSE);
    expect(dt).toHaveLength(1);
    expect(dt[0].event).toBe("upkeep");
    expect(dt[0].interveningIf).toBe("an opponent controls three or more creatures");
    expect(triggerRoutesNatively(dt[0])).toBe(true);
  });
});

// ─── 2. Classify ────────────────────────────────────────────────────────────────────
describe("Defense of the Heart — classify", () => {
  it("flips to native-trigger", () => {
    expect(classifyCard(DEFENSE)).toBe("native-trigger");
  });
});

// ─── 3. Intervening-if evaluator (absolute per-opponent threshold) ──────────────────
describe("intervening-if — 'an opponent controls N or more <filter>'", () => {
  const perm = (id, type, controller, over = {}) => createPermanent({ id, card: { id, name: id, type }, controller, ...over });
  function board({ userBoard = [], oppBoard = [] }) {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s,
      players: {
        ...s.players,
        user: { ...s.players.user, battlefield: userBoard },
        ai: { ...s.players.ai, battlefield: oppBoard },
      },
    };
  }
  const cond = "an opponent controls three or more creatures";
  it("TRUE when an opponent controls ≥3 creatures", () => {
    const opp = [perm("o1", "Creature — Bear", "ai"), perm("o2", "Creature — Bear", "ai"), perm("o3", "Creature — Bear", "ai")];
    expect(evaluateInterveningIf(board({ oppBoard: opp }), cond, "user")).toBe(true);
  });
  it("FALSE when the opponent controls only 2 creatures", () => {
    const opp = [perm("o1", "Creature — Bear", "ai"), perm("o2", "Creature — Bear", "ai")];
    expect(evaluateInterveningIf(board({ oppBoard: opp }), cond, "user")).toBe(false);
  });
  it("only counts OPPONENTS' creatures — the controller's own 3 creatures do NOT satisfy it", () => {
    const mine = [perm("m1", "Creature — Bear", "user"), perm("m2", "Creature — Bear", "user"), perm("m3", "Creature — Bear", "user")];
    expect(evaluateInterveningIf(board({ userBoard: mine }), cond, "user")).toBe(false);
  });
  it("parseable (shape returns a boolean on the probe board)", () => {
    expect(interveningIfParseable(cond)).toBe(true);
  });
  it("CREED near-miss: a non-card-type threshold ('three or more commanders') stays unparseable → Arbiter", () => {
    expect(interveningIfParseable("an opponent controls three or more commanders")).toBe(false);
  });
});

// ─── 4. Runtime (CR 603.4 flush + resolution + multi-fetch chain) ───────────────────
describe("Defense of the Heart — runtime: fires, sacrifices itself, fetches two creatures", () => {
  const oppCreature = (id) => createPermanent({ id, card: { id, name: id, type: "Creature — Bear" }, controller: "ai" });
  const libCreature = (id) => ({ id, name: id, type: "Creature — Beast", oracle: "" });
  const libLand = (id) => ({ id, name: id, type: "Basic Land — Forest", oracle: "" });

  function fireUpkeep({ oppCount, library }) {
    let st = createGameState({ userDeck: [], aiDeck: [] });
    const source = createPermanent({ id: "src", card: { id: "src", ...DEFENSE }, controller: "user" });
    const opp = Array.from({ length: oppCount }, (_, i) => oppCreature(`opp${i}`));
    st = {
      ...st,
      players: {
        ...st.players,
        user: { ...st.players.user, battlefield: [source], library, hand: [] },
        ai: { ...st.players.ai, battlefield: opp },
      },
    };
    st = { ...st, pendingTriggers: [{
      event: "upkeep", source: { name: "Defense of the Heart", permanentId: "src" }, controller: "user",
      descriptor: detectTriggers(DEFENSE)[0], context: { sourceId: "src" }, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    // Drain the multi-fetch pending-choice chain (the driver auto-picks; here we auto-pick to completion).
    let guard = 0;
    while (out.pendingChoice && out.pendingChoice.kind === "tutor-search" && guard++ < 10) {
      out = resolveTutorChoice(out, autoPickTutorCandidate(out, out.pendingChoice));
    }
    return out;
  }

  it("opponent controls 3 creatures → the enchantment sacrifices itself and TWO creatures enter from library", () => {
    const out = fireUpkeep({ oppCount: 3, library: [libCreature("c1"), libCreature("c2"), libLand("l1")] });
    // the enchantment sacrificed itself → it's in the graveyard, off the battlefield
    expect(out.players.user.battlefield.some((p) => p.id === "src")).toBe(false);
    expect(out.players.user.graveyard.some((c) => c.id === "src")).toBe(true);
    // exactly TWO creatures fetched onto the battlefield (never the land). enterCardFromZone mints a NEW
    // permanent id, so identify by the (preserved) card name, not the library card id.
    const entered = out.players.user.battlefield.filter((p) => /Creature/.test(p.card.type));
    expect(entered).toHaveLength(2);
    expect(entered.map((p) => p.card.name).sort()).toEqual(["c1", "c2"]);
    // library: 3 → 1 (two creatures pulled; the land remains), no fabricated card
    expect(out.players.user.library.map((c) => c.id)).toEqual(["l1"]);
    expect(out.pendingChoice).toBeFalsy();
  });

  it("opponent controls only 2 creatures → the trigger never fires (no sac, no fetch)", () => {
    const out = fireUpkeep({ oppCount: 2, library: [libCreature("c1"), libCreature("c2")] });
    expect(out.players.user.battlefield.some((p) => p.id === "src")).toBe(true); // still there
    expect(out.players.user.library).toHaveLength(2);                             // untouched
    expect(out.players.user.battlefield.filter((p) => /Creature/.test(p.card.type))).toHaveLength(0);
  });

  it("only ONE creature in the library → fetches one, the second finds nothing (no fabricated creature)", () => {
    const out = fireUpkeep({ oppCount: 3, library: [libCreature("c1"), libLand("l1")] });
    const entered = out.players.user.battlefield.filter((p) => /Creature/.test(p.card.type));
    expect(entered).toHaveLength(1);
    expect(entered[0].card.name).toBe("c1");
    expect(out.players.user.library.map((c) => c.id)).toEqual(["l1"]);
  });
});

// ─── 5. CREED near-miss: a subtyped creature multi-fetch stays parked ────────────────
describe("CREED — a subtyped / MV-capped creature multi-fetch to battlefield stays non-native", () => {
  const isHigh = (txt) => programConfidence(parseEffectClause(txt, "Instant", { hasX: false })) === "high";
  it("PLAIN 'creature' is native, but a subtyped 'Dragon' multi-fetch is NOT (no wrong-cheat FP)", () => {
    expect(isHigh("search your library for up to two creature cards, put those cards onto the battlefield, then shuffle")).toBe(true);
    expect(isHigh("search your library for up to two Dragon cards, put those cards onto the battlefield, then shuffle")).toBe(false);
    expect(isHigh("search your library for up to two artifact cards, put those cards onto the battlefield, then shuffle")).toBe(false);
  });
});
