/**
 * whirOfInvention.test.js — the X-CAPPED SEARCH→BATTLEFIELD arm (bfx) learns the rest of its own allowlist.
 *
 * Whir of Invention ({X}{U}{U}{U}, Instant): "Improvise … / Search your library for an artifact card with
 * mana value X or less, put it onto the battlefield, then shuffle."
 *
 * ⭐ THE NARROW WORD SET WAS AN INCONSISTENCY, NOT A GUARD. `bfx` was hard-limited to the two literal words
 * creature|permanent while its FIXED-cap twin `bfn` — ten lines below in the same file — has always taken any
 * `parseTutorFilter` phrase (artifact, enchantment, Equipment, "Rebel permanent"). Both arms carry the
 * IDENTICAL safety argument, and bfn's own comment states it: the MV cap is what makes an uncapped fetch
 * impossible. X-bound-at-cast (CR 202.3b) is exactly as real a cap as a printed N. So Soul of Mirrodin's
 * artifact fetch at a fixed cap worked while Whir's at an X cap parked, for no reason either comment gave.
 *
 * ⛔ The allowlist stays the gate. An unmodeled filter word returns null → LOW → Arbiter, and the colour
 * prefix is still admitted ONLY on "creature" (a "green permanent" is not a printed shape).
 *
 * Improvise needs no work here — it is already stripped as a cost-only keyword.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { resolveTutorChoice, autoPickTutorCandidate } from "./effects/runProgram.js";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const WHIR = { name: "Whir of Invention", type: "Instant", mana: "{X}{U}{U}{U}",
  oracle: "Improvise (Your artifacts can help cast this spell. Each artifact you tap after you're done activating mana abilities pays for {1}.)\nSearch your library for an artifact card with mana value X or less, put it onto the battlefield, then shuffle." };

const atoms = (txt) => parseEffectClause(txt, "Instant", { hasX: true })?.atoms;
const SEARCH = "Search your library for an artifact card with mana value X or less, put it onto the battlefield, then shuffle.";
const artifactCard = (id, name, cmc) => ({ id, name, type: "Artifact", mana_cost: `{${cmc}}`, cmc, oracle: "" });
const creatureCard = (id, name, cmc) => ({ id, name, type: "Creature — Beast", mana_cost: `{${cmc}}`, cmc, oracle: "" });
function board(userLib = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, library: userLib } } };
}

describe("the PARSER takes the whole tutor allowlist, not two literal words", () => {
  it("artifact carries the X cap and the battlefield destination", () => {
    expect(atoms(SEARCH)).toEqual([{
      op: "tutor", filter: { groups: [["artifact"]], mvCapX: true },
      filterLabel: "artifact card with mana value X or less",
      destination: "battlefield", entersTapped: false, targetType: null,
    }]);
  });

  it("the two forms that already worked are byte-identical", () => {
    expect(atoms("Search your library for a creature card with mana value X or less, put it onto the battlefield, then shuffle.")[0])
      .toMatchObject({ filter: { groups: [["creature"]], mvCapX: true }, filterLabel: "creature card with mana value X or less" });
    expect(atoms("Search your library for a permanent card with mana value X or less, put it onto the battlefield, then shuffle.")[0])
      .toMatchObject({ filter: { groups: [], permanentOnly: true, mvCapX: true }, filterLabel: "permanent card with mana value X or less" });
  });

  it("the colour prefix still rides only on 'creature' (Green Sun's Zenith)", () => {
    expect(atoms("Search your library for a green creature card with mana value X or less, put it onto the battlefield, then shuffle.")[0])
      .toMatchObject({ filter: { groups: [["creature"]], mvCapX: true, colors: ["green"] } });
  });

  it("⛔ an unmodeled filter word parks the clause (the allowlist is the gate)", () => {
    expect(atoms("Search your library for a widget card with mana value X or less, put it onto the battlefield, then shuffle.")).toEqual([]);
  });

  it("⛔ a colour prefix on a NON-creature phrase still parks", () => {
    expect(atoms("Search your library for a green artifact card with mana value X or less, put it onto the battlefield, then shuffle.")).toEqual([]);
  });
});

describe("⭐ RUNTIME — the X cap is enforced and only artifacts are offered", () => {
  it("X=3: a MV-2 artifact is fetchable, a MV-5 artifact is over the cap, a MV-2 CREATURE is the wrong type", () => {
    let s = board([artifactCard("cheap", "Cheap Cog", 2), artifactCard("pricey", "Pricey Engine", 5), creatureCard("bear", "Grizzly Bears", 2)]);
    s = ATOM_RESOLVERS.tutor(s, atoms(SEARCH)[0], { controller: "user", targets: [], xValue: 3, cardName: "Whir of Invention" });
    expect(s.pendingChoice).toMatchObject({ kind: "tutor-search", destination: "battlefield" });
    expect(s.pendingChoice.candidates.map((c) => c.id)).toEqual(["cheap"]);   // ⭐ cap AND type both hold
    s = resolveTutorChoice(s, autoPickTutorCandidate(s, s.pendingChoice));
    expect(s.players.user.battlefield.some((pm) => pm.card.name === "Cheap Cog")).toBe(true);
    expect(s.players.user.library.some((c) => c.id === "cheap")).toBe(false);
    expect(s.pendingChoice).toBeFalsy();
  });

  it("⛔ CREED — X=0 caps at 0, it does NOT mean uncapped", () => {
    let s = board([artifactCard("one", "One Drop", 1)]);
    s = ATOM_RESOLVERS.tutor(s, atoms(SEARCH)[0], { controller: "user", targets: [], xValue: 0, cardName: "Whir of Invention" });
    expect(s.pendingChoice?.candidates || []).toHaveLength(0);
  });

  it("⛔ CREED — a MISSING xValue is treated as 0, never as uncapped", () => {
    let s = board([artifactCard("one", "One Drop", 1)]);
    s = ATOM_RESOLVERS.tutor(s, atoms(SEARCH)[0], { controller: "user", targets: [], cardName: "Whir of Invention" });
    expect(s.pendingChoice?.candidates || []).toHaveLength(0);
  });
});

describe("coverage", () => {
  it("Whir of Invention flips native-spell", () => {
    expect(classifyCard(WHIR)).toBe("native-spell");
  });

  it("⛔ an unmodeled companion line still parks it", () => {
    expect(classifyCard({ ...WHIR, name: "Fake Whir",
      oracle: WHIR.oracle + "\nWhenever a player consults an oracle, interpret its riddle however you like." }))
      .not.toMatch(/^native/);
  });
});
