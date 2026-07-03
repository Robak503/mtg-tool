/**
 * JUNK WINDER (token-enters tap-lockdown) — "Whenever a token you control enters, tap target nonland
 * permanent an opponent controls. It doesn't untap during its controller's next untap step."
 *
 * Build (the smallest faithful slice that flips this mechanic):
 *   1. TRIGGER — classifyCondition recognizes "a token you control enters" → a permanentEnters trigger with
 *      the new `tokenYouControl` scope (scopeMatches gates on the entering permanent's `card.token` flag AND
 *      the controller). checkPermanentEntersTriggers already fires on every minted token (tokens.js), so no
 *      new firing wiring is needed — a nontoken entry / an opponent's token is a no-op (no over-fire).
 *   2. EFFECT — combatKeywordClauseParser parses "tap target nonland permanent an opponent controls and it
 *      doesn't untap during its controller's next untap step" (the two sentences folded by splitClauses) →
 *      { op:"tap", targetType:"nonlandPermanent", restrictions:[controller opponent], noUntapNext:true }.
 *      The nonlandPermanent predicate + controller restriction are enforced by enumerateTargets.
 *   3. NO-UNTAP LOCKDOWN — applyTapEffect flags the tapped permanent (setDoesNotUntapNext); untapAll SKIPS it
 *      exactly once, clearing the flag as it skips, so only the NEXT untap step is affected (CR 302.6).
 *
 * CREED: the effect is modeled WHOLE (tap + the one-shot lockdown), the trigger routes natively through the
 * enemy-aware flush chooser (the tap intent is "enemy"), and every near-miss below stays LOW/undetected →
 * Arbiter (a safe false-negative), never a confident wrong play. Affinity for tokens is a cost-only keyword
 * stripped before parse (the runtime hard-casts at full cost — Ninjutsu precedent), so it doesn't block.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { applyTapEffect } from "./effects/atoms/combat.js";
import {
  _resetIdsForTests,
  createGameState,
  createPermanent,
  untapAll,
  findPermanent,
} from "./gameState.js";
import { enterPermanent } from "./resolvers.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const JUNK_WINDER = {
  id: "c-jw",
  name: "Junk Winder",
  type: "Creature — Serpent",
  power: 3,
  toughness: 5,
  mana: "{5}{U}{U}",
  keywords: ["Affinity"],
  oracle:
    "Affinity for tokens (This spell costs {1} less to cast for each token you control.)\nWhenever a token you control enters, tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step.",
};

// ─── Parser: the tap-lockdown effect clause ───────────────────────────────────
describe("JUNK WINDER — effect parser", () => {
  it("folds the two-sentence tap-lockdown and parses HIGH", () => {
    const r = parseEffectClause(
      "Tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step.",
      "Instant",
    );
    expect(programConfidence(r)).toBe("high");
    expect(r.atoms).toHaveLength(1);
    expect(r.atoms[0]).toMatchObject({
      op: "tap",
      targetType: "nonlandPermanent",
      restrictions: [{ kind: "controller", who: "opponent" }],
      noUntapNext: true,
    });
    expect(r.unparsedTail).toBeNull();
  });

  it("the tap atom's trigger intent is enemy-side (the flush chooser taps an opponent's permanent)", () => {
    expect(atomTargetIntent({ op: "tap", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "opponent" }], noUntapNext: true })).toBe("enemy");
  });

  it("CREED — the bare tap WITHOUT the no-untap lockdown stays LOW (Arbiter, safe FN)", () => {
    // Model the WHOLE clause or nothing: a "tap target nonland permanent an opponent controls." with no
    // lockdown rider isn't the modeled shape → LOW. (No real card prints exactly this, but the $ anchor
    // must reject it so a mis-templated variant can never claim a partial native.)
    expect(parseEffectClause("Tap target nonland permanent an opponent controls.", "Instant").confidence).toBe("low");
  });

  it("CREED — a DIFFERENT rider on the tap keeps it LOW (Arbiter)", () => {
    expect(
      parseEffectClause(
        "Tap target nonland permanent an opponent controls. Draw a card.",
        "Instant",
      ).confidence,
    ).toBe("low");
  });
});

// ─── Detection: the token-enters trigger ──────────────────────────────────────
describe("JUNK WINDER — trigger detection", () => {
  const triggers = (oracle) => detectTriggers({ name: "X", type: "Creature", oracle });

  it("detects the 'a token you control enters' trigger", () => {
    const ds = triggers("Whenever a token you control enters, you gain 1 life.");
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "permanentEnters", permanentFilter: "token", scope: "tokenYouControl" });
  });

  it("detects Junk Winder's full trigger (Affinity is a cost-only keyword — not a trigger)", () => {
    const ds = detectTriggers(JUNK_WINDER);
    expect(ds).toHaveLength(1);
    expect(ds[0]).toMatchObject({ event: "permanentEnters", scope: "tokenYouControl" });
  });

  it("CREED — does NOT detect bare 'a token enters' (no controller gate → undetected → Arbiter)", () => {
    expect(triggers("Whenever a token enters, you gain 1 life.")).toHaveLength(0);
  });

  it("CREED — does NOT detect 'a token an opponent controls enters' (unenforceable scope → undetected)", () => {
    expect(triggers("Whenever a token an opponent controls enters, you gain 1 life.")).toHaveLength(0);
  });
});

// ─── Coverage flip ────────────────────────────────────────────────────────────
describe("JUNK WINDER — coverage", () => {
  it("Junk Winder flips native-trigger (Affinity stripped, tap-lockdown modeled)", () => {
    expect(classifyCard(JUNK_WINDER)).toBe("native-trigger");
  });

  it("a token-enters watcher with a modeled tap-lockdown effect classifies native-trigger", () => {
    expect(
      classifyCard({
        type: "Creature — Serpent",
        name: "Test Winder",
        mana: "{4}{U}",
        oracle: "Whenever a token you control enters, tap target nonland permanent an opponent controls. It doesn't untap during its controller's next untap step.",
      }),
    ).toBe("native-trigger");
  });

  it("CREED — a token-enters watcher with an UNMODELED effect stays body-only (Arbiter)", () => {
    // "exile that permanent" is not a modeled trigger-flush effect here → the trigger doesn't route natively →
    // body-only (the creature body still plays; the trigger routes to the Arbiter). Never a confident wrong play.
    expect(
      classifyCard({
        type: "Creature — Serpent",
        name: "Test Winder Bad",
        mana: "{4}{U}",
        oracle: "Whenever a token you control enters, exile target nonland permanent an opponent controls unless its controller pays {3}.",
      }),
    ).toBe("body-only");
  });
});

// ─── Engine: token-gate + controller-gate firing ──────────────────────────────
describe("JUNK WINDER — trigger firing", () => {
  function stateWithWinder() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const winder = createPermanent({ id: "w-jw", card: { ...JUNK_WINDER, id: "cw-jw" }, controller: "user" });
    return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [winder] } } };
  }
  const permEntersCount = (s2) => (s2.pendingTriggers || []).filter((t) => t.event === "permanentEnters").length;

  it("fires when a TOKEN you control enters", () => {
    const state = stateWithWinder();
    const tokenCard = { id: "tok1", name: "Insect", type: "Creature — Insect", oracle: "", power: 1, toughness: 1, token: true };
    expect(permEntersCount(enterPermanent(state, tokenCard, "user"))).toBe(1);
  });

  it("CREED — does NOT fire when a NONTOKEN creature you control enters", () => {
    const state = stateWithWinder();
    const nontoken = { id: "c1", name: "Bear", type: "Creature — Bear", oracle: "", power: 2, toughness: 2 };
    expect(permEntersCount(enterPermanent(state, nontoken, "user"))).toBe(0);
  });

  it("CREED — does NOT fire when an OPPONENT's token enters", () => {
    const state = stateWithWinder();
    const oppToken = { id: "tok2", name: "Goblin", type: "Creature — Goblin", oracle: "", power: 1, toughness: 1, token: true };
    expect(permEntersCount(enterPermanent(state, oppToken, "ai"))).toBe(0);
  });
});

// ─── Runtime: the no-untap lockdown skips exactly one untap step ───────────────
describe("JUNK WINDER — no-untap lockdown runtime", () => {
  function stateWithTappableOpponentArtifact() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    // An opponent's tapped Treasure (a nonland permanent); Junk Winder's controller is "user".
    const treasure = createPermanent({
      id: "opp-art",
      card: { id: "c-tr", name: "Treasure", type: "Artifact — Treasure", oracle: "", token: true },
      controller: "ai",
      tapped: true,
    });
    return { ...s, players: { ...s.players, ai: { ...s.players.ai, battlefield: [treasure] } } };
  }

  it("applyTapEffect taps the target AND flags it doesNotUntapNext", () => {
    let state = stateWithTappableOpponentArtifact();
    // The target enters the atom already-tapped is fine; tap re-applies + flags it.
    state = applyTapEffect(
      state,
      { op: "tap", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "opponent" }], noUntapNext: true },
      { targets: [{ id: "opp-art", type: "permanent" }] },
      true,
    );
    const perm = findPermanent(state, "opp-art").permanent;
    expect(perm.tapped).toBe(true);
    expect(perm.doesNotUntapNext).toBe(true);
  });

  it("the controller's NEXT untap step SKIPS the flagged permanent (it stays tapped), then untaps the turn after", () => {
    let state = stateWithTappableOpponentArtifact();
    state = applyTapEffect(
      state,
      { op: "tap", targetType: "nonlandPermanent", restrictions: [{ kind: "controller", who: "opponent" }], noUntapNext: true },
      { targets: [{ id: "opp-art", type: "permanent" }] },
      true,
    );

    // The controller (ai) reaches their untap step: the lockdown SKIPS the tap-clear and CLEARS the flag.
    state = untapAll(state, { playerId: "ai" });
    let perm = findPermanent(state, "opp-art").permanent;
    expect(perm.tapped).toBe(true); // still tapped — the lockdown held for this untap step
    expect(perm.doesNotUntapNext).toBeUndefined(); // one-shot flag consumed

    // The FOLLOWING untap step untaps it normally (the restriction was only "next untap step").
    state = untapAll(state, { playerId: "ai" });
    perm = findPermanent(state, "opp-art").permanent;
    expect(perm.tapped).toBe(false);
  });

  it("an UNflagged tapped permanent untaps normally (the lockdown is opt-in per permanent)", () => {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const art = createPermanent({ id: "art-x", card: { id: "c-x", name: "Sol Ring", type: "Artifact", oracle: "" }, controller: "user", tapped: true });
    let state = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [art] } } };
    state = untapAll(state, { playerId: "user" });
    expect(findPermanent(state, "art-x").permanent.tapped).toBe(false);
  });
});
