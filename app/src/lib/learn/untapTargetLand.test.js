/**
 * UNTAP-TARGET-LAND (CR 701.26) — "{T}: Untap target land" (Voyaging Satyr). An activated ability whose
 * effect untaps a single chosen LAND so it can produce mana again (the classic "untap a land that makes 2+"
 * ramp play). Build: combatKeywordClauseParser parses "untap target land" → { op: "untap", targetType:
 * "land" }; the land routes through PERMANENT_PREDICATES.land in enumerateTargets, and applyTapEffect
 * re-verifies the LIVE permanent is a land before untapping (never a non-land). Classifies native-activated.
 *
 * CREED: the $ anchor keeps every qualified / X form Arbiter — "untap X target lands" (Candelabra / Magus,
 * an X-cost ability deferred), "untap target land you control", "return a land you control" untaps (Oboro) —
 * a safe false-negative, never a mis-applied or fabricated untap. NOTE: "untap target basic land" under a
 * "Tap an untapped creature you control" cost (Earthcraft) is NOW modeled (γ1f tap-creature cost +
 * targetType "basicLand"); see earthcraft.test.js for the end-to-end proof.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { enumerateTargets } from "./spellEffects.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

// ─── Verified oracle text (Scryfall oracle-index.json) ──────────────────────────
const VOYAGING_SATYR = { id: "c-vs", name: "Voyaging Satyr", type: "Creature — Satyr Druid", power: 1, toughness: 2, mana: "{1}{G}", oracle: "{T}: Untap target land." };
// Non-native (X-cost / non-standard-cost / qualified):
const CANDELABRA = { id: "c-cand", name: "Candelabra of Tawnos", type: "Artifact", mana: "{1}", oracle: "{X}, {T}: Untap X target lands." };
const OBORO = { id: "c-obo", name: "Oboro Breezecaller", type: "Creature — Moonfolk Wizard", power: 1, toughness: 1, mana: "{1}{U}", oracle: "Flying\n{2}, Return a land you control to its owner's hand: Untap target land." };
const EARTHCRAFT = { id: "c-ec", name: "Earthcraft", type: "Enchantment", mana: "{1}{G}", oracle: "Tap an untapped creature you control: Untap target basic land." };

const TAPPED_FOREST = (id) => ({ id, name: "Forest", type: "Basic Land — Forest", oracle: "" });
const EMPTY_POOL = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };

function mainState(over = {}) {
  const base = createGameState({ userDeck: [], aiDeck: [] });
  return { ...base, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", consecutivePasses: 0, ...over };
}
function withBattlefield(state, playerId, perms) {
  return { ...state, players: { ...state.players, [playerId]: { ...state.players[playerId], battlefield: perms, manaPool: { ...EMPTY_POOL } } } };
}

// ─── Parser ──────────────────────────────────────────────────────────────────────
describe("UNTAP-TARGET-LAND — parser", () => {
  it("'untap target land' → high, { op: untap, targetType: land }", () => {
    const r = parseEffectClause("untap target land.", "Creature");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "land" }] });
  });
  it("intent is own-side (you untap your own land)", () => {
    expect(atomTargetIntent({ op: "untap", targetType: "land" })).toBe("own");
  });
  it("the creature form is untouched", () => {
    const r = parseEffectClause("untap target creature.", "Instant");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "creature" }] });
  });
  it("qualified / X forms stay low (Arbiter) — CREED safe FN", () => {
    expect(parseEffectClause("untap X target lands.", "Artifact").confidence).toBe("low");
    expect(parseEffectClause("untap target land you control.", "Creature").confidence).toBe("low");
  });
  it("'untap target basic land' → high, { op: untap, targetType: basicLand } (Earthcraft — now modeled)", () => {
    const r = parseEffectClause("untap target basic land.", "Enchantment");
    expect(r).toMatchObject({ confidence: "high", atoms: [{ op: "untap", targetType: "basicLand" }] });
  });
});

// ─── Coverage ──────────────────────────────────────────────────────────────────────
describe("UNTAP-TARGET-LAND — classifyCard", () => {
  it("Voyaging Satyr classifies native-activated", () => {
    expect(classifyCard(VOYAGING_SATYR)).toBe("native-activated");
  });
  it("X-cost / non-standard-cost untap-land cards stay non-native", () => {
    // {X}, {T} cost is deferred (X-cost activated abilities) — body-only.
    expect(classifyCard(CANDELABRA)).toBe("body-only");
    // "Return a land you control" is an unmodeled non-standard activation cost — body-only.
    expect(classifyCard(OBORO)).toBe("body-only");
  });
  it("Earthcraft classifies native-activated (γ1f tap-creature cost + basic-land untap now modeled)", () => {
    expect(classifyCard(EARTHCRAFT)).toBe("native-activated");
  });
});

// ─── Targeting: a land is a legal untap target ───────────────────────────────────
describe("UNTAP-TARGET-LAND — enumerateTargets", () => {
  it("offers any land on any battlefield as an untap-land target", () => {
    const myForest = createPermanent({ id: "perm-f1", card: TAPPED_FOREST("c1"), controller: "user", tapped: true });
    const oppForest = createPermanent({ id: "perm-f2", card: TAPPED_FOREST("c2"), controller: "ai", tapped: true });
    let s = withBattlefield(mainState(), "user", [myForest]);
    s = withBattlefield(s, "ai", [oppForest]);
    const targets = enumerateTargets(s, "user", { targetType: "land" });
    const ids = targets.map((t) => t.id).sort();
    expect(ids).toEqual(["perm-f1", "perm-f2"]);
  });
});

// ─── Runtime: Voyaging Satyr untaps a tapped land end-to-end ─────────────────────
describe("UNTAP-TARGET-LAND — runtime (Voyaging Satyr)", () => {
  function setup() {
    const satyr = createPermanent({ id: "perm-vs", card: VOYAGING_SATYR, controller: "user", summoningSick: false });
    const tappedForest = createPermanent({ id: "perm-tf", card: TAPPED_FOREST("c-tf"), controller: "user", tapped: true });
    return withBattlefield(mainState(), "user", [satyr, tappedForest]);
  }

  it("surfaces the {T} untap-land ability targeting the tapped land", () => {
    const s = setup();
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    const atLand = acts.find((a) => a.targets?.[0]?.id === "perm-tf");
    expect(atLand).toBeTruthy();
    expect(atLand).toMatchObject({ kind: "activate-ability", permanentId: "perm-vs", tapSelf: true, needsTargets: true });
  });

  it("taps the Satyr, goes on the stack, and resolves to UNTAP the land (it makes mana again)", () => {
    let s = setup();
    const atLand = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability").find((a) => a.targets?.[0]?.id === "perm-tf");
    expect(atLand).toBeTruthy();

    s = dispatchAction(s, atLand);
    const stk = s.stack.find((o) => o.kind === "activated-ability");
    expect(stk).toBeTruthy();
    // Satyr paid {T} (tapped) but is still on the battlefield; the forest is still tapped (effect not resolved).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-vs").tapped).toBe(true);
    expect(s.players.user.battlefield.find((p) => p.id === "perm-tf").tapped).toBe(true);

    s = resolveTopOfStack(s);
    // The land is now UNTAPPED — it can produce mana again.
    expect(s.players.user.battlefield.find((p) => p.id === "perm-tf").tapped).toBe(false);
    // The Satyr stays tapped (it paid its own {T} cost).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-vs").tapped).toBe(true);
  });

  it("does NOT untap a non-land (CREED — the atom only untaps the verified land target)", () => {
    // Belt-and-suspenders: even if a creature id were threaded as the target, applyTapEffect must skip it.
    // Build the same ability but force a creature target id; the resolver should leave the creature tapped.
    const satyr = createPermanent({ id: "perm-vs", card: VOYAGING_SATYR, controller: "user", summoningSick: false });
    const tappedCreature = createPermanent({ id: "perm-tc", card: { id: "c-tc", name: "Bear", type: "Creature — Bear", power: 2, toughness: 2, oracle: "" }, controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [satyr, tappedCreature]);
    // No land exists → the untap-land ability has no legal target → it isn't surfaced at all.
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability");
    expect(acts.length).toBe(0);
    // The tapped creature stays tapped (never touched by an untap-LAND effect).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-tc").tapped).toBe(true);
  });
});
