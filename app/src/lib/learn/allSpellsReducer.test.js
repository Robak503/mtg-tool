/**
 * allSpellsReducer.test.js — "Spells you cast cost {1} less to cast." (the 09-06 plan's stage ③ · 53, 2026-09-30 — Stone Calendar).
 *
 * The unfiltered reducer. The static cost-reduction family (CR 601.2f) needed a word before "spells" — a subtype, a colour,
 * a card type — so the bare form never parsed. It is now `{ costReduction: { allSpells: true } }`, and costReductionForSpell
 * applies it to every spell its controller casts: generic mana only, floored at {0}, the mana value untouched (CR 202.3).
 * The symmetric "Spells cost {1} less to cast." (Helm of Awakening) reaches every player's spells, which the caster-only
 * reducer collection can't express, so it stays parked.
 *
 * Real oracle fixtures (bundled Scryfall, probed 2026-09-30).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseStaticAbilities, costReductionForSpell } from "./staticAbilityParser.js";
import { classifyCard, isNativeTier } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const STONE_CALENDAR = { name: "Stone Calendar", type: "Artifact", mana: "{5}", cmc: 5, colors: [], keywords: [],
  oracle: "Spells you cast cost {1} less to cast." };
const HELM_OF_AWAKENING = { name: "Helm of Awakening", type: "Artifact", mana: "{2}", cmc: 2, colors: [], keywords: [],
  oracle: "Spells cost {1} less to cast." };
const LAVA_AXE = { id: "la", name: "Lava Axe", type: "Sorcery", mana: "{4}{R}", mana_cost: "{4}{R}", cmc: 5, colors: ["R"], keywords: [],
  oracle: "Lava Axe deals 5 damage to target player or planeswalker." };
const SHOCK = { id: "sh", name: "Shock", type: "Instant", mana: "{R}", mana_cost: "{R}", cmc: 1, colors: ["R"], keywords: [],
  oracle: "Shock deals 2 damage to any target." };

const calendar = (id, controller) => createPermanent({ id, card: { ...STONE_CALENDAR, id: `c-${id}` }, controller, summoningSick: false });
function board({ hand = [LAVA_AXE], userBf = [], aiBf = [], pool = {} } = {}) {
  const g = createGameState({ userDeck: [], aiDeck: [] });
  return { ...g, turn: 5, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", stack: [], pendingTriggers: [],
    players: { ...g.players,
      user: { ...g.players.user, hand, battlefield: userBf, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } },
      ai: { ...g.players.ai, battlefield: aiBf } } };
}
const castOf = (s, cardId) => legalActionsForPlayer(s, "user").find((a) => a.kind === "cast-spell" && a.cardId === cardId);

describe("the clause", () => {
  it("⭐ the bare reducer parses to allSpells and Stone Calendar reads native; the symmetric Helm of Awakening stays parked", () => {
    expect(parseStaticAbilities(STONE_CALENDAR)).toEqual([{ costReduction: { allSpells: true, amount: 1 } }]);
    expect({ calendar: isNativeTier(classifyCard(STONE_CALENDAR)), helm: isNativeTier(classifyCard(HELM_OF_AWAKENING)) }).toEqual({ calendar: true, helm: false });
  });
});

describe("⭐ the real cast offer and payment", () => {
  it("⭐ with Stone Calendar, Lava Axe costs {3}{R}: four mana casts it (five without); mana value still 5", () => {
    const withCal = castOf(board({ userBf: [calendar("sc", "user")], pool: { R: 1, C: 3 } }), "la");
    const without = castOf(board({ pool: { R: 1, C: 3 } }), "la");
    const row = { withCalendar: withCal ? { generic: withCal.cost.generic, R: withCal.cost.R, cmc: withCal.cmc } : null, without: without ?? null };
    console.log(`WITNESS allSpellsReducer ${JSON.stringify(row)}`);
    expect(row).toEqual({ withCalendar: { generic: 3, R: 1, cmc: 5 }, without: null });
  });
  it("the dispatcher pays exactly the reduced cost — four mana spent, the Axe on the stack", () => {
    const s = board({ userBf: [calendar("sc", "user")], pool: { R: 1, C: 3 } });
    const out = dispatchAction(s, castOf(s, "la"));
    const pool = out.players.user.manaPool;
    expect({ onStack: out.stack.some((o) => o.source?.name === "Lava Axe"), left: pool.R + pool.C }).toEqual({ onStack: true, left: 0 });
  });
  it("two Calendars stack: {2}{R}", () => {
    const s = board({ userBf: [calendar("sc1", "user"), calendar("sc2", "user")], pool: { R: 1, C: 2 } });
    expect(castOf(s, "la")?.cost?.generic).toBe(2);
  });
  it("⛔ generic only, floored at {0}: Shock still costs {R} (no mana, no cast)", () => {
    expect(castOf(board({ hand: [SHOCK], userBf: [calendar("sc", "user")] }), "sh")).toBeUndefined();
  });
  it("⛔ \"spells YOU cast\": an opponent's Stone Calendar discounts nothing of yours", () => {
    expect(castOf(board({ aiBf: [calendar("sc", "ai")], pool: { R: 1, C: 3 } }), "la")).toBeUndefined();
  });
});

// ── The second spell each turn (rank 77, same slice): an ORDINAL reducer ──────────────────────────────────────────────────
const BELL_RINGER = { name: "Highspire Bell-Ringer", type: "Creature — Djinn Monk", mana: "{2}{U}", cmc: 3, colors: ["U"], power: "1", toughness: "4", keywords: ["Flying"],
  oracle: "Flying\nThe second spell you cast each turn costs {1} less to cast." };
const PSIONICIST = { name: "Uthros Psionicist", type: "Creature — Jellyfish Scientist", mana: "{2}{U}", cmc: 3, colors: ["U"], power: "2", toughness: "4", keywords: [],
  oracle: "The second spell you cast each turn costs {2} less to cast." };

describe("⭐ the second spell each turn", () => {
  const ringer = createPermanent({ id: "hb", card: { ...BELL_RINGER, id: "c-hb" }, controller: "user", summoningSick: false });
  const afterCasts = (n) => { const s = board({ userBf: [ringer], pool: { R: 1, C: 3 } }); return { ...s, players: { ...s.players, user: { ...s.players.user, spellsCastThisTurn: n } } }; };
  it("⭐ the carriers read native; the clause is an ordinal reducer", () => {
    expect([BELL_RINGER, PSIONICIST].map((c) => isNativeTier(classifyCard(c)))).toEqual([true, true]);
    expect(parseStaticAbilities(PSIONICIST)).toEqual([{ costReduction: { nthSpellThisTurn: 2, amount: 2 } }]);
  });
  it("⭐ one spell already cast this turn → Lava Axe (the second) costs {3}{R}; as the first or the third it costs full", () => {
    const row = { first: castOf(afterCasts(0), "la") ?? null, second: castOf(afterCasts(1), "la")?.cost?.generic ?? null, third: castOf(afterCasts(2), "la") ?? null };
    console.log(`WITNESS secondSpellReducer ${JSON.stringify(row)}`);
    expect(row).toEqual({ first: null, second: 3, third: null });
  });
  it("⛔ fail-closed: without the count the ordinal never applies", () => {
    expect(costReductionForSpell([{ nthSpellThisTurn: 2, amount: 1 }], LAVA_AXE)).toBe(0);
  });
});
