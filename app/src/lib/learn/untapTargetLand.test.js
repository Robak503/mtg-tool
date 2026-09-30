/**
 * UNTAP-TARGET-LAND (CR 701.26) — "{T}: Untap target land" (Voyaging Satyr). An activated ability whose
 * effect untaps a single chosen LAND so it can produce mana again (the classic "untap a land that makes 2+"
 * ramp play). Build: combatKeywordClauseParser parses "untap target land" → { op: "untap", targetType:
 * "land" }; the land routes through PERMANENT_PREDICATES.land in enumerateTargets, and applyTapEffect
 * re-verifies the LIVE permanent is a land before untapping (never a non-land). Classifies native-activated.
 *
 * CREED: the $ anchor keeps every qualified form Arbiter — "untap target land you control" — a safe
 * false-negative, never a mis-applied or fabricated untap. NOW MODELED (γ1f family): "untap target basic land"
 * under a "Tap an untapped creature you control" cost (Earthcraft — see earthcraft.test.js), "untap X target
 * lands" under a lone {X} mana cost (Candelabra / Magus — see activatedX.test.js), and the "return a land you
 * control" activation cost (Oboro — see its own test).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause, atomTargetIntent } from "./effects/parser.js";
import { parseAbilityCost } from "./effects/abilities.js";
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
  it("'untap X target lands' → high, targetCountX (γ1f — the multi-count X-target untap, Candelabra)", () => {
    expect(parseEffectClause("untap X target lands.", "Artifact", { hasX: true })).toMatchObject({
      confidence: "high", xSpell: true, atoms: [{ op: "untap", targetType: "land", targetCountX: true }],
    });
  });
  it("qualified forms stay low (Arbiter) — CREED safe FN", () => {
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
  it("Candelabra of Tawnos ({X}, {T}: Untap X target lands) classifies native-activated (γ1f)", () => {
    // The lone {X} mana cost + the X-count target set (targetCountX) are now BOTH modeled: the player picks X,
    // pays {X}, and untaps exactly X target lands. See activatedX.test.js for the end-to-end runtime proof.
    expect(classifyCard(CANDELABRA)).toBe("native-activated");
  });
  it("Oboro Breezecaller ({2}, Return a land you control: Untap target land) classifies native-activated (γ1g)", () => {
    // The {2} + return-a-land-you-control activation cost is now BOTH modeled: the player picks WHICH land they
    // control to bounce, pays {2}, and untaps a target land. See the runtime section below for the end-to-end proof.
    expect(classifyCard(OBORO)).toBe("native-activated");
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

// ─── γ1g — RETURN-A-LAND cost: parse ─────────────────────────────────────────────
describe("RETURN-A-LAND cost (γ1g) — parseAbilityCost", () => {
  it("'{2}, Return a land you control to its owner's hand' → {2} + returnLand shape", () => {
    const c = parseAbilityCost("{2}, Return a land you control to its owner's hand");
    expect(c).toMatchObject({ manaPips: "{2}", returnLand: { another: false } });
  });
  it("a COUNT variant ('Return two lands') stays unmodeled → null (CREED safe FN)", () => {
    expect(parseAbilityCost("{2}, Return two lands you control to their owners' hands")).toBeNull();
  });
  // GRADUATED (the 09-06 plan's stage ③ · 31, 2026-09-30): this pinned "Return a Forest" as unmodeled → null. It is modeled now —
  // the cost carries the basic land type and legalChoices' victim filter enforces it word-bounded on the type line (Quirion Ranger,
  // Scryb Ranger — quirionRanger.test.js runs the Forest-only payment). The pin keeps its job as the subtype contract.
  it("GRADUATED — a SUBTYPE variant ('Return a Forest') carries the subtype the victim filter enforces", () => {
    expect(parseAbilityCost("Return a Forest you control to its owner's hand")?.returnLand).toEqual({ another: false, subtype: "Forest" });
  });
});

// ─── γ1g — RETURN-A-LAND cost: runtime (Oboro Breezecaller) ──────────────────────
describe("RETURN-A-LAND cost (γ1g) — runtime (Oboro Breezecaller)", () => {
  const TAPPED_LAND = (id, name) => ({ id, name, type: `Basic Land — ${name}`, oracle: "" });

  function setup(pool = { ...EMPTY_POOL, C: 2 }, extraLands = []) {
    const oboro = createPermanent({ id: "perm-obo", card: OBORO, controller: "user", summoningSick: false });
    const tappedIsland = createPermanent({ id: "perm-ti", card: TAPPED_LAND("c-ti", "Island"), controller: "user", tapped: true });
    const bounceLand = createPermanent({ id: "perm-bl", card: TAPPED_LAND("c-bl", "Mountain"), controller: "user", tapped: true });
    let s = withBattlefield(mainState(), "user", [oboro, tappedIsland, bounceLand, ...extraLands]);
    return { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...pool } } } };
  }

  it("surfaces the {2}+return-a-land untap ability, one action per (target land × returnable land)", () => {
    const s = setup();
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.name === "Oboro Breezecaller");
    // Untap Island bouncing Mountain, and untap Mountain bouncing Island — the self-target combo (untap X, bounce X)
    // is excluded (it would fizzle), so exactly 2 actions.
    expect(acts.length).toBe(2);
    const untapIsland = acts.find((a) => a.targets?.[0]?.id === "perm-ti");
    expect(untapIsland).toMatchObject({ returnLandId: "perm-bl", needsTargets: true });
  });

  it("dispatch ACTUALLY bounces the chosen land AND pays {2} (CREED — cost is really paid), then untaps the target", () => {
    let s = setup();
    const act = legalActionsForPlayer(s, "user")
      .filter((a) => a.kind === "activate-ability" && a.name === "Oboro Breezecaller")
      .find((a) => a.targets?.[0]?.id === "perm-ti" && a.returnLandId === "perm-bl");
    expect(act).toBeTruthy();

    s = dispatchAction(s, act);
    // {2} was paid.
    expect(s.players.user.manaPool.C).toBe(0);
    // The Mountain was actually returned: off the battlefield, in hand.
    expect(s.players.user.battlefield.some((p) => p.id === "perm-bl")).toBe(false);
    expect(s.players.user.hand.some((c) => c.name === "Mountain")).toBe(true);
    // The target Island is still tapped (the ability is on the stack, unresolved).
    expect(s.players.user.battlefield.find((p) => p.id === "perm-ti").tapped).toBe(true);

    s = resolveTopOfStack(s);
    // The Island is now untapped — it makes mana again.
    expect(s.players.user.battlefield.find((p) => p.id === "perm-ti").tapped).toBe(false);
  });

  it("CREED — a land with an unmodeled 'leaves the battlefield' trigger is NOT a legal return victim (safe FN)", () => {
    const ltbLand = createPermanent({
      id: "perm-ltb",
      card: { id: "c-ltb", name: "Weird Land", type: "Land", oracle: "When Weird Land leaves the battlefield, draw a card." },
      controller: "user", tapped: true,
    });
    const s = setup({ ...EMPTY_POOL, C: 2 }, [ltbLand]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.name === "Oboro Breezecaller");
    // Never offered as the returned land — its LTB trigger can't be fired by the bounce, so returning it would
    // silently drop the trigger (a forbidden partial application). The plain Island/Mountain are still legal victims.
    expect(acts.every((a) => a.returnLandId !== "perm-ltb")).toBe(true);
    expect(acts.length).toBeGreaterThan(0);
  });

  it("CREED — bouncing the ONLY mana-land that pays the {2} starves the cost → not offered (never unpayable)", () => {
    // Oboro + a single UNTAPPED Island (the only mana source). Bouncing it leaves nothing to pay {2}, and there's
    // no floating mana, so no legal action exists.
    const oboro = createPermanent({ id: "perm-obo", card: OBORO, controller: "user", summoningSick: false });
    const onlyIsland = createPermanent({ id: "perm-only", card: { id: "c-o", name: "Island", type: "Basic Land — Island", oracle: "" }, controller: "user", tapped: false });
    const s = withBattlefield(mainState(), "user", [oboro, onlyIsland]);
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.name === "Oboro Breezecaller");
    expect(acts.length).toBe(0);
  });

  it("CREED — no land to return → the cost can't be paid → not offered", () => {
    const oboro = createPermanent({ id: "perm-obo", card: OBORO, controller: "user", summoningSick: false });
    let s = withBattlefield(mainState(), "user", [oboro]);
    s = { ...s, players: { ...s.players, user: { ...s.players.user, manaPool: { ...EMPTY_POOL, C: 2 } } } };
    const acts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "activate-ability" && a.name === "Oboro Breezecaller");
    expect(acts.length).toBe(0);
  });
});
