/**
 * OPPONENT-PAYS-TO-DENY (taxed-treasure) — "Whenever an opponent draws a card, that player may pay {2}. If the
 * player doesn't, you create a Treasure token." (Smothering Tithe).
 *
 * The sibling of taxed-draw (Rhystic Study), but the trigger is an OPPONENT-DRAW (not a cast) and the
 * decline-payoff is a functional Treasure token (not a card draw). The PAYER is the EXACT opponent who drew
 * (ctx.drawingPlayerId, threaded by checkCardDrawnTriggers's opponents-of-drawer scan); the BENEFICIARY (the
 * Tithe's controller) mints one Treasure on decline / can't-afford. These tests pin (1) the whole-card native
 * flip, (2) the trigger detection + effect parse, (3) the opponents-of-drawer chokepoint scan, (4) the pay /
 * decline / unaffordable settle branches (the minted Treasure taps for mana), and (5) the CREED near-misses
 * ({X} cost / scaled payoff / a different token — all stay off the native path).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { _resetIdsForTests } from "../gameState.js";
import { resolveAtom } from "./effectAtoms.js";
import { resolveTaxedPaymentChoice, autoPickTaxedPayment } from "./runProgram.js";
import { detectTriggers, checkCardDrawnTriggers } from "../triggers.js";
import { parseEffectClause } from "./parser.js";
import { classifyCard } from "../coverage.js";
import { triggerRoutesNatively } from "../triggerRouting.js";
import { manaSources } from "../manaModel.js";

beforeEach(() => _resetIdsForTests());

const mana = (over = {}) => ({ generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0, hybrid: [], ...over });
const player = (over = {}) => ({ life: 40, hand: [], library: [], graveyard: [], battlefield: [], manaPool: mana(), ...over });
const TITHE_ORACLE =
  "Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Treasure token. " +
  "(It's an artifact with \"{T}, Sacrifice this token: Add one mana of any color.\")";
const titheCard = { name: "Smothering Tithe", type: "Enchantment", oracle: TITHE_ORACLE };
const atom = { op: "taxed-treasure", cost: { kind: "mana", mana: mana({ generic: 2 }) }, targetType: null };
// Fire the atom as if the opponent-draw trigger resolved: controller = the Tithe's controller (user), drawer = ai1.
const fire = (state, drawingPlayerId = "ai1") =>
  resolveAtom(state, atom, { controller: "user", drawingPlayerId, cardName: "Smothering Tithe", targets: [] });

describe("taxed-treasure — the whole-card native flip", () => {
  it("Smothering Tithe classifies as a native tier (not body-only)", () => {
    expect(classifyCard(titheCard)).toBe("native-trigger");
  });

  it("detects the opponent-draw trigger and parses its effect HIGH to a taxed-treasure atom", () => {
    const dets = detectTriggers(titheCard);
    expect(dets).toHaveLength(1);
    expect(dets[0].event).toBe("cardDrawn");
    expect(dets[0].scope).toBe("opponentDraw");
    expect(dets[0].whose).toBe("opponent");
    expect(triggerRoutesNatively(dets[0])).toBe(true);
    const prog = parseEffectClause(dets[0].effectClause, "Instant", {});
    expect(prog.confidence).toBe("high");
    expect(prog.atoms).toHaveLength(1);
    expect(prog.atoms[0].op).toBe("taxed-treasure");
    expect(prog.atoms[0].cost.mana.generic).toBe(2);
  });
});

describe("taxed-treasure — the chokepoint fires on an OPPONENT's draw only", () => {
  // A permanent object standing in for Smothering Tithe on the battlefield.
  const tithePerm = () => ({ id: "tithe1", controller: "user", card: titheCard });

  it("an OPPONENT (ai1) drawing enqueues the opponent-draw trigger from the user's Tithe", () => {
    const state = {
      players: {
        user: { ...player(), battlefield: [tithePerm()] },
        ai1: { ...player(), cardsDrawnThisTurn: 1 },
      },
      log: [],
    };
    const next = checkCardDrawnTriggers(state, "ai1", 1);
    const pend = (next.pendingTriggers || []).filter((t) => t.event === "cardDrawn");
    expect(pend).toHaveLength(1);
    expect(pend[0].source.name).toBe("Smothering Tithe");
    expect(pend[0].context.drawingPlayerId).toBe("ai1"); // the PAYER binding for the atom
  });

  it("the CONTROLLER (user) drawing does NOT fire their own Tithe (it's an OPPONENT-draw trigger)", () => {
    const state = {
      players: {
        user: { ...player(), battlefield: [tithePerm()], cardsDrawnThisTurn: 1 },
        ai1: { ...player() },
      },
      log: [],
    };
    const next = checkCardDrawnTriggers(state, "user", 1);
    const pend = (next.pendingTriggers || []).filter((t) => t.event === "cardDrawn");
    expect(pend).toHaveLength(0); // no self-fire — the drawer isn't an opponent of the Tithe's controller
  });

  it("fires once PER card drawn (each draw is a separate CR 121.2 event)", () => {
    const state = {
      players: {
        user: { ...player(), battlefield: [tithePerm()] },
        ai1: { ...player(), cardsDrawnThisTurn: 3 },
      },
      log: [],
    };
    const next = checkCardDrawnTriggers(state, "ai1", 3);
    expect((next.pendingTriggers || []).filter((t) => t.event === "cardDrawn")).toHaveLength(3);
  });
});

describe("taxed-treasure — payer identity + settle branches", () => {
  it("binds the payer to the EXACT drawing opponent (ai1), never the beneficiary", () => {
    const paused = fire({ players: { user: player(), ai1: player(), ai2: player() }, log: [] }, "ai1");
    expect(paused.pendingChoice?.kind).toBe("taxed-payment");
    expect(paused.pendingChoice.payer).toBe("ai1");
    expect(paused.pendingChoice.controller).toBe("ai1"); // seat = payer → driver routes to ai1
    expect(paused.pendingChoice.beneficiary).toBe("user");
    expect(paused.pendingChoice.declinePayoff).toBe("treasure");
  });

  it("does NOT fire when the drawer IS the beneficiary, or when drawingPlayerId is unthreaded", () => {
    expect(fire({ players: { user: player() }, log: [] }, "user").pendingChoice).toBeFalsy(); // payer === beneficiary → skip
    // No drawingPlayerId in ctx (reached outside an opponent-draw trigger) → no-op, never a fabricated Treasure.
    const unthreaded = resolveAtom({ players: { user: player(), ai1: player() }, log: [] }, atom, { controller: "user", cardName: "Smothering Tithe", targets: [] });
    expect(unthreaded.pendingChoice).toBeFalsy();
  });

  it("PAY + afford: the drawer (ai1) is charged and the beneficiary creates NO Treasure", () => {
    const s = { players: { user: player(), ai1: player({ manaPool: mana({ W: 2 }) }) }, log: [] };
    const done = resolveTaxedPaymentChoice(fire(s, "ai1"), true);
    expect(done.pendingChoice).toBeFalsy();
    expect(done.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.type || ""))).toHaveLength(0);
    expect(done.players.ai1.manaPool.W).toBe(0); // ai1's {2} spent
  });

  it("DECLINE: the beneficiary (user) creates one FUNCTIONAL Treasure; the payer keeps their mana", () => {
    const s = { players: { user: player(), ai1: player({ manaPool: mana({ W: 2 }) }) }, log: [] };
    const declined = resolveTaxedPaymentChoice(fire(s, "ai1"), false);
    const treasures = declined.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.type || ""));
    expect(treasures).toHaveLength(1);
    expect(treasures[0].card.oracle).toMatch(/Add one mana of any color/i);
    expect(declined.players.ai1.manaPool.W).toBe(2); // no mana spent

    // The minted Treasure is a REAL mana source (taps for any color, sacrifices on use) — the CREED "actually plays it" bar.
    const src = manaSources(declined, "user");
    expect(src).toHaveLength(1);
    expect(src[0].sacrifices).toBe(true);
    expect(src[0].colors).toEqual(expect.arrayContaining(["W", "U", "B", "R", "G"]));
  });

  it("CAN'T afford + forced 'pay': payManaCost fabricates nothing → the beneficiary still gets a Treasure", () => {
    const s = { players: { user: player(), ai1: player({ manaPool: mana() }) }, log: [] }; // ai1 broke
    const out = resolveTaxedPaymentChoice(fire(s, "ai1"), true);
    expect(out.players.user.battlefield.filter((p) => /Treasure/.test(p.card?.type || ""))).toHaveLength(1);
  });

  it("autoPick: the drawer pays iff they can afford the tax (the self-interested default)", () => {
    const s = { players: { user: player(), ai1: player({ manaPool: mana({ W: 2 }) }), ai2: player() }, log: [] };
    const paused = fire(s, "ai1");
    expect(autoPickTaxedPayment(paused, paused.pendingChoice)).toBe(true); // ai1 can pay → deny the Treasure
    const paused2 = fire({ players: { user: player(), ai1: player({ manaPool: mana({ W: 1 }) }) }, log: [] }, "ai1");
    expect(autoPickTaxedPayment(paused2, paused2.pendingChoice)).toBe(false); // only WW-1 → can't pay {2} → let the Treasure be made
  });
});

describe("taxed-treasure — CREED near-misses (must stay OFF the native path)", () => {
  const nearMiss = (oracle) => {
    const card = { name: "NearMiss", type: "Enchantment", oracle };
    const dets = detectTriggers(card);
    const conf = dets[0]?.effectClause ? parseEffectClause(dets[0].effectClause, "Instant", {}).confidence : null;
    return { card, dets, conf };
  };

  it("an {X} tax (parseFixedManaPips null) does NOT model — effect parses LOW → Arbiter", () => {
    const { card, conf } = nearMiss("Whenever an opponent draws a card, that player may pay {X}. If the player doesn't, you create a Treasure token.");
    expect(conf).toBe("low");
    expect(classifyCard(card)).not.toBe("native-trigger");
  });

  it("a SCALED payoff (two Treasure tokens) does NOT model — residue → LOW → Arbiter", () => {
    const { card, conf } = nearMiss("Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create two Treasure tokens.");
    expect(conf).toBe("low");
    expect(classifyCard(card)).not.toBe("native-trigger");
  });

  it("a DIFFERENT token payoff (Clue) does NOT match taxed-treasure — LOW → Arbiter", () => {
    const { card, conf } = nearMiss("Whenever an opponent draws a card, that player may pay {2}. If the player doesn't, you create a Clue token.");
    expect(conf).toBe("low");
    expect(classifyCard(card)).not.toBe("native-trigger");
  });
});
