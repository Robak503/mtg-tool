/**
 * BREAKAGE WAVE — six cards the self-play stress-test surfaced as unmodeled, built CREED-clean:
 *   - Exsanguinate          DRAIN-X            ({X}{B}{B}) — each opp loses X, you gain the total drained
 *   - Chandra's Ignition    SOURCE-POWER-FANOUT ({3}{R}{R}) — a creature you control deals its power to each
 *                                                            OTHER creature + each opponent
 *   - Biomass Mutation      SET-BASE-PT-TEAM   ({X}{G/U}{G/U}) — your creatures' base P/T → X/X until EOT
 *   - Crux of Fate          modal subtype wipe ({3}{B}{B}) — destroy all Dragon / all non-Dragon creatures
 *   - Deadly Dispute        ADDCOST-1 union    ({1}{B}) — sac an artifact OR creature; draw 2 + a Treasure
 *   - Blood Money           BLOOD-MONEY        ({5}{B}{B}) — destroy all creatures + a tapped Treasure per
 *                                                            nontoken creature destroyed this way
 *
 * Each: classification (native-spell) + the atom shape + a RUNTIME check through the real ATOM_RESOLVERS /
 * cast path. CREED anti-FP pins (a mis-scoped / mis-counted variant routes to the Arbiter) are asserted too.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence, programContainsMassRemoval, atomTargetIntent } from "./effects/parser.js";
import { legalActionsForPlayer } from "./legalChoices.js";
import { dispatchAction } from "./actionDispatcher.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent, opponentsOf } from "./gameState.js";
import { permanentPower, permanentToughness } from "./layers.js";

beforeEach(() => _resetIdsForTests());

const cr = (id, name, p, t, ctrl, over = {}) =>
  createPermanent({
    id,
    card: { id: `c-${id}`, name, type: `Creature — ${over.sub || "Beast"}`, power: p, toughness: t, oracle: over.oracle || "", ...(over.token ? { token: true } : {}) },
    controller: ctrl,
    summoningSick: false,
  });

function board({ user = [], ai = [], userLife = 20, aiLife = 20, turn = 1, hand = [], library = [], pool = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, life: userLife, hand, library, manaPool: { ...s.players.user.manaPool, ...pool } },
      ai: { ...s.players.ai, battlefield: ai, life: aiLife },
    },
  };
}

// ───────────────────────────── EXSANGUINATE (DRAIN-X) ─────────────────────────────
describe("Exsanguinate — DRAIN-X (each opponent loses X, you gain the total drained)", () => {
  const EXSANG = { name: "Exsanguinate", type: "Sorcery", mana: "{X}{B}{B}", oracle: "Each opponent loses X life. You gain life equal to the life lost this way." };

  it("classifies native-spell as a single drain-each-opponent X atom", () => {
    expect(classifyCard(EXSANG)).toBe("native-spell");
    const p = parseEffectProgram(EXSANG);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "drain-each-opponent", amountX: true, targetType: null }]);
  });

  it("RUNTIME X=3: each opponent loses 3, you gain 3 × (number of opponents)", () => {
    let s = board({ userLife: 20, aiLife: 20 });
    const oppCount = opponentsOf(s, "user").length; // 1 in the 2-player harness
    s = ATOM_RESOLVERS["drain-each-opponent"](s, { op: "drain-each-opponent", amountX: true }, { controller: "user", xValue: 3 });
    expect(s.players.ai.life).toBe(17);                  // each opp -3
    expect(s.players.user.life).toBe(20 + 3 * oppCount); // you gain the TOTAL drained
  });

  it("RUNTIME X=0 is a clean no-op (no life change)", () => {
    let s = board({ userLife: 20, aiLife: 20 });
    s = ATOM_RESOLVERS["drain-each-opponent"](s, { op: "drain-each-opponent", amountX: true }, { controller: "user", xValue: 0 });
    expect(s.players.user.life).toBe(20);
    expect(s.players.ai.life).toBe(20);
  });

  it("CREED: life lost counts the FULL amount even past 0 (opp at 2 loses 5 → you gain 5)", () => {
    let s = board({ userLife: 20, aiLife: 2 });
    s = ATOM_RESOLVERS["drain-each-opponent"](s, { op: "drain-each-opponent", amountX: true }, { controller: "user", xValue: 5 });
    expect(s.players.ai.life).toBe(-3); // CR 118.2 — life can go below 0
    expect(s.players.user.life).toBe(25); // life lost = 5 (the full amount), not capped at the opp's 2
  });
});

// ──────────────────────── CHANDRA'S IGNITION (SOURCE-POWER-FANOUT) ────────────────────────
describe("Chandra's Ignition — SOURCE-POWER-FANOUT", () => {
  const IGNITION = { name: "Chandra's Ignition", type: "Sorcery", mana: "{3}{R}{R}", oracle: "Target creature you control deals damage equal to its power to each other creature and each opponent." };

  it("classifies native-spell as a source-power-fanout atom targeting a creature you control", () => {
    expect(classifyCard(IGNITION)).toBe("native-spell");
    const p = parseEffectProgram(IGNITION);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "source-power-fanout", targetType: "creature", restrictions: [{ kind: "controller", who: "you" }] }]);
    // the chosen target is the controller's OWN creature → "own" intent
    expect(atomTargetIntent(p.atoms[0])).toBe("own");
  });

  it("RUNTIME: a 5-power source deals 5 to each OTHER creature + each opponent, NOT to itself", () => {
    let s = board({
      user: [cr("src", "Big", 5, 5, "user"), cr("mine", "MyOther", 2, 6, "user")],
      ai: [cr("en", "Enemy", 4, 4, "ai")],
      userLife: 20, aiLife: 20,
    });
    s = ATOM_RESOLVERS["source-power-fanout"](s, { op: "source-power-fanout", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "src" }] });
    expect(s.players.user.battlefield.find((p) => p.id === "src")).toBeTruthy();   // source NOT hit ("each OTHER creature")
    expect(s.players.user.battlefield.find((p) => p.id === "mine")).toBeTruthy();  // my 2/6 took 5 → survives
    expect(s.players.ai.battlefield.find((p) => p.id === "en")).toBeUndefined();   // enemy 4/4 took 5 → dies
    expect(s.players.ai.life).toBe(15);                                            // each opponent took 5
    expect(s.players.user.life).toBe(20);                                          // controller is NOT a target ("each opponent")
  });

  it("RUNTIME: a source that left the battlefield (stale target) is a clean no-op", () => {
    let s = board({ ai: [cr("en", "Enemy", 1, 1, "ai")], aiLife: 20 });
    s = ATOM_RESOLVERS["source-power-fanout"](s, { op: "source-power-fanout", targetType: "creature" }, { controller: "user", targets: [{ type: "creature", id: "gone" }] });
    expect(s.players.ai.life).toBe(20);                                            // no fabricated damage
    expect(s.players.ai.battlefield.find((p) => p.id === "en")).toBeTruthy();
  });
});

// ──────────────────────── BIOMASS MUTATION (SET-BASE-PT-TEAM) ────────────────────────
describe("Biomass Mutation — SET-BASE-PT-TEAM (X/X base set, until end of turn)", () => {
  const BIOMASS = { name: "Biomass Mutation", type: "Instant", mana: "{X}{G/U}{G/U}", oracle: "Creatures you control have base power and toughness X/X until end of turn." };

  it("classifies native-spell as a set-base-pt-team X atom", () => {
    expect(classifyCard(BIOMASS)).toBe("native-spell");
    const p = parseEffectProgram(BIOMASS);
    expect(programConfidence(p)).toBe("high");
    expect(p.xSpell).toBe(true);
    expect(p.atoms).toEqual([{ op: "set-base-pt-team", scope: "youControl", amountX: true }]);
  });

  it("RUNTIME X=4: each creature you control becomes base 4/4; opponents untouched", () => {
    let s = board({
      user: [cr("a", "Small", 1, 1, "user"), cr("b", "Big", 7, 7, "user")],
      ai: [cr("en", "Enemy", 2, 2, "ai")],
    });
    s = ATOM_RESOLVERS["set-base-pt-team"](s, { op: "set-base-pt-team", scope: "youControl", amountX: true }, { controller: "user", xValue: 4 });
    expect([permanentPower(s, "a"), permanentToughness(s, "a")]).toEqual([4, 4]);
    expect([permanentPower(s, "b"), permanentToughness(s, "b")]).toEqual([4, 4]);
    expect([permanentPower(s, "en"), permanentToughness(s, "en")]).toEqual([2, 2]); // opponent's creature unchanged
  });

  it("RUNTIME: a +1/+1 counter sits ABOVE the base set (layer 7b set, then 7c counter)", () => {
    let s = board({ user: [cr("a", "C", 1, 1, "user")] });
    // add a +1/+1 counter first
    s = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [{ ...s.players.user.battlefield[0], counters: { "+1/+1": 1 } }] } } };
    s = ATOM_RESOLVERS["set-base-pt-team"](s, { op: "set-base-pt-team", scope: "youControl", amountX: true }, { controller: "user", xValue: 3 });
    expect([permanentPower(s, "a"), permanentToughness(s, "a")]).toEqual([4, 4]); // base 3/3 + counter 1/1
  });

  it("RUNTIME X=0: base 0/0 kills the controller's creatures (lethal SBA)", () => {
    let s = board({ user: [cr("a", "C", 5, 5, "user")] });
    s = ATOM_RESOLVERS["set-base-pt-team"](s, { op: "set-base-pt-team", scope: "youControl", amountX: true }, { controller: "user", xValue: 0 });
    expect(s.players.user.battlefield.find((p) => p.id === "a")).toBeUndefined();
  });
});

// ──────────────────────── CRUX OF FATE (modal subtype wipe) ────────────────────────
describe("Crux of Fate — modal subtype-filtered mass destroy", () => {
  const CRUX = { name: "Crux of Fate", type: "Sorcery", mana: "{3}{B}{B}", oracle: "Choose one —\n• Destroy all Dragon creatures.\n• Destroy all non-Dragon creatures." };

  it("classifies native-spell with two modes (Dragon / non-Dragon subtype wipe)", () => {
    expect(classifyCard(CRUX)).toBe("native-spell");
    const p = parseEffectProgram(CRUX);
    expect(programConfidence(p)).toBe("high");
    expect(p.structure).toBe("modal");
    expect(p.modal.modes[0].atoms).toEqual([{ op: "destroy", targetType: "eachCreature", subtypeFilter: "Dragon", subtypeNegate: false }]);
    expect(p.modal.modes[1].atoms).toEqual([{ op: "destroy", targetType: "eachCreature", subtypeFilter: "Dragon", subtypeNegate: true }]);
    // a subtype wipe is still a mass removal — the AI holds it
    expect(programContainsMassRemoval(p)).toBe(true);
  });

  it("RUNTIME mode 0 (all Dragons): every Dragon dies, non-Dragons survive", () => {
    let s = board({
      user: [cr("d", "Drag", 3, 3, "user", { sub: "Dragon" }), cr("g", "Gob", 2, 2, "user", { sub: "Goblin" })],
      ai: [cr("ed", "EDrag", 5, 5, "ai", { sub: "Dragon" })],
    });
    s = ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "eachCreature", subtypeFilter: "Dragon", subtypeNegate: false }, { controller: "user", targets: [] });
    expect(s.players.user.battlefield.find((p) => p.id === "d")).toBeUndefined();  // my Dragon dies
    expect(s.players.user.battlefield.find((p) => p.id === "g")).toBeTruthy();     // my Goblin survives
    expect(s.players.ai.battlefield.find((p) => p.id === "ed")).toBeUndefined();   // enemy Dragon dies
  });

  it("RUNTIME mode 1 (all non-Dragons): every non-Dragon dies, Dragons survive", () => {
    let s = board({
      user: [cr("d", "Drag", 3, 3, "user", { sub: "Dragon" }), cr("g", "Gob", 2, 2, "user", { sub: "Goblin" })],
      ai: [cr("ed", "EDrag", 5, 5, "ai", { sub: "Dragon" })],
    });
    s = ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "eachCreature", subtypeFilter: "Dragon", subtypeNegate: true }, { controller: "user", targets: [] });
    expect(s.players.user.battlefield.find((p) => p.id === "d")).toBeTruthy();     // my Dragon survives
    expect(s.players.user.battlefield.find((p) => p.id === "g")).toBeUndefined();  // my Goblin dies
    expect(s.players.ai.battlefield.find((p) => p.id === "ed")).toBeTruthy();      // enemy Dragon survives
  });

  it("CREED: a non-curated subtype wipe stays Arbiter (never a fabricated filter)", () => {
    expect(classifyCard({ name: "X", type: "Sorcery", oracle: "Destroy all Wibble creatures." })).toBe("arbiter-spell");
  });
});

// ──────────────────────── DEADLY DISPUTE (ADDCOST-1 union) ────────────────────────
describe("Deadly Dispute — sacrifice an artifact OR creature, draw 2, create a Treasure", () => {
  const DEADLY = { id: "card-dd", name: "Deadly Dispute", type: "Instant", mana: "{1}{B}", oracle: 'As an additional cost to cast this spell, sacrifice an artifact or creature.\nDraw two cards and create a Treasure token. (It\'s an artifact with "{T}, Sacrifice this token: Add one mana of any color.")' };

  it("classifies native-spell with an artifactOrCreature sac cost + draw 2 + Treasure", () => {
    expect(classifyCard(DEADLY)).toBe("native-spell");
    const p = parseEffectProgram(DEADLY);
    expect(programConfidence(p)).toBe("high");
    expect(p.additionalCosts).toEqual([{ kind: "sacrifice", sacType: "artifactOrCreature" }]);
    expect(p.atoms).toEqual([
      { op: "draw", amount: 2, targetType: null },
      { op: "create-named-token", token: "treasure", count: 1, targetType: null },
    ]);
  });

  it("RUNTIME: offers BOTH an artifact and a creature as sac victims; paying then drawing + Treasure", () => {
    const artifact = createPermanent({ id: "art", card: { id: "c-art", name: "Mox", type: "Artifact", oracle: "" }, controller: "user" });
    const creature = cr("cre", "Bear", 2, 2, "user");
    let s = board({ user: [artifact, creature], hand: [DEADLY], library: [{ id: "l1", name: "L1" }, { id: "l2", name: "L2" }, { id: "l3", name: "L3" }], pool: { B: 1, C: 1 } });

    const casts = legalActionsForPlayer(s, "user").filter((a) => a.kind === "cast-spell" && a.name === "Deadly Dispute");
    expect(casts.map((a) => a.sacCreatureName).sort()).toEqual(["Bear", "Mox"]); // EITHER type is a legal victim

    // Cast sacrificing the artifact.
    const after0 = dispatchAction(s, casts.find((a) => a.sacCreatureId === "art"));
    expect(after0.players.user.battlefield.find((p) => p.id === "art")).toBeUndefined(); // cost paid (artifact gone)
    expect(after0.stack.some((o) => o.kind === "spell")).toBe(true);
    const after = resolveTopOfStack(after0);
    expect(after.players.user.hand.filter((c) => /^l/.test(c.id)).length).toBe(2);          // drew two
    expect(after.players.user.battlefield.filter((p) => p.card?.name === "Treasure").length).toBe(1); // a Treasure
  });

  it("is UNCASTABLE with no artifact OR creature to sacrifice", () => {
    let s = board({ user: [], hand: [DEADLY], pool: { B: 1, C: 1 } });
    expect(legalActionsForPlayer(s, "user").some((a) => a.kind === "cast-spell" && a.name === "Deadly Dispute")).toBe(false);
  });
});

// ──────────────────────── BLOOD MONEY (BLOOD-MONEY) ────────────────────────
describe("Blood Money — destroy all creatures + a tapped Treasure per nontoken creature destroyed", () => {
  const BLOOD = { name: "Blood Money", type: "Sorcery", mana: "{5}{B}{B}", oracle: "Destroy all creatures. For each nontoken creature destroyed this way, you create a tapped Treasure token." };

  it("classifies native-spell as one mass-destroy-treasure-per-nontoken atom; AI holds it", () => {
    expect(classifyCard(BLOOD)).toBe("native-spell");
    const p = parseEffectProgram(BLOOD);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "mass-destroy-treasure-per-nontoken", targetType: "eachCreature" }]);
    expect(programContainsMassRemoval(p)).toBe(true); // a board wipe → the AI holds it
  });

  it("RUNTIME: wipes the board; one TAPPED Treasure per NONTOKEN creature destroyed (tokens don't count)", () => {
    let s = board({
      user: [cr("c1", "Nontoken1", 2, 2, "user")],
      ai: [cr("c2", "Nontoken2", 3, 3, "ai"), cr("tok", "Token", 1, 1, "ai", { token: true })],
    });
    s = ATOM_RESOLVERS["mass-destroy-treasure-per-nontoken"](s, { op: "mass-destroy-treasure-per-nontoken", targetType: "eachCreature" }, { controller: "user", cardName: "Blood Money" });
    const stillCreatures = [...s.players.user.battlefield, ...s.players.ai.battlefield].filter((p) => /Creature/.test(p.card?.type || ""));
    expect(stillCreatures.length).toBe(0);                                                // board wiped
    const treasures = s.players.user.battlefield.filter((p) => p.card?.name === "Treasure");
    expect(treasures.length).toBe(2);                                                     // 2 NONTOKEN destroyed (token excluded)
    expect(treasures.every((t) => t.tapped)).toBe(true);                                  // entered tapped
  });

  it("RUNTIME: an indestructible creature isn't destroyed → no Treasure for it", () => {
    const indes = createPermanent({ id: "ind", card: { id: "c-ind", name: "Darksteel", type: "Creature — Golem", power: 4, toughness: 4, oracle: "Indestructible" }, controller: "ai", summoningSick: false });
    let s = board({ user: [cr("c1", "Mortal", 2, 2, "user")], ai: [indes] });
    s = ATOM_RESOLVERS["mass-destroy-treasure-per-nontoken"](s, { op: "mass-destroy-treasure-per-nontoken", targetType: "eachCreature" }, { controller: "user", cardName: "Blood Money" });
    expect(s.players.ai.battlefield.find((p) => p.id === "ind")).toBeTruthy();            // indestructible survives
    expect(s.players.user.battlefield.filter((p) => p.card?.name === "Treasure").length).toBe(1); // only the 1 mortal that actually died
  });
});
