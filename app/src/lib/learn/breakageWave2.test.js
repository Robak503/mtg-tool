/**
 * BREAKAGE WAVE 2 — cards a SECOND, VARIED self-play sweep (seeded-shuffle, gamesPer>1 over the 13/15
 * training decks) surfaced as unmodeled, built CREED-clean:
 *   - Putrefy           DESTROY-UNION       ({1}{B}{G}) — destroy target ARTIFACT OR CREATURE (the
 *                                                          word-order alias of "creature or artifact"),
 *                                                          can't be regenerated
 *   - Blasphemous Act   SELF-COST-STRIP     ({8}{R})    — the cast-cost-reduction sentence is stripped so
 *                                                          the modeled mass-burn ("deals 13 damage to each
 *                                                          creature") resolves natively
 *   - Smell Fear        FIGHT-PAIR-OPTIONAL ({1}{G})    — proliferate, then "target creature you control
 *                                                          fights UP TO ONE target creature you don't
 *                                                          control" (optional enemy, mandatory fighter)
 *
 * Each: classification (native-spell) + the atom shape + a RUNTIME check through the real ATOM_RESOLVERS /
 * cast path. CREED anti-FP pins are asserted (a mis-scoped variant routes to the Arbiter; a declined
 * optional enemy is a clean no-op, never a fabricated self-fight). Ships in v0.49.0.
 */

import { beforeEach, describe, expect, it } from "vitest";

import { ATOM_RESOLVERS } from "./effects/effectAtoms.js";
import { classifyCard } from "./coverage.js";
import { parseEffectProgram, programConfidence, atomTargetIntent } from "./effects/parser.js";
import { expandCastChoices } from "./effects/targeting.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const cr = (id, name, p, t, ctrl, over = {}) =>
  createPermanent({
    id,
    card: { id: `c-${id}`, name, type: `Creature — ${over.sub || "Beast"}`, power: p, toughness: t, oracle: over.oracle || "" },
    controller: ctrl,
    summoningSick: false,
  });

function board({ user = [], ai = [], userLife = 20, aiLife = 20 } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, phase: "precombat-main", step: "main", activePlayer: "user", priorityHolder: "user", consecutivePasses: 0, turn: 1,
    players: {
      ...s.players,
      user: { ...s.players.user, battlefield: user, life: userLife },
      ai: { ...s.players.ai, battlefield: ai, life: aiLife },
    },
  };
}

// ───────────────────────────── PUTREFY (DESTROY-UNION word-order alias) ─────────────────────────────
describe("Putrefy — destroy target ARTIFACT OR CREATURE (word-order alias), can't be regenerated", () => {
  const PUTREFY = { name: "Putrefy", type: "Instant", mana: "{1}{B}{G}", oracle: "Destroy target artifact or creature. It can't be regenerated." };

  it("classifies native-spell as one destroy atom over the creatureOrArtifact union with cannotRegenerate", () => {
    expect(classifyCard(PUTREFY)).toBe("native-spell");
    const p = parseEffectProgram(PUTREFY);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creatureOrArtifact", restrictions: [], cannotRegenerate: true }]);
  });

  it("the union targetType matches BOTH printed word-orders (creature or artifact ⇔ artifact or creature)", () => {
    const reversed = parseEffectProgram({ ...PUTREFY, oracle: "Destroy target creature or artifact." });
    const forward = parseEffectProgram({ ...PUTREFY, oracle: "Destroy target artifact or creature." });
    expect(reversed.atoms[0].targetType).toBe("creatureOrArtifact");
    expect(forward.atoms[0].targetType).toBe("creatureOrArtifact");
  });

  // The cast path tags a UNION target with type "permanent" (verified via expandCastChoices — a
  // creatureOrArtifact target enumerates as { type: "permanent" } regardless of which member it is), and
  // applyDestroyEffect destroys a "permanent"-typed target. Both members are exercised below.
  it("RUNTIME: destroys a targeted CREATURE (union member, tagged 'permanent' by the cast path)", () => {
    let s = board({ ai: [cr("en", "Bear", 2, 2, "ai")] });
    s = ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "creatureOrArtifact", cannotRegenerate: true }, { controller: "user", targets: [{ type: "permanent", id: "en" }] });
    expect(s.players.ai.battlefield.find((p) => p.id === "en")).toBeUndefined();
    expect(s.players.ai.graveyard.some((c) => c.name === "Bear")).toBe(true);
  });

  it("RUNTIME: destroys a targeted ARTIFACT (the other union member)", () => {
    const art = createPermanent({ id: "art", card: { id: "c-art", name: "Mox", type: "Artifact", oracle: "" }, controller: "ai" });
    let s = board({ ai: [art] });
    s = ATOM_RESOLVERS["destroy"](s, { op: "destroy", targetType: "creatureOrArtifact", cannotRegenerate: true }, { controller: "user", targets: [{ type: "permanent", id: "art" }] });
    expect(s.players.ai.battlefield.find((p) => p.id === "art")).toBeUndefined();
    expect(s.players.ai.graveyard.some((c) => c.name === "Mox")).toBe(true);
  });

  it("CREED: the cannotRegenerate rider is stamped (a regen shield can't save the victim)", () => {
    expect(parseEffectProgram(PUTREFY).atoms[0].cannotRegenerate).toBe(true);
  });
});

