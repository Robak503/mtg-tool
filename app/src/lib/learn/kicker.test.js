/**
 * KICKER (CR 702.33) — optional additional cast cost + a "was-kicked" payoff.
 *
 * Two modeled kicked-payoff shapes share the cast-flag plumbing:
 *   (1) ENTERS-WITH-COUNTERS (v0.71.0) — a CREATURE whose ONLY non-keyword text is "If this creature was
 *       kicked, it enters with N +1/+1 counters on it" (parseKickerCounterCreature → native-body). The
 *       resolver reads opts.kicked directly to add the counters AS it enters.
 *   (2) KICKED ETB-TRIGGER (v0.73.0) — a CREATURE with "When this creature enters, if it was kicked,
 *       <effect>" (Goblin Ruinblaster, Torch Slinger, Heartstabber Mosquito …). The kicked flag rides into
 *       the trigger via the permanent: enterPermanent stamps perm.wasKicked, and the "it was kicked"
 *       intervening-if (interveningIf.js, CR 603.4) reads it at BOTH the flush check (drop if not kicked)
 *       and the resolution re-check. parseKickerEtbCreature re-classifies the kicker-line-stripped body
 *       native iff the kicked effect routes HIGH. The two gates are mutually exclusive (no double-claim).
 *
 * End-to-end the engine GENUINELY runs both: legalChoices emits a normal cast + (when the kicker mana is also
 * affordable) a kicked cast; actionDispatcher pays the folded cost + threads `kicked`; the payoff fires only
 * when kicked. The CREED-critical assertions: a NOT-kicked cast fires NOTHING (no counters / the trigger is
 * dropped at flush), a kicked cast fires EXACTLY the payoff, and every deferred shape (multikicker / kicker
 * SPELL effect [PARKED] / an unmodeled kicked effect or unresolvable target / an extra unmodeled body clause)
 * stays body-only or Arbiter — never a fabricated native credit.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { parseKickerCost, entersWithKickedCounters, parseKickerCounterCreature, stripKickerText, hasKickedEtbTrigger, parseKickerEtbCreature } from "./kicker.js";
import { classifyCard, isKeywordOnly, isNativeTier } from "./coverage.js";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { createPermanent } from "./gameState.js";
import { parseEffectClause } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { permanentPower, permanentToughness, permanentHasKeyword } from "./layers.js";
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
    expect(entersWithKickedCounters(ARDENT_SOLDIER)).toEqual({ n: 1, keywords: [] });
    expect(entersWithKickedCounters(ACADEMY_DRAKE)).toEqual({ n: 2, keywords: [] });
    expect(entersWithKickedCounters(BALOTH_GORGER)).toEqual({ n: 3, keywords: [] });
    expect(entersWithKickedCounters(LLANOWAR_ELITE)).toEqual({ n: 5, keywords: [] });
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
  it("⭐ Multikicker's variable scaler is now MODELED — the refusal here was EARNED, 2026-08-05", () => {
    // ⚠️ THIS ASSERTED body-only, and that was right while "for each time it was kicked" had no count source:
    // crediting it would have fabricated a magnitude. The count is now stamped at cast and read by
    // countForSpec's `timesKicked` kind. It reads ZERO on every cast the engine can make — legalChoices still
    // never offers a multikicked cast (parseKickerCost refuses multikicker, CR 702.33h) — and zero is the
    // CORRECT value for those casts: Skitter Eel hard-cast is a plain body with no counters, as printed.
    // ⛔ WHAT THIS DOES **NOT** CLAIM: that multikicker is offered. That deferral is unchanged and is still
    // guarded by parseKickerCost's own pins; see multikickerCount.test.js for the count's zero/non-zero drive.
    expect(classifyCard({ name: "Skitter Eel", type: "Creature — Fish", mana: "{3}{U}", oracle: "Multikicker {2}\nThis creature enters with two +1/+1 counters on it for each time it was kicked." })).toBe("native-body");
  });

  it("⛔ …and the multikicker COST is still deferred — the offer side is untouched", () => {
    expect(parseKickerCost({ name: "Skitter Eel", type: "Creature — Fish", mana: "{3}{U}", oracle: "Multikicker {2}\nThis creature enters with two +1/+1 counters on it for each time it was kicked." })).toBeNull();
  });
  it("a kicked ETB-TRIGGER whose EFFECT IS now modeled (destroy target nonbasic land) flips native-trigger — the kicker→trigger routing fires AND the land-destroy atom resolves (Goblin Ruinblaster)", () => {
    // The "it was kicked" intervening-if routes (interveningIf.js), and "destroy target nonbasic land" now parses
    // HIGH (DESTROY-TARGET nonbasicLand atom), so the whole kicked-ETB creature is native (formerly body-only).
    expect(classifyCard({ name: "Goblin Ruinblaster", type: "Creature — Goblin Shaman", mana: "{2}{R}", oracle: "Kicker {R}\nHaste\nWhen this creature enters, if it was kicked, destroy target nonbasic land." })).toBe("native-trigger");
  });
  it("a kicked ETB-TRIGGER whose EFFECT is STILL unmodeled (destroy target nonbasic land + a damage rider) stays body-only — the destroy atom models, but the conjoined damage rider drags the program LOW (whole-card CREED)", () => {
    // Anti-FP pin (preserves the deferred-shape coverage the Goblin Ruinblaster pin used to give): a Molten-Rain-
    // style conjoined "…It deals 2 damage to that land's controller" rider fails the exact destroy anchor → LOW →
    // the whole kicked-ETB creature stays body-only (never a partial that silently drops the damage rider).
    // GRADUATED (2026-07-28): the damage rider is no longer dropped — it is FOLDED INTO the destroy atom
    // (`damageRider: {amount: 2}`), the program parses HIGH, and the trigger routes. The card was only
    // still parking because the residue chain left the rider sentence behind, which is a different
    // mechanism than the partial-drop this pin is about. The claim it was making — never a partial —
    // is now asserted directly on the atom instead of inferred from the tier.
    const moltenHellkite = { name: "Molten Hellkite", type: "Creature — Dragon", mana: "{4}{R}", oracle: "Kicker {R}\nWhen this creature enters, if it was kicked, destroy target nonbasic land. It deals 2 damage to that land's controller." };
    expect(classifyCard(moltenHellkite)).toMatch(/^native/);
    expect(parseEffectClause("destroy target nonbasic land. It deals 2 damage to that land's controller").atoms[0])
      .toMatchObject({ op: "destroy", targetType: "nonbasicLand", damageRider: { amount: 2 } });
  });
  it("a kicked ETB-TRIGGER whose target-intent is unresolvable (a two-sided fight) stays body-only", () => {
    // A fight-pair atom needs BOTH an own fighter AND an enemy target — one intent value can't express two
    // sides (programTriggerTargetsResolvable false), so triggerRoutesNatively rejects it → body-only (FN-safe
    // CREED). (Gatekeeper of Malakir GRADUATED: its "target player sacrifices" edict is enemy-intent now and
    // routes — monarchBecomes.test.js / edicts.test.js pin that flip.)
    expect(classifyCard({ name: "Fight-Kicker", type: "Creature — Beast", mana: "{2}{G}", oracle: "Kicker {G}\nWhen this creature enters, if it was kicked, this creature fights another target creature and that creature fights another target creature." })).toBe("body-only");
  });
  it("a kicker SPELL with an ADDITIVE kicked effect is now native-spell (v0.74.0 KICKED-SPELL-EFFECT slice — destroy + scry 2)", () => {
    expect(classifyCard({ name: "Runic Shot", type: "Sorcery", mana: "{W}", oracle: "Kicker {U}\nDestroy target tapped creature. If this spell was kicked, scry 2." })).toBe("native-spell");
  });
  it("the ETB-kicker gate does NOT claim the enters-with-counters payoff (that's parseKickerCounterCreature's) — no double-claim", () => {
    expect(parseKickerEtbCreature({ name: "Ardent Soldier", type: "Creature — Human Soldier", mana: "{1}{W}",
      oracle: "Kicker {2}\nVigilance\nIf this creature was kicked, it enters with a +1/+1 counter on it." }, classifyCard, isNativeTier)).toBeNull();
  });
  it("a kicker creature with an extra unmodeled static stays body-only", () => {
    // FIXTURE SWAPPED (census slice 20). This slot used "Whenever this creature attacks, draw a card.",
    // which is a MODELED trigger — it read body-only only because the kicked-counter gate then required the
    // base body to be keyword-only, so ANY extra line parked the card whether the engine understood it or
    // not. The gate now re-classifies the stripped body and takes its tier, so a modeled sibling correctly
    // flips (see kickerCounterBodyTier.test.js). The assertion here is about an UNMODELED sibling, so it
    // needs a genuinely unmodeled one to keep testing what its name says.
    expect(classifyCard({ name: "Rider", type: "Creature — Beast", mana: "{2}{G}", oracle: "Kicker {3}\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nWhenever this creature attacks, each opponent glorbulates." })).toBe("body-only");
  });

  it("…and a MODELED extra ability now takes that ability's tier (slice 20)", () => {
    expect(classifyCard({ name: "Rider2", type: "Creature — Beast", mana: "{2}{G}", oracle: "Kicker {3}\nIf this creature was kicked, it enters with two +1/+1 counters on it.\nWhenever this creature attacks, draw a card." })).toBe("native-trigger");
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

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// KICKED ETB-TRIGGER payoff (v0.73.0) — "When this creature enters, if it was kicked, <effect>".
//
// The base body (keyword-only) is already native; the kicked payoff is a TRIGGERED ability gated on the
// "it was kicked" intervening-if (CR 603.4 + 702.33e). The kicked flag rides into the trigger via the
// permanent: resolvers.enterPermanent stamps perm.wasKicked on a kicked cast, and interveningIf.evaluate
// reads it at BOTH the flush check (drop if not kicked) and the resolution re-check. End-to-end:
//   parser       → parseKickerEtbCreature gates the whole card (re-classifies the kicker-line-stripped body)
//   coverage     → native-trigger / native-mixed (the body's tier)
//   legalChoices → a normal cast + (when the kicker mana is also affordable) a kicked cast (no targets — the
//                  ETB trigger chooses its own at fire time, CR 603.3c)
//   resolvers    → enterPermanent stamps perm.wasKicked; the ETB trigger fires its payoff ONLY when kicked
//
// CREED-critical: a NOT-kicked cast fires NOTHING (the trigger is dropped at flush); a kicked cast fires the
// payoff exactly once; an unmodeled kicked effect (Goblin Ruinblaster land-destroy) / unresolvable target
// (Gatekeeper) stays body-only — never a fabricated native credit.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

// Real printed cards (exact Scryfall oracle text) whose kicked ETB effect IS modeled.
const HEARTSTABBER_MOSQUITO = { name: "Heartstabber Mosquito", type: "Creature — Insect", mana: "{3}{B}", power: 1, toughness: 1,
  oracle: "Kicker {2}{B} (You may pay an additional {2}{B} as you cast this spell.)\nFlying\nWhen this creature enters, if it was kicked, destroy target creature." };
const CITANUL_WOODREADERS = { name: "Citanul Woodreaders", type: "Creature — Human Druid", mana: "{2}{G}", power: 1, toughness: 4,
  oracle: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nWhen this creature enters, if it was kicked, draw two cards." };
const KROSAN_DRUID = { name: "Krosan Druid", type: "Creature — Centaur Druid", mana: "{2}{G}", power: 1, toughness: 4,
  oracle: "Kicker {4}{G} (You may pay an additional {4}{G} as you cast this spell.)\nWhen this creature enters, if it was kicked, you gain 10 life." };
const KOR_SANCTIFIERS = { name: "Kor Sanctifiers", type: "Creature — Kor Cleric", mana: "{2}{W}", power: 2, toughness: 2,
  oracle: "Kicker {W} (You may pay an additional {W} as you cast this spell.)\nWhen this creature enters, if it was kicked, destroy target artifact or enchantment." };
const CALIGO_SKIN_WITCH = { name: "Caligo Skin-Witch", type: "Creature — Human Wizard", mana: "{1}{B}", power: 1, toughness: 3,
  oracle: "Kicker {3}{B} (You may pay an additional {3}{B} as you cast this spell.)\nWhen this creature enters, if it was kicked, each opponent discards two cards." };
const SERGEANT_AT_ARMS = { name: "Sergeant-at-Arms", type: "Creature — Human Soldier", mana: "{2}{W}", power: 3, toughness: 2,
  oracle: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nWhen this creature enters, if it was kicked, create two 1/1 white Soldier creature tokens." };
const TORCH_SLINGER = { name: "Torch Slinger", type: "Creature — Goblin Shaman", mana: "{2}{R}", power: 2, toughness: 2,
  oracle: "Kicker {1}{R} (You may pay an additional {1}{R} as you cast this spell.)\nWhen this creature enters, if it was kicked, it deals 2 damage to target creature." };
const EXCAVATION_ELEPHANT = { name: "Excavation Elephant", type: "Creature — Elephant", mana: "{4}{W}", power: 3, toughness: 4,
  oracle: "Kicker {1}{W} (You may pay an additional {1}{W} as you cast this spell.)\nWhen this creature enters, if it was kicked, return target artifact card from your graveyard to your hand." };

const ETB_KICKERS_NATIVE = [HEARTSTABBER_MOSQUITO, CITANUL_WOODREADERS, KROSAN_DRUID, KOR_SANCTIFIERS, CALIGO_SKIN_WITCH, SERGEANT_AT_ARMS, TORCH_SLINGER, EXCAVATION_ELEPHANT];

describe("KICKED ETB — interveningIf 'it was kicked' (the strict per-permanent flag)", () => {
  it("is in the parseable vocabulary (so coverage + the flush gate credit it)", () => {
    expect(interveningIfParseable("it was kicked")).toBe(true);
  });
  it("reads the entering permanent's wasKicked flag — true when kicked, false when not", () => {
    const kicked = createPermanent({ id: "p1", card: { name: "X", type: "Creature" }, controller: "user" });
    kicked.wasKicked = true;
    const state = (perm) => ({ players: { user: { battlefield: [perm] } } });
    expect(evaluateInterveningIf(state(kicked), "it was kicked", "user", { triggeringPermanentId: "p1" })).toBe(true);
    const normal = createPermanent({ id: "p2", card: { name: "X", type: "Creature" }, controller: "user" });
    expect(evaluateInterveningIf(state(normal), "it was kicked", "user", { triggeringPermanentId: "p2" })).toBe(false);
  });
  it("returns null (FN-safe) with no entering permanent in context — never fail-open", () => {
    expect(evaluateInterveningIf({ players: { user: { battlefield: [] } } }, "it was kicked", "user", {})).toBeNull();
  });
});

describe("KICKED ETB — parser gate hasKickedEtbTrigger / parseKickerEtbCreature", () => {
  it("detects the kicked ETB-trigger shape (name-printed self-ref normalized)", () => {
    expect(hasKickedEtbTrigger(HEARTSTABBER_MOSQUITO)).toBe(true);
    expect(hasKickedEtbTrigger({ name: "Foo", type: "Creature", oracle: "When Foo enters, if it was kicked, draw a card." })).toBe(true);
    expect(hasKickedEtbTrigger({ name: "X", type: "Creature", oracle: "Flying" })).toBe(false);
    // the enters-with-counters payoff is NOT an ETB trigger (no When/Whenever lead)
    expect(hasKickedEtbTrigger(ARDENT_SOLDIER)).toBe(false);
  });
  it("returns the kicker cost for each modeled ETB-kicker; null for the counters shape (no double-claim)", () => {
    for (const c of ETB_KICKERS_NATIVE) {
      const spec = parseKickerEtbCreature(c, classifyCard, isNativeTier);
      expect(spec, c.name).not.toBeNull();
      expect(spec.kickerCost, c.name).toBe(parseKickerCost(c));
    }
    expect(parseKickerEtbCreature(ACADEMY_DRAKE, classifyCard, isNativeTier)).toBeNull(); // counters payoff → other gate
  });
});

describe("KICKED ETB coverage — the modeled ETB-kicker creatures classify native", () => {
  for (const c of ETB_KICKERS_NATIVE) {
    it(`${c.name} → native`, () => {
      expect(isNativeTier(classifyCard(c))).toBe(true);
    });
  }
});

// ── Runtime: cast → resolve (the kicked ETB trigger GENUINELY fires only when kicked) ───────────────
function withOppBoard(state, perms) {
  return { ...state, players: { ...state.players, ai: { ...state.players.ai, battlefield: perms } } };
}
function drainStack(s) {
  let guard = 0;
  while (s.stack && s.stack.length && guard++ < 30) s = resolveTopOfStack(s);
  return s;
}

describe("KICKED ETB runtime — Heartstabber Mosquito destroys a creature ONLY when kicked", () => {
  const VICTIM = createPermanent({ id: "v1", card: { name: "Grizzly Bears", id: "vc", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
  it("KICKED → the ETB trigger destroys the opponent's creature", () => {
    let s = withOppBoard(setup({ hand: [{ ...HEARTSTABBER_MOSQUITO, id: "c1" }], mana: { B: 8 } }), [{ ...VICTIM }]);
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    expect(kicked.cost.generic).toBe(3 + 2);            // {3} base + {2} kicker generic (the {B} is colored)
    expect(kicked.cmc).toBe(7);                          // CR 202.3b — MV counts the kicker paid
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Grizzly Bears");
    expect(s.players.ai.graveyard.map((c) => c.name)).toContain("Grizzly Bears");
    expect(s.players.user.battlefield.map((p) => p.card.name)).toContain("Heartstabber Mosquito");
  });
  it("NOT kicked → the ETB trigger does NOT fire (the creature survives), and no kicked cast is even offered", () => {
    let s = withOppBoard(setup({ hand: [{ ...HEARTSTABBER_MOSQUITO, id: "c1" }], mana: { B: 4 } }), [{ ...VICTIM }]);
    const mine = casts(s).filter((a) => a.cardId === "c1");
    expect(mine.map((a) => a.kicked)).toEqual([false]); // can't afford the kicker → only the normal cast
    s = drainStack(dispatchAction(s, mine[0]));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).toContain("Grizzly Bears"); // survived
    expect((s.pendingTriggers || []).length).toBe(0);   // the conditional trigger was dropped at flush (CR 603.4)
  });
});

describe("KICKED ETB runtime — Citanul Woodreaders draws two ONLY when kicked", () => {
  it("KICKED → draws two cards", () => {
    let s = setup({ hand: [{ ...CITANUL_WOODREADERS, id: "c1" }], mana: { G: 8 } });
    // give the library something to draw
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L1", name: "Forest", type: "Land" }, { id: "L2", name: "Forest", type: "Land" }, { id: "L3", name: "Forest", type: "Land" }] } } };
    const handBefore = s.players.user.hand.length; // 1 (the creature)
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    s = drainStack(dispatchAction(s, kicked));
    // hand: started with 1 (the creature, now cast → -1) + 2 drawn = 2
    expect(s.players.user.hand.length).toBe(handBefore - 1 + 2);
  });
  it("NOT kicked → draws nothing", () => {
    let s = setup({ hand: [{ ...CITANUL_WOODREADERS, id: "c1" }], mana: { G: 4 } });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, library: [{ id: "L1", name: "Forest", type: "Land" }, { id: "L2", name: "Forest", type: "Land" }] } } };
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.user.hand.length).toBe(0); // creature cast, no draw
    expect(s.players.user.library.length).toBe(2); // library untouched
  });
});

describe("KICKED ETB runtime — Krosan Druid gains 10 life ONLY when kicked", () => {
  it("KICKED → +10 life", () => {
    let s = setup({ hand: [{ ...KROSAN_DRUID, id: "c1" }], mana: { G: 10 } });
    const lifeBefore = s.players.user.life;
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.user.life).toBe(lifeBefore + 10);
  });
  it("NOT kicked → life unchanged", () => {
    let s = setup({ hand: [{ ...KROSAN_DRUID, id: "c1" }], mana: { G: 4 } });
    const lifeBefore = s.players.user.life;
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.user.life).toBe(lifeBefore);
  });
});

describe("KICKED ETB runtime — the AI pays the kicker for an ETB-trigger payoff when affordable", () => {
  function aiPickEtb(mana, oppBoard = []) {
    const base = createGameState({ userDeck: [], aiDeck: [] });
    const s = {
      ...base, activePlayer: "ai", priorityHolder: "ai", phase: "precombat-main", step: "main",
      players: {
        ...base.players,
        ai: { ...base.players.ai, hand: [{ ...HEARTSTABBER_MOSQUITO, id: "c1" }], manaPool: { ...base.players.ai.manaPool, B: mana } },
        user: { ...base.players.user, battlefield: oppBoard },
      },
    };
    return pickAction(s, "ai", legalActionsForPlayer(s, "ai"), { archetype: "midrange" });
  }
  it("picks the KICKED cast when the kicker is affordable", () => {
    const enemy = createPermanent({ id: "e1", card: { name: "Bear", id: "bc", type: "Creature — Bear", power: 2, toughness: 2 }, controller: "user" });
    expect(aiPickEtb(8, [enemy])).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: true });
  });
  it("picks the normal cast when only the base cost is affordable", () => {
    expect(aiPickEtb(4)).toMatchObject({ kind: "cast-spell", cardId: "c1", kicked: false });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════
// KICKED ENTERS-WITH — "… counters on it AND WITH <keyword>" grant tail (BLITZ KK-1, CR 702.33e + 614.12).
//
// The kicked replacement can grant a continuous combat keyword ALONGSIDE the +1/+1 counters (Benalish Lancer
// = first strike, Kavu Titan = trample, Duskwalker = fear, Faerie Squadron = flying, Pouncing Wurm/Kavu =
// haste). resolvers.enterPermanent stamps perm.kickedKeywords on the kicked cast; layers.permanentHasKeyword
// seeds from it (fromKicked) — the ONE gate combat damage / evasion / summoning-sickness all funnel through —
// but ONLY for GRANTABLE_COMBAT_KEYWORDS, so a granted instance behaves EXACTLY like a printed one. A NOT-
// kicked cast grants nothing. CREED anti-FP: a quoted grant (Prison Barricade) / a compound "…and a trample
// counter…" shape (Voidpouncer) / a non-grantable keyword fails closed → the card stays body-only. Also:
// hasKickedEtbTrigger now normalizes the legendary PRE-COMMA short name (CR 201.5), flipping Slinn Voda,
// whose "When Slinn Voda enters, if it was kicked, …" self-reference was a false negative before.
// ════════════════════════════════════════════════════════════════════════════════════════════════════

const BENALISH_LANCER = { name: "Benalish Lancer", type: "Creature — Human Knight", mana: "{2}{W}", power: 2, toughness: 2,
  oracle: "Kicker {2}{W} (You may pay an additional {2}{W} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it and with first strike." };
const KAVU_TITAN = { name: "Kavu Titan", type: "Creature — Kavu", mana: "{1}{G}", power: 2, toughness: 2,
  oracle: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with trample." };
const DUSKWALKER = { name: "Duskwalker", type: "Creature — Human Minion", mana: "{B}", power: 1, toughness: 1,
  oracle: "Kicker {3}{B} (You may pay an additional {3}{B} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it and with fear. (It can't be blocked except by artifact creatures and/or black creatures.)" };
const FAERIE_SQUADRON = { name: "Faerie Squadron", type: "Creature — Faerie", mana: "{U}", power: 1, toughness: 1,
  oracle: "Kicker {3}{U} (You may pay an additional {3}{U} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters on it and with flying." };
const POUNCING_WURM = { name: "Pouncing Wurm", type: "Creature — Wurm", mana: "{3}{G}", power: 3, toughness: 3,
  oracle: "Kicker {2}{G} (You may pay an additional {2}{G} as you cast this spell.)\nIf this creature was kicked, it enters with three +1/+1 counters on it and with haste." };
const POUNCING_KAVU = { name: "Pouncing Kavu", type: "Creature — Kavu", mana: "{1}{R}", power: 1, toughness: 1,
  oracle: "Kicker {2}{R} (You may pay an additional {2}{R} as you cast this spell.)\nFirst strike\nIf this creature was kicked, it enters with two +1/+1 counters on it and with haste." };
const SLINN_VODA = { name: "Slinn Voda, the Rising Deep", type: "Legendary Creature — Leviathan", mana: "{6}{U}{U}", power: 8, toughness: 8,
  oracle: "Kicker {1}{U} (You may pay an additional {1}{U} as you cast this spell.)\nWhen Slinn Voda enters, if it was kicked, return all creatures to their owners' hands except for Merfolk, Krakens, Leviathans, Octopuses, and Serpents." };
// Anti-FP park cards (real oracle): a quoted-grant tail and a compound "…and a trample counter…" shape.
const PRISON_BARRICADE = { name: "Prison Barricade", type: "Creature — Wall", mana: "{1}{W}", power: 1, toughness: 3,
  oracle: "Defender (This creature can't attack.)\nKicker {1}{W} (You may pay an additional {1}{W} as you cast this spell.)\nIf this creature was kicked, it enters with a +1/+1 counter on it and with \"This creature can attack as though it didn't have defender.\"" };
const VOIDPOUNCER = { name: "Voidpouncer", type: "Creature — Eldrazi", mana: "{1}{R}", power: 3, toughness: 1,
  oracle: "Devoid (This card has no color.)\nKicker {2}{C} (You may pay an additional {2}{C} as you cast this spell.)\nIf this creature was kicked, it enters with two +1/+1 counters and a trample counter on it and with haste." };
const GRUNN = { name: "Grunn, the Lonely King", type: "Legendary Creature — Ape Warrior", mana: "{4}{G}{G}", power: 5, toughness: 5,
  oracle: "Kicker {3} (You may pay an additional {3} as you cast this spell.)\nIf Grunn was kicked, it enters with five +1/+1 counters on it.\nWhenever Grunn attacks alone, double its power and toughness until end of turn." };

// [card, granted keyword, kicked-counter count, kicked-total mana (single color), exact base mana]. Mana is
// isolated to the card's OWN color (zero of anything else) so the "not kicked" cast can afford the base but
// NEVER the kicker — cross-color generic can't sneak the kicker in.
const KEYWORD_GRANT_FLIPS = [
  [BENALISH_LANCER, "First strike", 2, { W: 6 }, { W: 3 }], // {2}{W} + kicker {2}{W}
  [KAVU_TITAN,      "Trample",      3, { G: 5 }, { G: 2 }], // {1}{G} + kicker {2}{G}
  [DUSKWALKER,      "Fear",         2, { B: 5 }, { B: 1 }], // {B}    + kicker {3}{B}
  [FAERIE_SQUADRON, "Flying",       2, { U: 5 }, { U: 1 }], // {U}    + kicker {3}{U}
  [POUNCING_WURM,   "Haste",        3, { G: 7 }, { G: 4 }], // {3}{G} + kicker {2}{G}
  [POUNCING_KAVU,   "Haste",        2, { R: 5 }, { R: 2 }], // {1}{R} + kicker {2}{R}
];

describe("KICKER keyword-grant parser — entersWithKickedCounters returns { n, keywords }", () => {
  it("reads the counters count AND the grantable-keyword tail (first strike / trample / fear / flying / haste)", () => {
    expect(entersWithKickedCounters(BENALISH_LANCER)).toEqual({ n: 2, keywords: ["first strike"] });
    expect(entersWithKickedCounters(KAVU_TITAN)).toEqual({ n: 3, keywords: ["trample"] });
    expect(entersWithKickedCounters(DUSKWALKER)).toEqual({ n: 2, keywords: ["fear"] });
    expect(entersWithKickedCounters(FAERIE_SQUADRON)).toEqual({ n: 2, keywords: ["flying"] });
    expect(entersWithKickedCounters(POUNCING_WURM)).toEqual({ n: 3, keywords: ["haste"] });
    expect(entersWithKickedCounters(POUNCING_KAVU)).toEqual({ n: 2, keywords: ["haste"] });
  });
  it("the counter-only form still returns an EMPTY keyword list (backward compatible)", () => {
    expect(entersWithKickedCounters(BALOTH_GORGER)).toEqual({ n: 3, keywords: [] });
    expect(entersWithKickedCounters(ARDENT_SOLDIER)).toEqual({ n: 1, keywords: [] });
  });
  it("normalizes the legendary PRE-COMMA short name (Grunn → n=5)", () => {
    expect(entersWithKickedCounters(GRUNN)).toEqual({ n: 5, keywords: [] });
  });
  it("fails closed on a non-grantable / quoted / compound grant tail (CREED anti-FP)", () => {
    expect(entersWithKickedCounters(PRISON_BARRICADE)).toBeNull();  // quoted "can attack as though…" grant
    expect(entersWithKickedCounters(VOIDPOUNCER)).toBeNull();       // "…and a trample counter…" compound shape
    // a hypothetical NON-grantable keyword (protection) must park, not fabricate a grant the engine ignores
    expect(entersWithKickedCounters({ name: "X", oracle: "If this creature was kicked, it enters with a +1/+1 counter on it and with protection from red." })).toBeNull();
  });
});

describe("KICKER keyword-grant coverage — the six counter+keyword creatures classify native-body", () => {
  for (const [c] of KEYWORD_GRANT_FLIPS) {
    it(`${c.name} → native-body`, () => {
      expect(classifyCard(c)).toBe("native-body");
      const spec = parseKickerCounterCreature(c, isKeywordOnly);
      expect(spec, c.name).not.toBeNull();
      expect(spec.kicked.keywords.length, c.name).toBeGreaterThan(0);
    });
  }
  it("Slinn Voda (short-name ETB self-ref) → native-trigger via hasKickedEtbTrigger normalization", () => {
    expect(hasKickedEtbTrigger(SLINN_VODA)).toBe(true);
    expect(classifyCard(SLINN_VODA)).toBe("native-trigger");
  });
  it("anti-FP: quoted-grant / compound-counter / extra-clause kicker creatures stay body-only", () => {
    expect(classifyCard(PRISON_BARRICADE)).toBe("body-only"); // quoted grant tail
    expect(classifyCard(VOIDPOUNCER)).toBe("body-only");      // compound "…and a trample counter…"
    expect(classifyCard(GRUNN)).toBe("body-only");            // attacks-alone trigger drags the whole card
  });
});

describe("KICKER keyword-grant runtime — the granted keyword is honored ONLY on a kicked cast", () => {
  for (const [card, keyword, n, kickedMana, baseMana] of KEYWORD_GRANT_FLIPS) {
    it(`${card.name} KICKED → enters with ${n} counters AND ${keyword} (permanentHasKeyword true)`, () => {
      const s = setup({ hand: [{ ...card, id: "c1" }], mana: kickedMana });
      const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
      expect(kicked, card.name).toBeTruthy();
      const after = castAndResolve(s, kicked);
      const perm = enteredPerm(after);
      expect(perm.counters?.["+1/+1"], card.name).toBe(n);
      expect(permanentHasKeyword(after, perm.id, keyword), card.name).toBe(true);
    });
    it(`${card.name} NOT kicked → no counters and NO granted ${keyword}`, () => {
      const s = setup({ hand: [{ ...card, id: "c1" }], mana: baseMana });
      const mine = casts(s).filter((a) => a.cardId === "c1");
      expect(mine.map((a) => a.kicked), card.name).toEqual([false]); // base affordable, kicker is NOT
      const after = castAndResolve(s, mine[0]);
      const perm = enteredPerm(after);
      expect(perm.counters?.["+1/+1"] || 0, card.name).toBe(0);
      // Pouncing Kavu has PRINTED first strike; the GRANTED keyword under test (haste) must still be absent.
      expect(permanentHasKeyword(after, perm.id, keyword), card.name).toBe(false);
    });
  }
  it("a kicked Pouncing Kavu keeps its PRINTED first strike AND gains the granted haste", () => {
    const s = setup({ hand: [{ ...POUNCING_KAVU, id: "c1" }], mana: { R: 6 } }); // {1}{R} + kicker {2}{R}
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    const after = castAndResolve(s, kicked);
    const perm = enteredPerm(after);
    expect(permanentHasKeyword(after, perm.id, "First strike")).toBe(true); // printed
    expect(permanentHasKeyword(after, perm.id, "Haste")).toBe(true);        // kicked grant
  });
});

describe("KICKER short-name ETB runtime — Slinn Voda bounces the board ONLY when kicked", () => {
  const BEAR = createPermanent({ id: "b1", card: { name: "Grizzly Bears", id: "gb", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "ai" });
  it("KICKED → the ETB trigger returns the opponent's non-exempt creature to hand", () => {
    let s = withOppBoard(setup({ hand: [{ ...SLINN_VODA, id: "c1" }], mana: { U: 12 } }), [{ ...BEAR }]);
    const kicked = casts(s).find((a) => a.cardId === "c1" && a.kicked === true);
    expect(kicked).toBeTruthy();
    s = drainStack(dispatchAction(s, kicked));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).not.toContain("Grizzly Bears");
    expect(s.players.ai.hand.map((c) => c.name)).toContain("Grizzly Bears");
  });
  it("NOT kicked → the ETB trigger is dropped at flush (the creature survives)", () => {
    let s = withOppBoard(setup({ hand: [{ ...SLINN_VODA, id: "c1" }], mana: { U: 8 } }), [{ ...BEAR }]);
    const normal = casts(s).find((a) => a.cardId === "c1" && a.kicked === false);
    expect(normal).toBeTruthy();
    s = drainStack(dispatchAction(s, normal));
    expect(s.players.ai.battlefield.map((p) => p.card.name)).toContain("Grizzly Bears");
  });
});
