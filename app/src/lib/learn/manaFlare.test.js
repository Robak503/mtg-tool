/**
 * manaFlare.test.js — BLITZ MF-1: the ALL-PLAYERS, LANDS-ONLY, SAME-TYPE tap augment (Mana Flare).
 *
 * "Whenever a player taps a land for mana, that player adds one mana of any type that land produced."
 * (Mana Flare / Heartbeat of Spring / Zhur-Taa Ancient / Dictate of Karametra — the exact template, a
 * triggered mana ability per CR 605.1b, resolved inline off the mana-production path.) Two properties
 * distinguish it from the existing controller-scoped fixed-pip augment (Groundchuck):
 *   • allPlayers — the TAPPING player benefits regardless of who controls the carrier ("a player … that
 *     player"), so globalTapManaAugment scans EVERY battlefield and gates only the controller-scoped forms;
 *   • sameAsProduced — the extra pip's TYPE (CR 106.1b) is the type this tap produced: planPayment binds
 *     the bonus to the PRIMARY chosen color and actionsTapForMana stamps it per-action, so one dual-land
 *     tap under Mana Flare makes WW or UU, NEVER W+U (the off-type FP, CREED).
 *
 * Anchored whole-clause: Overabundance's damage rider ("…, and this enchantment deals 1 damage to the
 * player.") and Barbflare Gremlin's "if this creature is tapped" condition + land-ping rider leave residue
 * → parse null → body-only (safe FNs). Mirari's Wake's YOU-scoped doubler stays null too (pinned in
 * globalTapManaAugment.test.js). Real oracle fixtures (bundled Scryfall, 2026-07-16).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createGameState, createPermanent, _resetIdsForTests, findPermanent } from "./gameState.js";
import { legalActionsForPlayer, filterActions } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { parseGlobalTapManaAugment, stripGlobalTapManaAugment } from "./staticAbilityParser.js";
import { manaSources, planPayment, globalTapManaAugment } from "./manaModel.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (bundled Scryfall) ──────────────────────────
const FLARE_LINE = "Whenever a player taps a land for mana, that player adds one mana of any type that land produced.";
const MANA_FLARE = { id: "c-mf", name: "Mana Flare", type: "Enchantment", mana: "{2}{R}", oracle: FLARE_LINE };
const HEARTBEAT = { id: "c-hb", name: "Heartbeat of Spring", type: "Enchantment", mana: "{2}{G}", oracle: FLARE_LINE };
const ZHUR_TAA = { id: "c-zt", name: "Zhur-Taa Ancient", type: "Creature — Beast", mana: "{3}{R}{G}", power: 7, toughness: 5, oracle: FLARE_LINE };
const DICTATE = { id: "c-dk", name: "Dictate of Karametra", type: "Enchantment", mana: "{3}{G}{G}", oracle: `Flash\n${FLARE_LINE}` };
const OVERABUNDANCE = { id: "c-oa", name: "Overabundance", type: "Enchantment", mana: "{1}{R}{G}",
  oracle: "Whenever a player taps a land for mana, that player adds one mana of any type that land produced, and this enchantment deals 1 damage to the player." };
const BARBFLARE = { id: "c-bg", name: "Barbflare Gremlin", type: "Creature — Gremlin", mana: "{3}{R}", power: 3, toughness: 3,
  oracle: "First strike, haste\nWhenever a player taps a land for mana, if this creature is tapped, that player adds one mana of any type that land produced. Then that land deals 1 damage to that player." };

const MOUNTAIN = { name: "Mountain", type: "Basic Land — Mountain", oracle: "" };
// A synthetic clean dual (Adarkar Wastes minus its self-ping — the ping is a separate unmodeled ability).
const DUAL_WU = { id: "c-wu", name: "Test Dual", type: "Land", oracle: "{T}: Add {W} or {U}." };
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function board({ userBf = [], aiBf = [] } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0,
    players: { ...s.players,
      user: { ...s.players.user, battlefield: userBf, manaPool: { ...EMPTY_POOL } },
      ai: { ...s.players.ai, battlefield: aiBf, manaPool: { ...EMPTY_POOL } } } };
}
const land = (id, card, controller) => createPermanent({ id, card, controller, summoningSick: false });

describe("MF-1 parser — the exact all-players same-type template; riders/conditions reject", () => {
  it("parses to { subject:'land', allPlayers:true, sameAsProduced:true, amount:1 }", () => {
    for (const c of [MANA_FLARE, HEARTBEAT, ZHUR_TAA, DICTATE]) {
      expect(parseGlobalTapManaAugment(c)).toEqual({ subject: "land", allPlayers: true, sameAsProduced: true, amount: 1 });
    }
  });
  it("ANTI-FP: Overabundance's damage rider and Barbflare's condition+ping stay null", () => {
    expect(parseGlobalTapManaAugment(OVERABUNDANCE)).toBeNull();
    expect(parseGlobalTapManaAugment(BARBFLARE)).toBeNull();
  });
  it("stripGlobalTapManaAugment removes only the exact rider-free line (Overabundance's line survives)", () => {
    expect(stripGlobalTapManaAugment(MANA_FLARE).trim()).toBe("");
    expect(stripGlobalTapManaAugment(DICTATE).trim()).toBe("Flash");
    expect(stripGlobalTapManaAugment(OVERABUNDANCE)).toContain("deals 1 damage");
  });
});

describe("MF-1 coverage — the four carriers flip native; the rider forms stay parked", () => {
  it("Mana Flare / Heartbeat of Spring / Zhur-Taa Ancient / Dictate of Karametra are native-trigger", () => {
    for (const c of [MANA_FLARE, HEARTBEAT, ZHUR_TAA, DICTATE]) expect(classifyCard(c)).toBe("native-trigger");
  });
  it("Overabundance / Barbflare Gremlin stay body-only (safe FNs)", () => {
    expect(classifyCard(OVERABUNDANCE)).toBe("body-only");
    expect(classifyCard(BARBFLARE)).toBe("body-only");
  });
});

describe("MF-1 runtime — SYMMETRIC: the TAPPING player benefits, whoever controls the carrier", () => {
  it("the user's tap under their own Mana Flare carries the bonus", () => {
    const s = board({ userBf: [land("mtn", MOUNTAIN, "user"), createPermanent({ id: "mf", card: MANA_FLARE, controller: "user" })] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "mtn").permanent)).toEqual([{ sameAsProduced: true, amount: 1 }]);
  });
  it("the OPPONENT's tap under the USER's Mana Flare carries the bonus too (allPlayers)", () => {
    const s = board({ userBf: [createPermanent({ id: "mf", card: MANA_FLARE, controller: "user" })], aiBf: [land("amtn", MOUNTAIN, "ai")] });
    expect(globalTapManaAugment(s, "ai", findPermanent(s, "amtn").permanent)).toEqual([{ sameAsProduced: true, amount: 1 }]);
    // and the opponent's payment planner sees a 2-R Mountain
    const srcs = manaSources(s, "ai");
    expect(srcs).toHaveLength(1);
    expect(srcs[0]).toMatchObject({ permanentId: "amtn", colors: ["R"], bonus: [{ sameAsProduced: true, colors: ["R"], amount: 1 }] });
    expect(planPayment(EMPTY_POOL, srcs, { R: 2 })).not.toBeNull();          // one Mountain pays {R}{R}
  });
  it("a CREATURE tap never rides the lands-only augment", () => {
    const dork = createPermanent({ id: "dork", card: { id: "c-dk2", name: "Mana Dork", type: "Creature — Elf Druid", mana: "{G}", oracle: "{T}: Add {G}." }, controller: "user", summoningSick: false });
    const s = board({ userBf: [dork, createPermanent({ id: "mf", card: MANA_FLARE, controller: "user" })] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "dork").permanent)).toEqual([]);
  });
});

describe("MF-1 runtime — SAME-TYPE binding: one dual tap makes WW or UU, never W+U (CR 106.1b)", () => {
  const dualBoard = () => board({ userBf: [land("dual", DUAL_WU, "user"), createPermanent({ id: "mf", card: MANA_FLARE, controller: "user" })] });
  it("planPayment pays {W}{W} or {U}{U} from ONE dual tap", () => {
    for (const cost of [{ W: 2 }, { U: 2 }]) {
      const plan = planPayment(EMPTY_POOL, manaSources(dualBoard(), "user"), cost);
      expect(plan).not.toBeNull();
      expect(plan.taps).toHaveLength(1);
      const color = Object.keys(cost)[0];
      expect(plan.taps[0]).toMatchObject({ permanentId: "dual", color, bonus: [{ color, amount: 1 }] }); // bonus = the primary's color
    }
  });
  it("planPayment can NOT pay {W}{U} from one dual tap (the bonus never picks an off-type pip)", () => {
    const plan = planPayment(EMPTY_POOL, manaSources(dualBoard(), "user"), { W: 1, U: 1 });
    expect(plan).toBeNull();
  });
  it("the explicit tap-for-mana actions carry a per-action same-color bonus (W action → +W, U action → +U)", () => {
    const s = dualBoard();
    const taps = filterActions(legalActionsForPlayer(s, "user"), "tap-for-mana").filter((a) => a.permanentId === "dual");
    const byColor = Object.fromEntries(taps.map((a) => [a.color, a.bonus]));
    expect(byColor.W).toEqual([{ color: "W", amount: 1 }]);
    expect(byColor.U).toEqual([{ color: "U", amount: 1 }]);
    // dispatch the U action: the pool gains UU exactly — no stray W, the carrier untouched
    const after = dispatchAction(s, taps.find((a) => a.color === "U"));
    expect(after.players.user.manaPool.U).toBe(2);
    expect(after.players.user.manaPool.W).toBe(0);
    expect(findPermanent(after, "mf").permanent.tapped).toBe(false);
  });
});

describe("MF-1 regression — the controller-scoped fixed-pip augment is still controller-only", () => {
  it("an opponent's Groundchuck-style augment never boosts the user's tap (the allPlayers gate)", () => {
    const gc = createPermanent({ id: "gc", card: { id: "c-gc", name: "Groundchuck & Dirtbag", type: "Legendary Creature — Ox Mole Mutant", mana: "{4}{G}{G}", oracle: "Trample\nWhenever you tap a land for mana, add {G}." }, controller: "ai" });
    const s = board({ userBf: [land("mtn", MOUNTAIN, "user")], aiBf: [gc] });
    expect(globalTapManaAugment(s, "user", findPermanent(s, "mtn").permanent)).toEqual([]);
  });
});
