/**
 * anotherTargetPtPump.test.js — BLITZ LF-1 (landfall census harvest).
 *
 * "another target creature you control gets +P/+T[ and gains KW] until end of turn" — the P/T sibling of the
 * pre-existing "another target creature you control GAINS KW until end of turn" pump (Flesh Burrower et al.).
 * The pump atom already carried the excludeSource + targetType:"creatureYouControl" targeting (CR 109.5 — the
 * chosen own creature may NOT be the source; enumerateTargets drops ctx.sourceId), and the runtime resolves it
 * through the SAME applyPumpEffect target-id path as the plain "target creature you control gets …" form — only
 * the "+P/+T [and gains KW]" combat.js matcher (and its splitClauses keep-whole guard, so the internal " and "
 * doesn't shatter the sentence) were missing. Adding them routes the payoff with NO resolver change.
 *
 * The landfall card this unblocks is Gladiolus Amicitia (its landfall payoff was the SOLE blocker — its ETB
 * land-tutor already routes); the same shape rides ETB / attack / combat-begin / activated triggers on Cunning
 * Coyote, Eel-Hounds, Efreet Weaponmaster, Foot Elite, Haradrim Spearmaster, Hardened Escort, Imperial
 * Aerosaur, Living Lightning, and Patriot (activated). Flip-diff: +10 native, LOST=0.
 *
 * CREED: POSITIVE deltas only (a buff you point at your OWN creature is unambiguously own-side); the "you
 * control" scope is exact (a bare any-side "another target creature gets +2/+2" stays LOW — the engine can't
 * scope an opponent's board); an ungrantable keyword drops the whole clause (no fabricated grant); a card with
 * this shape PLUS other unmodeled text (Hovel Hurler's -1/-1 ETB, Yotian Frontliner's Unearth) stays body-only.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { pumpClauseParser } from "./effects/atoms/combat.js";
import { classifyCard, isNativeTier } from "./coverage.js";
import { detectTriggers } from "./triggers.js";
import { triggerRoutesNatively } from "./triggerRouting.js";
import { dispatchAction } from "./actionDispatcher.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─────────────────────────────────────────────────────────────────────────────
// Parser — the anotherPt pump atom (bare + keyword-grant)
// ─────────────────────────────────────────────────────────────────────────────
describe("ANOTHER-PT-PUMP — pumpClauseParser produces the excludeSource own-target pump", () => {
  it("bare P/T: 'another target creature you control gets +3/+0 until end of turn' (Efreet Weaponmaster)", () => {
    expect(pumpClauseParser("another target creature you control gets +3/+0 until end of turn"))
      .toEqual({ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 3, t: 0 } });
  });
  it("P/T + keyword: 'another target creature you control gets +2/+2 and gains trample …' (Gladiolus)", () => {
    expect(pumpClauseParser("another target creature you control gets +2/+2 and gains trample until end of turn"))
      .toEqual({ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 2, t: 2 }, grantKeywords: ["Trample"] });
  });
  it("CREED — an ungrantable keyword drops the whole clause (no fabricated grant)", () => {
    expect(pumpClauseParser("another target creature you control gets +2/+2 and gains landfall until end of turn")).toBeNull();
  });
});

describe("ANOTHER-PT-PUMP — full program stays a single HIGH pump (keep-whole guard holds the ' and ')", () => {
  it("'…gets +2/+2 and gains trample until end of turn' → HIGH, one pump atom (not shattered on ' and ')", () => {
    const p = parseEffectClause("another target creature you control gets +2/+2 and gains trample until end of turn", "Instant");
    expect(p.confidence).toBe("high");
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0]).toMatchObject({ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 2, t: 2 }, grantKeywords: ["Trample"] });
  });
  it("CREED — the any-side form ('another target creature gets +2/+2 …', no 'you control') stays LOW", () => {
    expect(parseEffectClause("another target creature gets +2/+2 until end of turn", "Instant").confidence).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Trigger routing — landfall + the adjacent trigger families route natively
// ─────────────────────────────────────────────────────────────────────────────
describe("ANOTHER-PT-PUMP — the landfall (and sibling) trigger routes natively", () => {
  const lf = (oracle) => detectTriggers({ name: "W", type: "Creature — Elemental", power: 2, toughness: 2, oracle }).find((t) => t.event === "landfall");
  it("Gladiolus's landfall payoff routes natively", () => {
    const d = lf("Landfall — Whenever a land you control enters, another target creature you control gets +2/+2 and gains trample until end of turn.");
    expect(d).toMatchObject({ event: "landfall", scope: "landYouControl" });
    expect(triggerRoutesNatively(d)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Classifier — the landfall target + the adjacent family flip native (REAL oracle)
// ─────────────────────────────────────────────────────────────────────────────
describe("ANOTHER-PT-PUMP — native classification (real Scryfall oracle)", () => {
  it("Gladiolus Amicitia (landfall pump + ETB land-tutor) → native-trigger", () => {
    expect(classifyCard({ name: "Gladiolus Amicitia", type: "Legendary Creature — Human Warrior", mana: "{3}{G}{W}",
      oracle: "When Gladiolus Amicitia enters, search your library for a land card, put it onto the battlefield tapped, then shuffle.\nLandfall — Whenever a land you control enters, another target creature you control gets +2/+2 and gains trample until end of turn." })).toBe("native-trigger");
  });
  it("Eel-Hounds (attacks, +2/+2 trample) → native-trigger", () => {
    expect(isNativeTier(classifyCard({ name: "Eel-Hounds", type: "Creature — Fish Dog", mana: "{3}{G}",
      oracle: "Trample\nWhenever this creature attacks, another target creature you control gets +2/+2 and gains trample until end of turn." }))).toBe(true);
  });
  it("Imperial Aerosaur (ETB, +1/+1 flying) → native-trigger", () => {
    expect(isNativeTier(classifyCard({ name: "Imperial Aerosaur", type: "Creature — Dinosaur", mana: "{3}{W}",
      oracle: "Flying\nWhen this creature enters, another target creature you control gets +1/+1 and gains flying until end of turn." }))).toBe(true);
  });
  it("Efreet Weaponmaster (bare +3/+0, no keyword) → native-trigger", () => {
    expect(isNativeTier(classifyCard({ name: "Efreet Weaponmaster", type: "Creature — Efreet Monk", mana: "{4}{R}",
      oracle: "First strike\nWhen this creature enters or is turned face up, another target creature you control gets +3/+0 until end of turn.\nMorph {2}{U}{R}{W} (You may cast this card face down as a 2/2 creature for {3}. Turn it face up any time for its morph cost.)" }))).toBe(true);
  });
  it("Patriot, Shield Wielder (ACTIVATED, +2/+0 hexproof) → native-activated", () => {
    expect(classifyCard({ name: "Patriot, Shield Wielder", type: "Legendary Creature — Human Hero", mana: "{2}{W}",
      oracle: "{2}, {T}: Another target creature you control gets +2/+0 and gains hexproof until end of turn. (It can't be the target of spells or abilities your opponents control.)" })).toBe("native-activated");
  });

  // ── CREED anti-FP: this shape PLUS other unmodeled text stays body-only (whole-card law) ──
  it("Hovel Hurler (-1/-1-counter ETB rider) stays body-only", () => {
    expect(isNativeTier(classifyCard({ name: "Hovel Hurler", type: "Creature — Giant Warrior", mana: "{3}{R/W}",
      oracle: "This creature enters with two -1/-1 counters on it.\n{R/W}{R/W}, Remove a counter from this creature: Another target creature you control gets +1/+0 and gains flying until end of turn. Activate only as a sorcery." }))).toBe(false);
  });
  it("Yotian Frontliner (Unearth rider) stays body-only", () => {
    expect(isNativeTier(classifyCard({ name: "Yotian Frontliner", type: "Artifact Creature — Soldier", mana: "{1}",
      oracle: "Whenever this creature attacks, another target creature you control gets +1/+1 until end of turn.\nUnearth {W} ({W}: Return this card from your graveyard to the battlefield. It gains haste. Exile it at the beginning of the next end step or if it would leave the battlefield. Unearth only as a sorcery.)" }))).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Runtime — playing a land FIRES Gladiolus's landfall; the +2/+2 + trample lands on
// ANOTHER creature (excludeSource keeps it off the source). CREED: not a bare matcher.
// ─────────────────────────────────────────────────────────────────────────────
describe("ANOTHER-PT-PUMP — runtime: Gladiolus's landfall pumps another creature, never itself", () => {
  const FOREST = { id: "forest1", name: "Forest", type: "Basic Land — Forest", mana: "" };
  const GLADIOLUS = { id: "c-glad", name: "Gladiolus Amicitia", type: "Legendary Creature — Human Warrior", power: 3, toughness: 3,
    oracle: "Landfall — Whenever a land you control enters, another target creature you control gets +2/+2 and gains trample until end of turn." };
  const ALLY = { id: "c-ally", name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" };

  function board() {
    const s = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s, phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user",
      players: { ...s.players, user: { ...s.players.user, hand: [FOREST], battlefield: [
        createPermanent({ id: "glad", card: GLADIOLUS, controller: "user" }),
        createPermanent({ id: "ally", card: ALLY, controller: "user" }),
      ] } },
    };
  }
  const playForest = (s) => dispatchAction(s, { kind: "play-land", playerId: "user", cardId: "forest1", name: "Forest" });
  const resolveAll = (s) => { let g = 0; while ((s.stack || []).length && g++ < 30) s = resolveTopOfStack(s); return s; };

  it("the landfall fires, the pump resolves onto the ALLY (+2/+2 and trample), and Gladiolus is untouched", () => {
    let s = playForest(board());
    expect((s.pendingTriggers || []).filter((t) => t.event === "landfall")).toHaveLength(1);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    // excludeSource → the only legal "another … you control" target is the ally; it gains the buff.
    expect(permanentPower(s, "ally")).toBe(4);          // 2 + 2
    expect(permanentToughness(s, "ally")).toBe(4);      // 2 + 2
    expect(permanentHasKeyword(s, "ally", "Trample")).toBe(true);
    // the SOURCE is excluded from targeting → it never receives the buff (CR 109.5).
    expect(permanentPower(s, "glad")).toBe(3);          // unchanged
    expect(permanentHasKeyword(s, "glad", "Trample")).toBe(false);
  });

  it("CREED — with ONLY the source creature present, 'another target creature you control' has no legal target (no self-pump)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    let s = {
      ...s0, phase: "precombat-main", step: "main", priorityHolder: "user", activePlayer: "user", consecutivePasses: 0, startingPlayer: "user",
      players: { ...s0.players, user: { ...s0.players.user, hand: [FOREST], battlefield: [createPermanent({ id: "glad", card: GLADIOLUS, controller: "user" })] } },
    };
    s = playForest(s);
    s = resolveAll(flushTriggers(s, { chooseTargets: chooseTriggerTargets }));
    expect(permanentPower(s, "glad")).toBe(3); // source never pumps itself — the trigger has no legal target
  });
});
