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
    // NOTE: "a creature died this turn" is now MODELED (DEATHS-THIS-TURN) — covered in its own block below.
    expect(evaluateInterveningIf(withBoard([]), "you gained 3 or more life this turn", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "a Zubera died this turn", "user")).toBe(null); // subtype-scoped death stays Arbiter (CREED)
    expect(evaluateInterveningIf(withBoard([]), "you're the monarch", "user")).toBe(null);
    // POWER near-misses stay null (only "power N or greater/more" is modeled — CREED)
    expect(evaluateInterveningIf(withBoard([]), "you control a creature with power 4 or less", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you control a creature with toughness 4 or greater", "user")).toBe(null);
    // a DESIGNATION read as a type would silently count 0 → must be rejected as unparseable
    expect(evaluateInterveningIf(withBoard([]), "you control a commander", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "you control a blue permanent", "user")).toBe(null);
    // a MALFORMED life phrase (no number, or a per-opponent variant) stays null (only "you have N or less/more
    // life" is modeled — a "that player has N … life" / bare "you have life" is out of vocabulary, CREED)
    expect(evaluateInterveningIf(withBoard([]), "you have life", "user")).toBe(null);
    expect(evaluateInterveningIf(withBoard([]), "that player has 5 or less life", "user")).toBe(null);
  });
  it("a missing controller → false (condition unmet, never a throw)", () => {
    expect(evaluateInterveningIf(withBoard([]), "you control an artifact", "ghost")).toBe(false);
  });
});

describe("interveningIfParseable — shape gate", () => {
  it("true for board queries, false for unmodeled shapes", () => {
    for (const c of ["you control an artifact", "you control two or more Gates", "you control no untapped lands",
      "you control three or more tokens", "there are three or more creature cards in your graveyard",
      "you control a creature with power 4 or greater", "you control two or more creatures with power 5 or more",
      "you have 5 or less life", "you have 10 or less life", "you have 25 or more life"]) {
      expect(interveningIfParseable(c)).toBe(true);
    }
    for (const c of ["you control a commander", "you control a blue permanent",
      "you control a creature with power 4 or less", "you control a creature with toughness 4 or greater",
      "a Zubera died this turn", "you're the monarch"]) {
      expect(interveningIfParseable(c)).toBe(false);
    }
    // DEATHS-THIS-TURN now parseable (modeled):
    for (const c of ["a creature died this turn", "three or more creatures died this turn"]) {
      expect(interveningIfParseable(c)).toBe(true);
    }
  });
});

// ─── 1b. OPPONENT-COMPARISON + CONTROL-ANOTHER-SUBTYPE (new families) ────────────────
// A 2-player state where the OPPONENT (ai) board/life/hand can be set independently of the controller's.
function withOpp({ user = {}, ai = {} } = {}) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return { ...s, players: {
    ...s.players,
    user: { ...s.players.user, battlefield: [], graveyard: [], hand: [], ...user },
    ai: { ...s.players.ai, battlefield: [], graveyard: [], hand: [], ...ai },
  } };
}
const card = (id, type, over = {}) => ({ id, name: id, type, ...over });
const oppPerm = (id, type) => createPermanent({ id, card: card(id, type), controller: "ai" });
// the entering (triggering) permanent, controlled by the user — for the "another <subtype>" self-exclusion
const enterPerm = (id, type) => createPermanent({ id, card: card(id, type), controller: "user" });

