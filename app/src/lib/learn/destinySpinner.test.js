/**
 * destinySpinner.test.js — the play-weighted program, #1006 Destiny Spinner.
 *
 *   "Creature and enchantment spells you control can't be countered.
 *    {3}{G}: Target land you control becomes an X/X Elemental creature with trample and haste until end of turn, where X is the
 *    number of enchantments you control. It's still a land."
 *
 * Two clauses were missing:
 *   · the controller-scoped can't-be-countered static read ONE card type ("Creature spells you control can't be countered." —
 *     Prowling Serpopard). "Creature and enchantment spells" is both: a spell of either type (CR 205.2b — an enchantment creature is
 *     both). It reads as two card-type entries on the same controller, the union uncounterableCoversSpell already takes;
 *   · the land animation read a printed N/N only. "An X/X …, where X is <count>" carries the count, and X is fixed as the ability
 *     resolves (CR 608.2h; the bundled ruling: "Once that happens, the creature's base power and toughness won't change later in the
 *     turn even if the number of enchantments you control changes."). With no enchantments it is a 0/0 and dies (the ruling).
 *
 * Real oracle fixtures (bundled Scryfall via cardIndex.publicCard, 2026-10-17; the trailing comment is the tier BEFORE this slice).
 * The counter offers are the engine's own (legalActionsForPlayer); the activation is the offered action, resolved by passPriority.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { classifyCard, isNativeTier } from "./coverage.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { passPriority } from "./gameEngine.js";
import { permanentHasKeyword, permanentIsCreature, permanentPower, permanentToughness, permanentTypes } from "./layers.js";
import { _resetIdsForTests, createGameState, createPermanent, createStackObject } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ── real card fixtures (bundled Scryfall, cardIndex.publicCard) ──
const SPINNER = {"name":"Destiny Spinner","type":"Enchantment Creature — Human","mana":"{1}{G}","cmc":2,"power":"2","toughness":"3","keywords":[],"colors":["G"],"oracle":"Creature and enchantment spells you control can't be countered.\n{3}{G}: Target land you control becomes an X/X Elemental creature with trample and haste until end of turn, where X is the number of enchantments you control. It's still a land."}; // body-only #1006
const SERPOPARD = {"name":"Prowling Serpopard","type":"Creature — Cat Snake","mana":"{1}{G}{G}","cmc":3,"power":"4","toughness":"3","keywords":[],"colors":["G"],"oracle":"This spell can't be countered.\nCreature spells you control can't be countered."}; // native-static #3651
const COUNTERSPELL = {"name":"Counterspell","type":"Instant","mana":"{U}{U}","cmc":2,"keywords":[],"colors":["U"],"oracle":"Counter target spell."}; // native-spell #16
const BEARS = {"name":"Grizzly Bears","type":"Creature — Bear","mana":"{1}{G}","cmc":2,"power":"2","toughness":"2","keywords":[],"colors":["G"],"oracle":""}; // native-body
const ANTHEM = {"name":"Glorious Anthem","type":"Enchantment","mana":"{1}{W}{W}","cmc":3,"keywords":[],"colors":["W"],"oracle":"Creatures you control get +1/+1."}; // native-static #7248
const DIVINATION = {"name":"Divination","type":"Sorcery","mana":"{2}{U}","cmc":3,"keywords":[],"colors":["U"],"oracle":"Draw two cards."}; // native-spell #6263
const WILD_GROWTH = {"name":"Wild Growth","type":"Enchantment — Aura","mana":"{G}","cmc":1,"keywords":["Enchant"],"colors":["G"],"oracle":"Enchant land\nWhenever enchanted land is tapped for mana, its controller adds an additional {G}."}; // native-mana-aura #212
const SPHINX = {"name":"Sphinx of the Final Word","type":"Creature — Sphinx","mana":"{5}{U}{U}","cmc":7,"power":"5","toughness":"5","keywords":["Flying","Hexproof"],"colors":["U"],"oracle":"This spell can't be countered.\nFlying\nHexproof (This creature can't be the target of spells or abilities your opponents control.)\nInstant and sorcery spells you control can't be countered."}; // body-only #9283
const SHOCK = {"name":"Shock","type":"Instant","mana":"{R}","cmc":1,"keywords":[],"colors":["R"],"oracle":"Shock deals 2 damage to any target."}; // native-spell #2215
const FOREST = {"name":"Forest","type":"Basic Land — Forest","mana":"","cmc":0,"keywords":[],"colors":[],"oracle":"({T}: Add {G}.)"}; // land
const ANIMIST = {"name":"Vastwood Animist","type":"Creature — Elf Shaman Ally","mana":"{2}{G}","cmc":3,"power":"1","toughness":"1","keywords":[],"colors":["G"],"oracle":"{T}: Target land you control becomes an X/X Elemental creature until end of turn, where X is the number of Allies you control. It's still a land."}; // body-only #25555

const P = (id, card, controller, over = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...over });
const ANIMATE = "Target land you control becomes an X/X Elemental creature with trample and haste until end of turn, where X is the number of enchantments you control. It's still a land.";

/** The user's spell on the stack; the AI holds Counterspell with {U}{U} floating and has priority. */
function counterBoard({ user = [], ai = [], spell, caster = "user" }) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const stk = createStackObject({ id: "stk-spell", kind: "spell", source: { id: "c-spell", ...spell }, controller: caster, targets: [], payload: {} });
  const holder = caster === "user" ? "ai" : "user";
  return {
    ...s0, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: holder, turn: 5, consecutivePasses: 0, stack: [stk],
    players: {
      ...s0.players,
      user: { ...s0.players.user, battlefield: user, hand: holder === "user" ? [{ ...COUNTERSPELL, id: "h-cs" }] : [], manaPool: holder === "user" ? { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } : s0.players.user.manaPool },
      ai: { ...s0.players.ai, battlefield: ai, hand: holder === "ai" ? [{ ...COUNTERSPELL, id: "h-cs" }] : [], manaPool: holder === "ai" ? { W: 0, U: 2, B: 0, R: 0, G: 0, C: 0 } : s0.players.ai.manaPool },
    },
  };
}
const counterOffers = (s, pid) => legalActionsForPlayer(s, pid).filter((a) => a.kind === "cast-spell" && a.cardId === "h-cs");

