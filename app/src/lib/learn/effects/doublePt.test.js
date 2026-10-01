/**
 * doublePt.test.js — DOUBLE POWER/TOUGHNESS (CR 701.10 — doubling modifies a value by an amount equal to
 * itself, it doesn't set it; CR 701.10c — a power < 0 gets -X/-0). A per-target one-shot doubling modeled as
 * a pump atom carrying doublePt ("pt" = both stats,
 * "p" = power only); applyPumpEffect reads each target's LIVE layer-aware P/T inside its loop and adds
 * +that as a fixed layer-7c bonus (so P/T becomes 2×). Each affected creature gets its OWN delta.
 *
 * Three clauses reach the pump parser cleanly (self-referents that need no external target):
 *   • TEAM  — "double the power and toughness of each creature you control until end of turn"
 *             (Unnatural Growth, Zopandrel's combat trigger) → scope:"youControl", doublePt:"pt".
 *   • SELF  — "double this creature's power and toughness until end of turn" (Reckless Amplimancer's
 *             activated ability) → target:"self", doublePt:"pt".
 *   • SELF-P— "double this creature's power until end of turn" (Tifa Lockhart's Landfall trigger, after the
 *             name→self rewrite) → target:"self", doublePt:"p".
 * A split guard keeps the internal " and " of "power and toughness" whole; rewriteSelfNameToThisCreature
 * normalizes the possessive self-name "double <Name>'s power …" → "this creature's". Flip-diff (this slice):
 * GAINED = {Unnatural Growth, Reckless Amplimancer, Tifa Lockhart}, LOST = 0.
 *
 * CREED false-negatives (stay non-native — an unmodeled sibling ability / undetected trigger / unhandled
 * referent, never a wrong partial): Zopandrel (graduated P·17 — its sac-two-other-creatures ability is modeled now),
 * World War Hulk (Saga chapter III — a targeted double + trample rider), Grunn (attacks-alone trigger
 * undetected), Junk Jet ("equipped creature's" referent unmodeled), Exponential Growth ("X times").
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, creaturePower, creatureToughness, findPermanent } from "../gameState.js";
import { addContinuousEffect } from "../layers.js";
import { applyPumpEffect } from "./atoms/combat.js";
import { parseEffectClause, programConfidence } from "./parser.js";
import { classifyCard } from "../coverage.js";

beforeEach(() => _resetIdsForTests());

// Confirmed real oracle text (Scryfall bundle) — hermetic card objects, no data-dir dependency.
const UNNATURAL_GROWTH = { name: "Unnatural Growth", type: "Enchantment", mana: "{3}{G}{G}", oracle: "At the beginning of each combat, double the power and toughness of each creature you control until end of turn." };
const RECKLESS_AMPLIMANCER = { name: "Reckless Amplimancer", type: "Creature — Elf Druid", mana: "{1}{G}", oracle: "{4}{G}: Double this creature's power and toughness until end of turn." };
const TIFA = { name: "Tifa Lockhart", type: "Legendary Creature — Human Monk", mana: "{2}{G}", oracle: "Trample\nLandfall — Whenever a land you control enters, double Tifa Lockhart's power until end of turn." };
const ZOPANDREL = { name: "Zopandrel, Hunger Dominus", type: "Legendary Creature — Phyrexian Horror", mana: "{4}{G}{G}", oracle: "Reach\nAt the beginning of each combat, double the power and toughness of each creature you control until end of turn.\n{G/P}{G/P}, Sacrifice two other creatures: Put an indestructible counter on Zopandrel." };
const JUNK_JET = { name: "Junk Jet", type: "Artifact — Equipment", mana: "{2}", oracle: "{3}, Sacrifice another artifact: Double equipped creature's power until end of turn.\nEquip {1}" };
const EXPONENTIAL_GROWTH = { name: "Exponential Growth", type: "Sorcery", mana: "{X}{G}{G}", oracle: "Until end of turn, double target creature's power X times." };

function mk(perms) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, turn: 5, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
const cr = (id, p, t) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Test", power: p, toughness: t }, controller: "user", summoningSick: false });
const PT = (s, id) => { const lk = findPermanent(s, id); return `${creaturePower(lk.permanent, s)}/${creatureToughness(lk.permanent, s)}`; };

describe("double-P/T — classification", () => {
  it("flips the three clean cards native (2 of them are self-normalized referents)", () => {
    expect(classifyCard(UNNATURAL_GROWTH)).toBe("native-trigger");
    expect(classifyCard(RECKLESS_AMPLIMANCER)).toBe("native-activated");
    expect(classifyCard(TIFA)).toBe("native-trigger"); // name→self possessive rewrite
  });
  it("CREED: cards with an unmodeled sibling ability / undetected trigger / unhandled referent stay non-native", () => {
    // GRADUATED (play-weighted P·17): Zopandrel's sibling — "{G/P}{G/P}, Sacrifice two other creatures: Put an indestructible
    // counter on Zopandrel" — is modeled now (SAC-N-CLASS), so the whole card is; the rest still park on their own text.
    expect(classifyCard(ZOPANDREL)).toBe("native-mixed");
    expect(classifyCard(JUNK_JET)).not.toMatch(/^native/);         // "equipped creature's" referent unmodeled
    expect(classifyCard(EXPONENTIAL_GROWTH)).not.toMatch(/^native/); // "X times"
  });
});

describe("double-P/T — parser (split guard keeps 'power and toughness' whole)", () => {
  it("team / self forms parse HIGH to a doublePt pump atom", () => {
    const team = parseEffectClause("double the power and toughness of each creature you control until end of turn");
    expect(programConfidence(team)).toBe("high");
    expect(team.atoms).toEqual([{ op: "pump", scope: "youControl", doublePt: "pt" }]);
    const self = parseEffectClause("double this creature's power and toughness until end of turn");
    expect(programConfidence(self)).toBe("high");
    expect(self.atoms).toEqual([{ op: "pump", target: "self", doublePt: "pt" }]);
    const selfP = parseEffectClause("double this creature's power until end of turn");
    expect(programConfidence(selfP)).toBe("high");
    expect(selfP.atoms).toEqual([{ op: "pump", target: "self", doublePt: "p" }]);
  });
});

describe("double-P/T — runtime (per-target doubling, snapshot at resolution)", () => {
  it("SELF p+t: a 3/3 becomes 6/6", () => {
    let s = mk([cr("A", 3, 3)]);
    s = applyPumpEffect(s, { op: "pump", target: "self", doublePt: "pt" }, { controller: "user", sourceId: "A", cardName: "A" });
    expect(PT(s, "A")).toBe("6/6");
  });
  it("SELF power-only: a 3/3 becomes 6/3 (toughness untouched)", () => {
    let s = mk([cr("A", 3, 3)]);
    s = applyPumpEffect(s, { op: "pump", target: "self", doublePt: "p" }, { controller: "user", sourceId: "A", cardName: "A" });
    expect(PT(s, "A")).toBe("6/3");
  });
  it("TEAM p+t: each creature doubles its OWN P/T (2/2→4/4, 3/4→6/8)", () => {
    let s = mk([cr("A", 2, 2), cr("B", 3, 4)]);
    s = applyPumpEffect(s, { op: "pump", scope: "youControl", doublePt: "pt" }, { controller: "user", sourceId: "A", cardName: "Unnatural Growth" });
    expect(PT(s, "A")).toBe("4/4");
    expect(PT(s, "B")).toBe("6/8");
  });
  it("SNAPSHOT: doubles the CURRENT (already-buffed) P/T — a 3/3 under +2/+2 doubles to 10/10", () => {
    let s = mk([cr("A", 3, 3)]);
    s = addContinuousEffect(s, { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: 2, toughness: 2 }, affects: { mode: "fixed", permanentIds: ["A"] }, duration: { kind: "endOfTurn", turn: 5 }, source: { kind: "test" } }).state;
    expect(PT(s, "A")).toBe("5/5");
    s = applyPumpEffect(s, { op: "pump", target: "self", doublePt: "pt" }, { controller: "user", sourceId: "A", cardName: "A" });
    expect(PT(s, "A")).toBe("10/10");
  });
  it("ZERO power doubles to 0 (no negative delta): a 0/1 power-double stays 0/1", () => {
    let s = mk([cr("A", 0, 1)]);
    s = applyPumpEffect(s, { op: "pump", target: "self", doublePt: "p" }, { controller: "user", sourceId: "A", cardName: "A" });
    expect(PT(s, "A")).toBe("0/1");
  });
  it("NEGATIVE power (CR 701.10c): a 3/3 debuffed to -2/3 doubles to -4/6 (the signed value doubles, no 0-floor)", () => {
    // Adversarial-gate finding: a Math.max(0,…) floor under-doubled a creature at negative power. CR 701.10c —
    // "if a creature's power is less than 0 when it's doubled … it gets -X/-0" — so the power bonus is the SIGNED
    // current value. A -2-power creature must get an additional -2 (→ -4), not +0.
    let s = mk([cr("A", 3, 3)]);
    s = addContinuousEffect(s, { layer: 7, sublayer: "7c", op: { layerOp: "ptModify", power: -5, toughness: 0 }, affects: { mode: "fixed", permanentIds: ["A"] }, duration: { kind: "endOfTurn", turn: 5 }, source: { kind: "test" } }).state;
    expect(PT(s, "A")).toBe("-2/3");
    s = applyPumpEffect(s, { op: "pump", target: "self", doublePt: "pt" }, { controller: "user", sourceId: "A", cardName: "A" });
    expect(PT(s, "A")).toBe("-4/6");
  });
});
