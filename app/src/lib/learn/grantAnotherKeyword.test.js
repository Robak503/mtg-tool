/**
 * grantAnotherKeyword.test.js — ANOTHER-TARGET-YOU-CONTROL keyword grant (overnight grind, corpus lever).
 *
 * "another target creature you control gains <keyword> until end of turn" (Flesh Burrower / Starling, Aerial
 * Ally / Trained Condor / Heavenly Qilin / Toxic Scorpion / Void Grafter / Selfless Savior … — attack / ETB /
 * cast triggers). The bare "target creature you control gains KW" was already native; the "another" (CR 109.5:
 * distinct from the source) prefix is the only gap. Modeled as a pure grant pump (ptDelta 0/0) with
 * targetType "creatureYouControl" + excludeSource — enumerateTargets drops ctx.sourceId, so the source can
 * never grant the keyword to ITSELF. Mirrors the add-counter "another … you control" shape.
 *
 * Flip-diff GAINED = 9 (the family), LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence, parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { resolveAtom } from "./effects/effectAtoms.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentHasKeyword } from "./layers.js";

beforeEach(() => _resetIdsForTests());

describe("another-target-you-control keyword grant — parser + classify", () => {
  it("parses to a pump grant with creatureYouControl + excludeSource", () => {
    expect(parseEffectClause("another target creature you control gains flying until end of turn")).toMatchObject({
      confidence: "high",
      atoms: [{ op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying"] }],
    });
  });
  it("Flesh Burrower / Starling / Heavenly Qilin classify native-trigger", () => {
    expect(classifyCard({ type: "Creature — Insect", name: "Flesh Burrower", mana: "{1}{B}", oracle: "When this creature enters, another target creature you control gains deathtouch until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Bird", name: "Starling, Aerial Ally", mana: "{2}{W}", oracle: "Whenever this creature attacks, another target creature you control gains flying until end of turn." })).toBe("native-trigger");
    expect(classifyCard({ type: "Creature — Unicorn", name: "Heavenly Qilin", mana: "{2}{W}", oracle: "Whenever this creature attacks, another target creature you control gains flying until end of turn." })).toBe("native-trigger");
  });
  it("CREED: an UN-grantable keyword drops the whole grant (no fabricated grant)", () => {
    expect(programConfidence(parseEffectProgram({ type: "Instant", mana: "{W}", name: "X", oracle: "Another target creature you control gains banding until end of turn." }))).toBe("low");
  });
});

describe("another-target-you-control keyword grant — resolver (the source is excluded)", () => {
  it("grants the keyword to the chosen OTHER creature, never the source", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const src = createPermanent({ id: "src", card: { id: "c-src", name: "Src", type: "Creature — Bird", power: 2, toughness: 2 }, controller: "user", summoningSick: false });
    const other = createPermanent({ id: "other", card: { id: "c-o", name: "Other", type: "Creature — Beast", power: 1, toughness: 1 }, controller: "user", summoningSick: false });
    const s = { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [src, other] } } };
    const atom = { op: "pump", targetType: "creatureYouControl", excludeSource: true, ptDelta: { p: 0, t: 0 }, grantKeywords: ["Flying"] };
    const next = resolveAtom(s, atom, { controller: "user", sourceId: "src", targets: [{ type: "creature", id: "other" }] });
    expect(permanentHasKeyword(next, "other", "Flying")).toBe(true);
    expect(permanentHasKeyword(next, "src", "Flying")).toBe(false);
  });
});