function mainBoard({ user = [], ai = [], pool = {} } = {}) {
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s0, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", turn: 5, consecutivePasses: 0,
    players: { ...s0.players, user: { ...s0.players.user, battlefield: user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, ...pool } }, ai: { ...s0.players.ai, battlefield: ai } } };
}
const resolveAll = (s) => { let g = 0; while (s.stack.length && !s.pendingChoice && g++ < 50) s = passPriority(s); return s; };
const spinnerActs = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "spin");
const pt = (s, id) => [permanentPower(s, id), permanentToughness(s, id)];

describe("PARSE + CLASSIFICATION", () => {
  it("the static → the creature AND the enchantment card types on the controller's can't-be-countered scope", () => {
    expect(parseStaticAbilities({ ...SPINNER, oracle: "Creature and enchantment spells you control can't be countered." }))
      .toEqual([{ cantBeCountered: { scope: "youControl", cardType: "Creature" } }, { cantBeCountered: { scope: "youControl", cardType: "Enchantment" } }]);
  });

  it("the activation → the land animation with its X counted as it resolves", () => {
    const p = parseEffectClause(ANIMATE, "Instant", { sourceScoped: true });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "animate", targetType: "land", power: 0, toughness: 0, ptCount: { kind: "permanentsYouControl", cardType: "enchantment" }, subtypes: ["Elemental"], grantKeywords: ["Trample", "Haste"], duration: "endOfTurn", restrictions: [{ kind: "controller", who: "you" }] }]);
  });

  it("⭐ Destiny Spinner classifies native (and its twin, Vastwood Animist)", () => {
    expect([isNativeTier(classifyCard(SPINNER)), isNativeTier(classifyCard(ANIMIST))]).toEqual([true, true]);
  });

  it("control — Prowling Serpopard's one-type static reads as before", () => {
    expect(parseStaticAbilities(SERPOPARD).filter((d) => d.cantBeCountered?.scope === "youControl")).toEqual([{ cantBeCountered: { scope: "youControl", cardType: "Creature" } }]);
  });

  it("CREED — a permanent animate (no \"until end of turn\") or an unread count stays unread", () => {
    expect(programConfidence(parseEffectClause("Target land you control becomes an X/X Elemental creature with trample, where X is the number of enchantments you control. It's still a land.", "Instant", { sourceScoped: true }))).toBe("low");
    expect(programConfidence(parseEffectClause("Target land you control becomes an X/X Elemental creature until end of turn, where X is the number of times you've cast a spell this game. It's still a land.", "Instant", { sourceScoped: true }))).toBe("low");
  });
});

