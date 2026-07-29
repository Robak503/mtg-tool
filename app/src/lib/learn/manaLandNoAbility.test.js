/**
 * manaLandNoAbility.test.js — PHANTOM MANA: a land with no mana ability was tapping for {C}.
 *
 * THE ASSUMPTION THAT WAS WRONG. manaModel's land fallback read, in full:
 *     "A land we couldn't otherwise parse still taps for something — assume colorless so it can at least
 *      pay generic. Never invents a color."
 * "Never invents a color" was true. "Still taps for something" was not, and it is not a rare exception —
 * **54 corpus lands print no mana ability at all**, led by EVERY FETCHLAND (Polluted Delta #36, Evolving
 * Wilds #18, Terramorphic Expanse #27, Fabled Passage #50, the whole Onslaught/Zendikar cycle) plus Maze of
 * Ith, Glacial Chasm, Diamond Valley and Dark Depths. A fetchland has no mana ability — it sacrifices
 * itself to search. Each was credited a REPEATABLE, TAPLESS {C}.
 *
 * ⛔ MEASURED, NOT ARGUED: a battlefield holding nothing but Maze of Ith could pay {1}. In a fetch-heavy
 * deck that is a fistful of fabricated mana every turn, and it flows straight into self-play training data —
 * the exact failure the other phantom-mana gates in manaModel exist to prevent (Utopia Mycon's sac cost, the
 * Springleaf Drum compound-cost guard, the token-maker reminder strip). This one sat underneath all of them,
 * in the fallback.
 *
 * ⚠️ FOUND SIDEWAYS, BY A CONTROL. I was measuring whether a quoted mana GRANT reached lands; the control —
 * the same board WITHOUT the granter — came back 1 instead of 0. The grant was irrelevant; the blank land
 * was a source on its own. The control WAS the finding. Second time this run that adding a
 * without-the-thing control turned a green measurement into a bug.
 *
 * THE RULE NOW: a land produces mana only if it has a BASIC LAND TYPE (CR 305.6, printed in no oracle) or
 * its oracle says "add" somewhere (a printed ability the parser merely failed to read — the case the
 * fallback was actually written for). Everything else produces nothing: an UNDER-count, the safe direction.
 *
 * Fixtures are VERBATIM oracle/type lines pulled from the bundled index (the test env has no oracle repo,
 * so they are inlined rather than looked up).
 */
import { describe, expect, it } from "vitest";

import { manaProduction, manaSources, canAfford } from "./manaModel.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";

// ── NO mana ability: nothing in the oracle says "add", no basic land type ──
const NO_ABILITY = [
  { name: "Polluted Delta", type: "Land", oracle: "{T}, Pay 1 life, Sacrifice this land: Search your library for an Island or Swamp card, put it onto the battlefield, then shuffle." },
  { name: "Evolving Wilds", type: "Land", oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle." },
  { name: "Fabled Passage", type: "Land", oracle: "{T}, Sacrifice this land: Search your library for a basic land card, put it onto the battlefield tapped, then shuffle. Then if you control four or more lands, untap that land." },
  { name: "Maze of Ith", type: "Land", oracle: "{T}: Untap target attacking creature. Prevent all combat damage that would be dealt to and dealt by that creature this turn." },
  { name: "Glacial Chasm", type: "Land", oracle: "Cumulative upkeep—Pay 2 life. (At the beginning of your upkeep, put an age counter on this permanent, then sacrifice it unless you pay its upkeep cost for each age counter on it.)\nWhen this land enters, sacrifice a land.\nCreatures you control can't attack.\nPrevent all damage that would be dealt to you." },
  { name: "Dark Depths", type: "Legendary Snow Land", oracle: "Dark Depths enters with ten ice counters on it.\n{3}: Remove an ice counter from Dark Depths.\nWhen Dark Depths has no ice counters on it, sacrifice it. If you do, create Marit Lage, a legendary 20/20 black Avatar creature token with flying and indestructible." },
];

// ── SHOULD still make mana ──
const REAL_SOURCES = [
  [{ name: "Forest", type: "Basic Land — Forest", oracle: "({T}: Add {G}.)" }, { colors: ["G"], amount: 1 }],
  [{ name: "Wastes", type: "Basic Land", oracle: "{T}: Add {C}." }, { colors: ["C"], amount: 1 }],
];

describe("⛔ lands with NO mana ability produce NOTHING", () => {
  it("⭐ fetchlands — the largest and most-played group", () => {
    for (const c of NO_ABILITY.slice(0, 3)) expect(manaProduction(c), c.name).toBeNull();
  });

  it("⭐ and the utility lands that never tapped for mana either", () => {
    for (const c of NO_ABILITY.slice(3)) expect(manaProduction(c), c.name).toBeNull();
  });

  it("⛔ THE SPENDABILITY PROOF — a lone Maze of Ith can no longer pay {1}", () => {
    // What makes this a bug report rather than a shape change: the fabricated mana was real enough to cast
    // with. Asserting manaProduction alone would not have shown that.
    _resetIdsForTests();
    const s = createGameState({ userDeck: [], aiDeck: [] });
    const maze = createPermanent({ id: "m", controller: "user", card: { id: "cm", ...NO_ABILITY[3] } });
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [maze] } } };
    const one = { generic: 1, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [] };
    expect(manaSources(st, "user")).toHaveLength(0);
    expect(canAfford(st.players.user.manaPool, manaSources(st, "user"), one)).toBe(false);
  });
});

