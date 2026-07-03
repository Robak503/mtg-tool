/**
 * EARTHCRAFT (γ1f TAP-CREATURE cost + UNTAP-BASIC-LAND effect) — CR 602.1b / 701.26.
 *
 * Card: Earthcraft — Enchantment {1}{G} — "Tap an untapped creature you control: Untap target basic land."
 *
 * Two blocks had to be modeled for this to flip native-activated (all-or-nothing, CREED):
 *   1. COST — "Tap an untapped creature you control" is a CHOICE cost (parseAbilityCost.tapCreature): the
 *      player picks WHICH untapped creature they control to tap (like the sacOther victim pick). legalChoices
 *      expands one action per legal untapped creature; the dispatcher taps it and excludes it from the mana
 *      sources (a creature tapped for the cost can't also tap for mana).
 *   2. EFFECT — "Untap target basic land" (combatKeywordClauseParser → { op:"untap", targetType:"basicLand" }):
 *      targetType "basicLand" routes through PERMANENT_PREDICATES.basicLand (a Land WITH the Basic supertype);
 *      applyTapEffect re-verifies the LIVE permanent is a basic land before untapping (never a nonbasic / non-land).
 *
 * CREED near-misses proven below: no untapped creature → cost unpayable → 0 actions; a NONBASIC land is never
 * a legal untap target and is never untapped by the resolver; a summoning-sick creature CAN pay the tap cost
 * (it isn't the creature's own {T}); the tapped creature stays on the battlefield (tap is not a sacrifice).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { parseAbilityCost, parseActivatedAbilities } from "./effects/abilities.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, creaturePower } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const EARTHCRAFT = { id: "c-ec", name: "Earthcraft", type: "Enchantment", mana: "{1}{G}", oracle: "Tap an untapped creature you control: Untap target basic land." };
const BEAR = (id) => ({ id, name: "Grizzly Bears", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" });
const BASIC_FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const NONBASIC_LAND = (id) => ({ id, name: "Reflecting Pool", type: "Land", oracle: "{T}: Add one mana of any color a land you control could produce." });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms, manaPool: { ...EMPTY_POOL } } } };
}

// ─── Parser: cost + effect ─────────────────────────────────────────────────────
describe("EARTHCRAFT — parser", () => {
  it("cost 'Tap an untapped creature you control' → tapCreature choice-cost shape", () => {
    expect(parseAbilityCost("Tap an untapped creature you control")).toMatchObject({ tapCreature: { another: false } });
  });
  it("effect 'untap target basic land' → high, { op: untap, targetType: basicLand }", () => {
    const r = parseEffectClause("untap target basic land.", "Enchantment");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "basicLand" }] });
  });
  it("untap-basic-land intent is own-side (you untap your own land)", () => {
    expect(atomTargetIntent({ op: "untap", targetType: "basicLand" })).toBe("own");
  });
  it("the whole Earthcraft ability parses as one modeled, targeted, non-mana ability", () => {
    const abs = parseActivatedAbilities(EARTHCRAFT);
    expect(abs).toHaveLength(1);
    expect(abs[0]).toMatchObject({ modeled: true, needsTarget: true, isManaEffect: false, tapCreature: { another: false } });
  });
  // CREED — a COUNT / qualified tap-creature cost stays unmodeled (deferred), never mis-paid.
  it("a qualified / count tap-creature cost stays unmodeled → null (safe FN)", () => {
    expect(parseAbilityCost("Tap two untapped creatures you control")).toBeNull();
    expect(parseAbilityCost("Tap an untapped Elf you control")).toBeNull();
    // A bare "untap target basic land" under a qualified target stays low (Arbiter).
    expect(parseEffectClause("untap target basic land you control.", "Enchantment").confidence).toBe("low");
  });
});

// ─── Coverage ─────────────────────────────────────────────────────────────────
describe("EARTHCRAFT — classifyCard", () => {
  it("Earthcraft classifies native-activated", () => {
    expect(classifyCard(EARTHCRAFT)).toBe("native-activated");
  });
});

// ─── Targeting: only BASIC lands are legal untap targets ────────────────────────
describe("EARTHCRAFT — enumerateTargets(basicLand)", () => {
  it("offers basic lands (any battlefield) but NOT nonbasic lands — CREED", () => {
    const myForest = createPermanent({ id: "perm-bf", card: BASIC_FOREST("c1"), controller: "user", tapped: true });
    const oppForest = createPermanent({ id: "perm-of", card: BASIC_FOREST("c2"), controller: "ai", tapped: true });
    const nonbasic = createPermanent({ id: "perm-nb", card: NONBASIC_LAND("c3"), controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [myForest, nonbasic]);
    s = withBattlefield(s, "ai", [oppForest]);
    const ids = enumerateTargets(s, "user", { targetType: "basicLand" }).map((t) => t.id).sort();
    expect(ids).toEqual(["perm-bf", "perm-of"]); // the nonbasic land is excluded
  });
});

// ─── Runtime: end-to-end ────────────────────────────────────────────────────────
describe("EARTHCRAFT — runtime", () => {
  function setup(extra = []) {
    const ec = createPermanent({ id: "perm-ec", card: EARTHCRAFT, controller: "user" });
    const bear = createPermanent({ id: "perm-bear", card: BEAR("c-bear"), controller: "user", summoningSick: false });
    const forest = createPermanent({ id: "perm-forest", card: BASIC_FOREST("c-forest"), controller: "user", tapped: true });
    return withBattlefield(mainState(), "user", [ec, bear, forest, ...extra]);
  }

  it("surfaces exactly one activate-ability: tap the Bear (cost), untap the basic Forest (target)", () => {
    const s = setup();
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(1);
    expect(acts[0]).toMatchObject({
      permanentId: "perm-ec",
      tapCreatureId: "perm-bear",
      needsTargets: true,
    });
    expect(acts[0].targets?.[0]?.id).toBe("perm-forest");
  });

  it("taps the Bear as cost, goes on the stack, resolves to UNTAP the basic Forest", () => {
    let s = setup();
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability").find((a) => a.targets?.[0]?.id === "perm-forest");
    expect(act).toBeTruthy();

    s = dispatchAction(s, act);
    // Cost paid: the Bear is now tapped; the ability is on the stack; the Forest is still tapped (unresolved).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-bear").tapped).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-forest").tapped).toBe(true);
    expect(s.stack.find((o) => o.kind === "activated-ability")).toBeTruthy();

    s = resolveTopOfStack(s);
    // The basic Forest is now UNTAPPED (it can make mana again); the Bear stays tapped (it paid the cost, not sacrificed).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-forest").tapped).toBe(false);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-bear").tapped).toBe(true);
    // The Bear is STILL on the battlefield — a tap cost is not a sacrifice (CREED: model the cost faithfully).
    expect(s.players.user.battlefield.some((p) => p.id === "perm-bear")).toBe(true);
  });

  it("expands one action PER untapped creature the player controls (the choice cost)", () => {
    const bear2 = createPermanent({ id: "perm-bear2", card: BEAR("c-bear2"), controller: "user", summoningSick: false });
    const s = setup([bear2]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts.map((a) => a.tapCreatureId).sort()).toEqual(["perm-bear", "perm-bear2"]);
  });

  it("a summoning-sick creature CAN pay the tap cost (it isn't the creature's own {T} — CR 302.6)", () => {
    const sick = createPermanent({ id: "perm-sick", card: BEAR("c-sick"), controller: "user", summoningSick: true });
    const ec = createPermanent({ id: "perm-ec", card: EARTHCRAFT, controller: "user" });
    const forest = createPermanent({ id: "perm-forest", card: BASIC_FOREST("c-forest"), controller: "user", tapped: true });
    const s = withBattlefield(mainState(), "user", [ec, sick, forest]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts.some((a) => a.tapCreatureId === "perm-sick")).toBe(true);
  });

  // ── CREED near-misses ──────────────────────────────────────────────────────
  it("no UNTAPPED creature → the cost is unpayable → the ability is not offered", () => {
    const ec = createPermanent({ id: "perm-ec", card: EARTHCRAFT, controller: "user" });
    const tappedBear = createPermanent({ id: "perm-bear", card: BEAR("c-bear"), controller: "user", tapped: true });
    const forest = createPermanent({ id: "perm-forest", card: BASIC_FOREST("c-forest"), controller: "user", tapped: true });
    const s = withBattlefield(mainState(), "user", [ec, tappedBear, forest]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(0);
  });

  it("only a NONBASIC land present → no legal basic-land target → the ability is not offered", () => {
    const ec = createPermanent({ id: "perm-ec", card: EARTHCRAFT, controller: "user" });
    const bear = createPermanent({ id: "perm-bear", card: BEAR("c-bear"), controller: "user", summoningSick: false });
    const nonbasic = createPermanent({ id: "perm-nb", card: NONBASIC_LAND("c-nb"), controller: "user", tapped: true });
    const s = withBattlefield(mainState(), "user", [ec, bear, nonbasic]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(0);
    // And the resolver never untaps a nonbasic land even if one were mis-threaded (the type re-verify guards it).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-nb").tapped).toBe(true);
  });

  it("the resolver untaps ONLY the basic land, never a nonbasic land in the same pool (CREED type re-verify)", () => {
    const ec = createPermanent({ id: "perm-ec", card: EARTHCRAFT, controller: "user" });
    const bear = createPermanent({ id: "perm-bear", card: BEAR("c-bear"), controller: "user", summoningSick: false });
    const forest = createPermanent({ id: "perm-forest", card: BASIC_FOREST("c-forest"), controller: "user", tapped: true });
    const nonbasic = createPermanent({ id: "perm-nb", card: NONBASIC_LAND("c-nb"), controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [ec, bear, forest, nonbasic]);
    const act = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability").find((a) => a.targets?.[0]?.id === "perm-forest");
    s = dispatchAction(s, act);
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-forest").tapped).toBe(false); // basic untapped
    expect(s.players.user.battlefield.find((p) => p.id === "perm-nb").tapped).toBe(true);       // nonbasic untouched
  });
});

// ─── Sibling flips: the γ1f tap-creature cost also flips other cards ─────────────
// These ride the SAME cost branch. The critical CREED case is a {T} + tap-creature combo (Selesnya Evangel,
// Revelsong Horn): the SOURCE can't be its OWN tap-victim when it's already tapped by the {T} part — offering
// that action would crash the dispatcher (ALREADY_TAPPED). A pure tap-creature source (Bramblesnap — no {T})
// CAN tap itself. Both are exercised here against the real oracle so the source-exclusion gate can't regress.
describe("EARTHCRAFT (γ1f) — sibling flips + the tapSelf source-exclusion (CREED)", () => {
  // Synthetic {T} + tap-creature ability (the Selesnya Evangel / Revelsong Horn shape) on a CREATURE source —
  // so the source is BOTH a {T} payer and a candidate tap-victim. The source must be excluded as its own
  // tap-victim (it's already tapped by {T}); only ANOTHER untapped creature can pay the tap-creature cost.
  const TAPSELF_AND_TAPCREATURE = {
    id: "c-ts", name: "Tandem Tapper", type: "Creature — Construct", power: 0, toughness: 3, mana: "{2}",
    oracle: "{T}, Tap an untapped creature you control: Untap target basic land.",
  };

  it("a {T} + tap-creature ability on a creature source is NOT offered when the source is the ONLY untapped creature", () => {
    const src = createPermanent({ id: "perm-src", card: TAPSELF_AND_TAPCREATURE, controller: "user", summoningSick: false });
    const forest = createPermanent({ id: "perm-f", card: BASIC_FOREST("c-f"), controller: "user", tapped: true });
    const s = withBattlefield(mainState(), "user", [src, forest]);
    // The source can't tap for BOTH {T} and the tap-creature cost, and no OTHER creature exists → 0 actions.
    // (Without the source-exclusion gate this would offer an action the dispatcher throws ALREADY_TAPPED on.)
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(0);
  });

  it("with ANOTHER untapped creature, the {T}+tap-creature ability offers only the OTHER creature as the tap-victim, and pays cleanly", () => {
    const src = createPermanent({ id: "perm-src", card: TAPSELF_AND_TAPCREATURE, controller: "user", summoningSick: false });
    const helper = createPermanent({ id: "perm-help", card: BEAR("c-help"), controller: "user", summoningSick: false });
    const forest = createPermanent({ id: "perm-f", card: BASIC_FOREST("c-f"), controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [src, helper, forest]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(1);
    expect(acts[0].tapCreatureId).toBe("perm-help"); // the helper, NEVER the source
    // Dispatch must NOT throw: the source pays {T}, the helper pays the tap-creature cost (two distinct taps).
    s = dispatchAction(s, acts[0]);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-src").tapped).toBe(true);  // {T}
    expect(s.players.user.battlefield.find((p) => p.id === "perm-help").tapped).toBe(true); // tap-creature cost
    s = resolveTopOfStack(s);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-f").tapped).toBe(false);   // the basic land untapped
  });

  // Bramblesnap (real oracle, NO {T} cost): the source CAN tap ITSELF as the tap-creature victim to pump itself.
  const BRAMBLESNAP = { id: "c-bs", name: "Bramblesnap", type: "Creature — Elemental", power: 1, toughness: 1, mana: "{2}{G}", oracle: "Trample\nTap an untapped creature you control: This creature gets +1/+1 until end of turn." };

  it("Bramblesnap classifies native-activated and taps ITSELF to pump itself (no {T} cost → self is a legal victim)", () => {
    expect(classifyCard(BRAMBLESNAP)).toBe("native-activated");
    const bs = createPermanent({ id: "perm-bs", card: BRAMBLESNAP, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [bs]);
    const before = creaturePower(s.players.user.battlefield.find((p) => p.id === "perm-bs"), s);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts).toHaveLength(1);
    expect(acts[0].tapCreatureId).toBe("perm-bs"); // the source taps ITSELF
    s = dispatchAction(s, acts[0]);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-bs").tapped).toBe(true);
    s = resolveTopOfStack(s);
    expect(creaturePower(s.players.user.battlefield.find((p) => p.id === "perm-bs"), s)).toBe(before + 1); // +1/+1
  });
});
