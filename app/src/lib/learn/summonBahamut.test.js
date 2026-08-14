/**
 * summonBahamut.test.js — SUMMON: BAHAMUT (2026-08-14), the FF Summon Saga class. "I, II — Destroy up
 * to one target nonland permanent. / III — Draw two cards. / IV — Mega Flare — This creature deals
 * damage equal to the total mana value of other permanents you control to each opponent. / Flying"
 *
 * ⭐ THREE PIECES on the existing Saga machinery (parseSagaChapters + the chapter-trigger synthesis):
 *   · a pure COMBAT-KEYWORD line on a creature Saga is SKIPPED, never chapter residue (the body's
 *     keyword machinery credits it — "Flying" was the class's park).
 *   · a FLAVOR-LABELED chapter strips through the SAME single-source ABILITY_WORD_LABEL_RE every path
 *     uses ("mega flare" added to the list) — an UN-listed label keeps its raw text; anchored arms
 *     refuse it (FN-safe), though a wildcard-lead arm (the damage source phrase) parses through it.
 *   · the TOTAL-MV damage arm (CR 202.3): countForSpec's totalMvPermanentsYouControl sums the
 *     controller's permanents' printed mana values, excludeSource dropping the Saga itself ("other").
 *
 * Mutation-checked (2026-08-14, applied-check by PRINTING THE CHANGED LINE BACK; throw on no-op):
 *   · the keyword-line skip dropped → Bahamut parks (the Flying line is residue again).
 *   · excludeSource dropped from the reader → the Saga counts ITSELF (8 too high — the over-fire).
 *
 * Real oracle fixture (bundled Scryfall, probed 2026-08-14 — the FULL text).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard } from "./coverage.js";
import { parseSagaChapters } from "./saga.js";
import { parseEffectClause } from "./effects/parser.js";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import "./resolvers.js"; // the integrator — atom resolution in a witness needs the engine's registrations

beforeEach(() => _resetIdsForTests());

const BAHAMUT = { name: "Summon: Bahamut", type: "Enchantment Creature — Saga Dragon", mana: "{6}{W}{W}", keywords: [],
  power: "8", toughness: "8", cmc: 8,
  oracle: "(As this Saga enters and after your draw step, add a lore counter. Sacrifice after IV.)\nI, II — Destroy up to one target nonland permanent.\nIII — Draw two cards.\nIV — Mega Flare — This creature deals damage equal to the total mana value of other permanents you control to each opponent.\nFlying" };
const MEGA = "This creature deals damage equal to the total mana value of other permanents you control to each opponent.";

describe("the carrier and the chapter parse", () => {
  it("⭐ Bahamut flips native-trigger; four chapters, the label stripped, the keyword line skipped", () => {
    expect(classifyCard(BAHAMUT)).toBe("native-trigger");
    const p = parseSagaChapters(BAHAMUT);
    expect(p.final).toBe(4);
    expect(p.chapters.map((c) => c.n)).toEqual([1, 2, 3, 4]);
    expect(p.chapters[3].effect).toBe(MEGA); // "Mega Flare — " gone, the rules text intact
  });

  it("⛔ CREED: an UN-listed flavor label survives the strip, and an ANCHORED arm under it parks", () => {
    const p = parseSagaChapters({ ...BAHAMUT, oracle: BAHAMUT.oracle.replace("Mega Flare", "Giga Flare") });
    expect(p.chapters[3].effect).toMatch(/^Giga Flare/); // not in ABILITY_WORD_LABEL_RE → kept
    // NB the DAMAGE arm's wildcard source phrase (`^.+? deals?`) swallows any label, so THIS chapter
    // still parses — a first negative claimed it parked and failed at the gate. The FN-safety claim
    // holds where it matters: every ANCHORED arm refuses a labeled clause (the common case).
    expect(parseEffectClause("Giga Flare — Draw two cards.", "Instant").confidence).toBe("low");
  });

  it("⛔ a NON-keyword extra line still parks the whole Saga (the skip is keyword-exact)", () => {
    expect(parseSagaChapters({ ...BAHAMUT, oracle: BAHAMUT.oracle.replace("Flying", "Protection from everything") })).toBeNull();
  });
});

describe("⭐⭐ LAW 6 — Mega Flare sums OTHER permanents' mana values", () => {
  it("⭐⭐ Saga (mv 8) + mv-3 + mv-5 on board: each opponent takes exactly 8 — the Saga never counts itself", () => {
    const g = createGameState({ userDeck: [], aiDeck: [] });
    const saga = createPermanent({ id: "BAH", controller: "user", summoningSick: false, card: { id: "c-BAH", ...BAHAMUT } });
    const a = createPermanent({ id: "A3", controller: "user", summoningSick: false, card: { id: "c-A3", name: "Rock", type: "Artifact", cmc: 3, oracle: "" } });
    const b = createPermanent({ id: "B5", controller: "user", summoningSick: false, card: { id: "c-B5", name: "Golem", type: "Artifact Creature — Golem", power: "4", toughness: "4", cmc: 5, oracle: "" } });
    const s0 = { ...g, players: { ...g.players, user: { ...g.players.user, battlefield: [saga, a, b] }, ai: { ...g.players.ai, life: 40 } } };
    const prog = parseEffectClause(MEGA, "Instant", { hasX: false });
    expect(prog.confidence).toBe("high");
    const s = ATOM_RESOLVERS["deal-damage"](s0, prog.atoms[0], { controller: "user", targets: [], sourceId: "BAH", cardName: "Summon: Bahamut" });
    const row = { aiLife: s.players.ai.life };
    console.log("  WITNESS megaFlare", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row).toEqual({ aiLife: 32 }); // 40 − (3+5); the Saga's own 8 EXCLUDED
  });
});
