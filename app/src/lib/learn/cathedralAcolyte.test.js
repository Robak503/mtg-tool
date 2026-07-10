/**
 * cathedralAcolyte.test.js — Cathedral Acolyte (SHELF S7): counter-gated GROUP WARD GRANT + the
 * entered-this-turn counter target.
 *
 *   1. "Each creature you control with a counter on it has ward {1}." → a layer-6 addWard grant over the
 *      ANY-counter dynamic selector (requiresAnyCounter); permanentGrantedWardCosts reads it live and
 *      ward.wardTaxForStackObject UNIONS it with printed ward — so the grant taxes real targeting spells,
 *      not just the classifier.
 *   2. "{T}: Put a +1/+1 counter on target creature that entered this turn." → the chosen-creature atom
 *      with the enteredThisTurn restriction (perm.enteredOnTurn === state.turn).
 * CREED FP = taxing a counter-less creature, a stale grant after the counter leaves, or offering a
 * creature that entered LAST turn.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { _resetIdsForTests, createGameState, createPermanent, addCounter } from "./gameState.js";
import { parseStaticAbilities } from "./staticAbilityParser.js";
import { permanentGrantedWardCosts } from "./layers.js";
import { wardTaxForStackObject } from "./ward.js";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { enumerateTargets } from "./spellEffects.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

// Real oracle text (bundled Scryfall data — never from memory).
const ACOLYTE_ORACLE =
  "Each creature you control with a counter on it has ward {1}. (Whenever it becomes the target of a spell or ability an opponent controls, counter it unless that player pays {1}.)\n{T}: Put a +1/+1 counter on target creature that entered this turn.";
const acolyteCard = (id = "ca-card") => ({
  id, name: "Cathedral Acolyte", type: "Creature — Human Cleric", power: "1", toughness: "2", mana: "{1}{W}", oracle: ACOLYTE_ORACLE,
});

function baseState(over = {}) {
  const s = createGameState({ mode: "commander", userDeck: [], opponentDecks: [[], [], []] });
  return { ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main", ...over };
}
function withBattlefield(state, pid, perms) {
  return { ...state, players: { ...state.players, [pid]: { ...state.players[pid], battlefield: perms } } };
}
const creature = (id, controller) =>
  createPermanent({ id, card: { name: id, type: "Creature — Soldier", power: "2", toughness: "2", oracle: "" }, controller });

describe("parse + classify", () => {
  it("the ward grant parses to the layer-6 addWard descriptor; the activated parses with the restriction; Acolyte → native-mixed", () => {
    const [d] = parseStaticAbilities(acolyteCard());
    expect(d).toMatchObject({
      layer: 6, op: { layerOp: "addWard", generic: 1 },
      affects: { mode: "dynamic", selector: { controllerScope: "you", cardTypes: ["Creature"], requiresAnyCounter: true } },
    });
    const p = parseEffectClause("put a +1/+1 counter on target creature that entered this turn", "Instant");
    expect(programConfidence(p)).toBe("high");
    expect(p.atoms[0]).toMatchObject({ op: "add-counter", targetType: "creature", restrictions: [{ kind: "enteredThisTurn" }] });
    expect(classifyCard(acolyteCard())).toBe("native-mixed");
  });
});

describe("granted ward is ENFORCED (CREED core)", () => {
  function board() {
    let s = baseState();
    s = withBattlefield(s, "user", [
      createPermanent({ id: "ca", card: acolyteCard(), controller: "user" }),
      creature("c1", "user"),
      creature("c2", "user"),
    ]);
    s = addCounter(s, { permanentId: "c1", type: "charge", amount: 1 }); // ANY counter kind gates the grant
    return s;
  }

  it("a countered creature carries the granted ward {1}; a counter-less one doesn't; the grant tracks live", () => {
    const s = board();
    expect(permanentGrantedWardCosts(s, "c1")).toEqual([{ generic: 1 }]);
    expect(permanentGrantedWardCosts(s, "c2")).toEqual([]);
  });

  it("an opponent's spell targeting the countered creature is ward-taxed {1}; the counter-less one is not", () => {
    const s = board();
    const spellOn = (id) => ({ kind: "spell", controller: "ai1", targets: [{ type: "creature", id }] });
    const tax = wardTaxForStackObject(s, spellOn("c1"));
    expect(tax).toMatchObject({ cost: { kind: "mana", mana: { generic: 1 } } });
    expect(wardTaxForStackObject(s, spellOn("c2"))).toBeNull();
    // the CONTROLLER's own spell is never taxed (ward fires on opponents' spells only, CR 702.21a)
    expect(wardTaxForStackObject(s, { kind: "spell", controller: "user", targets: [{ type: "creature", id: "c1" }] })).toBeNull();
  });
});

describe("entered-this-turn targeting (CREED core)", () => {
  it("offers ONLY creatures whose enteredOnTurn is the CURRENT turn", () => {
    let s = baseState();
    const fresh = { ...creature("fresh", "user"), enteredOnTurn: 5 };
    const stale = { ...creature("stale", "user"), enteredOnTurn: 4 };
    const oppFresh = { ...creature("of", "ai1"), enteredOnTurn: 5 };
    s = { ...withBattlefield(withBattlefield(s, "user", [fresh, stale]), "ai1", [oppFresh]), turn: 5 };
    const targets = enumerateTargets(s, "user", { kind: "damage", targetType: "creature", restrictions: [{ kind: "enteredThisTurn" }] });
    expect(targets.map((t) => t.id).sort()).toEqual(["fresh", "of"]); // any controller; stale excluded
  });
});