// ───────────────────────────── BLASPHEMOUS ACT (SELF-COST-STRIP) ─────────────────────────────
describe("Blasphemous Act — cast-cost-reduction stripped so the mass-burn resolves natively", () => {
  const BLAST = { name: "Blasphemous Act", type: "Sorcery", mana: "{8}{R}", oracle: "This spell costs {1} less to cast for each creature on the battlefield.\nBlasphemous Act deals 13 damage to each creature." };

  it("classifies native-spell as one deal-damage 13 atom to each creature (cost line ignored for the effect)", () => {
    expect(classifyCard(BLAST)).toBe("native-spell");
    const p = parseEffectProgram(BLAST);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "deal-damage", amount: 13, targetType: "eachCreature" }]);
  });

  it("RUNTIME: deals 13 to EVERY creature on every battlefield (a board-clearing wipe)", () => {
    let s = board({
      user: [cr("a", "Small", 1, 1, "user"), cr("b", "Mid", 5, 5, "user")],
      ai: [cr("en", "Big", 12, 12, "ai")],
    });
    s = ATOM_RESOLVERS["deal-damage"](s, { op: "deal-damage", amount: 13, targetType: "eachCreature" }, { controller: "user", targets: [] });
    expect(s.players.user.battlefield.find((p) => p.id === "a")).toBeUndefined(); // 1/1 dies
    expect(s.players.user.battlefield.find((p) => p.id === "b")).toBeUndefined(); // 5/5 dies (13 ≥ 5)
    expect(s.players.ai.battlefield.find((p) => p.id === "en")).toBeUndefined();  // 12/12 dies (13 ≥ 12)
  });

  it("RUNTIME: a 14-toughness creature SURVIVES 13 damage (exact amount, not a fabricated destroy)", () => {
    let s = board({ ai: [cr("fat", "Colossus", 14, 14, "ai")] });
    s = ATOM_RESOLVERS["deal-damage"](s, { op: "deal-damage", amount: 13, targetType: "eachCreature" }, { controller: "user", targets: [] });
    expect(s.players.ai.battlefield.find((p) => p.id === "fat")).toBeTruthy(); // 13 < 14 → survives
  });

  it("the strip is GENERIC: a self-cost-reduction line never blocks an otherwise-modeled spell", () => {
    const p = parseEffectProgram({ name: "X", type: "Sorcery", mana: "{5}{R}", oracle: "This spell costs {2} less to cast. Destroy target creature." });
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([{ op: "destroy", targetType: "creature" }]);
  });

  it("CREED: an UNMODELED effect alongside a stripped cost line still routes to the Arbiter", () => {
    // "five times X damage" is unmodeled → LOW even after the cost line is gone (no false native).
    const p = parseEffectProgram({ name: "Crackle with Power", type: "Sorcery", mana: "{X}{X}{X}{R}{R}", oracle: "Crackle with Power deals five times X damage to each of up to X targets." });
    expect(programConfidence(p)).toBe("low");
  });
});

