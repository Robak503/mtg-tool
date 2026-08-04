/**
 * landAuraEtbRider.test.js — BLITZ LA-1: the mana-grant aura WITH a modeled aura-own ETB rider
 * (Gift of Paradise / Abundant Growth / Urban Utopia frame). An Aura enters through the SAME
 * enterPermanent chokepoint every permanent uses (checkEnterTriggers is the single ETB-fire site),
 * so "When this Aura enters, <native effect>" is modeled end-to-end — the metric admits the line as
 * non-residue when its SINGLE descriptor is event=etb, scope=self, and routes natively.
 * CREED FP guarded: an aura-own trigger that does NOT route stays residue (body-only).
 * Real oracle fixtures (bundled Scryfall, verified 2026-07-16).
 */

import { beforeEach, describe, expect, it } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { enterPermanent } from "./resolvers.js";
import { classifyCard } from "./coverage.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const GIFT_OF_PARADISE = { id: "gop", name: "Gift of Paradise", type: "Enchantment — Aura", mana: "{2}{G}",
  oracle: "Enchant land\nWhen this Aura enters, you gain 3 life.\nEnchanted land has \"{T}: Add two mana of any one color.\"" };
const ABUNDANT_GROWTH = { id: "abg", name: "Abundant Growth", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant land\nWhen this Aura enters, draw a card.\nEnchanted land has \"{T}: Add one mana of any color.\"" };
const UNROUTABLE = { id: "unr", name: "Probe Growth", type: "Enchantment — Aura", mana: "{G}",
  oracle: "Enchant land\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nEnchanted land has \"{T}: Add one mana of any color.\"" };

describe("classify", () => {
  it("the ramp staples flip native-mana-aura", () => {
    expect(classifyCard(GIFT_OF_PARADISE)).toBe("native-mana-aura");
    expect(classifyCard(ABUNDANT_GROWTH)).toBe("native-mana-aura");
  });
  it("CREED — an aura-own ETB that does NOT route natively stays residue (body-only)", () => {
    expect(classifyCard(UNROUTABLE)).toBe("body-only");
  });
});

describe("runtime — the aura's own ETB fires through the shared enter chokepoint", () => {
  it("entering (attached to a land) enqueues the gain-life ETB trigger", () => {
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    const forest = createPermanent({ id: "f1", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [forest] } } };
    const after = enterPermanent(s, GIFT_OF_PARADISE, "user", { attachTo: "f1" });
    const etb = (after.pendingTriggers || []).filter((t) => t.descriptor?.event === "etb");
    expect(etb.length).toBe(1);
    expect(etb[0].descriptor.effectClause).toMatch(/gain 3 life/i);
  });
});

// ── LA-2 (2026-08-03): the same modeled-ETB admission for the tapped-for-mana BOOST lane ──────────
// (Verdant Haven — the Fertile Ground boost + a "you gain 2 life" ETB rider; the census's two-flip
// list carried it as sibling asymmetry against Fertile Ground). manaAuraResidueClauses now skips a
// validator-approved aura-own ETB exactly like the mana-GRANT frame above; the boost read site
// (manaModel.landAuraManaBonus) and the ETB chokepoint are entirely independent runtime paths.
// Law-6 battery below: the flip makes the CAST LANE offer the card (legalChoices/actionDispatcher/
// resolvers all read isNativeManaAura), so the proof drives cast → attach → ETB → tap, not the parse.
// Mutation-checked (2026-08-03): LA-2 skip line removed from manaAuraResidueClauses → 4 red (the
// classify pin here, both inverted pins in auraLandMana.test.js, and the cast-offer runtime below).
const VERDANT_HAVEN = { id: "c-vh", name: "Verdant Haven", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant land\nWhen this Aura enters, you gain 2 life.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };
const UNROUTABLE_BOOST = { id: "c-ub", name: "Probe Haven", type: "Enchantment — Aura", mana: "{1}{G}",
  oracle: "Enchant land\nWhen this Aura enters, untap all Islands you control and shuffle your hand into your library.\nWhenever enchanted land is tapped for mana, its controller adds an additional one mana of any color." };

describe("LA-2 — the boost lane admits a modeled aura-own ETB rider (Verdant Haven)", () => {
  it("Verdant Haven flips native-mana-aura; an unroutable ETB rider on the same frame stays body-only", () => {
    expect(classifyCard(VERDANT_HAVEN)).toBe("native-mana-aura");
    expect(classifyCard(UNROUTABLE_BOOST)).toBe("body-only");
  });

  it("law 6: cast targets an own land, resolve attaches + fires the ETB (life +2), tap yields land + any-color bonus", () => {
    const forest = createPermanent({ id: "forest", card: { name: "Forest", type: "Basic Land — Forest", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    let s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
    s = { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
      players: { ...s.players, user: { ...s.players.user, battlefield: [forest], hand: [VERDANT_HAVEN],
        manaPool: { W: 0, U: 0, B: 0, R: 0, G: 2, C: 0 } } } };
    const life0 = s.players.user.life;
    const cast = filterActions(legalActionsForPlayer(s, "user"), "cast-spell").find((a) => a.isAuraSpell);
    expect(cast).toMatchObject({ cardId: "c-vh", targets: [{ id: "forest" }] });
    s = resolveTopOfStack(dispatchAction(s, cast));
    const aura = s.players.user.battlefield.find((p) => p.card?.name === "Verdant Haven");
    expect(aura.attachedTo).toBe("forest");
    // the aura-own ETB fired through the shared chokepoint and was FLUSHED ONTO THE STACK by the
    // resolve (the wrong-assertion-layer trap: pendingTriggers is already drained here — assert the
    // layer the engine actually uses, then resolve it → life +2).
    const etbObjs = (s.stack || []).filter((o) => o.kind === "triggered-ability");
    expect(etbObjs).toHaveLength(1);
    s = resolveTopOfStack(s);
    expect(s.players.user.life).toBe(life0 + 2);
    // the boost rides the LAND's tap (any-color, amount 1) — the mana half is live too
    const tap = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").find((a) => a.permanentId === "forest");
    expect(tap).toBeTruthy();
    expect(tap.bonus).toHaveLength(1);
    expect(tap.bonus[0].amount).toBe(1);
    s = dispatchAction(s, tap);
    const pool = s.players.user.manaPool;
    expect(Object.values(pool).reduce((a, b) => a + b, 0)).toBe(2);   // 1 land G + 1 any-color bonus (cast drained the pool)
    expect(pool.G).toBeGreaterThanOrEqual(1);                          // the land's own G is always present
    expect(findPermanent(s, "forest").permanent.tapped).toBe(true);    // the LAND taps; the aura is untouched
    expect(aura.attachedTo).toBe("forest");
  });
});
