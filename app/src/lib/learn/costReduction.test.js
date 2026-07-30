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
 *   6. EMINENCE (The Ur-Dragon — Joe's deck; Efteekay): a command-zone cost-reducer that discounts
 *      OTHER subtype spells from the command zone, NEVER the source's own cast (the literal "other"),
 *      and does NOT flip the carrier native (its attack/ETB trigger is still on the Arbiter tail).
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
  // Each subject below is filtered (supertype / "noncreature" / over-broad "permanent" / non-color word) so it
  // produces NO marker — its word-bounded type-line match would never fire, so a native claim would be a
  // false positive. The clause stays unmodeled (body-only) instead. NOTE: real card-TYPE words
  // (Artifact/Creature/Enchantment/Instant/Sorcery) are NO LONGER excluded — they ARE type-line tokens and
  // reduce correctly (covered by the card-TYPE reducer block below). COLOR words (Red/Green) are ALSO no longer
  // excluded — they emit a COLOR reducer now (see the COLOR-COST-REDUCTION block below); only NON-color, NON-
  // type-line subjects stay excluded. "colorless" is NOT a WUBRG color, so it stays excluded here.
  // ⭐ "noncreature" GRADUATED 2026-07-30 and moved OUT of this list. This block's own rationale was the
  // criterion — "its word-bounded type-line match would never fire" — which described the IMPLEMENTATION, not
  // the rules. It is now a real NEGATION predicate (`notCardType`), matched by asking whether the type line
  // LACKS the word rather than contains it, so it fires correctly and reduces exactly the printed set.
  // Its positive pins (both directions + fail-closed) live in costReducerFilterVocabulary.test.js.
  const cases = [
    ["supertype (Legendary — Kethis)", "Legendary spells you cast cost {1} less to cast."],
    ["colorless (Ugin) — not a WUBRG color", "Colorless spells you cast cost {2} less to cast."],
    ["over-broad 'permanent' (not a type-line token)", "Permanent spells you cast cost {1} less to cast."],
    // NOTE: the compound "Instant and sorcery spells …" is NO LONGER excluded — it is now MODELED (BLITZ ST-2:
    // the disjoint-pair compound card-type reducer, tested in compoundCostReduction.test.js). The compound
    // SUBTYPE pair ("Elemental spells and Warrior spells" — Banneret) is ALSO modeled now (2026-07-30) as a
    // single union descriptor; the dual-subtype over-reduction it was guarding against is pinned directly in
    // staticResidueST2.test.js (a spell matching BOTH halves is reduced ONCE).
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

// ─── 2b. card-TYPE reducers (Foundry Inspector, Marauding Raptor) ────────────────
// A card-TYPE word (Artifact/Creature/Enchantment/Instant/Sorcery) IS a real type-line token, so
// "<Type> spells you cast cost {N} less to cast" reduces via the word-bounded \b<word>\b type-line match
// (every card's type line begins with its card type). These are blocked on the ANTHEM/lord path (a
// card-TYPE anthem selects zero creatures — Tempered Steel FP), but for cost reduction they're correct.

describe("STATIC-COST-REDUCTION — card-TYPE reducers (Foundry Inspector / Marauding Raptor)", () => {
  it("Foundry Inspector ('Artifact spells …') → an Artifact/1 cost-reduction marker", () => {
    const foundry = { name: "Foundry Inspector", type: "Artifact Creature — Construct", oracle: "Artifact spells you cast cost {1} less to cast." };
    expect(parseStaticAbilities(foundry)).toEqual([{ costReduction: { subtype: "Artifact", amount: 1 } }]);
  });

  it("Marauding Raptor's reducer clause → a Creature/1 marker (its ETB-damage clause adds no static descriptor)", () => {
    const raptor = {
      name: "Marauding Raptor", type: "Creature — Dinosaur",
      oracle: "Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn.",
    };
    expect(parseStaticAbilities(raptor)).toEqual([{ costReduction: { subtype: "Creature", amount: 1 } }]);
  });

  it("'Enchantment spells …' (Starfield Mystic-style) → an Enchantment/1 marker", () => {
    expect(parseStaticAbilities({ type: "Enchantment", oracle: "Enchantment spells you cast cost {1} less to cast." }))
      .toEqual([{ costReduction: { subtype: "Enchantment", amount: 1 } }]);
  });

  it("a Creature reducer discounts a Creature spell, not an Instant; colored pips never reduced; floors at {0}", () => {
    const reducers = [{ subtype: "Creature", amount: 1 }];
    expect(costReductionForSpell(reducers, { type: "Creature — Bear" })).toBe(1); // a creature is reduced
    expect(costReductionForSpell(reducers, { type: "Instant" })).toBe(0);         // an instant is not
    // The reducer only ever trims GENERIC mana — costReductionForSpell returns a count; the cast site floors
    // it (CR 601.2f). An Artifact reducer matches an Artifact Creature spell (type-line substring).
    expect(costReductionForSpell([{ subtype: "Artifact", amount: 2 }], { type: "Artifact Creature — Golem" })).toBe(2);
  });

  it("Marauding Raptor stays NON-native (its ETB-damage clause is uncovered) even though the reducer is collected", () => {
    const raptor = {
      name: "Marauding Raptor", type: "Creature — Dinosaur",
      oracle: "Creature spells you cast cost {1} less to cast.\nWhenever another creature you control enters, this creature deals 2 damage to it. If a Dinosaur is dealt damage this way, this creature gets +2/+0 until end of turn.",
    };
    expect(collectCostReducers([raptor])).toEqual([{ subtype: "Creature", amount: 1 }]);
    expect(classifyCard(raptor)).not.toBe("native-static");
  });

  it("Foundry Inspector (single covered clause + vanilla body) flips to native-static", () => {
    const foundry = { name: "Foundry Inspector", type: "Artifact Creature — Construct", oracle: "Artifact spells you cast cost {1} less to cast." };
    expect(classifyCard(foundry)).toBe("native-static");
  });
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

  it("Ruby Medallion (single-color reducer on a vanilla artifact) now flips to native-static", () => {
    // COLOR-COST-REDUCTION: "Red spells you cast cost {1} less to cast." is now MODELED (the color reducer),
    // so its only clause is covered → native-static (previously a safe FN that stayed body-only).
    expect(classifyCard(RUBY_MEDALLION())).toBe("native-static");
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

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// EMINENCE COST-REDUCTION (command zone) — anchor: The Ur-Dragon (Joe's deck)
//
// "Eminence — As long as <this> is in the command zone or on the battlefield, other <Subtype> spells you
// cast cost {N} less to cast." Eminence is an ABILITY WORD (CR 207.2c — no rules meaning); the reach from
// the command zone is the clause's own literal text (CR 113.6 — a permanent's ability functions only on the
// battlefield "except as [its] wording specifies"). The discount itself is the same CR 601.2f / 202.3 math
// as the base reducer. The carrier flips NOTHING native (its attack/ETB trigger is uncovered) — this PR just
// makes the deck PLAY its Dragon discount instead of silently dropping it. Real oracle text below, verified
// against bundled Scryfall data.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

const UR_DRAGON = () => ({
  name: "The Ur-Dragon",
  type: "Legendary Creature — Dragon Avatar",
  mana: "{4}{W}{U}{B}{R}{G}",
  keywords: ["Flying"],
  oracle: "Eminence — As long as The Ur-Dragon is in the command zone or on the battlefield, other Dragon spells you cast cost {1} less to cast.\nFlying\nWhenever one or more Dragons you control attack, draw that many cards, then you may put a permanent card from your hand onto the battlefield.",
});
const EFTEEKAY = () => ({
  name: "Efteekay, Flame of the Kav",
  type: "Legendary Creature — Kavu Soldier",
  mana: "{4}{R}{G}",
  keywords: [],
  oracle: "Eminence — As long as Efteekay is in the command zone or on the battlefield, other Kavu spells you cast cost {1} less to cast.\nWhenever Efteekay or another Kavu you control enters, it deals damage equal to its power to target creature.",
});
const UNKNOWN_WIZARD = () => ({
  name: "The Unknown Wizard",
  type: "Legendary Creature — Human Wizard",
  mana: "{2}{W}{U}{B}{R}{G}",
  keywords: [],
  oracle: "Eminence — As long as The Unknown Wizard is in the command zone or on the battlefield, other playtest cards you cast cost {1} less to cast.\nWhenever The Unknown Wizard enters or attacks, look at the top ten cards of your library. You may put a legendary playtest card from among them onto the battlefield. Put the rest on the bottom in a random order.",
});

// ─── 6a. Parser: the eminence marker carries fromCommandZone + excludeSelf + sourceName ──────────
describe("EMINENCE — parser marker", () => {
  it("The Ur-Dragon → a Dragon/1 reducer flagged fromCommandZone + excludeSelf, stamped with its name", () => {
    expect(parseStaticAbilities(UR_DRAGON())).toEqual([
      { costReduction: { subtype: "Dragon", amount: 1, fromCommandZone: true, excludeSelf: true, sourceName: "The Ur-Dragon" } },
    ]);
  });

  it("Efteekay (full name ≠ the bare self-ref in its text) → a Kavu/1 eminence reducer", () => {
    expect(parseStaticAbilities(EFTEEKAY())).toEqual([
      { costReduction: { subtype: "Kavu", amount: 1, fromCommandZone: true, excludeSelf: true, sourceName: "Efteekay, Flame of the Kav" } },
    ]);
  });

  it("The Unknown Wizard ('other playtest CARDS', not 'spells') → no marker", () => {
    expect(parseStaticAbilities(UNKNOWN_WIZARD()).some((d) => d.costReduction)).toBe(false);
  });
});

// ─── 6b. collect (command-zone vs battlefield) + the excludeSelf "other" guard ───────────────────
describe("EMINENCE — collect + excludeSelf", () => {
  it("a command-zone scan collects ONLY eminence reducers; a plain battlefield reducer there is skipped", () => {
    expect(collectCostReducers([UR_DRAGON()], { commandZone: true })).toEqual([
      { subtype: "Dragon", amount: 1, fromCommandZone: true, excludeSelf: true, sourceName: "The Ur-Dragon" },
    ]);
    // Dragonspeaker is a battlefield-only reducer (no fromCommandZone) → not collected from the command zone.
    expect(collectCostReducers([DRAGONSPEAKER()], { commandZone: true })).toEqual([]);
  });

  it("the default (battlefield) scan ALSO includes an eminence reducer (it works on the battlefield too)", () => {
    expect(collectCostReducers([UR_DRAGON()])).toEqual([
      { subtype: "Dragon", amount: 1, fromCommandZone: true, excludeSelf: true, sourceName: "The Ur-Dragon" },
    ]);
  });

  it("excludeSelf: the reducer never discounts ITS OWN cast, but still discounts another Dragon", () => {
    const reducers = collectCostReducers([UR_DRAGON()], { commandZone: true });
    expect(costReductionForSpell(reducers, UR_DRAGON())).toBe(0); // "other" — self excluded
    expect(costReductionForSpell(reducers, { name: "Dragonlord Atarka", type: "Legendary Creature — Elder Dragon" })).toBe(1);
  });
});

// ─── 6c. Coverage: the carrier stays NON-native (its trigger is uncovered) — no FP ──────────────
describe("EMINENCE — coverage (no false positive)", () => {
  it("The Ur-Dragon does NOT flip native-static (its attack trigger is on the Arbiter tail)", () => {
    expect(classifyCard(UR_DRAGON())).not.toBe("native-static");
  });
  it("Efteekay does NOT flip native-static (its ETB trigger is uncovered)", () => {
    expect(classifyCard(EFTEEKAY())).not.toBe("native-static");
  });
});

// ─── 6d. Engine: the command-zone discount applies to OTHER Dragons, never the commander itself ──
describe("EMINENCE — engine cast actions (command zone)", () => {
  function mkCmdState({ hand = [], command = [], mana = {} }) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...base,
      phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: {
        ...base.players,
        user: { ...base.players.user, manaPool: { ...base.players.user.manaPool, ...mana }, hand, command },
      },
    };
  }
  const castActions = (s) => filterActions(legalActionsForPlayer(s, "user"), "cast-spell");
  const FULL_MANA = { W: 6, U: 6, B: 6, R: 6, G: 6 };
  const HAND_DRAGON = { id: "hd1", name: "Hand Dragon", type: "Creature — Dragon", mana: "{4}{R}{R}", oracle: "", keywords: [] };
  const HAND_GOBLIN = { id: "hg1", name: "Hand Goblin", type: "Creature — Goblin", mana: "{4}{R}", oracle: "", keywords: [] };
  const urInCommand = () => ({ ...UR_DRAGON(), id: "ur1", isCommander: true });

  it("a Dragon in HAND is discounted {1} by The Ur-Dragon sitting in the COMMAND ZONE", () => {
    const a = castActions(mkCmdState({ hand: [HAND_DRAGON], command: [urInCommand()], mana: FULL_MANA })).find((x) => x.cardId === "hd1");
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(3); // {4}{R}{R} generic 4 → 3; the {R}{R} pips are untouched
    expect(a.cmc).toBe(6); // CR 202.3 — mana value unchanged
  });

  it("the SAME hand Dragon with an EMPTY command zone pays its printed {4}", () => {
    const a = castActions(mkCmdState({ hand: [HAND_DRAGON], command: [], mana: FULL_MANA })).find((x) => x.cardId === "hd1");
    expect(a.cost.generic).toBe(4);
  });

  it("an off-subtype hand spell (a Goblin) is NOT discounted by the Dragon eminence", () => {
    const a = castActions(mkCmdState({ hand: [HAND_GOBLIN], command: [urInCommand()], mana: FULL_MANA })).find((x) => x.cardId === "hg1");
    expect(a.cost.generic).toBe(4);
  });

  it("FP GUARD: casting The Ur-Dragon ITSELF from the command zone gets NO self-discount ('other')", () => {
    const a = castActions(mkCmdState({ command: [urInCommand()], mana: FULL_MANA })).find((x) => x.cardId === "ur1" && x.fromZone === "command");
    expect(a).toBeTruthy();
    expect(a.cost.generic).toBe(4); // {4}{W}{U}{B}{R}{G}, tax 0, excludeSelf → no {1} off (would be 3 if the guard were missing)
  });
});
