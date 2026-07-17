/**
 * sourceGatedAnthem.test.js — BLITZ SG-1: SOURCE-GATED GROUP ANTHEMS.
 *
 * A leveler band GROUP anthem ("Other [<Subtype> ]creatures you control get +X/+Y") is a continuous
 * effect whose GATE is a condition on the SOURCE permanent (its level counters), while the EFFECT
 * buffs OTHER permanents. This is the case LV-1 parked ("the countersOnSelf gate evaluates against the
 * AFFECTED permanent, not the source"). SG-1 wires it with a `gateOn: "source"` gate variant:
 * layers.gatePermForEffect swaps the gate's subject to the effect's source before gateMet, so the
 * anthem flips ON/OFF live as the SOURCE crosses the band boundary (CR 711.2a/b + 613.7).
 *
 * CR (verified against knowledge/mtg-judge/data/cr/cr_current.json, 2026-07-17):
 *   711.2a/b  a {LEVEL N1-N2} / {LEVEL N3+} symbol is a STATIC ability active only while
 *             N1 <= level counters on THIS permanent <= N2 (open band: no upper bound).
 *   613.4c    P/T modifications (anthems) apply in layer 7c.
 *   613.7-adj the layer system is recomputed each derive (gateMet re-reads the SOURCE's counters
 *             every P/T computation) — the anthem turns on/off the instant the SOURCE's level count
 *             crosses a band boundary. (House convention for live recompute; see layers.js gateMet.)
 *
 * Two real carriers (bundled Scryfall oracle, verified 2026-07-17):
 *   Kabira Vindicator   — "Other creatures you control get +1/+1." (band 2-4) / "+2/+2." (band 5+)
 *   Coralhelm Commander — "Other Merfolk creatures you control get +1/+1." (band 4+ only)
 *
 * WHOLE-CARD-OR-PARK (THE CREED): the anthem line is admitted ONLY through the closed
 * parseBandAnthemLine matcher (positive fixed P/T, "Other …" subject, at most one subtype). Anything
 * else (a non-"Other" subject, a dynamic/negative magnitude, a keyword tail) → unmodeledLines → the
 * whole leveler parks. Bladeback Sliver — a hellbent-gated grant of a QUOTED ACTIVATED ability, NOT a
 * P/T/keyword anthem — is out of this shape and stays body-only (documented park below).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { parseLeveler, parseBandAnthemLine } from "./leveler.js";
import { modeledLeveler } from "./effects/abilities.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real bundled oracle text, probed via cardIndex.lookupCard + publicCard 2026-07-17 and embedded verbatim
// (the house pattern — sliverInteriors.test.js; the corpus index isn't loaded inside a bare vitest run).
const KABIRA = {
  name: "Kabira Vindicator", type: "Creature — Human Knight", mana: "{3}{W}", power: "2", toughness: "4",
  oracle: "Level up {2}{W} ({2}{W}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-4\n3/6\nOther creatures you control get +1/+1.\nLEVEL 5+\n4/8\nOther creatures you control get +2/+2.",
};
const CORALHELM = {
  name: "Coralhelm Commander", type: "Creature — Merfolk Soldier", mana: "{1}{U}", power: "2", toughness: "2",
  oracle: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-3\n3/3\nFlying\nLEVEL 4+\n4/4\nFlying\nOther Merfolk creatures you control get +1/+1.",
};
const BLADEBACK = { // real oracle (verbatim) — a hellbent-gated QUOTED ACTIVATED-ability group grant, NOT an anthem
  name: "Bladeback Sliver", type: "Creature — Sliver", mana: "{1}{R}", power: "2", toughness: "2",
  oracle: 'Hellbent — As long as you have no cards in hand, Sliver creatures you control have "{T}: This creature deals 1 damage to target player or planeswalker."',
};

// ─── 1. leveler.js parseBandAnthemLine — a CLOSED matcher (CREED) ──────────────────────────────

describe("parseBandAnthemLine — the closed band-anthem matcher", () => {
  it("recognizes the two real band-anthem shapes (all-creatures and one-subtype)", () => {
    expect(parseBandAnthemLine("Other creatures you control get +1/+1.")).toEqual({ subtype: null, power: 1, toughness: 1 });
    expect(parseBandAnthemLine("Other creatures you control get +2/+2.")).toEqual({ subtype: null, power: 2, toughness: 2 });
    expect(parseBandAnthemLine("Other Merfolk creatures you control get +1/+1.")).toEqual({ subtype: "Merfolk", power: 1, toughness: 1 });
  });
  it("fails closed on everything outside the shape (→ unmodeledLines → park)", () => {
    // A NON-"Other" subject (the source would be wrongly included) — parked, not modeled.
    expect(parseBandAnthemLine("Creatures you control get +1/+1.")).toBeNull();
    // A dynamic / X magnitude — not a fixed anthem.
    expect(parseBandAnthemLine("Other creatures you control get +X/+X.")).toBeNull();
    // A negative anthem — outside the admitted positive shape.
    expect(parseBandAnthemLine("Other creatures you control get -1/-1.")).toBeNull();
    // A keyword tail — the anthem grants MORE than P/T; whole line unmodeled.
    expect(parseBandAnthemLine("Other creatures you control get +1/+1 and have flying.")).toBeNull();
    // An opponents-scoped debuff — not a "you control" self-group anthem.
    expect(parseBandAnthemLine("Creatures your opponents control get -1/-1.")).toBeNull();
  });
  it("the anthem line lands in the band's `anthems` bucket, NOT unmodeledLines", () => {
    const lv = parseLeveler(KABIRA);
    expect(lv.bands[0]).toMatchObject({ atLeast: 2, atMost: 4, pt: { power: 3, toughness: 6 }, anthems: [{ subtype: null, power: 1, toughness: 1 }], unmodeledLines: [] });
    expect(lv.bands[1]).toMatchObject({ atLeast: 5, atMost: null, pt: { power: 4, toughness: 8 }, anthems: [{ subtype: null, power: 2, toughness: 2 }], unmodeledLines: [] });
    const co = parseLeveler(CORALHELM);
    expect(co.bands[0]).toMatchObject({ atLeast: 2, atMost: 3, keywords: ["flying"], anthems: [], unmodeledLines: [] });
    expect(co.bands[1]).toMatchObject({ atLeast: 4, atMost: null, keywords: ["flying"], anthems: [{ subtype: "Merfolk", power: 1, toughness: 1 }], unmodeledLines: [] });
  });
});

// ─── 2. Recognition on REAL oracle — the whole card flips native-mixed ─────────────────────────

describe("classification — Kabira / Coralhelm flip native-mixed on real oracle", () => {
  it("both cards classify native-mixed (were body-only pre-SG-1)", () => {
    for (const fx of [KABIRA, CORALHELM]) {
      expect(modeledLeveler(fx), fx.name).not.toBeNull();
      expect(classifyCard(fx), fx.name).toBe("native-mixed");
    }
  });
  it("modeledLeveler carries the band anthems through", () => {
    const lv = modeledLeveler(KABIRA);
    expect(lv.bands.map((b) => b.anthems)).toEqual([[{ subtype: null, power: 1, toughness: 1 }], [{ subtype: null, power: 2, toughness: 2 }]]);
    expect(modeledLeveler(CORALHELM).bands.map((b) => b.anthems)).toEqual([[], [{ subtype: "Merfolk", power: 1, toughness: 1 }]]);
  });
  it("the emitted anthem static is a layer-7c ptModifyGated with a SOURCE gate over OTHER creatures", () => {
    const anthems = parseStaticAbilities(KABIRA).filter((s) => s.op?.layerOp === "ptModifyGated");
    expect(anthems).toHaveLength(2);
    expect(anthems[0]).toMatchObject({
      layer: 7, sublayer: "7c",
      op: { layerOp: "ptModifyGated", power: 1, toughness: 1, gate: { countSpec: { kind: "countersOnSelf", counterType: "level" }, atLeast: 2, atMost: 4, gateOn: "source" } },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], excludeSelf: true } },
    });
    // Coralhelm's single anthem carries the Merfolk subtype restriction.
    const co = parseStaticAbilities(CORALHELM).filter((s) => s.op?.layerOp === "ptModifyGated");
    expect(co).toHaveLength(1);
    expect(co[0].affects.selector).toMatchObject({ controllerScope: "you", cardTypes: ["Creature"], excludeSelf: true, subtypes: ["Merfolk"] });
    expect(co[0].op.gate).toMatchObject({ atLeast: 4, gateOn: "source" });
    expect(co[0].op.gate.atMost).toBeUndefined(); // open band — no upper bound
  });
});

// ─── 3. Runtime — the anthem switches ON/OFF live at the SOURCE's band boundary ─────────────────

// A board: the leveler (permId), a plain OTHER creature the anthem should buff, and (optionally) a
// Merfolk. Level counters go on whichever permanent `withLevelOn` names — the pin that proves the gate
// reads the SOURCE, not the affected permanent.
function board(levelerCard, others = []) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  const src = createPermanent({ id: "src", card: levelerCard, controller: "user", summoningSick: false });
  const perms = [src, ...others.map((o) => createPermanent({ id: o.id, card: o.card, controller: "user", summoningSick: false }))];
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: perms } } };
}
// Put N level counters on the permanent named `onId` (leaving everything else at zero).
const withLevelOn = (s, onId, n) => ({
  ...s,
  players: Object.fromEntries(Object.entries(s.players).map(([pid, pl]) => [pid, { ...pl, battlefield: (pl.battlefield || []).map((p) => (p.id === onId ? { ...p, counters: n ? { level: n } : {} } : p)) }])),
});
const VANILLA = { name: "Bear", type: "Creature — Bear", power: "2", toughness: "2", oracle: "" };
const MERFOLK = { name: "Merfolk Scout", type: "Creature — Merfolk Scout", power: "1", toughness: "1", oracle: "" };

describe("runtime — the Kabira anthem tracks the SOURCE's level band, buffs OTHERS, excludes self", () => {
  it("below the first band (0-1 counters) the anthem is OFF — no buff to the other creature", () => {
    const s = board(KABIRA, [{ id: "bear", card: VANILLA }]);
    for (const n of [0, 1]) {
      const t = withLevelOn(s, "src", n);
      expect(permanentPower(t, "bear"), `level ${n}`).toBe(2);
      expect(permanentToughness(t, "bear"), `level ${n}`).toBe(2);
    }
  });
  it("band 2-4: the other creature gets +1/+1; band 5+: it gets +2/+2 (bands are exclusive)", () => {
    const s = board(KABIRA, [{ id: "bear", card: VANILLA }]);
    const read = (n) => { const t = withLevelOn(s, "src", n); return `${permanentPower(t, "bear")}/${permanentToughness(t, "bear")}`; };
    expect(read(2)).toBe("3/3");  // band 2-4 opens: +1/+1
    expect(read(4)).toBe("3/3");  // upper edge inclusive
    expect(read(5)).toBe("4/4");  // band 2-4 CLOSES (atMost 4), band 5+ opens: +2/+2
    expect(read(9)).toBe("4/4");  // open band, no upper bound — still +2/+2
  });
  it("the anthem excludes the SOURCE itself ('Other') — Kabira shows only its own band P/T box", () => {
    const s = withLevelOn(board(KABIRA, [{ id: "bear", card: VANILLA }]), "src", 3);
    expect(permanentPower(s, "src")).toBe(3);   // band 2-4 box 3/6, NOT 3+1 (no self-anthem)
    expect(permanentToughness(s, "src")).toBe(6);
  });
  it("THE SOURCE PIN: level counters on the AFFECTED creature (not the source) leave the anthem OFF", () => {
    // Kabira at 0 counters; the bear carries 3 level counters. The gate reads the SOURCE (Kabira), so the
    // anthem stays closed — proving gateMet is evaluated against the source, never the affected permanent
    // (the exact LV-1 park bug this slice fixes). The stray counters on a vanilla creature do nothing.
    const s = withLevelOn(board(KABIRA, [{ id: "bear", card: VANILLA }]), "bear", 3);
    expect(permanentPower(s, "bear")).toBe(2);
    expect(permanentToughness(s, "bear")).toBe(2);
  });
});

describe("runtime — Coralhelm's anthem is subtype-gated (Merfolk only) and band-4-gated on the source", () => {
  it("at band 4+ only the OTHER Merfolk is buffed; a non-Merfolk is not; the source is excluded", () => {
    const s = withLevelOn(board(CORALHELM, [{ id: "merf", card: MERFOLK }, { id: "bear", card: VANILLA }]), "src", 4);
    expect(`${permanentPower(s, "merf")}/${permanentToughness(s, "merf")}`).toBe("2/2"); // 1/1 +1/+1
    expect(`${permanentPower(s, "bear")}/${permanentToughness(s, "bear")}`).toBe("2/2"); // untouched (not Merfolk)
    expect(`${permanentPower(s, "src")}/${permanentToughness(s, "src")}`).toBe("4/4");   // band-4 box, no self-anthem
  });
  it("below band 4 (source at level 3) the Merfolk anthem is OFF even for a Merfolk", () => {
    const s = withLevelOn(board(CORALHELM, [{ id: "merf", card: MERFOLK }]), "src", 3);
    expect(`${permanentPower(s, "merf")}/${permanentToughness(s, "merf")}`).toBe("1/1");
  });
});

// ─── 4. CREED FN guards — the parked neighbors stay parked ──────────────────────────────────────

describe("FN guards — source-gated grants outside the modeled anthem shape stay body-only", () => {
  it("Bladeback Sliver (hellbent → a QUOTED ACTIVATED-ability group grant, not an anthem) stays body-only", () => {
    // A source-gated grant of a QUOTED ACTIVATED ability (source-gated quoted-activated group grants are a
    // future slice), NOT the fixed P/T anthem shape SG-1 ships — so it must stay parked. (SP-1's brief
    // mis-quoted this card as granting "double strike"; the real grant is the tap-for-1-damage ability.)
    expect(/Hellbent/.test(BLADEBACK.oracle)).toBe(true);
    expect(/\{T\}: This creature deals 1 damage/.test(BLADEBACK.oracle)).toBe(true);
    expect(modeledLeveler(BLADEBACK)).toBeNull(); // not a leveler
    expect(classifyCard(BLADEBACK)).toBe("body-only");
  });
  it("a leveler whose band anthem is non-'Other' (would include the source) parks whole", () => {
    const bad = {
      name: "Fake Leveler A", type: "Creature — Human", power: "1", toughness: "1",
      oracle: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-4\n3/3\nCreatures you control get +1/+1.\nLEVEL 5+\n5/5",
    };
    expect(parseLeveler(bad).bands[0].unmodeledLines).toEqual(["Creatures you control get +1/+1."]);
    expect(modeledLeveler(bad)).toBeNull();
    expect(classifyCard(bad)).toBe("body-only");
    expect(parseStaticAbilities(bad)).toEqual([]); // parked → emits nothing
  });
  it("a leveler whose band anthem has a keyword tail (grants more than P/T) parks whole", () => {
    const bad = {
      name: "Fake Leveler B", type: "Creature — Human", power: "1", toughness: "1",
      oracle: "Level up {1} ({1}: Put a level counter on this. Level up only as a sorcery.)\nLEVEL 2-4\n3/3\nOther creatures you control get +1/+1 and have flying.\nLEVEL 5+\n5/5",
    };
    expect(modeledLeveler(bad)).toBeNull();
    expect(classifyCard(bad)).toBe("body-only");
  });
});
