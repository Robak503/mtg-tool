/**
 * costReduction.test.js — STATIC-COST-REDUCTION: "<Subtype> spells you cast cost {N} less to cast".
 *
 * Dragonspeaker Shaman ("Dragon spells you cast cost {2} less to cast.") → every Dragon in Joe's
 * The Ur-Dragon; Gargos, Vicious Watcher ("Hydra spells you cast cost {4} less to cast.") → Hydras
 * in Colton's Zaxara. The reduction trims the GENERIC portion of a matching spell at the cast site,
 * floored at {0} (CR 601.2f — effects may reduce the cost to pay); the mana value is UNCHANGED
 * (CR 202.3 — MV is the printed mana cost).
 *
 * Pieces under test:
 *   1. Parser: a subtype clause → a { costReduction } marker descriptor (Dragon/Hydra/Goblin forms).
 *   2. Parser exclusions: a color / card-type / supertype / "noncreature" subject → NO marker (those
 *      never appear as a type-line token, so claiming native while never reducing would be a false
 *      positive — left body-only as a safe false-negative).
 *   3. collectCostReducers / costReductionForSpell: type-line (not name) word-bounded match, stacking.
 *   4. Coverage flip: Dragonspeaker → "native-static"; Ruby Medallion (color) → not native.
 *   5. Engine: legalActionsForPlayer trims the cast action's cost.generic (MV/cmc untouched), floors
 *      at {0}, leaves off-subtype spells alone, and reduces an {X}-spell's fixed base before {X}.
 *
 * Every expected value below was confirmed against the live parser + engine before being written.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseStaticAbilities, collectCostReducers, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";

beforeEach(() => _resetIdsForTests());

// ─── real card fixtures (oracle text verified against bundled Scryfall data) ─────
const DRAGONSPEAKER = () => ({ name: "Dragonspeaker Shaman", type: "Creature — Human Barbarian Shaman", oracle: "Dragon spells you cast cost {2} less to cast.", mana: "{1}{R}", keywords: [] });
const GARGOS = () => ({ name: "Gargos, Vicious Watcher", type: "Legendary Creature — Hydra", mana: "{3}{G}{G}{G}", keywords: [], oracle: "Vigilance\nHydra spells you cast cost {4} less to cast.\nWhenever a creature you control becomes the target of a spell, Gargos fights up to one target creature you don't control." });
const RUBY_MEDALLION = () => ({ name: "Ruby Medallion", type: "Artifact", oracle: "Red spells you cast cost {1} less to cast.", mana: "{2}" });

// ─── 1. Parser: the { costReduction } marker ────────────────────────────────────

describe("STATIC-COST-REDUCTION — parser marker", () => {
  it("Dragonspeaker Shaman → exactly one Dragon/2 cost-reduction marker", () => {
    expect(parseStaticAbilities(DRAGONSPEAKER())).toEqual([{ costReduction: { subtype: "Dragon", amount: 2 } }]);
  });

  it("Gargos → a Hydra/4 marker (the Vigilance keyword + the fight trigger don't add static descriptors)", () => {
    expect(parseStaticAbilities(GARGOS())).toEqual([{ costReduction: { subtype: "Hydra", amount: 4 } }]);
  });

  it("'you cast' is optional — 'Goblin spells cost {1} less to cast.' still parses", () => {
    const goblin = { type: "Creature — Goblin", oracle: "Goblin spells cost {1} less to cast." };
    expect(parseStaticAbilities(goblin)).toEqual([{ costReduction: { subtype: "Goblin", amount: 1 } }]);
  });

  it("the subject's case is canonicalized (lowercase oracle → capitalized subtype)", () => {
    const z = { type: "Creature — Zombie", oracle: "Zombie spells you cast cost {3} less to cast." };
    expect(parseStaticAbilities(z)).toEqual([{ costReduction: { subtype: "Zombie", amount: 3 } }]);
  });
});

// ─── 2. Parser exclusions: never claim native for a non-type-line subject ────────

describe("STATIC-COST-REDUCTION — excluded subjects stay body-only (safe FN)", () => {
  // Each subject below is filtered (color / card-type / supertype / "noncreature") so it produces NO
  // marker — its word-bounded type-line match would never fire, so a native claim would be a false
  // positive. The clause stays unmodeled (body-only) instead.
  const cases = [
    ["color (Red — Ruby Medallion)", "Red spells you cast cost {1} less to cast."],
    ["noncreature", "Noncreature spells you cast cost {1} less to cast."],
    ["card type (Artifact — Foundry Inspector)", "Artifact spells you cast cost {1} less to cast."],
    ["card type (Enchantment — Starfield Mystic)", "Enchantment spells you cast cost {1} less to cast."],
    ["supertype (Legendary — Kethis)", "Legendary spells you cast cost {1} less to cast."],
    ["generic 'creature'", "Creature spells you cast cost {1} less to cast."],
    ["colorless (Ugin)", "Colorless spells you cast cost {2} less to cast."],
    ["compound 'instant and sorcery'", "Instant and sorcery spells you cast cost {1} less to cast."],
    ["'{X} less' (non-numeric)", "Dragon spells you cast cost {X} less to cast."],
    ["a trailing rider breaks the anchor", "Dragon spells you cast cost {1} less to cast for each Mountain you control."],
  ];
  for (const [label, oracle] of cases) {
    it(`${label} → no cost-reduction marker`, () => {
      const descriptors = parseStaticAbilities({ type: "Artifact", oracle });
      expect(descriptors.some((d) => d.costReduction)).toBe(false);
    });
  }
});

// ─── 3. collectCostReducers / costReductionForSpell ─────────────────────────────

describe("STATIC-COST-REDUCTION — collect + match helpers", () => {
  it("collectCostReducers gathers reducers across a battlefield, ignoring non-reducers", () => {
    const bf = [DRAGONSPEAKER(), { type: "Creature — Bear", oracle: "" }, GARGOS()];
    expect(collectCostReducers(bf)).toEqual([
      { subtype: "Dragon", amount: 2 },
      { subtype: "Hydra", amount: 4 },
    ]);
  });

  it("matches the TYPE LINE, not the name — a Dragon creature is reduced", () => {
    expect(costReductionForSpell([{ subtype: "Dragon", amount: 2 }], { type: "Creature — Dragon" })).toBe(2);
  });

  it("a Tribal/Kindred spell of the subtype matches (subtype on the type line)", () => {
    expect(costReductionForSpell([{ subtype: "Dragon", amount: 2 }], { type: "Tribal Sorcery — Dragon" })).toBe(2);
  });

  it("an off-subtype spell that only NAMES the subtype is NOT reduced (Beast Within)", () => {
    expect(costReductionForSpell([{ subtype: "Beast", amount: 1 }], { type: "Instant", name: "Beast Within" })).toBe(0);
  });

  it("stacks: two Dragon reducers sum", () => {
    expect(costReductionForSpell([{ subtype: "Dragon", amount: 2 }, { subtype: "Dragon", amount: 2 }], { type: "Creature — Dragon" })).toBe(4);
  });

  it("no type line / no reducers → 0", () => {
    expect(costReductionForSpell([{ subtype: "Dragon", amount: 2 }], {})).toBe(0);
    expect(costReductionForSpell([], { type: "Creature — Dragon" })).toBe(0);
  });
});

// ─── 4. Coverage flip ───────────────────────────────────────────────────────────

describe("STATIC-COST-REDUCTION — coverage", () => {
  it("Dragonspeaker Shaman (single covered clause) flips to native-static", () => {
    expect(classifyCard(DRAGONSPEAKER())).toBe("native-static");
  });

  it("Ruby Medallion (color → excluded → uncovered clause) stays non-native", () => {
    expect(classifyCard(RUBY_MEDALLION())).not.toBe("native-static");
  });

  it("Gargos stays non-native (its fight trigger is uncovered) even though its Hydra reducer is collected", () => {
    expect(classifyCard(GARGOS())).not.toBe("native-static");
  });
});

// ─── 5. Engine: the cast-site reduction ─────────────────────────────────────────

describe("STATIC-COST-REDUCTION — engine cast actions", () => {
  function mkState({ hand = [], battlefield = [], mana = {} }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana }, hand, battlefield },
      },
    };
  }
  const speakerPerm = () => createPermanent({ card: DRAGONSPEAKER(), controller: "user" });
  const castActions = (s, id) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === id);
  const DRAGON = { id: "drag1", name: "Test Dragon", type: "Creature — Dragon", mana: "{4}{R}{R}", oracle: "", keywords: [] };

  it("a Dragon's generic is reduced by {2} with one Dragonspeaker; its mana value is unchanged", () => {
    const a = castActions(mkState({ hand: [DRAGON], battlefield: [speakerPerm()], mana: { R: 8 } }), "drag1")[0];
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(2); // {4}{R}{R} → {2}{R}{R}
    expect(a.cmc).toBe(6); // CR 202.3 — MV stays the printed 6
  });

  it("the same Dragon WITHOUT a reducer costs its printed {4}", () => {
    const a = castActions(mkState({ hand: [DRAGON], mana: { R: 8 } }), "drag1")[0];
    expect(a.cost.generic).toBe(4);
    expect(a.cmc).toBe(6);
  });

  it("an off-subtype spell (a Goblin) is NOT reduced by a Dragon reducer", () => {
    const goblin = { id: "gob1", name: "Test Goblin", type: "Creature — Goblin", mana: "{4}{R}", oracle: "", keywords: [] };
    const a = castActions(mkState({ hand: [goblin], battlefield: [speakerPerm()], mana: { R: 8 } }), "gob1")[0];
    expect(a.cost.generic).toBe(4);
  });

  it("the reduction floors at {0} — two Dragonspeakers ({4}) on a {4}{R}{R} Dragon → generic 0", () => {
    const a = castActions(mkState({ hand: [DRAGON], battlefield: [speakerPerm(), speakerPerm()], mana: { R: 8 } }), "drag1")[0];
    expect(a.cost.generic).toBe(0); // max(0, 4 - 4); the {R}{R} pips are never reduced
  });

  it("an {X}-spell's fixed base is reduced before {X} is added (Hydra {3}{X}{G}, reducer {1})", () => {
    const hydra = { id: "hyd1", name: "Test Hydra", type: "Creature — Hydra", mana: "{3}{X}{G}", oracle: "This creature enters the battlefield with X +1/+1 counters on it.", keywords: [] };
    const reducer = createPermanent({ card: { type: "Creature — Hydra", oracle: "Hydra spells you cast cost {1} less to cast.", mana: "{2}{G}" }, controller: "user" });
    const withR = castActions(mkState({ hand: [hydra], battlefield: [reducer], mana: { G: 12 } }), "hyd1").find((a) => a.xValue === 1);
    const noR = castActions(mkState({ hand: [hydra], mana: { G: 12 } }), "hyd1").find((a) => a.xValue === 1);
    expect(noR.cost.generic).toBe(4); // base 3 + X(1)
    expect(withR.cost.generic).toBe(3); // base 3→2, + X(1)
  });

  it("documented safe-FN: a pure {X}{G} spell (base 0) floors the reduction away (under-delivery, not misplay)", () => {
    const pure = { id: "hyd2", name: "Pure Hydra", type: "Creature — Hydra", mana: "{X}{G}", oracle: "This creature enters the battlefield with X +1/+1 counters on it.", keywords: [] };
    const reducer = createPermanent({ card: { type: "Creature — Hydra", oracle: "Hydra spells you cast cost {1} less to cast.", mana: "{2}{G}" }, controller: "user" });
    const withR = castActions(mkState({ hand: [pure], battlefield: [reducer], mana: { G: 12 } }), "hyd2").find((a) => a.xValue === 1);
    expect(withR.cost.generic).toBe(1); // base 0 floored, reduction lost; pays X(1) in full — exact X-cost reduction is a follow-up
  });
});
