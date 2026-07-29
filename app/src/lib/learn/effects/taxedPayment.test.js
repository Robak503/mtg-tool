/**
 * OPPONENT-PAYS-TO-DENY (taxed-payment) — "Whenever an opponent casts a spell, you may draw a card
 * unless that player pays {N}." (Rhystic Study).
 *
 * The FP that no green suite otherwise catches (game-warping in 4-player Commander): the PAYER is the
 * EXACT opponent who cast (ctx.castingPlayerId, threaded by checkCastTriggers), not "an opponent"
 * generically, not the beneficiary. The pay-decision belongs to that payer (pc.controller = payer, so
 * the driver routes the choice to their seat). On pay+afford the payer is charged and the beneficiary
 * draws NOTHING; on decline / can't-afford the beneficiary draws one card. These tests pin the payer
 * identity in a THREE-opponent state and the pay/decline/unaffordable branches.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { _resetIdsForTests } from "../gameState.js";
import { resolveAtom } from "./effectAtoms.js";
import { autoPickTaxedPayment, resolveTaxedPaymentChoice } from "./runProgram.js";

beforeEach(() => _resetIdsForTests());

const mana = (over = {}) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...over });
const player = (over = {}) => ({ life: 40, hand: [], library: [], graveyard: [], battlefield: [], manaPool: mana(), ...over });
// A 4-player Commander-shaped state: the user (beneficiary) + three AI opponents.
const fourPlayer = (players = {}) => ({
  players: {
    user: player(players.user),
    ai1: player(players.ai1),
    ai2: player(players.ai2),
    ai3: player(players.ai3),
  },
  log: [],
});
const COST1 = { kind: "mana", mana: mana({ generic: 1 }) };
const taxAtom = { op: "taxed-draw", cost: COST1, targetType: null };
// The trigger fires during the beneficiary's (user's) Rhystic Study resolution; ctx.castingPlayerId = the caster.
const fire = (state, castingPlayerId) => resolveAtom(state, taxAtom, { controller: "user", castingPlayerId, cardName: "Rhystic Study", targets: [] });

describe("taxed-payment — payer identity (the game-warping FP guard)", () => {
  it("binds pc.payer to the EXACT caster (ai2), never a different opponent or the beneficiary", () => {
    const s = fourPlayer({ ai2: { manaPool: mana({ U: 1 }) } });
    const paused = fire(s, "ai2");
    expect(paused.pendingChoice?.kind).toBe("taxed-payment");
    expect(paused.pendingChoice.payer).toBe("ai2");        // the exact caster
    expect(paused.pendingChoice.controller).toBe("ai2");   // seat = payer → driver routes to ai2
    expect(paused.pendingChoice.beneficiary).toBe("user");
  });

  it("a DIFFERENT opponent (ai1) casting binds the payer to ai1, not ai2", () => {
    const paused = fire(fourPlayer({ ai1: { manaPool: mana({ U: 1 }) } }), "ai1");
    expect(paused.pendingChoice.payer).toBe("ai1");
  });

  it("does NOT fire when the caster IS the beneficiary (you don't tax your own cast) or when unthreaded", () => {
    expect(fire(fourPlayer(), "user").pendingChoice).toBeFalsy(); // payer === beneficiary → skip
    expect(fire(fourPlayer(), undefined).pendingChoice).toBeFalsy(); // no castingPlayerId (non-cast context) → no-op
  });
});

describe("taxed-payment — settle branches", () => {
  it("PAY + afford: the payer (ai2) is charged and the beneficiary draws NOTHING", () => {
    const s = fourPlayer({
      ai2: { manaPool: mana({ U: 1 }) },
      user: { library: [{ id: "d1", name: "Card", type: "Instant" }] },
    });
    const paused = fire(s, "ai2");
    const done = resolveTaxedPaymentChoice(paused, true);
    expect(done.pendingChoice).toBeFalsy();
    expect(done.players.user.hand).toHaveLength(0);            // no draw — the tax was paid
    expect(done.players.user.library).toHaveLength(1);
    expect(done.players.ai2.manaPool.U).toBe(0);              // ai2's {1} spent
  });

  it("DECLINE: the beneficiary (user) draws one card; the payer keeps their mana", () => {
    const s = fourPlayer({
      ai2: { manaPool: mana({ U: 1 }) },
      user: { library: [{ id: "d1", name: "Card", type: "Instant" }] },
    });
    const declined = resolveTaxedPaymentChoice(fire(s, "ai2"), false);
    expect(declined.players.user.hand.map((c) => c.id)).toEqual(["d1"]); // drew
    expect(declined.players.ai2.manaPool.U).toBe(1);                     // no mana spent
  });

  it("CAN'T afford + forced 'pay': payManaCost fabricates nothing → the beneficiary still draws", () => {
    const s = fourPlayer({ user: { library: [{ id: "d1", name: "Card", type: "Instant" }] } }); // ai2 broke (empty pool)
    const out = resolveTaxedPaymentChoice(fire(s, "ai2"), true);
    expect(out.players.user.hand.map((c) => c.id)).toEqual(["d1"]); // unaffordable → drew anyway
  });

  it("a THIRD broke opponent doesn't matter — the outcome tracks the bound payer (ai2), not ai3", () => {
    const s = fourPlayer({
      ai2: { manaPool: mana({ U: 1 }) }, // the caster CAN pay
      ai3: { manaPool: mana() },          // a different opponent is broke — irrelevant
      user: { library: [{ id: "d1", name: "Card", type: "Instant" }] },
    });
    const done = resolveTaxedPaymentChoice(fire(s, "ai2"), true); // ai2 pays
    expect(done.players.user.hand).toHaveLength(0); // no draw — because the BOUND payer (ai2) paid, ai3 is not consulted
  });
});

describe("taxed-payment — autoPick (the payer's self-interested default)", () => {
  it("pays iff the payer can afford it; false when broke or gone", () => {
    const s = fourPlayer({ ai2: { manaPool: mana({ U: 1 }) } });
    expect(autoPickTaxedPayment(s, { payer: "ai2", cost: COST1 })).toBe(true);   // can pay → deny the draw
    expect(autoPickTaxedPayment(s, { payer: "ai1", cost: COST1 })).toBe(false);  // broke → let them draw
    expect(autoPickTaxedPayment(s, { payer: "ghost", cost: COST1 })).toBe(false); // gone
  });
});

// ── DYNAMIC TAX AMOUNT (Esper Sentinel, rank 76) ────────────────────────────────────────────────────────
// "draw a card unless that player pays {X}, where X is this creature's power." matchTaxedDraw parsed FIXED
// pips only and named this card as its deliberate safe-FN. A snapshot taken at parse time would be wrong the
// moment the creature grows, which is the card's entire plan — so the amount rides as a `genericSpec` that
// applyTaxedDraw evaluates at resolution (CR 608.2) through the SAME countForSpec `selfPower` metric the
// mana model reads. The tax and a power-scaled dork's mana can therefore never disagree about what "this
// creature's power" means.
describe("⭐ DYNAMIC TAX — {X} = this creature's power, resolved live", () => {
  const DYN = { op: "taxed-draw", cost: { kind: "mana", genericSpec: { kind: "selfPower" } }, targetType: null };
  // The Sentinel sits on the beneficiary's battlefield; ctx.sourceId points at it, as the trigger path threads it.
  const withSentinel = (power, counters = 0) => {
    const perm = {
      id: "es", controller: "user", tapped: false, summoningSick: false,
      counters: counters ? { "+1/+1": counters } : {},
      card: { id: "es", name: "Esper Sentinel", type: "Artifact Creature — Human Soldier", power: String(power), toughness: "1", oracle: "" },
    };
    return fourPlayer({ user: { battlefield: [perm] } });
  };
  const taxOf = (state) => resolveAtom(state, DYN, { controller: "user", castingPlayerId: "ai1", cardName: "Esper Sentinel", sourceId: "es", targets: [] })
    .pendingChoice?.cost?.mana?.generic;

  it("⭐ a printed 1/1 Sentinel taxes {1}", () => {
    expect(taxOf(withSentinel(1))).toBe(1);
  });

  it("⭐ LAYER-AWARE — two +1/+1 counters make the tax {3}, not {1}", () => {
    // The whole reason a parse-time snapshot is wrong. A fixed cost would still read 1 here.
    expect(taxOf(withSentinel(1, 2))).toBe(3);
  });

  it("⛔ the source having LEFT the battlefield taxes 0 — never a fabricated number", () => {
    expect(taxOf(fourPlayer())).toBe(0);
  });

  it("CONTROL — a FIXED cost is untouched by the dynamic branch", () => {
    // Without this, a branch that always recomputed would silently override Rhystic Study's printed {1}.
    expect(fire(fourPlayer({ ai1: { manaPool: mana({ U: 1 }) } }), "ai1").pendingChoice.cost).toEqual(COST1);
  });

  it("CONTROL — the payer binding is unchanged by the dynamic amount", () => {
    const paused = resolveAtom(withSentinel(2), DYN, { controller: "user", castingPlayerId: "ai3", cardName: "Esper Sentinel", sourceId: "es", targets: [] });
    expect(paused.pendingChoice.payer).toBe("ai3");
    expect(paused.pendingChoice.beneficiary).toBe("user");
  });
});
