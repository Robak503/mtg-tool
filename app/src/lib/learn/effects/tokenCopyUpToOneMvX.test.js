/**
 * TOKEN-COPY-UPTOONE-MVX — "Here Comes a New Hero!" ({X}{2}{U} Sorcery):
 *   "Target player draws X cards. Create a token that's a copy of up to one target
 *    creature with mana value X or less."
 *
 * Two X-bound clauses in one program:
 *   1. an X-draw to a TARGET PLAYER (already modeled: draw who:"target", amountX),
 *   2. a copy of an UP-TO-ONE target creature whose MV is bounded by the chosen X (new).
 *
 * The new slice: tokenCopy.js emits an `optionalTarget` + `mvCapX` copy atom carrying a
 * `manaValue`/`valueX` restriction; spellEffects.creatureSatisfiesRestrictions resolves the
 * cap from ctx.xValue; legalChoices enumerates the copy target PER-X so a creature whose MV
 * exceeds the chosen X is never offered (CR 202.3b / 601.2c). copySource:"target" reuses the
 * proven resolver, which treats a declined "up to one" as a CR 111.12 clean no-op.
 *
 * CREED: an EXACT anchor — a type/stat "except" rider, "up to two", a FIXED MV cap, a
 * non-creature target, or "or greater" all stay LOW → Arbiter (never a partial copy).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "../gameState.js";
import { legalActionsForPlayer } from "../legalChoices.js";
import { dispatchAction } from "../actionDispatcher.js";
import { resolveTopOfStack } from "../gameEngine.js";
import { parseEffectProgram, parseEffectClause, programConfidence } from "./parser.js";

beforeEach(() => _resetIdsForTests());

const HERO_ORACLE =
  "Target player draws X cards. Create a token that's a copy of up to one target creature with mana value X or less.";
const heroCard = () => ({ id: "hero", name: "Here Comes a New Hero!", type: "Sorcery", mana: "{X}{2}{U}", oracle: HERO_ORACLE });

const island = (id) => ({ id, card: { name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user", tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
const creature = (id, name, cmc, ctrl, pt = { power: "2", toughness: "3" }) => ({ id, card: { name, type: "Creature — Human", oracle: "", cmc, ...pt }, controller: ctrl, tapped: false, summoningSick: false, counters: {}, damageMarked: 0, attachments: [], attachedTo: null });
const forestLib = (who, n) => Array.from({ length: n }, (_, i) => ({ id: `${who}-lib${i}`, name: "Forest", type: "Basic Land — Forest", oracle: "" }));

/** user has `lands` Islands + the given creatures + Hero in hand; both libraries stocked. */
function heroState(lands, creatures = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", stack: [],
    players: {
      ...s.players,
      user: { ...s.players.user, hand: [heroCard()], battlefield: [...Array.from({ length: lands }, (_, i) => island(`i${i}`)), ...creatures], library: forestLib("u", 12) },
      ai: { ...s.players.ai, library: forestLib("a", 12) },
    },
  };
}

describe("Here Comes a New Hero! — parse shape", () => {
  it("flips the WHOLE card to a HIGH X-spell program: [X-draw-to-target, up-to-one MV≤X copy]", () => {
    const p = parseEffectProgram(heroCard());
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toHaveLength(2);
    expect(p.atoms[0]).toMatchObject({ op: "draw", who: "target", targetType: "player", amountX: true });
    expect(p.atoms[1]).toMatchObject({
      op: "create-token-copy", copySource: "target", targetType: "creature",
      optionalTarget: true, mvCapX: true,
      restrictions: [{ kind: "manaValue", op: "<=", valueX: true }],
    });
  });

  it("CREED — a type/stat rider, 'up to two', a FIXED MV, a non-creature target, or 'or greater' all stay LOW", () => {
    const low = (clause) => programConfidence(parseEffectClause(clause, "Sorcery", { hasX: true }));
    expect(low("create a token that's a copy of up to one target creature with mana value x or less, except it's a 4/4 hero")).toBe("low");
    expect(low("create a token that's a copy of up to two target creatures with mana value x or less")).toBe("low");
    expect(low("create a token that's a copy of up to one target creature with mana value 3 or less")).toBe("low");
    expect(low("create a token that's a copy of up to one target artifact with mana value x or less")).toBe("low");
    expect(low("create a token that's a copy of up to one target creature with mana value x or greater")).toBe("low");
  });
});

