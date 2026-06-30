/**
 * KICKER (CR 702.33) — optional additional cast cost + a "was-kicked" enters-with-counters payoff.
 *
 * Scope (this slice): a CREATURE with a clean single "Kicker {cost}" and the modeled kicked payoff
 * "If this creature was kicked, it enters with N +1/+1 counters on it", whose base body is keyword-only.
 * Both halves are modeled atoms (the keyword-only native-body + the existing enters-with-counters
 * replacement, now gated on the was-kicked flag). End-to-end the engine GENUINELY runs it:
 *   parser           → parseKickerCounterCreature (kicker.js) gates the whole card
 *   coverage         → native-body (the additive seam classifier)
 *   legalChoices     → a normal cast + (when the kicker mana is also affordable) a kicked cast
 *   actionDispatcher → pays the folded cost, threads `kicked` onto PERMANENT_ETB
 *   resolvers        → enterPermanent adds the kicked +1/+1 counters AS the creature enters
 *
 * The CREED-critical assertions: a NOT-kicked cast adds NO counters (base body only), a kicked cast adds
 * EXACTLY the printed N, and every deferred shape (multikicker / kicker SPELL effect / an ETB-trigger
 * kicked payoff / an extra unmodeled clause) stays body-only (Arbiter) — never a fabricated native credit.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseKickerCost, entersWithKickedCounters, parseKickerCounterCreature, stripKickerText } from "./kicker.js";
import { classifyCard, isKeywordOnly } from "./coverage.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness } from "./layers.js";
import { _resetIdsForTests, createGameState } from "./gameState.js";
import { pickAction } from "./opponentAI.js";

beforeEach(() => _resetIdsForTests());

// ── Real printed cards (exact Scryfall oracle text) ─────────────────────────────────────────────────
const ARDENT_SOLDIER = { name: "Ardent Soldier", type: "Creature — Human Soldier", mana: "{1}{W}", power: 1, toughness: 2,
  oracle: "Kicker {2} (You may pay an additional {2} as you cast this spell.)\nVigilance\nIf this creature was kicked, it enters with a +1/+1 counter on it." };
const ACADEMY_DRAKE = { name: "Academy Drake", type: "Creature — Drake", mana: "{2}{U}", power: 2, toughness: 2,
  oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nFlying\nIf this creature was kicked, it enters with two +1/+1 counters on it." };
const BALOTH_GORGER = { name: "Baloth Gorger", type: "Creature — Beast", mana: "{2}{G}{G}", power: 4, toughness: 4,
  oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it." };
const UNTAMED_KAVU = { name: "Untamed Kavu", type: "Creature — Kavu", mana: "{1}{G}", power: 2, toughness: 2,
  oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nVigilance, trample\nIf this creature was kicked, it enters with three +1/+1 counters on it." };
const GHASTLY_GLOOMHUNTER = { name: "Ghastly Gloomhunter", type: "Creature — Zombie Bat", mana: "{1}{B}", power: 1, toughness: 1,
  oracle: "Kicker {3}{B} (You may pay an additional {3}{B} as you cast this spell.)\nFlying, lifelink\nIf this creature was kicked, it enters with two +1/+1 counters on it." };
const SHALAIS_ACOLYTE = { name: "Shalai's Acolyte", type: "Creature — Angel", mana: "{4}{W}", power: 3, toughness: 4,
  oracle: "Kicker {1}{G} (You may pay an additional {1}{G} as you cast this spell.)\nFlying\nIf this creature was kicked, it enters with two +1/+1 counters on it." };
const LLANOWAR_ELITE = { name: "Llanowar Elite", type: "Creature — Elf", mana: "{G}", power: 1, toughness: 1,
  oracle: "Kicker {8} (You may pay an additional {8} as you cast this spell.)\nTrample\nIf this creature was kicked, it enters with five +1/+1 counters on it." };
const PINCER_SPIDER = { name: "Pincer Spider", type: "Creature — Spider", mana: "{2}{G}", power: 2, toughness: 3,
  oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nReach (This creature can block creatures with flying.)\nIf this creature was kicked, it enters with a +1/+1 counter on it." };
const STRONGHOLD_CONFESSOR = { name: "Stronghold Confessor", type: "Creature — Thrull", mana: "{B}", power: 1, toughness: 1,
  oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nMenace (This creature can't be blocked except by two or more creatures.)\nIf this creature was kicked, it enters with two +1/+1 counters on it." };

// Three more real cards with an enforced-evasion clause body and (Kavu Primarch) a cost-only Convoke line.
const AETHER_FIGMENT = { name: "Aether Figment", type: "Creature — Illusion", mana: "{1}{U}", power: 1, toughness: 1,
  oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nThis creature can't be blocked." };
const KAVU_AGGRESSOR = { name: "Kavu Aggressor", type: "Creature — Kavu", mana: "{2}{R}", power: 3, toughness: 2,
  oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nThis creature can't block.\nIf this creature was kicked, it enters with a +1/+1 counter on it." };
const KAVU_PRIMARCH = { name: "Kavu Primarch", type: "Creature — Kavu", mana: "{3}{G}", power: 3, toughness: 3,
  oracle: "Kicker {4} (You may pay an additional {4} as you cast this spell.)\nConvoke (Your creatures can help cast this spell. Each creature you tap while casting this spell pays for {1} or one mana of that creature's color.)\nIf this creature was kicked, it enters with four +1/+1 counters on it." };

const ALL_NINE = [ARDENT_SOLDIER, ACADEMY_DRAKE, BALOTH_GORGER, UNTAMED_KAVU, GHASTLY_GLOOMHUNTER, SHALAIS_ACOLYTE, LLANOWAR_ELITE, PINCER_SPIDER, STRONGHOLD_CONFESSOR];
const ALL_TWELVE = [...ALL_NINE, AETHER_FIGMENT, KAVU_AGGRESSOR, KAVU_PRIMARCH];

// ── Parser units ────────────────────────────────────────────────────────────────────────────────────
describe("KICKER parser — parseKickerCost", () => {
  it("reads a clean single kicker cost (generic / colored / mixed)", () => {
    expect(parseKickerCost(ARDENT_SOLDIER)).toBe("{2}");
    expect(parseKickerCost(GHASTLY_GLOOMHUNTER)).toBe("{3}{B}");
    expect(parseKickerCost(SHALAIS_ACOLYTE)).toBe("{1}{G}");
  });
  it("returns null for multikicker, an {X} kicker, an and/or double kicker, and no-kicker", () => {
    expect(parseKickerCost({ oracle: "Multikicker {1}{G} (You may pay an additional {1}{G} any number of times…)\nThis creature enters with two +1/+1 counters on it for each time it was kicked." })).toBeNull();
    expect(parseKickerCost({ oracle: "Kicker {X}\nIf this spell was kicked, draw X cards." })).toBeNull();
    expect(parseKickerCost({ oracle: "Kicker {2} and/or {R}\nFoo." })).toBeNull();
    expect(parseKickerCost({ oracle: "Flying" })).toBeNull();
  });
});

describe("KICKER parser — entersWithKickedCounters", () => {
  it("reads the kicked counters count (a / two / three / five)", () => {
    expect(entersWithKickedCounters(ARDENT_SOLDIER)).toEqual({ n: 1 });
    expect(entersWithKickedCounters(ACADEMY_DRAKE)).toEqual({ n: 2 });
    expect(entersWithKickedCounters(BALOTH_GORGER)).toEqual({ n: 3 });
    expect(entersWithKickedCounters(LLANOWAR_ELITE)).toEqual({ n: 5 });
  });
  it("returns null for a non-counter kicked payoff (ETB trigger / spell effect) and a multikicker scaler", () => {
    expect(entersWithKickedCounters({ name: "X", oracle: "When this creature enters, if it was kicked, destroy target land." })).toBeNull();
    expect(entersWithKickedCounters({ name: "X", oracle: "Destroy target tapped creature. If this spell was kicked, scry 2." })).toBeNull();
    expect(entersWithKickedCounters({ name: "X", oracle: "This creature enters with a +1/+1 counter on it for each time it was kicked." })).toBeNull();
  });
});

describe("KICKER parser — parseKickerCounterCreature (whole-card gate) + stripKickerText", () => {
  it("returns the kicker cost + kicked counters for each of the nine clean cards", () => {
    for (const c of ALL_NINE) {
      const spec = parseKickerCounterCreature(c, isKeywordOnly);
      expect(spec, c.name).not.toBeNull();
      expect(spec.kickerCost, c.name).toBe(parseKickerCost(c));
      expect(spec.kicked.counters, c.name).toBe(entersWithKickedCounters(c).n);
    }
  });
  it("strips the kicker line + the kicked sentence, leaving the keyword-only body", () => {
    expect(isKeywordOnly(stripKickerText(ARDENT_SOLDIER.oracle), "Ardent Soldier")).toBe(true);
    expect(stripKickerText(BALOTH_GORGER.oracle).replace(/\s+/g, " ").trim()).toBe(""); // vanilla body
  });
  it("returns null when an UNMODELED body clause remains (all-or-nothing CREED)", () => {
    // A clean kicker + counters, but an extra unmodeled static drags the whole card to the Arbiter.
    const rider = { name: "Rider", type: "Creature — Beast", mana: "{2}{G}",
      oracle: "Kicker {3}\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nOther creatures you control get +1/+0 as long as it's your turn." };
    expect(parseKickerCounterCreature(rider, isKeywordOnly)).toBeNull();
  });
  it("returns null for a non-creature (an instant kicker is a different pipeline)", () => {
    expect(parseKickerCounterCreature({ type: "Instant", oracle: "Kicker {U}\nDraw a card. If this spell was kicked, draw two cards instead." }, isKeywordOnly)).toBeNull();
  });
});

// ── Coverage ──────────────────────────────────────────────────────────────────────────────────────
describe("KICKER coverage — the twelve clean creatures classify native-body", () => {
  for (const c of ALL_TWELVE) {
    it(`${c.name} → native-body`, () => {
      expect(classifyCard(c)).toBe("native-body");
    });
  }
  it("an enforced-evasion clause body (can't be blocked / can't block) counts keyword-only", () => {
    expect(classifyCard(AETHER_FIGMENT)).toBe("native-body"); // "This creature can't be blocked."
    expect(classifyCard(KAVU_AGGRESSOR)).toBe("native-body"); // "This creature can't block."
  });
  it("a Convoke (cost-only) kicker creature counts native-body — Convoke is stripped, the runtime hard-casts at full cost", () => {
    expect(classifyCard(KAVU_PRIMARCH)).toBe("native-body");
    expect(parseKickerCounterCreature(KAVU_PRIMARCH, isKeywordOnly)).toMatchObject({ kickerCost: "{4}", kicked: { counters: 4 } });
  });
});

describe("KICKER coverage — CREED anti-FP: deferred shapes stay body-only / arbiter", () => {
  it("Multikicker (variable scaler) stays body-only", () => {
    expect(classifyCard({ name: "Skitter Eel", type: "Creature — Fish", mana: "{3}{U}", oracle: "Multikicker {2}\nThis creature enters with two +1/+1 counters on it for each time it was kicked." })).toBe("body-only");
  });
  it("a kicked ETB-TRIGGER payoff (destroy target land) stays body-only — the trigger pipeline doesn't read the flag yet", () => {
    expect(classifyCard({ name: "Goblin Ruinblaster", type: "Creature — Goblin Shaman", mana: "{2}{R}", oracle: "Kicker {R}\nHaste\nWhen this creature enters, if it was kicked, destroy target nonbasic land." })).toBe("body-only");
  });
  it("a kicker SPELL with a kicked effect stays arbiter-spell (the spell-effect pipeline doesn't read the flag yet)", () => {
    expect(classifyCard({ name: "Runic Shot", type: "Sorcery", mana: "{W}", oracle: "Kicker {U}\nDestroy target tapped creature. If this spell was kicked, scry 2." })).toBe("arbiter-spell");
  });
  it("a kicker creature with an extra unmodeled static stays body-only", () => {
    expect(classifyCard({ name: "Rider", type: "Creature — Beast", mana: "{2}{G}", oracle: "Kicker {3}\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nWhenever this creature attacks, draw a card." })).toBe("body-only");
  });
});

// ── Runtime: cast → resolve (the cast-flag path GENUINELY works) ────────────────────────────────────
function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function setup({ hand = [], mana = {} } = {}) {
  const s = mainState();
  return { ...s, players: { ...s.players, user: { ...s.players.user, hand, manaPool: { ...s.players.user.manaPool, ...mana } } } };
}
const casts = (state, pid = "user") => legalActionsForPlayer(state, pid).filter((a) => a.kind === "cast-spell");
const enteredPerm = (s) => s.players.user.battlefield[s.players.user.battlefield.length - 1];

function castAndResolve(state, action) {
  let s = dispatchAction(state, action);
  // The spell is on the stack; resolve the top (the permanent enters).
  s = resolveTopOfStack(s);
  return s;
}

describe("KICKER runtime — a kicked cast adds the counters; a normal cast does not", () => {
  it("Baloth Gorger NOT kicked → enters as a 4/4 (no counters)", () => {
    const s = setup({ hand: [{ ...BALOTH_GORGER, id: "c1" }], mana: { G: 6 } });
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    expect(normal).toBeTruthy();
    const after = castAndResolve(s, normal);
    const perm = enteredPerm(after);
    expect(perm.card.name).toBe("Baloth Gorger");
    expect(perm.counters?.["+1/+1"] || 0).toBe(0);
    expect(permanentPower(after, perm.id)).toBe(4);
    expect(permanentToughness(after, perm.id)).toBe(4);
  });
  it("Baloth Gorger KICKED → enters as a 7/7 (three +1/+1 counters)", () => {
    const s = setup({ hand: [{ ...BALOTH_GORGER, id: "c1" }], mana: { G: 8 } }); // {2}{G}{G} + kicker {4} = 8 mana
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    const after = castAndResolve(s, kicked);
    const perm = enteredPerm(after);
    expect(perm.counters?.["+1/+1"]).toBe(3);
    expect(permanentPower(after, perm.id)).toBe(7);
    expect(permanentToughness(after, perm.id)).toBe(7);
  });
  it("Ardent Soldier KICKED → 1/2 + a counter = 2/3, keeps Vigilance (body intact)", () => {
    const s = setup({ hand: [{ ...ARDENT_SOLDIER, id: "c1" }], mana: { W: 4 } }); // {1}{W} + kicker {2}
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    const after = castAndResolve(s, kicked);
    const perm = enteredPerm(after);
    expect(perm.counters?.["+1/+1"]).toBe(1);
    expect(permanentPower(after, perm.id)).toBe(2);
    expect(permanentToughness(after, perm.id)).toBe(3);
  });
  it("Kavu Primarch (Convoke body) KICKED → 3/3 + four counters = 7/7 (the Convoke line doesn't block the kick)", () => {
    const s = setup({ hand: [{ ...KAVU_PRIMARCH, id: "c1" }], mana: { G: 8 } }); // {3}{G} + kicker {4} = 8 mana
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    const after = castAndResolve(s, kicked);
    const perm = enteredPerm(after);
    expect(perm.counters?.["+1/+1"]).toBe(4);
    expect(permanentPower(after, perm.id)).toBe(7);
    expect(permanentToughness(after, perm.id)).toBe(7);
  });
});

describe("KICKER runtime — legalChoices emission (both actions when affordable; only normal when not)", () => {
  it("offers BOTH a normal and a kicked cast when the kicker is affordable", () => {
    const s = setup({ hand: [{ ...BALOTH_GORGER, id: "c1" }], mana: { G: 8 } });
    const mine = casts(s).filter((a) => a.cardId === "c1");
    expect(mine.map((a) => a.kicked).sort()).toEqual([false, true]);
    // The kicked action folds the kicker pips into the cost (3 more generic on top of {2}{G}{G}).
    const kicked = mine.find((a) => a.kicked === true);
    expect(kicked.cost.generic).toBe(2 + 4); // {2} base generic + {4} kicker generic
    expect(kicked.cmc).toBe(8);              // mana value counts the kicker paid (CR 202.3b)
  });
  it("offers ONLY the normal cast when the kicker cost is NOT affordable", () => {
    // Exactly the base {2}{G}{G} but not the +{4} kicker.
    const s = setup({ hand: [{ ...BALOTH_GORGER, id: "c1" }], mana: { G: 4 } });
    const mine = casts(s).filter((a) => a.cardId === "c1");
    expect(mine.map((a) => a.kicked)).toEqual([false]);
  });
  it("offers NOTHING when even the base cost is unaffordable", () => {
    const s = setup({ hand: [{ ...BALOTH_GORGER, id: "c1" }], mana: { G: 2 } });
    expect(casts(s).filter((a) => a.cardId === "c1")).toHaveLength(0);
  });
});

describe("KICKER runtime — the AI pays the kicker when it can afford it (decide-by-value)", () => {
  function aiPick(mana) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: { ...base.players, ai: { ...base.players.ai, hand: [{ ...BALOTH_GORGER, id: "c1" }], manaPool: { ...base.players.ai.manaPool, G: mana } } },
    };
    const actions = legalActionsForPlayer(s, "ai");
    return pickAction(s, "ai", actions, { archetype: "midrange" });
  }
  it("picks the KICKED cast when the kicker is affordable", () => {
    expect(aiPick(8)).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: true });
  });
  it("picks the normal cast when only the base cost is affordable", () => {
    expect(aiPick(4)).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: false });
  });
});