// ───────────────────────────── SMELL FEAR (FIGHT-PAIR optional enemy) ─────────────────────────────
describe("Smell Fear — proliferate, then fight UP TO ONE enemy (optional enemy, mandatory fighter)", () => {
  const SMELL = { name: "Smell Fear", type: "Sorcery", mana: "{1}{G}", oracle: "Proliferate. (Choose any number of permanents and/or players, then give each another counter of each kind already there.)\nTarget creature you control fights up to one target creature you don't control." };

  it("classifies native-spell: a proliferate atom + an OPTIONAL-target fight-pair", () => {
    expect(classifyCard(SMELL)).toBe("native-spell");
    const p = parseEffectProgram(SMELL);
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms).toEqual([
      { op: "proliferate", targetType: null },
      {
        op: "fight-pair", targetType: "creature", restrictions: [{ kind: "controller", who: "opponent" }], role: "target",
        secondaryTargetType: "creature", secondaryRestrictions: [{ kind: "controller", who: "you" }], secondaryRole: "fighter",
        optionalTarget: true,
      },
    ]);
    // fight-pair's PRIMARY chosen target is the enemy ("you don't control") and its SECONDARY is the
    // fighter ("you control"), so the atom's overall intent is "ambiguous" — identical to the non-optional
    // fight-pair (the optionalTarget flag changes castability, not target intent). Pin that parity here.
    expect(atomTargetIntent(p.atoms[1])).toBe("ambiguous");
    const nonOptional = parseEffectProgram({ ...SMELL, oracle: "Target creature you control fights target creature you don't control." });
    expect(atomTargetIntent(p.atoms[1])).toBe(atomTargetIntent(nonOptional.atoms[0]));
  });

  it("CAST ENUMERATION: with an enemy present, offers BOTH (fight it) and (decline, fighter only)", () => {
    const s = board({ user: [cr("mine", "Mine", 3, 3, "user")], ai: [cr("en", "Enemy", 2, 2, "ai")] });
    const choices = expandCastChoices(s, "user", parseEffectProgram(SMELL), ["G"]);
    // one combo fights the enemy (fighter + target), one declines (fighter only)
    const sizes = choices.map((c) => c.targets.length).sort();
    expect(sizes).toEqual([1, 2]);
    const fightCombo = choices.find((c) => c.targets.length === 2);
    expect(fightCombo.targets.find((t) => t.role === "fighter").id).toBe("mine");
    expect(fightCombo.targets.find((t) => t.role === "target").id).toBe("en");
  });

  it("CAST ENUMERATION: with NO enemy, the mandatory fighter is still enumerated (enemy declined)", () => {
    const s = board({ user: [cr("mine", "Mine", 3, 3, "user")], ai: [] });
    const choices = expandCastChoices(s, "user", parseEffectProgram(SMELL), ["G"]);
    expect(choices.length).toBe(1);
    expect(choices[0].targets.length).toBe(1);
    expect(choices[0].targets[0].role).toBe("fighter");
  });

  it("RUNTIME fight: a 3/3 fighter vs a 2/2 enemy → the 2/2 dies, the 3/3 survives", () => {
    let s = board({ user: [cr("mine", "Mine", 3, 3, "user")], ai: [cr("en", "Enemy", 2, 2, "ai")] });
    s = ATOM_RESOLVERS["fight-pair"](
      s,
      { op: "fight-pair", targetType: "creature", role: "target", secondaryRole: "fighter", optionalTarget: true },
      { controller: "user", targets: [
        { type: "creature", id: "en", controller: "ai", role: "target", atomIndex: 1 },
        { type: "creature", id: "mine", controller: "user", role: "fighter", atomIndex: 1 },
      ] },
    );
    expect(s.players.ai.battlefield.find((p) => p.id === "en")).toBeUndefined(); // 2/2 took 3 → dies
    expect(s.players.user.battlefield.find((p) => p.id === "mine")).toBeTruthy(); // 3/3 took 2 → survives
  });

  it("CREED: a declined enemy (fighter only) is a clean no-op — never a fabricated self-fight", () => {
    let s = board({ user: [cr("mine", "Mine", 3, 3, "user")], ai: [] });
    s = ATOM_RESOLVERS["fight-pair"](
      s,
      { op: "fight-pair", targetType: "creature", role: "target", secondaryRole: "fighter", optionalTarget: true },
      { controller: "user", targets: [{ type: "creature", id: "mine", controller: "user", role: "fighter", atomIndex: 1 }] },
    );
    expect(s.players.user.battlefield.find((p) => p.id === "mine")).toBeTruthy(); // unharmed (no enemy → nothing happens)
    expect(s.players.user.battlefield.find((p) => p.id === "mine").damageMarked || 0).toBe(0);
  });

  it("RUNTIME proliferate half: a creature with a +1/+1 counter gains another", () => {
    const mine = { ...cr("mine", "Mine", 1, 1, "user"), counters: { "+1/+1": 1 } };
    let s = board({ user: [mine] });
    s = ATOM_RESOLVERS["proliferate"](s, { op: "proliferate", targetType: null }, { controller: "user" });
    expect(s.players.user.battlefield.find((p) => p.id === "mine").counters["+1/+1"]).toBe(2);
  });
});