describe("Here Comes a New Hero! — cast-time MV≤X target legality (per-X enumeration)", () => {
  it("X=2 offers ONLY the MV-2 creature as a copy target; the MV-4 creature is excluded", () => {
    // 6 Islands: {2}{U} + X ≤ 6 → affordable X = 1..3. Two creatures: MV 2 (legal at X≥2) and MV 4 (needs X≥4, unaffordable).
    const state = heroState(6, [creature("c2", "TwoDrop", 2, "user"), creature("c4", "FourDrop", 4, "user")]);
    const casts = legalActionsForPlayer(state, "user").filter((a) => a.kind === "cast-spell");
    expect([...new Set(casts.map((a) => a.xValue))].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    const copyTargetsAtX = (x) => {
      const names = new Set();
      for (const a of casts.filter((c) => c.xValue === x)) for (const t of a.targets) if (t.type === "creature") names.add(t.name);
      return [...names];
    };
    expect(copyTargetsAtX(2)).toEqual(["TwoDrop"]); // MV 2 ≤ X 2 ✓ ; FourDrop (MV 4) excluded
    expect(copyTargetsAtX(1)).toEqual([]);          // MV 2 > X 1 → not a legal copy target
    expect(copyTargetsAtX(3)).toEqual(["TwoDrop"]); // still only the MV-2 creature (no MV-3 on board)
    // The MV-4 creature is NEVER offered at any affordable X.
    expect(casts.some((a) => a.targets.some((t) => t.type === "creature" && t.id === "c4"))).toBe(false);
  });

  it("targets are atom-indexed: the player target → the draw (atom 0), the creature → the copy (atom 1)", () => {
    const state = heroState(6, [creature("c2", "TwoDrop", 2, "user")]);
    const casts = legalActionsForPlayer(state, "user").filter((a) => a.kind === "cast-spell");
    const both = casts.find((a) => a.xValue === 2 && a.targets.some((t) => t.type === "player" && t.id === "ai") && a.targets.some((t) => t.type === "creature" && t.id === "c2"));
    expect(both).toBeTruthy();
    expect(both.targets.find((t) => t.type === "player").atomIndex).toBe(0);
    expect(both.targets.find((t) => t.type === "creature").atomIndex).toBe(1);
  });
});

describe("Here Comes a New Hero! — full cast → pay → resolve", () => {
  it("X=2 at the opponent, copying a MV-2 creature: the opponent draws 2 AND a copy token enters", () => {
    const state = heroState(6, [creature("c2", "TwoDrop", 2, "user", { power: "2", toughness: "3" })]);
    const action = legalActionsForPlayer(state, "user").find(
      (a) => a.kind === "cast-spell" && a.xValue === 2 && a.targets.some((t) => t.type === "player" && t.id === "ai") && a.targets.some((t) => t.type === "creature" && t.id === "c2"),
    );
    expect(action).toBeTruthy();

    const afterCast = dispatchAction(state, action);
    // {2}{U} + X=2 = 5 mana → 5 Islands tap, 1 left.
    expect(afterCast.players.user.battlefield.filter((p) => p.card?.name === "Island" && p.tapped)).toHaveLength(5);
    expect(afterCast.stack).toHaveLength(1);

    const aiHandBefore = afterCast.players.ai.hand.length;
    const resolved = resolveTopOfStack(afterCast);
    expect(resolved.pendingArbiter).toBeUndefined();       // fully native — never routed to the Arbiter
    expect(resolved.players.ai.hand.length).toBe(aiHandBefore + 2); // TARGET player drew exactly X=2
    const tokens = resolved.players.user.battlefield.filter((p) => p.card?.token);
    expect(tokens).toHaveLength(1);
    expect(tokens[0].card).toMatchObject({ name: "TwoDrop", power: "2", toughness: "3", cmc: 2 }); // a faithful CR 707.2 copy
  });

  it("declining the up-to-one copy (choose zero) is a legal cast: the opponent draws X, NO token is made", () => {
    const state = heroState(6, [creature("c2", "TwoDrop", 2, "user")]);
    const casts = legalActionsForPlayer(state, "user").filter((a) => a.kind === "cast-spell");
    // A cast that targets the opponent for the draw but carries NO creature target (declined "up to one").
    const declined = casts.find((a) => a.xValue === 2 && a.targets.some((t) => t.type === "player" && t.id === "ai") && !a.targets.some((t) => t.type === "creature"));
    expect(declined).toBeTruthy();
    const afterCast = dispatchAction(state, declined);
    const aiHandBefore = afterCast.players.ai.hand.length;
    const resolved = resolveTopOfStack(afterCast);
    expect(resolved.pendingArbiter).toBeUndefined();
    expect(resolved.players.ai.hand.length).toBe(aiHandBefore + 2); // still drew X=2
    expect(resolved.players.user.battlefield.filter((p) => p.card?.token)).toHaveLength(0); // CR 111.12 — no copy
  });
});
