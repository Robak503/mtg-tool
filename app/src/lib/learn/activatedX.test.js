/**
 * γ1f — ACTIVATED-{X} MANA COST with an X-COUNT TARGET SET (Candelabra of Tawnos):
 *
 *   Candelabra of Tawnos — Artifact — "{X}, {T}: Untap X target lands."
 *
 * The gap this closes: parseAbilityCost rejected ANY {X} activated cost, and legalChoices'
 * actionsActivateAbility skipped every cost.hasX ability. Now a LONE {X} cost item is a
 * generic-X mana cost the player picks at activation, and — when the effect's TARGET COUNT is
 * that X (a targetCountX atom → program.xSpell) — the runtime enumerates one action per
 * affordable X, each expanding EXACTLY X distinct legal targets (targeting.expandAtoms, bound
 * from ctx.xValue). The resolver is the SAME applyTapEffect that plays single-target untap.
 *
 * CREED: model the WHOLE card or nothing. The effect must be X-scaled (xSpell) — a fixed effect
 * under a mana-{X} cost would leave X unconsumed (a half-model) and stays parked. The cost is
 * PAID at the chosen X (generic += X) and the SAME X sizes the target set — never a mismatch.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { parseEffectClause } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const CANDELABRA = "{X}, {T}: Untap X target lands.";
const candelabra = (over = {}) => ({ id: "card-cot", name: "Candelabra of Tawnos", type: "Artifact", oracle: CANDELABRA, ...over });

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms } } };
}
// A TAPPED basic with NO mana ability — the untap TARGET (a land, but never a mana source, so the only
// legal untap targets in these tests are exactly these, keeping the combo count deterministic).
const tappedLand = (id) => createPermanent({ id, card: { id: `c-${id}`, name: "Ancient Tomb", type: "Land", oracle: "" }, controller: "user", tapped: true, summoningSick: false });
// Give the player C mana in the POOL so the {X} is paid without adding more (untappable) LANDS to the target pool.
const withPool = (s, c) => ({ ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { W: 0, U: 0, B: 0, R: 0, G: 0, C: c } } } });
const activateActions = (s) => legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.permanentId === "perm-cot");

describe("γ1f — cost + ability shape", () => {
  it("parseAbilityCost accepts a lone {X} (costX) alongside {T}", () => {
    expect(parseAbilityCost("{X}, {T}")).toMatchObject({ manaPips: "{X}", tapSelf: true, costX: true });
  });

  it("⭐ a mixed {2}{X} activated cost item is the same generic-X cost since ④-AO (2026-09-04); a double {X} stays UNMODELED", () => {
    // Pinned null until ④-AO: the comma-split left "{2}{X}" as one item that fell to the multi-pip run. A run with exactly
    // one {X} beside real pips now reads as costX with the fixed pips alongside (Silklash Spider "{X}{G}{G}", Cinder
    // Elemental "{X}{R}", Kessig Wolf Run "{X}{R}{G}"); the activated lane's X expansion resolves it per chosen X.
    expect(parseAbilityCost("{2}{X}, {T}")).toMatchObject({ costX: true, manaPips: "{X}{2}", tapSelf: true });
    expect(parseAbilityCost("{X}{X}, {T}")).toMatchObject({ costX: true, manaPips: "{X}{X}" }); // GRADUATED (POD-SIM THREE · KN-4, 2026-09-05): a run of X pips is modeled — the mana cost carries both pips, the lane owes 2X (Treasure Vault; kinnanFillsKn4.test.js)
  });

  it("the effect 'Untap X target lands.' parses HIGH with a targetCountX atom + xSpell", () => {
    const p = parseEffectClause("Untap X target lands.", "Instant", { hasX: true });
    expect(p.confidence).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms[0]).toMatchObject({ op: "untap", targetType: "land", targetCountX: true });
  });

  it("parseActivatedAbilities marks Candelabra's ability modeled (costX, xSpell, needsTarget)", () => {
    const ab = parseActivatedAbilities(candelabra())[0];
    expect(ab).toMatchObject({ modeled: true, costX: true, tapSelf: true, needsTarget: true });
    expect(ab.program.xSpell).toBe(true);
  });

  it("classifyCard flips Candelabra of Tawnos to a native tier", () => {
    expect(classifyCard(candelabra())).toBe("native-activated");
  });

  // CREED near-miss: a FIXED effect under a mana-{X} cost must NOT be modeled (X unconsumed → half-model).
  it("CREED near-miss — '{X}, {T}: Draw a card.' is NOT modeled (X has no payoff)", () => {
    const ab = parseActivatedAbilities({ id: "c-x", name: "Bad X", type: "Artifact", oracle: "{X}, {T}: Draw a card." })[0];
    expect(ab.costX).toBe(true);      // the cost parses…
    expect(ab.modeled).toBe(false);   // …but the fixed (non-X) effect leaves it PARKED, not a confident wrong play
  });
});

describe("γ1f — runtime: enumerate X, expand X targets, untap exactly X", () => {
  it("offers one action per (affordable X × X-land subset), each target-count == chosen X", () => {
    // {C}{C} in pool (pays up to {X}=2) + 3 tapped lands (the ONLY untap targets on the battlefield).
    const cot = createPermanent({ id: "perm-cot", card: candelabra(), controller: "user", tapped: false, summoningSick: false });
    let s = withBattlefield(mainState(), "user", [cot, tappedLand("perm-t1"), tappedLand("perm-t2"), tappedLand("perm-t3")]);
    s = withPool(s, 2);
    const acts = activateActions(s);
    // X ∈ {1,2}. X=1 → C(3,1)=3 target picks; X=2 → C(3,2)=3 picks. Total 6.
    expect(acts.length).toBe(6);
    const tappedIds = new Set(["perm-t1", "perm-t2", "perm-t3"]);
    for (const a of acts) {
      expect(a.targets.length).toBe(a.xValue);              // the target set size IS the paid X (no mismatch)
      expect(a.cost.generic).toBe(a.xValue);               // and the cost is paid at that same X
      expect(a.targets.every((t) => tappedIds.has(t.id))).toBe(true);
    }
    expect(acts.some((a) => a.xValue === 1)).toBe(true);
    expect(acts.some((a) => a.xValue === 2)).toBe(true);
  });

  it("resolving an X=2 activation pays {2}, taps Candelabra, and untaps BOTH chosen lands (only those)", () => {
    const cot = createPermanent({ id: "perm-cot", card: candelabra(), controller: "user", tapped: false, summoningSick: false });
    let s = withBattlefield(mainState(), "user", [cot, tappedLand("perm-t1"), tappedLand("perm-t2"), tappedLand("perm-t3")]);
    s = withPool(s, 2);
    const two = activateActions(s).find((a) => a.xValue === 2 && a.targets.map((t) => t.id).sort().join(",") === "perm-t1,perm-t2");
    expect(two).toBeTruthy();
    expect(two.cost.generic).toBe(2); // {X} folded into generic at X=2 (CR 107.3)

    s = dispatchAction(s, two);
    const bf = (id) => s.players.user.battlefield.find((p) => p.id === id);
    expect(bf("perm-cot").tapped).toBe(true);          // {T} paid
    expect(s.players.user.manaPool.C).toBe(0);          // {2} paid from the pool
    expect(bf("perm-t1").tapped).toBe(true);            // untap is on the stack, not yet resolved

    s = resolveTopOfStack(s);
    const bf2 = (id) => s.players.user.battlefield.find((p) => p.id === id);
    // EXACTLY the two chosen lands untapped; the third stayed tapped (X-count target set is honored).
    expect(bf2("perm-t1").tapped).toBe(false);
    expect(bf2("perm-t2").tapped).toBe(false);
    expect(bf2("perm-t3").tapped).toBe(true);
  });

  it("no action is offered when the player has no mana to pay even {X}=1", () => {
    const cot = createPermanent({ id: "perm-cot", card: candelabra(), controller: "user", tapped: false, summoningSick: false });
    const s = withBattlefield(mainState(), "user", [cot, tappedLand("perm-t1"), tappedLand("perm-t2")]); // no mana anywhere
    expect(activateActions(s)).toHaveLength(0);
  });

  it("does NOT offer the ability when Candelabra is already tapped (can't pay {T})", () => {
    const cot = createPermanent({ id: "perm-cot", card: candelabra(), controller: "user", tapped: true, summoningSick: false });
    let s = withBattlefield(mainState(), "user", [cot, tappedLand("perm-t1")]);
    s = withPool(s, 5);
    expect(activateActions(s)).toHaveLength(0);
  });
});
