/**
 * twoTargetPump.test.js — TWO-TARGET PUMP/DEBUFF (overnight grind, systems lever).
 *
 * "Target creature gets +X/+Y until end of turn. Another target creature gets -A/-B until end of turn."
 * (Leeching Bite, Consume Strength, Schismotivate, Rites of Reaping, Steal Strength, and Drooling Groodion's
 * activated ability). matchTwoTargetPump collapses the two anaphoric sentences into ONE pump-pair atom mirroring
 * the unrestricted fight-pair form: role "fighter" = the +buff recipient, role "target" = the -debuff recipient,
 * distinct:true (CR 601.2c). applyPumpPair applies both endOfTurn layer-7c P/T effects; a -toughness debuff that
 * drops the enemy to <=0 dies on the lethal SBA. The AI two-target chooser (opponentAI) assigns fighter=OWN /
 * target=ENEMY and casts only when the debuff is lethal — never friendly-fire (adversarially verified separately).
 *
 * Flip-diff GAINED = 6, LOST = 0.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { parseEffectClause, programConfidence, parseEffectProgram, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyPumpPair } from "./effects/atoms/combat.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { pickAction } from "./opponentAI.js";
import { permanentPower, permanentToughness } from "./layers.js";

const LEECHING_BITE = { id: "lb", name: "Leeching Bite", type: "Instant", mana: "{G}", oracle: "Target creature gets +1/+1 until end of turn. Another target creature gets -1/-1 until end of turn." };

beforeEach(() => _resetIdsForTests());
const C = (name, oracle, type = "Instant", mana = "{1}{G}") => ({ name, oracle, type, keywords: [], mana });

describe("two-target pump — parser + classify", () => {
  it("collapses to ONE pump-pair atom with fighter/target roles, distinct, buff+debuff deltas", () => {
    expect(parseEffectClause("Target creature gets +1/+1 until end of turn. Another target creature gets -1/-1 until end of turn.")).toMatchObject({
      confidence: "high",
      atoms: [{ op: "pump-pair", role: "target", secondaryRole: "fighter", distinct: true, buffDelta: { p: 1, t: 1 }, debuffDelta: { p: -1, t: -1 } }],
    });
    expect(parseEffectClause("Target creature gets +4/+0 until end of turn. Another target creature gets -4/-0 until end of turn.").atoms[0])
      .toMatchObject({ op: "pump-pair", buffDelta: { p: 4, t: 0 }, debuffDelta: { p: -4, t: 0 } });
  });
  it("intent is AMBIGUOUS (two opposite sides) so a trigger routes to the Arbiter, never a blind mis-target", () => {
    expect(atomTargetIntent({ op: "pump-pair", targetType: "creature" })).toBe("ambiguous");
  });
  it("Leeching Bite / Consume Strength / Schismotivate classify native-spell", () => {
    expect(classifyCard(C("Leeching Bite", "Target creature gets +1/+1 until end of turn. Another target creature gets -1/-1 until end of turn.", "Instant", "{G}"))).toBe("native-spell");
    expect(classifyCard(C("Consume Strength", "Target creature gets +2/+2 until end of turn. Another target creature gets -2/-2 until end of turn.", "Sorcery", "{2}{B}{G}"))).toBe("native-spell");
    expect(classifyCard(C("Schismotivate", "Target creature gets +4/+0 until end of turn. Another target creature gets -4/-0 until end of turn.", "Sorcery", "{2}{R}{R}"))).toBe("native-spell");
  });
  it("CREED guard: a MASS 'each other creature' second clause does NOT match the two-target anchor", () => {
    // The pump-pair anchor requires "Another TARGET creature gets -A/-B" — a MASS "each other creature gets -1/-1"
    // (a Languish-style symmetric wipe, not a chosen second target) must fail the anchor → LOW → Arbiter.
    expect(programConfidence(parseEffectProgram(C("Fake", "Target creature gets +1/+1 until end of turn. Each other creature gets -1/-1 until end of turn.")))).toBe("low");
    // A single "Target creature gets +1/+1" is legitimately native via the ordinary PUMP path, but it is NOT a
    // pump-pair — the atom carries no debuffDelta / second role.
    expect(parseEffectClause("Target creature gets +1/+1 until end of turn.")?.atoms?.[0]?.op).not.toBe("pump-pair");
  });
});

describe("two-target pump — resolver (buff fighter, debuff target, lethal SBA)", () => {
  const mk = (id, p, t, ctl) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: p, toughness: t }, controller: ctl, summoningSick: false });
  function board() {
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return { ...s0, players: { ...s0.players, user: { ...s0.players.user, battlefield: [mk("mine", 2, 2, "user")] }, ai: { ...s0.players.ai, battlefield: [mk("foe", 3, 1, "ai")] } } };
  }
  const ctx = { controller: "user", targets: [{ type: "creature", id: "mine", role: "fighter", atomIndex: 0 }, { type: "creature", id: "foe", role: "target", atomIndex: 0 }] };

  it("the fighter gets +buff, the target gets -debuff, and a lethal -toughness kills the target", () => {
    const n = applyPumpPair(board(), { op: "pump-pair", buffDelta: { p: 1, t: 1 }, debuffDelta: { p: -1, t: -1 } }, ctx);
    expect(permanentPower(n, "mine")).toBe(3);            // 2 + 1
    expect(permanentToughness(n, "mine")).toBe(3);        // 2 + 1
    expect(n.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false); // 3/1 → 2/0 → dies
  });
  it("a power-only debuff (-N/-0) does NOT kill (no toughness reduction); the target survives shrunken", () => {
    const s = { ...createGameState({ userDeck: [], aiDeck: [] }) };
    const st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [mk("mine", 2, 2, "user")] }, ai: { ...s.players.ai, battlefield: [mk("foe", 4, 3, "ai")] } } };
    const n = applyPumpPair(st, { op: "pump-pair", buffDelta: { p: 4, t: 0 }, debuffDelta: { p: -4, t: 0 } }, ctx);
    expect(n.players.ai.battlefield.some((p) => p.id === "foe")).toBe(true);   // toughness untouched → survives
    expect(permanentPower(n, "foe")).toBe(0);             // 4 - 4
  });
});

// ─── End-to-end pipeline: the card MUST route through the role-tagged two-target path, not the legacy ───
// single-target pump (which half-resolved and could BUFF an enemy — the FP the adversarial audit caught).
describe("two-target pump — real cast pipeline routes role-tagged pairs (both halves resolve)", () => {
  const mk = (id, p, t, ctl) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Bear", power: p, toughness: t }, controller: ctl, summoningSick: false });
  function board(caster, foeTou) {
    const opp = caster === "user" ? "ai" : "user";
    const s0 = createGameState({ userDeck: [], aiDeck: [] });
    return {
      ...s0, phase: "precombat-main", step: "main", activePlayer: caster, priorityHolder: caster, consecutivePasses: 0,
      players: { ...s0.players,
        [caster]: { ...s0.players[caster], battlefield: [mk("mine", 2, 2, caster)], hand: [LEECHING_BITE], manaPool: { ...s0.players[caster].manaPool, G: 1 } },
        [opp]: { ...s0.players[opp], battlefield: [mk("foe", 3, foeTou, opp)] } },
    };
  }

  it("legalActions produce role-tagged (fighter/target) pairs, and casting buff-own/debuff-enemy resolves BOTH halves", () => {
    const s = board("user", 1);
    const casts = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").filter((a) => a.cardId === "lb");
    expect(casts.length).toBeGreaterThan(0);
    expect(casts.every((c) => (c.targets || []).some((t) => t.role === "fighter") && (c.targets || []).some((t) => t.role === "target"))).toBe(true); // ROLE-TAGGED, not legacy single-target
    const good = casts.find((c) => (c.targets || []).some((t) => t.role === "fighter" && t.id === "mine") && (c.targets || []).some((t) => t.role === "target" && t.id === "foe"));
    let n = resolveTopOfStack(dispatchAction(s, good));
    n = n.stack?.length ? resolveTopOfStack(n) : n;
    expect(permanentPower(n, "mine")).toBe(3);            // +buff landed on our creature
    expect(n.players.ai.battlefield.some((p) => p.id === "foe")).toBe(false); // -debuff landed → 3/1 → 2/0 → dead (NOT buffed)
  });

  it("the AI caster buffs OWN / debuffs ENEMY when the debuff is lethal, and HOLDS when it isn't (never friendly-fire)", () => {
    // lethal: enemy 3/1 → -1/-1 kills it. The AI must cast, buffing mine (ours) and debuffing foe (enemy).
    const chosen = pickAction(board("ai", 1), "ai", legalActionsForPlayer(board("ai", 1), "ai"), {});
    expect((chosen?.targets || []).find((t) => t.role === "fighter")?.id).toBe("mine"); // buff OURS
    expect((chosen?.targets || []).find((t) => t.role === "target")?.id).toBe("foe");   // debuff ENEMY
    // not lethal: enemy 3/4 → the AI holds rather than cast a non-lethal (or ever buff the enemy).
    const held = pickAction(board("ai", 4), "ai", legalActionsForPlayer(board("ai", 4), "ai"), {});
    expect((held?.targets || []).some((t) => t.role)).toBe(false); // no role-tagged pump-pair cast taken
  });
});
