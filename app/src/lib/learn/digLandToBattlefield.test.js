/**
 * digLandToBattlefield.test.js — DIG-LAND-TO-BATTLEFIELD (Silverback Elder mode 2). "Look at the top N cards
 * of your library. You may put a LAND card from among them onto the battlefield [tapped]. Put the rest on the
 * bottom of your library in a random order." is a DIFFERENT effect from impulse-dig (which keeps a card to
 * HAND): the chosen land ENTERS THE BATTLEFIELD (firing its ETB + landfall), and the REST of the looked-at
 * set (non-chosen lands + every nonland card) go to the BOTTOM of the library in a random order. It collapses
 * to ONE `dig-land-to-battlefield` atom that, at RESOLUTION, peeks the top N, sets a pendingChoice offering the
 * LAND cards, puts the chosen land onto the field, and bottoms the rest. Reuses the tutor/scry/impulse-dig
 * pause→resume seam; the driver surfaces a picker for the human or auto-puts the best land for the AI/Expert.
 *
 * The load-bearing card is SILVERBACK ELDER — a cast-trigger MODAL whose destroy + gain-life modes were
 * already HIGH; this mode was the sole blocker, so the whole card flips native-trigger once it's modeled.
 *
 * CREED pins: the exact-template ALLOWLIST (a MANDATORY put / a TYPED-land put ("a basic land") / a keep-to-
 * HAND variant / a "rest into your graveyard" / an unspelled-N variant all stay low → Arbiter), the
 * resolution-time reveal + put-a-land-onto-the-battlefield, the rest-to-bottom disposal, the no-land inline
 * bottom, the empty-library no-op, the eliminated-controller guard, and the driver/picker paths.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, _resetIdsForTests } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { advanceUntilDecision, applyDigLandChoice } from "./learnSession.js";
import { autoPickDigLandCandidate, resolveDigLandChoice } from "./effects/runProgram.js";
import { parseEffectProgram, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const SORCERY = "Sorcery";
const SILVERBACK_ORACLE =
  "Whenever you cast a creature spell, choose one —\n" +
  "• Destroy target artifact or enchantment.\n" +
  "• Look at the top five cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order.\n" +
  "• You gain 4 life.";
// A standalone spell carrying ONLY the dig-land mode text, so we can cast + resolve it directly (a cast trigger
// needs a creature spell to fire; the effect executor is identical either way — the same atom, same settler).
const DIG_LAND_TAPPED = { id: "dl", name: "DigLand", type: SORCERY, mana: "{G}", oracle: "Look at the top three cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order." };
const DIG_LAND_UNTAPPED = { id: "du", name: "DigLandU", type: SORCERY, mana: "{G}", oracle: "Look at the top three cards of your library. You may put a land card from among them onto the battlefield. Put the rest on the bottom of your library in a random order." };

const land = (id) => ({ id, name: id, type: "Land", cmc: 0 });
const spell = (id, cmc = 3) => ({ id, name: id, type: "Creature — Bear", cmc });

function state({ hand = [], library = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players, user: { ...s.players.user, hand, library, manaPool: { ...s.players.user.manaPool, C: 6, G: 2 } } },
  };
}
// Cast `cardId` and AUTO-put the best land (the AI/Expert path), then drain the stack.
function castAndAutoResolve(s, cardId) {
  const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === cardId);
  expect(cast).toBeTruthy();
  let next = resolveTopOfStack(dispatchAction(s, cast));
  while (next.pendingChoice?.kind === "dig-land-to-battlefield") next = resolveDigLandChoice(next, autoPickDigLandCandidate(next, next.pendingChoice));
  while (next.stack.length) next = resolveTopOfStack(next);
  return next;
}

describe("parser — the dig-land template is HIGH with amount + entersTapped; siblings stay low", () => {
  it("tapped + untapped both parse to one dig-land-to-battlefield atom", () => {
    expect(parseEffectProgram(DIG_LAND_TAPPED).atoms).toEqual([{ op: "dig-land-to-battlefield", amount: 3, entersTapped: true }]);
    expect(parseEffectProgram(DIG_LAND_UNTAPPED).atoms).toEqual([{ op: "dig-land-to-battlefield", amount: 3, entersTapped: false }]);
  });
  it("CREED near-misses — a MANDATORY put / TYPED-land put / keep-to-HAND / graveyard-rest / unspelled-N stay low → Arbiter", () => {
    const low = (oracle) => expect(programConfidence(parseEffectProgram({ type: SORCERY, oracle }))).toBe("low");
    low("Look at the top three cards of your library. Put a land card from among them onto the battlefield. Put the rest on the bottom of your library in a random order."); // MANDATORY (no "you may") — different effect (can't decline), unmodeled
    low("Look at the top three cards of your library. You may put a basic land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order."); // TYPED land ("basic") — unmodeled filter
    low("Look at the top three cards of your library. You may put a Forest card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order."); // TYPED land ("Forest")
    low("Look at the top three cards of your library. You may put a land card from among them into your hand. Put the rest on the bottom of your library in a random order."); // keep-to-HAND — that's a different (unmodeled) shape
    low("Look at the top three cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest into your graveyard."); // rest → GRAVEYARD (not bottom-random)
    low("Look at the top X cards of your library. You may put a land card from among them onto the battlefield tapped. Put the rest on the bottom of your library in a random order."); // variable X count
  });
});

describe("coverage — Silverback Elder (the whole card) flips native-trigger", () => {
  it("Silverback Elder classifies native-trigger (all three modes modeled)", () => {
    expect(classifyCard({ type: "Creature — Ape Shaman", name: "Silverback Elder", oracle: SILVERBACK_ORACLE, mana: "{3}{G}{G}" })).toBe("native-trigger");
  });
  it("a standalone dig-land spell is native-spell; a MANDATORY (non-'you may') variant is arbiter-spell", () => {
    expect(classifyCard(DIG_LAND_TAPPED)).toBe("native-spell");
    expect(classifyCard({ type: SORCERY, name: "MandatoryDig", oracle: "Look at the top three cards of your library. Put a land card from among them onto the battlefield. Put the rest on the bottom of your library in a random order." })).toBe("arbiter-spell");
  });
});

describe("resolution — peek top N, put a land onto the battlefield (tapped), rest → bottom (random)", () => {
  it("the chosen land enters the battlefield TAPPED; the other looked-at cards go to the bottom", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [spell("S1"), land("L1"), spell("S2"), land("L2"), land("L3")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dl");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    expect(paused.pendingChoice).toMatchObject({ kind: "dig-land-to-battlefield", controller: "user", entersTapped: true });
    expect(paused.pendingChoice.candidates.map((c) => c.id)).toEqual(["L1"]); // only the LAND in the top 3 is a candidate (S1, L1, S2)
    const after = castAndAutoResolve(s, "dl");
    // L1 (the only top-3 land) entered the battlefield tapped.
    const perms = after.players.user.battlefield;
    expect(perms.map((p) => p.card.id)).toEqual(["L1"]);
    expect(perms[0].tapped).toBe(true);
    // The rest of the looked-at set (S1, S2) went to the BOTTOM; L2, L3 (below the looked-at 3) surfaced to the top.
    expect(after.players.user.library.map((c) => c.id).slice(0, 2)).toEqual(["L2", "L3"]);
    expect(after.players.user.library.map((c) => c.id).slice(2).sort()).toEqual(["S1", "S2"]);
    expect(after.players.user.library).toHaveLength(4); // 5 started − 1 put onto the battlefield
  });
  it("untapped variant enters the land UNTAPPED", () => {
    const s = state({ hand: [DIG_LAND_UNTAPPED], library: [land("L1"), spell("S1"), spell("S2")] });
    const after = castAndAutoResolve(s, "du");
    expect(after.players.user.battlefield.map((p) => p.card.id)).toEqual(["L1"]);
    expect(after.players.user.battlefield[0].tapped).toBe(false);
  });
  it("auto-put picks the HIGHEST-MV land among the candidates (most impactful)", () => {
    const dual = { id: "D1", name: "D1", type: "Land", cmc: 0 };
    // Two lands in the top 3; the picker's highest-MV tie-break is by name then id (both cmc 0 here → L1 < L2 by name).
    const s = state({ hand: [DIG_LAND_TAPPED], library: [land("L2"), land("L1"), spell("S1"), dual] });
    const paused = resolveTopOfStack(dispatchAction(s, filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dl")));
    expect(paused.pendingChoice.candidates.map((c) => c.id).sort()).toEqual(["L1", "L2"]);
    const after = castAndAutoResolve(s, "dl");
    expect(after.players.user.battlefield.map((p) => p.card.id)).toEqual(["L1"]); // cmc tie → codepoint name L1 < L2
    // L2 (the unchosen land) + S1 bottomed; D1 (below the looked-at 3) surfaced.
    expect(after.players.user.library.map((c) => c.id)[0]).toBe("D1");
    expect(after.players.user.library.map((c) => c.id).slice(1).sort()).toEqual(["L2", "S1"]);
  });
  it("no LAND in the top N → nothing put; the whole looked-at set bottoms (no pause)", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [spell("S1"), spell("S2"), spell("S3"), land("L1")] });
    const after = castAndAutoResolve(s, "dl");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.battlefield).toHaveLength(0);               // nothing entered
    expect(after.players.user.library.map((c) => c.id)[0]).toBe("L1");    // L1 (below the looked-at 3) surfaced to the top
    expect(after.players.user.library.map((c) => c.id).slice(1).sort()).toEqual(["S1", "S2", "S3"]); // the rest bottomed
    expect(after.players.user.library).toHaveLength(4);
  });
  it("fewer cards than N: looks at the whole (small) library, no throw", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [land("L1"), spell("S1")] });
    const after = castAndAutoResolve(s, "dl");
    expect(after.players.user.battlefield.map((p) => p.card.id)).toEqual(["L1"]);
    expect(after.players.user.library.map((c) => c.id)).toEqual(["S1"]); // S1 bottomed (only remaining card)
  });
  it("an empty library is a clean no-op (no pause, the spell still resolves)", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [] });
    const after = castAndAutoResolve(s, "dl");
    expect(after.pendingChoice).toBeUndefined();
    expect(after.players.user.battlefield).toHaveLength(0);
  });
  it("an eliminated controller mid-pause is a clean no-op (no throw, no put)", () => {
    const s = state({ hand: [], library: [land("L1")] });
    const paused = { ...s, pendingChoice: { kind: "dig-land-to-battlefield", controller: "user", candidates: [{ id: "L1", name: "L1" }], restIds: ["L1"], entersTapped: true } };
    const gone = { ...paused, players: Object.fromEntries(Object.entries(paused.players).filter(([id]) => id !== "user")) };
    expect(() => resolveDigLandChoice(gone, "L1")).not.toThrow();
  });
});

describe("driver — the human gets a pick-which-land picker; the AI / Expert auto-put", () => {
  const sess = (st, difficulty = "beginner") => ({ id: "s", status: "active", difficulty, state: st, decisionLog: [] });
  it("a paused user dig-land surfaces a dig-land-to-battlefield decision (beginner)", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [land("L1"), land("L2"), spell("S1")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dl");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const { decision } = advanceUntilDecision(sess(paused));
    expect(decision.kind).toBe("dig-land-to-battlefield");
    expect(decision.candidates.map((c) => c.id).sort()).toEqual(["L1", "L2"]);
    expect(decision.entersTapped).toBe(true);
  });
  it("applyDigLandChoice: a valid pick puts THAT land; an illegal pick re-surfaces the picker", () => {
    const s = state({ hand: [DIG_LAND_TAPPED], library: [land("L1"), land("L2"), spell("S1")] });
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.cardId === "dl");
    const paused = resolveTopOfStack(dispatchAction(s, cast));
    const picked = applyDigLandChoice(sess(paused), { cardId: "L2" }); // human puts L2, not the auto-best L1
    expect(picked.session.state.players.user.battlefield.map((p) => p.card.id)).toEqual(["L2"]);
    const illegal = applyDigLandChoice(sess(paused), { cardId: "not-a-candidate" });
    expect(illegal.decision.kind).toBe("dig-land-to-battlefield"); // re-surfaced, not a crash
  });
});