describe("RUNTIME — creature and enchantment spells you control can't be countered", () => {
  it("⭐ with Destiny Spinner out, the user's creature spell and enchantment spell are not legal Counterspell targets", () => {
    expect(counterOffers(counterBoard({ user: [P("spin", SPINNER, "user")], spell: BEARS }), "ai")).toHaveLength(0);
    expect(counterOffers(counterBoard({ user: [P("spin", SPINNER, "user")], spell: ANTHEM }), "ai")).toHaveLength(0);
    expect(counterOffers(counterBoard({ user: [P("spin", SPINNER, "user")], spell: WILD_GROWTH }), "ai")).toHaveLength(0);
  });

  it("control — a sorcery the user casts is still counterable; so is the creature spell without the Spinner", () => {
    expect(counterOffers(counterBoard({ user: [P("spin", SPINNER, "user")], spell: DIVINATION }), "ai").length).toBeGreaterThan(0);
    expect(counterOffers(counterBoard({ spell: BEARS }), "ai").length).toBeGreaterThan(0);
  });

  it("control — \"spells YOU control\": the AI's creature spell is counterable by the user despite the user's Spinner", () => {
    expect(counterOffers(counterBoard({ user: [P("spin", SPINNER, "user")], spell: BEARS, caster: "ai" }), "user").length).toBeGreaterThan(0);
  });

  it("⭐ the twin the two-type arm reads — Sphinx of the Final Word: \"Instant and sorcery spells you control can't be countered.\"", () => {
    expect(isNativeTier(classifyCard(SPHINX))).toBe(true);
    expect(counterOffers(counterBoard({ user: [P("sphinx", SPHINX, "user")], spell: DIVINATION }), "ai")).toHaveLength(0);
    expect(counterOffers(counterBoard({ user: [P("sphinx", SPHINX, "user")], spell: SHOCK }), "ai")).toHaveLength(0);
    expect(counterOffers(counterBoard({ user: [P("sphinx", SPHINX, "user")], spell: BEARS }), "ai").length).toBeGreaterThan(0); // a creature spell is not covered
  });
});

describe("RUNTIME — {3}{G}: target land you control becomes an X/X", () => {
  const board = (extra = []) => mainBoard({ user: [P("spin", SPINNER, "user"), P("f1", FOREST, "user"), P("f2", FOREST, "user"), P("f3", FOREST, "user"), P("f4", FOREST, "user"), P("target", FOREST, "user"), ...extra], ai: [P("aif", FOREST, "ai")] });

  it("⭐ with Destiny Spinner and Glorious Anthem (two enchantments) the land becomes a 2/2 Elemental creature land with trample and haste", () => {
    let s = board([P("anthem", ANTHEM, "user")]);
    const a = spinnerActs(s).find((x) => x.targets[0]?.id === "target");
    expect(a).toBeTruthy();
    s = resolveAll(dispatchAction(s, a));
    const { types, subtypes } = permanentTypes(s, "target");
    expect({ creature: permanentIsCreature(s, "target"), land: types.includes("Land"), elemental: subtypes.includes("Elemental"), trample: permanentHasKeyword(s, "target", "Trample"), haste: permanentHasKeyword(s, "target", "Haste") })
      .toEqual({ creature: true, land: true, elemental: true, trample: true, haste: true });
    // Glorious Anthem's +1/+1 applies on top of the 2/2 base it now has.
    expect(pt(s, "target")).toEqual([3, 3]);
  });

  it("⭐ X is fixed as it resolves: with the Spinner alone (X = 1) a second enchantment arriving afterwards does not grow it (the ruling)", () => {
    let s = board();
    const a = spinnerActs(s).find((x) => x.targets[0]?.id === "target");
    expect(a).toBeTruthy();
    s = resolveAll(dispatchAction(s, a));
    expect(pt(s, "target")).toEqual([1, 1]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [...s.players.user.battlefield, P("anthem2", ANTHEM, "user")] } } };
    expect(pt(s, "target")).toEqual([2, 2]); // the anthem's +1/+1 only — the base stays 1/1
  });

  it("only the controller's lands are targets — the AI's Forest is never offered", () => {
    const ids = spinnerActs(board()).map((a) => a.targets[0]?.id);
    expect(ids).toContain("target");
    expect(ids).not.toContain("aif");
  });

  it("Vastwood Animist: X is the number of Allies the controller controls (the Animist itself) → a 1/1", () => {
    let s = mainBoard({ user: [P("ani", ANIMIST, "user"), P("target", FOREST, "user")] });
    const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "activate-ability" && x.permanentId === "ani" && x.targets[0]?.id === "target");
    expect(a).toBeTruthy();
    s = resolveAll(dispatchAction(s, a));
    expect([permanentIsCreature(s, "target"), ...pt(s, "target")]).toEqual([true, 1, 1]);
  });
});