describe("⭐ CONTROL — every land that SHOULD make mana still does", () => {
  it("basic land types keep their mana (CR 305.6)", () => {
    for (const [card, want] of REAL_SOURCES) expect(manaProduction(card), card.name).toEqual(want);
  });

  it("lands that PRINT a mana ability are untouched", () => {
    // Spread across shapes on purpose: a double-colorless with a drawback, a man-land, a five-colour fixer,
    // and a pain land. If the narrowing had over-reached, one of these would have gone null.
    expect(manaProduction({ name: "Ancient Tomb", type: "Land", oracle: "{T}: Add {C}{C}. This land deals 2 damage to you." }))
      .toMatchObject({ colors: ["C"], amount: 2 });
    expect(manaProduction({ name: "Mishra's Factory", type: "Land", oracle: "{T}: Add {C}.\n{1}: This land becomes a 2/2 Assembly-Worker artifact creature until end of turn. It's still a land.\n{T}: Target Assembly-Worker creature gets +1/+1 until end of turn." }))
      .toMatchObject({ colors: ["C"], amount: 1 });
    expect(manaProduction({ name: "City of Brass", type: "Land", oracle: "Whenever this land becomes tapped, it deals 1 damage to you.\n{T}: Add one mana of any color." }))
      .toMatchObject({ colors: ["W", "U", "B", "R", "G"] });
  });

  it("a land whose ability the parser cannot READ still falls back to colorless", () => {
    // The fallback's real purpose, preserved: it prints "Add", so it HAS an ability; we just can't parse it.
    expect(manaProduction({ name: "Weird Land", type: "Land", oracle: "{T}: Add one mana of a color nobody has named yet." }))
      .toEqual({ colors: ["C"], amount: 1 });
  });
});

describe("⚠️ ACCEPTED UNDER-COUNT — pinned so it is not 'fixed' by re-widening the fallback", () => {
  it("Urborg and Yavimaya now produce nothing, and that is the SAFE wrong answer", () => {
    // Both say "Each land is a Swamp/Forest in addition to its other land types", so in real Magic they tap
    // for {B}/{G} via a basic type they grant THEMSELVES. They print no "add" and carry no basic subtype.
    // They were already wrong here — credited {C}, a colour they cannot make — so this trades a WRONG answer
    // for a MISSING one, the direction the creed requires. Modelling the self-granted land type is its own
    // slice; re-widening this fallback to recover them would restore phantom mana on all 54.
    expect(manaProduction({ name: "Urborg, Tomb of Yawgmoth", type: "Legendary Land", oracle: "Each land is a Swamp in addition to its other land types." })).toBeNull();
    expect(manaProduction({ name: "Yavimaya, Cradle of Growth", type: "Legendary Land", oracle: "Each land is a Forest in addition to its other land types." })).toBeNull();
  });
});