describe("evaluateInterveningIf — opponent-comparison (an opponent <X> more than you)", () => {
  it("'controls more lands than you' — true only when an opponent strictly leads", () => {
    const COND = "an opponent controls more lands than you";
    // you: 2 lands, opp: 3 lands → opp leads → true
    expect(evaluateInterveningIf(withOpp({
      user: { battlefield: [perm("ul1", "Basic Land — Forest"), perm("ul2", "Basic Land — Forest")] },
      ai: { battlefield: [oppPerm("al1", "Basic Land — Island"), oppPerm("al2", "Basic Land — Island"), oppPerm("al3", "Basic Land — Island")] },
    }), COND, "user")).toBe(true);
    // tie (2 vs 2) is NOT "more" → false (strict >)
    expect(evaluateInterveningIf(withOpp({
      user: { battlefield: [perm("ul1", "Basic Land — Forest"), perm("ul2", "Basic Land — Forest")] },
      ai: { battlefield: [oppPerm("al1", "Basic Land — Island"), oppPerm("al2", "Basic Land — Island")] },
    }), COND, "user")).toBe(false);
    // you ahead → false
    expect(evaluateInterveningIf(withOpp({
      user: { battlefield: [perm("ul1", "Basic Land — Forest"), perm("ul2", "Basic Land — Forest")] },
      ai: { battlefield: [oppPerm("al1", "Basic Land — Island")] },
    }), COND, "user")).toBe(false);
  });
  it("'has more life / cards in hand than you'", () => {
    expect(evaluateInterveningIf(withOpp({ user: { life: 20 }, ai: { life: 25 } }), "an opponent has more life than you", "user")).toBe(true);
    expect(evaluateInterveningIf(withOpp({ user: { life: 25 }, ai: { life: 20 } }), "an opponent has more life than you", "user")).toBe(false);
    expect(evaluateInterveningIf(withOpp({ user: { hand: [card("h1", "X")] }, ai: { hand: [card("a1", "X"), card("a2", "X")] } }), "an opponent has more cards in hand than you", "user")).toBe(true);
  });
  it("'you have N or {less|fewer|more} life' — controller's own life vs a fixed threshold", () => {
    // "or less"/"or fewer" → life ≤ N (inclusive). Convalescent Care "5 or less", Convalescence "10 or less".
    expect(evaluateInterveningIf(withOpp({ user: { life: 5 } }), "you have 5 or less life", "user")).toBe(true);
    expect(evaluateInterveningIf(withOpp({ user: { life: 4 } }), "you have 5 or less life", "user")).toBe(true);
    expect(evaluateInterveningIf(withOpp({ user: { life: 6 } }), "you have 5 or less life", "user")).toBe(false);
    expect(evaluateInterveningIf(withOpp({ user: { life: 10 } }), "you have 10 or less life", "user")).toBe(true);
    expect(evaluateInterveningIf(withOpp({ user: { life: 11 } }), "you have 10 or less life", "user")).toBe(false);
    expect(evaluateInterveningIf(withOpp({ user: { life: 4 } }), "you have 5 or fewer life", "user")).toBe(true);
    // "or more" → life ≥ N (inclusive)
    expect(evaluateInterveningIf(withOpp({ user: { life: 25 } }), "you have 25 or more life", "user")).toBe(true);
    expect(evaluateInterveningIf(withOpp({ user: { life: 24 } }), "you have 25 or more life", "user")).toBe(false);
  });
  it("'controls more creatures than you' counts only creatures (a Land doesn't inflate)", () => {
    const COND = "an opponent controls more creatures than you";
    expect(evaluateInterveningIf(withOpp({
      user: { battlefield: [perm("uc", "Creature — Bear")] },
      ai: { battlefield: [oppPerm("ac1", "Creature — Goblin"), oppPerm("aland", "Basic Land — Island")] },
    }), COND, "user")).toBe(false); // 1 vs 1 creature (the land doesn't count) → not more
  });
});

