/**
 * anyColorManaEffect.test.js — "add one mana of any color" as a SPELL/TRIGGER effect (CR 106.1b).
 * Lotus Cobra #323 is the card behind it.
 *
 * ⚠️ THIS LOOKED LIKE A ONE-DIFF AND IS NOT. `add {G}` parsed HIGH while `add one mana of any color` parsed
 * LOW, and the MANA-ABILITY side has understood that phrasing forever (Birds of Paradise is native-mana) —
 * the shape of a missing-sibling guard. But the two sides are not symmetric: a TAP source can DEFER the
 * choice (manaSources hands the planner colors:[W,U,B,R,G] and payment settles it), while a RESOLUTION-time
 * add must commit, because addMana takes one colour and the pool has no wildcard slot. The regex was the
 * easy half; the COLOUR CHOICE is a modelling decision.
 *
 * THE RULE CHOSEN, and why it is safe: the colour comes from the controller's COMMANDER COLOUR IDENTITY
 * (CR 903.4 — the deck's usable colours, the closest honest proxy for what a player would pick), falling
 * back to the SOURCE permanent's own colours. The AMOUNT is exact, so a suboptimal pick can only ever be a
 * play-QUALITY loss — never more mana than printed, which is what makes this modellable at all.
 *
 * ⭐ N=1 ONLY, deliberately. "add TWO mana of any ONE color" is a different promise and "add two mana of any
 * color" lets the two DIFFER; collapsing either to one colour would silently narrow the player's options.
 * At N=1 the two templatings mean the same thing. The corpus prints the N=1 form 615 times against 35/29/23
 * for the multi forms — most of the value, none of the guessing.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { parseEffectClause } from "./effects/parser.js";
import { checkLandfallTriggers } from "./triggers.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { classifyCard } from "./coverage.js";

beforeEach(() => _resetIdsForTests());

const COBRA = {
  id: "lc", name: "Lotus Cobra", type: "Creature — Snake", mana: "{1}{G}", power: 2, toughness: 1,
  colors: ["G"],
  oracle: "Landfall — Whenever a land you control enters, add one mana of any color.",
};
const greenCommander = { id: "cm", name: "Green Cmdr", type: "Legendary Creature — Elf", power: 3, toughness: 3, oracle: "", colorIdentity: ["G"] };
const blueCommander = { id: "cm", name: "Blue Cmdr", type: "Legendary Creature — Merfolk", power: 3, toughness: 3, oracle: "", colorIdentity: ["U"] };

function landfall(sourceCard, command) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  let st = { ...s, players: { ...s.players, user: { ...s.players.user, battlefield: [createPermanent({ id: "lc", card: sourceCard, controller: "user" })], command } } };
  const land = createPermanent({ id: "f1", card: { id: "f1", name: "Forest", type: "Basic Land — Forest", oracle: "" }, controller: "user" });
  st = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [...st.players.user.battlefield, land] } } };
  st = checkLandfallTriggers(st, land);
  st = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
  let guard = 0;
  while ((st.stack || []).length && guard++ < 20) st = resolveTopOfStack(st);
  return st.players.user.manaPool;
}
const total = (pool) => Object.values(pool).reduce((a, b) => a + b, 0);

describe("parsing", () => {
  it("the N=1 form parses HIGH as an anyColor add", () => {
    const p = parseEffectClause("add one mana of any color", "Creature", { hasX: false });
    expect(p.confidence).toBe("high");
    expect(p.atoms).toEqual([{ op: "add-mana", anyColor: 1, targetType: null }]);
  });

  it("\"any one color\" at N=1 is the same promise", () => {
    expect(parseEffectClause("add one mana of any one color", "Creature", { hasX: false }).atoms[0]).toMatchObject({ anyColor: 1 });
  });

  it("Lotus Cobra #323 classifies native", () => {
    expect(classifyCard(COBRA)).toBe("native-trigger");
  });

  it("⭐ CREED — the MULTI forms stay LOW (a different promise, not a wider regex)", () => {
    expect(parseEffectClause("add two mana of any one color", "Creature", { hasX: false }).confidence).toBe("low");
    expect(parseEffectClause("add two mana of any color", "Creature", { hasX: false }).confidence).toBe("low");
    expect(parseEffectClause("add three mana of any one color", "Creature", { hasX: false }).confidence).toBe("low");
  });

  it("the fixed-symbol ritual arm is untouched", () => {
    expect(parseEffectClause("add {G}", "Creature", { hasX: false }).atoms[0]).toMatchObject({ op: "add-mana", mana: { G: 1 } });
  });
});

describe("⭐ RUNTIME — exactly one mana, in a colour the deck can use", () => {
  it("a GREEN commander yields {G}", () => {
    const pool = landfall(COBRA, [greenCommander]);
    expect(pool.G).toBe(1);
    expect(total(pool)).toBe(1);
  });

  it("⭐ a BLUE commander yields {U} — the identity drives it, not the source's colour", () => {
    const pool = landfall(COBRA, [blueCommander]);
    expect(pool.U).toBe(1);
    expect(total(pool)).toBe(1);
  });

  it("⭐ THE FALLBACK IS LIVE, not a dead branch — no commander falls back to the SOURCE's colour", () => {
    // Verified against the real card, which carries colors:["G"]. A fixture without a `colors` field would
    // make this branch look dead and the whole effect look broken.
    const pool = landfall(COBRA, []);
    expect(pool.G).toBe(1);
    expect(total(pool)).toBe(1);
  });

  it("⭐ CREED — nothing determinable adds NOTHING, never a guessed colour", () => {
    const colorless = { ...COBRA, colors: [], mana: "{2}" };
    expect(total(landfall(colorless, []))).toBe(0);
  });

  it("⭐ the AMOUNT is exact — one mana, never five", () => {
    // Crediting "any color" as all five colours would be the FP direction; the pool must hold exactly one.
    expect(total(landfall(COBRA, [greenCommander]))).toBe(1);
  });
});
