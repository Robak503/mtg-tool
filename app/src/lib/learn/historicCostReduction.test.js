/**
 * historicCostReduction.test.js — the play-weighted program, #1056 Jhoira's Familiar.
 *
 *   "Flying
 *    Historic spells you cast cost {1} less to cast. (Artifacts, legendaries, and Sagas are historic.)"
 *
 * "Historic" (CR 700.6) is the composite quality "has the legendary supertype, the artifact card type, or the Saga subtype". No
 * type line carries the word, so the static cost-reduction family excluded it (NON_SUBTYPE_COST_FILTER_WORDS — a word-bound match
 * would never fire). It is now a predicate of its own, `{ costReduction: { historic: true } }`, read by costReductionForSpell off the
 * FRONT face of the spell being cast (the face the cast lane projects: a flip card is cast unflipped, a transforming card front face
 * up — CR 710.2, 712.8c), the shape the library filter's historic gate (Monumental Henge) already reads. Generic mana only, floored at {0}
 * at the cast site like every reducer (CR 601.2f); the mana value is untouched (CR 202.3).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this slice).
 * The cast offer is the engine's own (legalActionsForPlayer); its `cost` is what the dispatcher pays.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities, costReductionForSpell, collectCostReducers } from "./staticAbilityParser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const FAMILIAR = {"name":"Jhoira's Familiar","type":"Artifact Creature — Bird","mana":"{4}","cmc":4,"power":"2","toughness":"2","keywords":["Flying"],"colors":[],"oracle":"Flying\nHistoric spells you cast cost {1} less to cast. (Artifacts, legendaries, and Sagas are historic.)"}; // body-only #1056
const MIND_STONE = {"name":"Mind Stone","type":"Artifact","mana":"{2}","cmc":2,"keywords":[],"colors":[],"oracle":"{T}: Add {C}.\n{1}, {T}, Sacrifice this artifact: Draw a card."}; // native-mana #32
const THALIA = {"name":"Thalia, Guardian of Thraben","type":"Legendary Creature — Human Soldier","mana":"{1}{W}","cmc":2,"power":"2","toughness":"1","keywords":["First strike"],"colors":["W"],"oracle":"First strike\nNoncreature spells cost {1} more to cast."}; // native-static #2346
const BENALIA = {"name":"History of Benalia","type":"Enchantment — Saga","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"(As this Saga enters and after your draw step, add a lore counter. Sacrifice after III.)\nI, II — Create a 2/2 white Knight creature token with vigilance.\nIII — Knights you control get +2/+1 until end of turn."}; // native-trigger #10456
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell #6263
const GRAVEROBBER = {"name":"Nezumi Graverobber // Nighteyes the Desecrator","type":"Creature — Rat Rogue // Legendary Creature — Rat Wizard","mana":"{1}{B}","cmc":2,"power":"2","toughness":"1","keywords":[],"colors":["B"],"oracle":"Nezumi Graverobber - Creature — Rat Rogue {1}{B}\n{1}{B}: Exile target card from an opponent's graveyard. If no cards are in that graveyard, flip this creature.\n//\nNighteyes the Desecrator - Legendary Creature — Rat Wizard \n{4}{B}: Put target creature card from a graveyard onto the battlefield under your control."}; // body-only #11773
const KETHIS = {"name":"Kethis, the Hidden Hand","type":"Legendary Creature — Elf Advisor","mana":"{W}{B}{G}","cmc":3,"power":"3","toughness":"4","keywords":[],"colors":["B","G","W"],"oracle":"Legendary spells you cast cost {1} less to cast.\nExile two legendary cards from your graveyard: Until end of turn, each legendary card in your graveyard gains \"You may play this card from your graveyard.\""}; // body-only #7495

const familiar = (id, controller) => createPermanent({ id, card: { ...FAMILIAR, id: `c-${id}` }, controller, summoningSick: false });
function board({ hand = [], userBf = [], aiBf = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield: userBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, battlefield: aiBf } } };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);
const costRow = (a) => (a ? { generic: a.cost.generic || 0, cmc: a.cmc } : null);

describe("the clause", () => {
  it("⭐ \"Historic spells you cast cost {1} less to cast.\" parses to the historic reducer; Jhoira's Familiar classifies native", () => {
    expect(parseStaticAbilities(FAMILIAR)).toEqual([{ costReduction: { historic: true, amount: 1 } }]);
    expect(isNativeTier(classifyCard(FAMILIAR))).toBe(true);
  });

  it("CREED — Kethis' \"Legendary spells\" is not the historic set (its other line parks the card either way)", () => {
    expect(parseStaticAbilities({ ...KETHIS, oracle: "Legendary spells you cast cost {1} less to cast." })).toEqual([]);
    expect(isNativeTier(classifyCard(KETHIS))).toBe(false);
  });

  it("the predicate, on the front face: an artifact, a legendary and a Saga are historic; a flip card's legendary back is not", () => {
    const r = collectCostReducers([familiar("jf", "user")]);
    const row = Object.fromEntries([MIND_STONE, THALIA, BENALIA, BEARS, DIVINATION, GRAVEROBBER].map((c) => [c.name, costReductionForSpell(r, c)]));
    expect(row).toEqual({ "Mind Stone": 1, "Thalia, Guardian of Thraben": 1, "History of Benalia": 1, "Grizzly Bears": 0, "Divination": 0, "Nezumi Graverobber // Nighteyes the Desecrator": 0 });
  });
});

describe("⭐ the real cast offer", () => {
  it("⭐ with Jhoira's Familiar: Mind Stone costs {1}, Thalia {W}, History of Benalia {W}{W}; the mana value is unchanged", () => {
    const s = board({ hand: [{ ...MIND_STONE, id: "ms" }, { ...THALIA, id: "th" }, { ...BENALIA, id: "hb" }], userBf: [familiar("jf", "user")], pool: { W: 2, C: 1 } });
    expect({ stone: costRow(castOf(s, "ms")), thalia: costRow(castOf(s, "th")), benalia: costRow(castOf(s, "hb")) })
      .toEqual({ stone: { generic: 1, cmc: 2 }, thalia: { generic: 0, cmc: 2 }, benalia: { generic: 0, cmc: 3 } });
  });

  it("without it, one mana short: Mind Stone and History of Benalia are not offered on {C} / {W}{W}", () => {
    expect(castOf(board({ hand: [{ ...MIND_STONE, id: "ms" }], pool: { C: 1 } }), "ms")).toBeUndefined();
    expect(castOf(board({ hand: [{ ...BENALIA, id: "hb" }], pool: { W: 2 } }), "hb")).toBeUndefined();
  });

  it("the dispatcher pays the reduced cost: Mind Stone for one {C}, the pool emptied, the artifact on the stack", () => {
    const s = board({ hand: [{ ...MIND_STONE, id: "ms" }], userBf: [familiar("jf", "user")], pool: { C: 1 } });
    const cast = castOf(s, "ms");
    expect(cast).toBeTruthy();
    const out = dispatchAction(s, cast);
    expect({ onStack: out.stack.some((o) => o.source?.name === "Mind Stone"), left: out.players.user.manaPool.C }).toEqual({ onStack: true, left: 0 });
  });

  it("control — a nonhistoric creature spell is not reduced: Grizzly Bears still costs {1}{G}", () => {
    const s = board({ hand: [{ ...BEARS, id: "gb" }], userBf: [familiar("jf", "user")], pool: { G: 2 } });
    expect(costRow(castOf(s, "gb"))).toEqual({ generic: 1, cmc: 2 });
  });

  it("⛔ \"spells YOU cast\": an opponent's Jhoira's Familiar reduces nothing of yours", () => {
    expect(castOf(board({ hand: [{ ...MIND_STONE, id: "ms" }], aiBf: [familiar("jf", "ai")], pool: { C: 1 } }), "ms")).toBeUndefined();
  });

  it("two Familiars stack: Mind Stone costs {0}", () => {
    const s = board({ hand: [{ ...MIND_STONE, id: "ms" }], userBf: [familiar("jf1", "user"), familiar("jf2", "user")] });
    expect(costRow(castOf(s, "ms"))).toEqual({ generic: 0, cmc: 2 });
  });
});
