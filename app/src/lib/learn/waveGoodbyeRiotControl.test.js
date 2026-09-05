/**
 * WAVE GOODBYE + RIOT CONTROL — SHELF-85 · Bumble Flower F5 (2026-09-05). Two small arms on shared grammar.
 * Wave Goodbye: "Return each creature without a +1/+1 counter on it to its owner's hand." — the "each creature <filter>"
 * mass bounce (the singular twin of the filtered "return all …" arm, delegated to the shared restriction grammar) and
 * the negated NAMED counter form "without a <type> counter on it" (tracked kinds only — the ④-AC discipline).
 * Riot Control: "You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt to you
 * this turn." — the gain-life-for-each arm now reads the scoped count sources, and "all damage to you" is the
 * controller's this-turn shield with a finite JSON-safe amount no hit exhausts.
 *
 * Mutation-checked: see the run ledger (docs-sk65).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { parseEffectProgram } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyDamageEffect } from "./spellEffects.js"; // the real damage path — it consumes prevention shields

beforeEach(() => _resetIdsForTests());

const WAVE = { name: "Wave Goodbye", type: "Sorcery", mana: "{2}{U}{U}", keywords: [], oracle: "Return each creature without a +1/+1 counter on it to its owner's hand." };
const RIOT = { name: "Riot Control", type: "Instant", mana: "{2}{W}", keywords: [], oracle: "You gain 1 life for each creature your opponents control. Prevent all damage that would be dealt to you this turn." };
const perm = (id, controller, card, extra = {}) => ({ ...createPermanent({ id, card: { id: `c-${id}`, ...card }, controller, summoningSick: false }), ...extra });
const bear = (id, controller, extra) => perm(id, controller, { name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, extra);
function state(hand, mana, board, oppBoard) {
  const b = createGameState({ userDeck: [], aiDeck: [] });
  return { ...b, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...b.players, user: { ...b.players.user, hand: [hand], battlefield: board, manaPool: { ...b.players.user.manaPool, ...mana }, life: 20 }, ai: { ...b.players.ai, battlefield: oppBoard, life: 20 } } };
}
function drain(s) { let g = 0; while (s.stack && s.stack.length && g++ < 30) s = resolveTopOfStack(s); return s; }
const cast = (s, id) => { const a = legalActionsForPlayer(s, "user").find((x) => x.kind === "cast-spell" && x.cardId === id); expect(a).toBeTruthy(); return drain(dispatchAction(s, a)); };

describe("parse + classify", () => {
  it("Wave Goodbye → a mass bounce with a negated +1/+1 hasCounter restriction; Riot Control → a scoped gain-life count + the all-damage shield; both native-spell", () => {
    const w = parseEffectProgram(WAVE), r = parseEffectProgram(RIOT);
    const row = { w: [w.confidence, w.atoms], r: [r.confidence, r.atoms.map((a) => [a.op, a.amountCount ?? null, a.amount ?? null, a.who ?? null])], wTier: classifyCard(WAVE), rTier: classifyCard(RIOT) };
    console.log("  WITNESS wrParse", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.w).toEqual(["high", [{ op: "bounce", targetType: "eachCreature", restrictions: [{ kind: "hasCounter", counterType: "+1/+1", negate: true }] }]]);
    expect(row.r[0]).toBe("high");
    expect(row.r[1]).toEqual([["gain-life", { kind: "permanentsYouControl", cardType: "creature", who: "opponents", per: 1 }, null, null], ["prevent-next-damage", null, 1000000, "you"]]);
    expect(row.wTier).toBe("native-spell");
    expect(row.rTier).toBe("native-spell");
  });
  it("an UNTRACKED counter type in the negated form stays residue (Oblivion Stone's kin park — the ④-AC discipline)", () => {
    const p = parseEffectProgram({ name: "Probe", type: "Sorcery", mana: "{1}", keywords: [], oracle: "Return each creature without a fate counter on it to its owner's hand." });
    console.log("  WITNESS wrUntracked", JSON.stringify({ confidence: p.confidence, atoms: p.atoms.length })); // vitest 4 needs --disable-console-intercept
    expect(p.confidence).toBe("low");
    expect(p.atoms.length).toBe(0);
  });
});

describe("resolution", () => {
  it("Wave Goodbye bounces every counter-less creature on BOTH sides and spares the one with a +1/+1 counter", () => {
    const s0 = state({ ...WAVE, id: "w1" }, { U: 2, C: 2 }, [bear("u1", "user"), bear("u2", "user", { counters: { "+1/+1": 1 } })], [bear("a1", "ai"), bear("a2", "ai", { counters: { "+1/+1": 2 } })]);
    const s1 = cast(s0, "w1");
    const row = { userBf: s1.players.user.battlefield.map((p) => p.id).sort(), aiBf: s1.players.ai.battlefield.map((p) => p.id).sort(), userHand: s1.players.user.hand.map((c) => c.name).sort(), aiHand: s1.players.ai.hand.map((c) => c.name).sort() };
    console.log("  WITNESS waveResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.userBf).toEqual(["u2"]);
    expect(row.aiBf).toEqual(["a2"]);
    expect(row.userHand).toEqual(["Grizzly Bears"]);
    expect(row.aiHand).toEqual(["Grizzly Bears"]);
  });
  it("Riot Control gains 1 life per OPPONENT creature (own creatures don't count) and a later 9-damage hit to you this turn is prevented", () => {
    const s0 = state({ ...RIOT, id: "r1" }, { W: 1, C: 2 }, [bear("u1", "user")], [bear("a1", "ai"), bear("a2", "ai"), bear("a3", "ai")]);
    const s1 = cast(s0, "r1");
    const s2 = applyDamageEffect(s1, { controller: "ai", amount: 9, targetType: "player", targets: [{ type: "player", id: "user" }], source: { id: "a1" } });
    const row = { lifeAfterCast: s1.players.user.life, shields: (s1.preventionShields || []).map((sh) => [sh.targetKind, sh.targetId, sh.amount]), lifeAfterHit: s2.players.user.life };
    console.log("  WITNESS riotResolve", JSON.stringify(row)); // vitest 4 needs --disable-console-intercept
    expect(row.lifeAfterCast).toBe(23);
    expect(row.shields).toEqual([["player", "user", 1000000]]);
    expect(row.lifeAfterHit).toBe(23);
  });
});
