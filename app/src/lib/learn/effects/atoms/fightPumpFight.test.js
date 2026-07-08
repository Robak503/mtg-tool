/**
 * fightPumpFight.test.js — PUMP-THEN-FIGHT (overnight grind, corpus lever).
 *
 * "Target creature you control gets +X/+Y until end of turn. It fights target creature you don't control."
 * (Epic Confrontation / Ruthless Predation / Savage Smash / Swift Kick / Wild Instincts / Chelonian Tackle).
 * matchPumpThenFight collapses the two anaphoric sentences into ONE fight-pair atom carrying fighterPump {X,Y};
 * applyFightPair buffs the chosen fighter +X/+Y (until end of turn, CR 611.2c) BEFORE locking powers, so the
 * pumped POWER deals more and the pumped TOUGHNESS survives the return damage. The cardinal gate the previous
 * author flagged (a source-less spell `fight` no-ops) is proven here to RESOLVE, not half-resolve.
 *
 * Flip-diff GAINED = {Epic Confrontation, Ruthless Predation, Savage Smash, Swift Kick, Wild Instincts,
 * Chelonian Tackle, Mage Duel (cost-reduction prefix strips clean)}, LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { applyFightPair } from "./combat.js";
import { parseEffectProgram } from "../parser.js";
import { classifyCard } from "../../coverage.js";
import { _resetIdsForTests, createGameState, createPermanent, findPermanent } from "../../gameState.js";

beforeEach(() => _resetIdsForTests());

function board(mine = [], theirs = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: mine }, ai: { ...s.players.ai, battlefield: theirs } } };
}
const creature = (id, name, power, toughness, extra = {}, controller = "user") =>
  createPermanent({ id, card: { id: `c-${id}`, name, type: "Creature — Beast", power, toughness, ...extra }, controller, summoningSick: false });
const pairCtx = (fighterId, targetId) => ({
  controller: "user",
  targets: [
    { type: "creature", id: fighterId, controller: "user", role: "fighter", atomIndex: 0 },
    { type: "creature", id: targetId, controller: "ai", role: "target", atomIndex: 0 },
  ],
});
const onBf = (s, pid, id) => s.players[pid].battlefield.some((p) => p.id === id);

const FP_PUMP = { op: "fight-pair", targetType: "creature", fighterPump: { power: 1, toughness: 2 } };
const FP_PLAIN = { op: "fight-pair", targetType: "creature" };

describe("PUMP-THEN-FIGHT runtime — the +X/+Y actually lands before the fight", () => {
  it("a 2/2 fighter with +1/+2 vs a 3/3 → the pumped fighter deals 3 (kills it) AND survives (toughness 4 > 3)", () => {
    const s = applyFightPair(board([creature("f", "Cub", 2, 2, {}, "user")], [creature("t", "Bear", 3, 3, {}, "ai")]), FP_PUMP, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(false);              // took 2+1 = 3 → dies
    expect(onBf(s, "user", "f")).toBe(true);             // 2 base tou + 2 pump = 4 > 3 return → survives
    expect(findPermanent(s, "f").permanent.damageMarked).toBe(3);
  });

  it("CONTROL — the SAME 2/2 vs 3/3 WITHOUT the pump loses (deals only 2, dies to 3): proves the pump changed the outcome", () => {
    const s = applyFightPair(board([creature("f", "Cub", 2, 2, {}, "user")], [creature("t", "Bear", 3, 3, {}, "ai")]), FP_PLAIN, pairCtx("f", "t"));
    expect(onBf(s, "ai", "t")).toBe(true);               // took only 2 → survives
    expect(onBf(s, "user", "f")).toBe(false);            // 2 toughness ≤ 3 return → dies
  });

  it("toughness-only pump (+0/+10, Chelonian Tackle) → the fighter survives a big return hit but deals just its base power", () => {
    const s = applyFightPair(board([creature("f", "Turtle", 1, 4, {}, "user")], [creature("t", "Ogre", 5, 5, {}, "ai")]), { op: "fight-pair", targetType: "creature", fighterPump: { power: 0, toughness: 10 } }, pairCtx("f", "t"));
    expect(onBf(s, "user", "f")).toBe(true);             // 4 + 10 = 14 > 5 return → survives
    expect(findPermanent(s, "t").permanent.damageMarked).toBe(1); // dealt only its base 1 power
  });
});

describe("PUMP-THEN-FIGHT parser + classifier", () => {
  const C = (name, oracle) => ({ name, oracle, type: "Sorcery", keywords: [], mana: "{1}{G}" });

  it("Epic Confrontation parses to a single fight-pair atom carrying fighterPump {1,2}", () => {
    const p = parseEffectProgram({ type: "Sorcery", mana: "{1}{G}", name: "Epic Confrontation", oracle: "Target creature you control gets +1/+2 until end of turn. It fights target creature you don't control." });
    expect(p).not.toBeNull();
    expect(p.atoms).toHaveLength(1);
    expect(p.atoms[0].op).toBe("fight-pair");
    expect(p.atoms[0].fighterPump).toEqual({ power: 1, toughness: 2 });
  });

  it("Epic Confrontation / Savage Smash / Wild Instincts / Chelonian Tackle classify native-spell", () => {
    expect(classifyCard(C("Epic Confrontation", "Target creature you control gets +1/+2 until end of turn. It fights target creature you don't control."))).toBe("native-spell");
    expect(classifyCard(C("Savage Smash", "Target creature you control gets +2/+2 until end of turn. It fights target creature you don't control."))).toBe("native-spell");
    expect(classifyCard(C("Wild Instincts", "Target creature you control gets +2/+2 until end of turn. It fights target creature an opponent controls."))).toBe("native-spell");
    expect(classifyCard(C("Chelonian Tackle", "Target creature you control gets +0/+10 until end of turn. Then it fights up to one target creature an opponent controls."))).toBe("native-spell");
  });

  it("CREED guards: a FILTERED fighter and an excess-damage RIDER stay non-native (safe FN) — the exact anchor rejects them", () => {
    // Hunt the Hunter — the "green creature" filter on both sides is unmodeled here → the exact anchor rejects it.
    expect(classifyCard(C("Hunt the Hunter", "Target green creature you control gets +2/+2 until end of turn. It fights target green creature an opponent controls."))).not.toMatch(/^native/);
    // Rhino's Rampage — the "When excess damage is dealt…" rider is a second, unmodeled ability past the anchor.
    expect(classifyCard(C("Rhino's Rampage", "Target creature you control gets +1/+0 until end of turn. It fights target creature an opponent controls. When excess damage is dealt to that creature this way, draw a card."))).not.toMatch(/^native/);
    // The whole-oracle matcher is anchored ^…$ on the pump-then-fight sentence, so a modal oracle ("Choose one —")
    // is never collapsed by matchPumpThenFight itself — a modal only goes native when EVERY mode is independently
    // modeled (the modal parser's job, not this matcher). Guard: an unmodeled second mode keeps the card non-native.
    expect(classifyCard(C("Fake Charm", "Choose one — • Target creature you control gets +1/+1 until end of turn. It fights target creature you don't control. • Each player draws cards equal to the number of untapped Forests they control."))).not.toBe("native-spell");
  });
});
