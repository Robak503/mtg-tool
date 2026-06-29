/**
 * interveningIf.test.js — the general board-query intervening-if subsystem (CR 603.4).
 *
 * A strict evaluator (interveningIf.js) reads the controller's-board conditions the corpus's conditional
 * triggers most often gate on ("if you control an artifact", "if you control two or more Gates", "if there
 * are three or more creature cards in your graveyard", …). gameEngine.buildTriggerStack evaluates it at
 * flush (drop if false) and resolvers re-check at resolution (CR 603.4). 40 permanents flip body-only →
 * native (incl. the layer-aware "you control a creature with power N or greater" query — Colossal Majesty,
 * Garruk's Uprising, Beastbond Outcaster). A designation that isn't a card type ("you control a commander"),
 * a power NEAR-MISS ("power N or less", toughness), and turn-event / state-flag conditions stay on the
 * Arbiter (false-negative SAFE — a mis-evaluation is a forbidden FP).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { evaluateInterveningIf, interveningIfParseable } from "./interveningIf.js";
import { classifyCard } from "./coverage.js";
import { createGameState, createPermanent, _resetIdsForTests } from "./gameState.js";
import { flushTriggers, resolveTopOfStack, chooseTriggerTargets } from "./gameEngine.js";

beforeEach(() => _resetIdsForTests());

const C = (name, oracle, type = "Creature") => ({ name, oracle, type, keywords: [], mana: "" });
const perm = (id, type, over = {}) => createPermanent({ id, card: { id, name: id, type }, controller: "user", ...over });
function withBoard(battlefield, graveyard = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: { ...s.players, user: { ...s.players.user, battlefield, graveyard } } };
}

// ─── 1. Evaluator correctness ─────────────────────────────────────────────────────
describe("evaluateInterveningIf — board queries", () => {
  it("'you control a/an <type>' counts ≥1", () => {
    expect(evaluateInterveningIf(withBoard([]), "you control an artifact", "user")).toBe(false);
    expect(evaluateInterveningIf(withBoard([perm("a", "Artifact")]), "you control an artifact", "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard([perm("i", "Basic Land — Island")]), "you control an Island", "user")).toBe(true);
  });
  it("'you control <N> or more <type/subtype>' counts ≥N (spelled cardinals + singularize)", () => {
    const board = [perm("g1", "Land — Gate"), perm("g2", "Land — Gate")];
    expect(evaluateInterveningIf(withBoard(board), "you control two or more Gates", "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard(board), "you control three or more Gates", "user")).toBe(false);
    const creatures = [perm("c1", "Creature — Elf"), perm("c2", "Creature — Elf"), perm("c3", "Creature — Elf")];
    expect(evaluateInterveningIf(withBoard(creatures), "you control three or more creatures", "user")).toBe(true);
  });
  it("tapped/untapped state filters", () => {
    const board = [perm("t1", "Creature — Bear", { tapped: true }), perm("u1", "Creature — Bear", { tapped: false })];
    expect(evaluateInterveningIf(withBoard(board), "you control a tapped creature", "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard(board), "you control two or more tapped creatures", "user")).toBe(false);
    const lands = [perm("l1", "Basic Land — Forest", { tapped: false })];
    expect(evaluateInterveningIf(withBoard(lands), "you control no untapped lands", "user")).toBe(false); // has 1 untapped
    expect(evaluateInterveningIf(withBoard([perm("l2", "Basic Land — Forest", { tapped: true })]), "you control no untapped lands", "user")).toBe(true);
  });
  it("token filter + 'no <type>'", () => {
    const tok = createPermanent({ id: "tk", card: { id: "tk", name: "Soldier", type: "Creature — Soldier", token: true }, controller: "user" });
    expect(evaluateInterveningIf(withBoard([tok, tok, tok]), "you control three or more tokens", "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard([perm("s", "Creature — Snake")]), "you control no Snakes", "user")).toBe(false);
    expect(evaluateInterveningIf(withBoard([]), "you control no Snakes", "user")).toBe(true);
  });
  it("graveyard card counts", () => {
    const gy = [{ id: "d1", name: "Bear", type: "Creature — Bear" }, { id: "d2", name: "Elk", type: "Creature — Elk" }, { id: "d3", name: "Wolf", type: "Creature — Wolf" }];
    expect(evaluateInterveningIf(withBoard([], gy), "there are three or more creature cards in your graveyard", "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard([], gy), "you have four or more creature cards in your graveyard", "user")).toBe(false);
  });
  it("'permanents' counts ALL battlefield permanents", () => {
    const board = [perm("a", "Artifact"), perm("c", "Creature — Bear"), perm("e", "Enchantment")];
    expect(evaluateInterveningIf(withBoard(board), "you control three or more permanents", "user")).toBe(true);
  });
  it("'you control a creature with power N or greater' — LAYER-AWARE power query", () => {
    const big = createPermanent({ id: "big", card: { id: "big", name: "Dino", type: "Creature — Dinosaur", power: "5", toughness: "5" }, controller: "user" });
    const small = createPermanent({ id: "sm", card: { id: "sm", name: "Bird", type: "Creature — Bird", power: "2", toughness: "2" }, controller: "user" });
    const exactly4 = createPermanent({ id: "e4", card: { id: "e4", name: "Elk", type: "Creature — Elk", power: "4", toughness: "4" }, controller: "user" });
    const COND = "you control a creature with power 4 or greater";
    expect(evaluateInterveningIf(withBoard([]), COND, "user")).toBe(false);          // empty board
    expect(evaluateInterveningIf(withBoard([small]), COND, "user")).toBe(false);      // 2/2 only
    expect(evaluateInterveningIf(withBoard([exactly4]), COND, "user")).toBe(true);    // ≥ is inclusive
    expect(evaluateInterveningIf(withBoard([big]), COND, "user")).toBe(true);
    expect(evaluateInterveningIf(withBoard([perm("art", "Artifact")]), COND, "user")).toBe(false); // non-creature
    // LAYER-AWARE: a 3/3 with two +1/+1 counters is power 5 → meets a power-4 gate (counters count, CR 613).
    // createPermanent always inits counters:{}, so set them after (mirrors how the engine mutates counters).
    const counterPumped = createPermanent({ id: "cp", card: { id: "cp", name: "Elf", type: "Creature — Elf", power: "3", toughness: "3" }, controller: "user" });
    counterPumped.counters = { "+1/+1": 2 };
    expect(evaluateInterveningIf(withBoard([counterPumped]), COND, "user")).toBe(true);
    // a higher threshold reads the actual number (not hardcoded 4)
    expect(evaluateInterveningIf(withBoard([big]), "you control a creature with power 7 or greater", "user")).toBe(false); // 5 < 7
  });
});

describe("evaluateInterveningIf — strict null for unmodeled conditions (CREED)", () => {
  it("turn-event / state-flag / designation conditions return null (Arbiter)", () => {
    expect(evaluateInterveningIf(withBoard([]), "a creature died this turn", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you gained 3 or more life this turn", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you're the monarch", "user")).toBe(null);
    // POWER near-misses stay null (only "power N or greater/more" is modeled — CREED)
    expect(evaluateInterveningIf(withBoard([]), "you control a creature with power 4 or less", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you control a creature with toughness 4 or greater", "user")).toBe(null);
    // a DESIGNATION read as a type would silently count 0 → must be rejected as unparseable
    expect(evaluateInterveningIf(withBoard([]), "you control a commander", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you control a blue permanent", "user")).toBe(null);
  });
  it("a missing controller → false (condition unmet, never a throw)", () => {
    expect(evaluateInterveningIf(withBoard([]), "you control an artifact", "ghost")).toBe(false);
  });
});

describe("interveningIfParseable — shape gate", () => {
  it("true for board queries, false for unmodeled shapes", () => {
    for (const c of ["you control an artifact", "you control two or more Gates", "you control no untapped lands",
      "you control three or more tokens", "there are three or more creature cards in your graveyard",
      "you control a creature with power 4 or greater", "you control two or more creatures with power 5 or more"]) {
      expect(interveningIfParseable(c)).toBe(true);
    }
    for (const c of ["a creature died this turn", "you control a commander", "you control a blue permanent",
      "you control a creature with power 4 or less", "you control a creature with toughness 4 or greater",
      "you're the monarch"]) {
      expect(interveningIfParseable(c)).toBe(false);
    }
  });
});

// ─── 2. Coverage flips ────────────────────────────────────────────────────────────
describe("intervening-if — coverage: conditional triggers flip native-trigger", () => {
  it("ETB conditional draw / lifegain / counter → native-trigger", () => {
    expect(classifyCard(C("Scholar of Stars", "When this creature enters, if you control an artifact, draw a card.", "Creature — Vedalken Wizard"))).toBe("native-trigger");
    expect(classifyCard(C("Saruli Gatekeepers", "When this creature enters, if you control two or more Gates, you gain 6 life.", "Creature — Elf Warrior"))).toBe("native-trigger");
    expect(classifyCard(C("Dundoolin Weaver", "When this creature enters, if you control three or more creatures, draw a card.", "Creature — Human"))).toBe("native-trigger");
  });
  it("end-step / graveyard-count conditional → native-trigger", () => {
    expect(classifyCard(C("Gixian Skullflayer", "At the beginning of your end step, if there are three or more creature cards in your graveyard, put a +1/+1 counter on this creature.", "Creature — Phyrexian"))).toBe("native-trigger");
  });
  it("power-qualified intervening-if → native-trigger (Colossal Majesty et al)", () => {
    // a real card: Colossal Majesty — upkeep conditional draw gated on a power-4 creature
    expect(classifyCard(C("Colossal Majesty", "At the beginning of your upkeep, if you control a creature with power 4 or greater, draw a card.", "Enchantment"))).toBe("native-trigger");
    // attack-trigger self-pump gated on the power query (Stampede Rider / Ornery Dilophosaur shape)
    expect(classifyCard(C("Power Pumper", "Whenever this creature attacks, if you control a creature with power 4 or greater, this creature gets +2/+2 until end of turn.", "Creature — Beast"))).toBe("native-trigger");
  });
});

describe("intervening-if — CREED: unparseable conditions stay body-only", () => {
  it("turn-event / designation conditions stay non-native", () => {
    expect(classifyCard(C("Turn Event", "When this creature enters, if a creature died this turn, draw a card."))).not.toMatch(/^native/);
    expect(classifyCard(C("Cmdr", "When this creature enters, if you control a commander, draw a card."))).not.toMatch(/^native/);
  });
  it("a power-qualified NEAR-MISS (power N or less / toughness) stays body-only — no partial flip", () => {
    // "power N or less" is NOT modeled (only "or greater/more") — the trigger must NOT route → body-only
    expect(classifyCard(C("Power Less Query", "When this creature enters, if you control a creature with power 4 or less, draw a card."))).not.toMatch(/^native/);
    expect(classifyCard(C("Toughness Query", "When this creature enters, if you control a creature with toughness 4 or greater, draw a card."))).not.toMatch(/^native/);
  });
});

// ─── 3. Runtime gate (CR 603.4 flush + resolution) ─────────────────────────────────
describe("intervening-if — runtime: condition gates the trigger (CR 603.4)", () => {
  function runConditionalDraw({ board, condition = "you control an artifact" }) {
    let st = createGameState({ userDeck: [], aiDeck: [] });
    const lib = [{ id: "topcard", name: "Forest", type: "Basic Land — Forest" }];
    st = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: board, library: lib, hand: [] } } };
    st = { ...st, pendingTriggers: [{
      event: "etb", source: { name: "Scholar of Stars", permanentId: "src" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "draw a card", interveningIf: condition },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    return out.players.user.hand.length;
  }
  it("condition MET (control an artifact) → the trigger fires (draws)", () => {
    expect(runConditionalDraw({ board: [perm("clue", "Artifact")] })).toBe(1);
  });
  it("condition NOT met (no artifact) → the trigger never goes on the stack (no draw)", () => {
    expect(runConditionalDraw({ board: [] })).toBe(0);
  });
  it("POWER condition MET (a power-5 creature) → fires (draws)", () => {
    const big = perm("big", "Creature — Dinosaur", { card: { id: "big", name: "Dino", type: "Creature — Dinosaur", power: "5", toughness: "5" } });
    expect(runConditionalDraw({ board: [big], condition: "you control a creature with power 4 or greater" })).toBe(1);
  });
  it("POWER condition NOT met (only a 2/2) → never goes on the stack (no draw)", () => {
    const small = perm("sm", "Creature — Bird", { card: { id: "sm", name: "Bird", type: "Creature — Bird", power: "2", toughness: "2" } });
    expect(runConditionalDraw({ board: [small], condition: "you control a creature with power 4 or greater" })).toBe(0);
  });
});