describe("evaluateInterveningIf — control-another-subtype (CR 113.7 + 205.3m)", () => {
  const ENTER = "__entering__";
  // a board carrying the entering permanent + extra creatures; ctx threads the entering id (like SAME-NAME ETB)
  const ctx = { triggeringPermanentId: ENTER };
  it("true only when ANOTHER (non-entering) creature of that subtype is controlled", () => {
    const entering = enterPerm(ENTER, "Creature — Elf Warrior");
    // only the entering Elf → "another Elf" is FALSE (CR 113.7 — itself doesn't count)
    expect(evaluateInterveningIf(withBoard([entering]), "you control another Elf", "user", ctx)).toBe(false);
    // a second Elf present → TRUE
    const otherElf = perm("e2", "Creature — Elf");
    expect(evaluateInterveningIf(withBoard([entering, otherElf]), "you control another Elf", "user", ctx)).toBe(true);
    // a Goblin doesn't satisfy "another Elf"
    expect(evaluateInterveningIf(withBoard([entering, perm("g", "Creature — Goblin")]), "you control another Elf", "user", ctx)).toBe(false);
  });
  it("a non-creature permanent sharing the subtype word does NOT count (must be a creature)", () => {
    const entering = enterPerm(ENTER, "Creature — Spirit");
    // an enchantment "Spirit" (rare) isn't "another Spirit" creature
    expect(evaluateInterveningIf(withBoard([entering, perm("ench", "Enchantment — Spirit")]), "you control another Spirit", "user", ctx)).toBe(false);
  });
  it("a non-curated subtype word ('outlaw' is a designation, not a creature type) → null (Arbiter, CREED)", () => {
    const entering = enterPerm(ENTER, "Creature — Human Mercenary");
    expect(evaluateInterveningIf(withBoard([entering]), "you control another outlaw", "user", ctx)).toBe(null);
  });
  it("no entering permanent in context → null (can't confirm 'another', FN-safe)", () => {
    expect(evaluateInterveningIf(withBoard([perm("e", "Creature — Elf")]), "you control another Elf", "user")).toBe(null);
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
  it("DEATHS-THIS-TURN intervening-if → native-trigger (Twinblade Assassins shape)", () => {
    // Twinblade Assassins — end-step conditional draw gated on "a creature died this turn"
    expect(classifyCard(C("Twinblade Assassins", "At the beginning of your end step, if a creature died this turn, draw a card.", "Creature — Elf Assassin"))).toBe("native-trigger");
    // ETB conditional draw gated on the death condition (the deferred plot.test / Turn Event shape, now modeled)
    expect(classifyCard(C("Turn Event", "When this creature enters, if a creature died this turn, draw a card."))).toBe("native-trigger");
    // the cardinal-threshold LEADING-if form ("if three or more creatures died this turn, …")
    expect(classifyCard(C("Threshold Draw", "At the beginning of your end step, if three or more creatures died this turn, draw a card."))).toBe("native-trigger");
  });
  it("CONTROLLER-LIFE-THRESHOLD upkeep conditional → native-trigger (Convalescent Care, Convalescence)", () => {
    // real cards: low-on-life payoffs gated on "you have N or less life" + a modeled effect (gain life / draw).
    expect(classifyCard(C("Convalescent Care", "At the beginning of your upkeep, if you have 5 or less life, you gain 3 life and draw a card.", "Enchantment"))).toBe("native-trigger");
    expect(classifyCard(C("Convalescence", "At the beginning of your upkeep, if you have 10 or less life, you gain 1 life.", "Enchantment"))).toBe("native-trigger");
  });
});

describe("intervening-if — CREED: unparseable conditions stay body-only", () => {
  it("turn-event / designation conditions stay non-native", () => {
    // a NON-death turn event ("you gained life this turn") is still unmodeled → body-only
    expect(classifyCard(C("Lifegain Event", "When this creature enters, if you gained life this turn, draw a card."))).not.toMatch(/^native/);
    // a subtype-scoped death ("a Zubera died this turn") stays Arbiter (CREED — never a mis-scoped death count)
    expect(classifyCard(C("Zubera Event", "When this creature enters, if a Zubera died this turn, draw a card."))).not.toMatch(/^native/);
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
  // CONTROLLER-LIFE-THRESHOLD runtime (Convalescent Care): the upkeep gain-life trigger fires only when life ≤ N.
  function runLifeGatedGain({ life, condition = "you have 5 or less life" }) {
    let st = createGameState({ userDeck: [], aiDeck: [] });
    st = { ...st, players: { ...st.players, user: { ...st.players.user, battlefield: [], hand: [], life } } };
    st = { ...st, pendingTriggers: [{
      event: "upkeep", source: { name: "Convalescence", permanentId: "src" }, controller: "user",
      descriptor: { event: "upkeep", scope: "you", whose: "yours", effectClause: "you gain 1 life", interveningIf: condition },
      context: {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    return out.players.user.life;
  }
  it("life-threshold MET (life ≤ 5) → the upkeep gain fires (5 → 6)", () => {
    expect(runLifeGatedGain({ life: 5 })).toBe(6);
  });
  it("life-threshold NOT met (life > 5) → never goes on the stack (20 stays 20)", () => {
    expect(runLifeGatedGain({ life: 20 })).toBe(20);
  });
});

// ─── 4. New families: coverage flips + runtime firing ───────────────────────────────
describe("opponent-comparison + control-another-subtype — coverage: real cards flip native-trigger", () => {
  it("control-another-subtype ETB → native-trigger (Dwynen's Elite / Ghitu Journeymage / Apothecary Geist / Resistance Squad)", () => {
    expect(classifyCard(C("Dwynen's Elite", "When this creature enters, if you control another Elf, create a 1/1 green Elf Warrior creature token.", "Creature — Elf Warrior"))).toBe("native-trigger");
    expect(classifyCard(C("Ghitu Journeymage", "When this creature enters, if you control another Wizard, this creature deals 2 damage to each opponent.", "Creature — Human Wizard"))).toBe("native-trigger");
    expect(classifyCard(C("Apothecary Geist", "Flying\nWhen this creature enters, if you control another Spirit, you gain 3 life.", "Creature — Spirit"))).toBe("native-trigger");
    expect(classifyCard(C("Resistance Squad", "When this creature enters, if you control another Human, draw a card.", "Creature — Human Soldier"))).toBe("native-trigger");
  });
  it("opponent-comparison ETB → native-trigger (Loyal Warhound / Ticket Tortoise)", () => {
    expect(classifyCard(C("Loyal Warhound", "Vigilance\nWhen this creature enters, if an opponent controls more lands than you, search your library for a basic Plains card, put it onto the battlefield tapped, then shuffle.", "Creature — Dog"))).toBe("native-trigger");
    expect(classifyCard(C("Ticket Tortoise", "Defender\nWhen this creature enters, if an opponent controls more lands than you, you create a Treasure token.", "Artifact Creature — Turtle"))).toBe("native-trigger");
  });
  it("CREED: a non-curated subtype ('another outlaw') or untracked metric stays body-only", () => {
    expect(classifyCard(C("Mine Raider", "When this creature enters, if you control another outlaw, create a Treasure token.", "Creature — Human Rogue"))).not.toMatch(/^native/);
    expect(classifyCard(C("Spell Counter", "When this creature enters, if an opponent controls more spells than you, draw a card.", "Creature — Bird"))).not.toMatch(/^native/);
  });
});

describe("opponent-comparison + control-another-subtype — runtime gates the trigger (CR 603.4)", () => {
  // Drive a real conditional ETB end-to-end with an opponent board, asserting the draw fires only when met.
  function runConditional({ condition, userBoard = [], aiBoard = [], userLife = 20, aiLife = 20, entering = null }) {
    let st = createGameState({ userDeck: [], aiDeck: [] });
    const lib = [{ id: "topcard", name: "Forest", type: "Basic Land — Forest" }];
    st = { ...st, players: { ...st.players,
      user: { ...st.players.user, battlefield: userBoard, library: lib, hand: [], life: userLife },
      ai: { ...st.players.ai, battlefield: aiBoard, life: aiLife },
    } };
    st = { ...st, pendingTriggers: [{
      event: "etb", source: { name: "Probe", permanentId: entering || "src" }, controller: "user",
      descriptor: { event: "etb", scope: "self", whose: "any", effectClause: "draw a card", interveningIf: condition },
      context: entering ? { triggeringPermanentId: entering } : {}, targets: [], payload: {},
    }] };
    let out = flushTriggers(st, { chooseTargets: chooseTriggerTargets });
    while (out.stack.length) out = resolveTopOfStack(out);
    return out.players.user.hand.length;
  }
  it("opponent-comparison MET (opp has more lands) → fires", () => {
    expect(runConditional({ condition: "an opponent controls more lands than you",
      userBoard: [perm("ul", "Basic Land — Forest")],
      aiBoard: [oppPerm("al1", "Basic Land — Island"), oppPerm("al2", "Basic Land — Island")] })).toBe(1);
  });
  it("opponent-comparison NOT met (you lead) → never goes on the stack", () => {
    expect(runConditional({ condition: "an opponent controls more lands than you",
      userBoard: [perm("ul1", "Basic Land — Forest"), perm("ul2", "Basic Land — Forest")],
      aiBoard: [oppPerm("al1", "Basic Land — Island")] })).toBe(0);
  });
  it("control-another-subtype MET (a second Elf besides the entering one) → fires", () => {
    const entering = enterPerm("ent", "Creature — Elf");
    expect(runConditional({ condition: "you control another Elf", entering: "ent",
      userBoard: [entering, perm("e2", "Creature — Elf")] })).toBe(1);
  });
  it("control-another-subtype NOT met (only the entering Elf) → never goes on the stack (CR 113.7)", () => {
    const entering = enterPerm("ent", "Creature — Elf");
    expect(runConditional({ condition: "you control another Elf", entering: "ent", userBoard: [entering] })).toBe(0);
  });
});
