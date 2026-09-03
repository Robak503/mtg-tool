/**
 * referentControllerTarget.test.js — ④-AH (2026-09-03 night): "target creature DEFENDING PLAYER controls" and "target
 * creature THAT PLAYER controls" join the subject peel — Spring Splasher "Whenever this creature attacks, target creature
 * defending player controls gets -3/-0 until end of turn", Skymark Roc (the same referent stacked with a toughness bound).
 * The two referents are the legacy parser's own (DP-TGT / DT-1): who:"defendingPlayer" reads ctx.defenderId (the attacks /
 * becomesBlocked / attacksAlone flushes), who:"damagedPlayer" reads ctx.damagedPlayerId (the combatDamageToPlayer flush);
 * both fail CLOSED without it. Honesty is the ROUTING gate's job: triggerRouting refuses the referent on any event that
 * does not supply it, coverage refuses it on a spell — so an ETB or an instant carrying the phrase parks as before. Only
 * +2 flipped: the other ~70 carriers park on their OTHER clause shapes (goad, "loses flying until your next turn", "you may
 * sacrifice it. If you do", "target Hero"), ablation-checked. Real oracle fixtures (bundled Scryfall snapshot, 2026-09-03).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { classifyCard } from "./coverage.js";
import { parseEffectClause } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const SPLASHER = { id: "c-ss", name: "Spring Splasher", type: "Creature — Frog Beast", mana: "{1}{U}", cmc: 2, power: 3, toughness: 2, keywords: [],
  oracle: "Whenever this creature attacks, target creature defending player controls gets -3/-0 until end of turn." };
const ROC = { id: "c-sr", name: "Skymark Roc", type: "Creature — Bird", mana: "{2}{W}{U}", cmc: 4, power: 3, toughness: 3, keywords: ["Flying"],
  oracle: "Flying\nWhenever this creature attacks, you may return target creature defending player controls with toughness 2 or less to its owner's hand." };
// synthetic controls, named as such: the SAME clause under an event / a spell that never supplies the referent
const ETB_FORM = { id: "c-etb", name: "Synthetic ETB Splasher", type: "Creature — Frog", mana: "{1}{U}", cmc: 2, power: 3, toughness: 2, keywords: [],
  oracle: "When this creature enters, target creature defending player controls gets -3/-0 until end of turn." };
const SPELL_FORM = { id: "h-sp", name: "Synthetic Splash", type: "Instant", mana: "{U}", cmc: 1, keywords: [],
  oracle: "Target creature defending player controls gets -3/-0 until end of turn." };
const CDMG_FORM = { id: "c-cd", name: "Synthetic Zealot", type: "Creature — Human", mana: "{1}{B}", cmc: 2, power: 2, toughness: 2, keywords: [],
  oracle: "Whenever this creature deals combat damage to a player, destroy target creature that player controls." };
const UPKEEP_FORM = { id: "c-up", name: "Synthetic Upkeep Zealot", type: "Creature — Human", mana: "{1}{B}", cmc: 2, power: 2, toughness: 2, keywords: [],
  oracle: "At the beginning of your upkeep, destroy target creature that player controls." };

const bear = (id, controller) => createPermanent({ id, card: { id: `card-${id}`, name: id, type: "Creature — Bear", mana: "{1}{G}", cmc: 2, power: 2, toughness: 2, keywords: [], oracle: "" }, controller, summoningSick: false });

describe("the parse", () => {
  it("⭐ the referent phrase peels off the subject and rides back as the legacy parser's own controller kinds", () => {
    expect(parseEffectClause("Target creature defending player controls gets -3/-0 until end of turn.", "Instant").atoms[0])
      .toMatchObject({ op: "pump", targetType: "creature", restrictions: [{ kind: "controller", who: "defendingPlayer" }] });
    expect(parseEffectClause("Destroy target creature that player controls.", "Instant").atoms[0].restrictions)
      .toEqual([{ kind: "controller", who: "damagedPlayer" }]);
    // stacked with a bound (Skymark Roc): both ride
    expect(parseEffectClause("Return target creature defending player controls with toughness 2 or less to its owner's hand.", "Instant").atoms[0].restrictions)
      .toEqual([{ kind: "toughness", op: "<=", value: 2 }, { kind: "controller", who: "defendingPlayer" }]);
    // ⛔ the fallback stamps ONLY a plain single-creature atom: a fight PAIR reduced to "… fights target creature" is
    // a two-target shape whose second target would carry the referent silently — refused, parks.
    expect(parseEffectClause("Target creature you control fights another target creature.", "Instant").atoms[0].op).toBe("fight-pair"); // the pair shape the guard sees
    expect(parseEffectClause("Target creature you control fights another target creature that player controls.", "Instant")?.atoms || []).toEqual([]);
  });

  it("⭐ the tiers — credited ONLY under the event that supplies the referent; an ETB, an upkeep trigger, or a spell carrying it parks", () => {
    expect(classifyCard(SPLASHER)).toBe("native-trigger");
    expect(classifyCard(ROC)).toBe("native-trigger");
    expect(classifyCard(CDMG_FORM)).toBe("native-trigger");
    expect(classifyCard(ETB_FORM)).not.toMatch(/^native/);
    expect(classifyCard(UPKEEP_FORM)).not.toMatch(/^native/);
    expect(classifyCard(SPELL_FORM)).not.toMatch(/^native/);
  });
});

describe("runtime — the pool is the referent's board, and EMPTY without the referent", () => {
  it("⭐ with ctx.defenderId the pool is exactly the defending player's creatures; without it, nothing (fail closed)", () => {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    const s = { ...s0, players: { ...s0.players,
      user: { ...s0.players.user, battlefield: [bear("mine", "user")] },
      ai: { ...s0.players.ai, battlefield: [bear("theirs-a", "ai"), bear("theirs-b", "ai")] } } };
    const spec = parseEffectClause("Target creature defending player controls gets -3/-0 until end of turn.", "Instant").atoms[0];
    const pool = (ctx) => enumerateTargets(s, "user", { targetType: "creature", restrictions: spec.restrictions }, [], ctx).map((t) => t.id).sort();
    expect(pool({ defenderId: "ai" })).toEqual(["theirs-a", "theirs-b"]);
    expect(pool({ defenderId: "user" })).toEqual(["mine"]);
    expect(pool(null)).toEqual([]);
    const cd = parseEffectClause("Destroy target creature that player controls.", "Instant").atoms[0];
    const cdPool = (ctx) => enumerateTargets(s, "user", { targetType: "creature", restrictions: cd.restrictions }, [], ctx).map((t) => t.id).sort();
    expect(cdPool({ damagedPlayerId: "ai" })).toEqual(["theirs-a", "theirs-b"]);
    expect(cdPool({ defenderId: "ai" })).toEqual([]); // the OTHER referent does not stand in
  });
});
