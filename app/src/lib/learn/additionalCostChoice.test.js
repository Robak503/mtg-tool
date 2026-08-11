/**
 * additionalCostChoice.test.js — AC-OR (CR 601.2f): "As an additional cost to cast this spell,
 * <costA> OR <costB>." Demand Answers (#413) · Bitter Triumph (#885) · Bone Shards.
 *
 * ⛔⛔ THIS FAMILY'S FAILURE MODE IS A FREE SPELL, and coverage.js says so in its own words: an ADDITIONAL
 * cost makes the card MORE expensive, so skipping it is cheaper-than-printed — the forbidden direction.
 * So the RUNTIME landed before the tier: legalChoices emits one cast per PAYABLE option and stamps the chosen
 * spec on the action, and actionDispatcher charges exactly that spec. The tests below assert the money
 * actually moves, per option, and that a card with NO payable option is not offered at all.
 *
 * ⭐ NO NEW MACHINERY. The cast-offer block already emits one action per way-to-pay within a single cost kind
 * (one per sacrifice victim, one per discardable card). An OR is just MORE ways, so the choice is a loop over
 * the options running the SAME branches — which is more faithful than the deterministic house-pick this slice
 * was originally designed around, because the player really does get the choice.
 *
 * ⛔ AND THE ORDERING INSIDE THE PARSER IS LOAD-BEARING: the split on " or " is tried ONLY after every
 * single-cost extractor has failed on the WHOLE phrase, because **"sacrifice an artifact or creature" is ONE
 * vetted cost that contains " or "**. Splitting first would shred Deadly Dispute into two nonsense halves.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { extractAdditionalCosts } from "./effects/castModifiers.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const BITTER = { name: "Bitter Triumph", type: "Instant", mana: "{1}{B}",
  oracle: "As an additional cost to cast this spell, discard a card or pay 3 life.\nDestroy target creature or planeswalker." };
const DEMAND = { name: "Demand Answers", type: "Instant", mana: "{1}{R}",
  oracle: "As an additional cost to cast this spell, sacrifice an artifact or discard a card.\nDraw two cards." };
const costsOf = (oracle) => extractAdditionalCosts(oracle).costs;

// ⚠️ THE LAND COLOUR IS PART OF THE FIXTURE, NOT DECORATION. Bitter Triumph is {1}{B} and Demand Answers
// is {1}{R}; the first version of this file put both on Swamps and Demand Answers simply read "not offered",
// which looks exactly like a broken feature. Same mistake bit a policy probe one slice earlier. Pick the land
// to match the card, or every zero is your own harness.
function board({ life = 20, handExtra = 1, artifacts = 0 } = {}, card = BITTER) {
  const landName = /\{R\}/.test(card.mana) ? "Mountain" : "Swamp";
  const pip = landName === "Mountain" ? "R" : "B";
  const s0 = createGameState({ userDeck: [], aiDeck: [] });
  const bf = [];
  for (let i = 0; i < 2; i++) bf.push(createPermanent({ id: `S${i}`, card: { id: `cs${i}`, name: landName, type: `Basic Land — ${landName}`, oracle: `{T}: Add {${pip}}.` }, controller: "user" }));
  for (let i = 0; i < artifacts; i++) bf.push(createPermanent({ id: `A${i}`, card: { id: `ca${i}`, name: "Trinket", type: "Artifact", oracle: "" }, controller: "user" }));
  const foe = createPermanent({ id: "foe", card: { id: "cfoe", name: "Foe", type: "Creature — Beast", power: "5", toughness: "5", oracle: "" }, controller: "ai" });
  const hand = [{ id: "spell", ...card }];
  for (let i = 0; i < handExtra; i++) hand.push({ id: `h${i}`, name: `Filler${i}`, type: "Instant", mana_cost: "{1}", cmc: 1, oracle: "Draw a card." });
  return { ...s0, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s0.players, user: { ...s0.players.user, battlefield: bf, hand, life }, ai: { ...s0.players.ai, battlefield: [foe] } } };
}
const castsOf = (s, name) => (legalActionsForPlayer(s, "user") || []).filter((a) => a.kind === "cast-spell" && a.name === name);
const kindsOf = (s, name) => castsOf(s, name).map((a) => a.addCostSpec?.kind).sort();

describe("the parser splits an OR into two vetted options — and never splits a vetted union", () => {
  it("both sides vetted → a choice spec", () => {
    expect(costsOf(BITTER.oracle)).toEqual([{ kind: "choice", options: [{ kind: "discard", count: 1 }, { kind: "payLife", amount: 3 }] }]);
    expect(costsOf(DEMAND.oracle)).toEqual([{ kind: "choice", options: [{ kind: "sacrifice", sacType: "artifact" }, { kind: "discard", count: 1 }] }]);
  });

  it("⛔ 'sacrifice an artifact or creature' is ONE cost and must NOT be split (Deadly Dispute)", () => {
    expect(costsOf("As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw a card."))
      .toEqual([{ kind: "sacrifice", sacType: "artifactOrCreature" }]);
  });

  it("⛔ one unvetted side parks the whole card (the vetted vocabulary stays the source of truth)", () => {
    // ⚠️ THE EXAMPLE CHANGED 2026-08-07 (AC-REVEAL). This row used "reveal a Dinosaur card from your hand",
    // which became a vetted kind — the TF-1 zombie-pin shape: a guard whose example is drawn from the same
    // namespace it guards goes red when the vocabulary grows. "pay half your life" is PROSE, permanently
    // outside the pip-anchored vocabulary, so this negative is stable rather than lucky.
    expect(costsOf("As an additional cost to cast this spell, sacrifice a creature or pay half your life.\nDraw a card.")).toBeNull();
  });

  it("⭐ GRADUATED — reveal-or-pay is a modeled compound now (AC-REVEAL)", () => {
    expect(costsOf("As an additional cost to cast this spell, reveal a Dinosaur card from your hand or pay {1}.\nDraw a card."))
      .toEqual([{ kind: "choice", options: [{ kind: "revealFromHand", subtype: "dinosaur" }, { kind: "payMana", pips: "{1}" }] }]);
  });

  it("a plain single cost is byte-identical", () => {
    expect(costsOf("As an additional cost to cast this spell, sacrifice a creature.\nDraw a card."))
      .toEqual([{ kind: "sacrifice", sacType: "creature" }]);
  });
});

describe("⭐ the cast is OFFERED once per PAYABLE option, and each is gated on its own", () => {
  it("both payable → two casts, one per option", () => {
    expect(kindsOf(board(), "Bitter Triumph")).toEqual(["discard", "payLife"]);
  });

  it("nothing to discard → only the life option (this is why a house-pick of option A was refused)", () => {
    expect(kindsOf(board({ handExtra: 0 }), "Bitter Triumph")).toEqual(["payLife"]);
  });

  it("not enough life → only the discard option", () => {
    expect(kindsOf(board({ life: 2 }), "Bitter Triumph")).toEqual(["discard"]);
  });

  it("⛔⛔ NEITHER payable → the spell is NOT OFFERED AT ALL (the free-spell guard)", () => {
    expect(castsOf(board({ handExtra: 0, life: 2 }), "Bitter Triumph")).toHaveLength(0);
  });

  it("Demand Answers: no artifact → only the discard option", () => {
    expect(kindsOf(board({ artifacts: 0 }, DEMAND), "Demand Answers")).toEqual(["discard"]);
    expect(kindsOf(board({ artifacts: 1 }, DEMAND), "Demand Answers")).toEqual(["discard", "sacrifice"]);
  });
});

describe("⭐⭐ RUNTIME — the chosen option is actually CHARGED, and only that one", () => {
  const cast = (s, name, kind) => {
    const act = castsOf(s, name).find((a) => a.addCostSpec?.kind === kind);
    expect(act, `no cast offering the ${kind} option`).toBeTruthy();
    const out = dispatchAction(s, act);
    return out?.state || out;
  };

  it("discard option: a card leaves hand, life is UNTOUCHED", () => {
    const after = cast(board(), "Bitter Triumph", "discard");
    expect(after.players.user.life).toBe(20);
    expect(after.players.user.hand.some((c) => c.name === "Filler0")).toBe(false);
  });

  it("payLife option: life drops by exactly 3, the hand is UNTOUCHED", () => {
    const after = cast(board(), "Bitter Triumph", "payLife");
    expect(after.players.user.life).toBe(17);
    expect(after.players.user.hand.some((c) => c.name === "Filler0")).toBe(true);
  });

  it("⛔ the two options are not interchangeable — paying one must never also pay the other", () => {
    const d = cast(board(), "Bitter Triumph", "discard");
    const l = cast(board(), "Bitter Triumph", "payLife");
    expect([d.players.user.life, d.players.user.hand.length]).toEqual([20, 0]);
    expect([l.players.user.life, l.players.user.hand.length]).toEqual([17, 1]);
  });

  it("Demand Answers sacrifice option really removes the artifact", () => {
    const after = cast(board({ artifacts: 1 }, DEMAND), "Demand Answers", "sacrifice");
    expect(after.players.user.battlefield.some((p) => p.card?.name === "Trinket")).toBe(false);
  });
});

describe("coverage", () => {
  it("the carriers flip", () => {
    expect(classifyCard(BITTER)).toBe("native-spell");
    expect(classifyCard(DEMAND)).toBe("native-spell");
  });

  it("⛔ Deadly Dispute (the union) is unchanged", () => {
    expect(classifyCard({ name: "Deadly Dispute", type: "Instant", mana: "{1}{B}",
      oracle: "As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw two cards. Create a Treasure token." })).toBe("native-spell");
  });
});
