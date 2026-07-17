/**
 * bolsterEndureKeywords.test.js — BLITZ KW-1: two keyword-action payoff buckets whose payoff atoms are now
 * reachable. (Connive is PARKED — its counter count scales with the number of NONLAND cards discarded "this
 * way", a quantity known only AFTER the interactive discard resolves across the pending-choice boundary; no
 * such nonland-discard tally exists and approximating it would be a forbidden FP, CR 701.50e.)
 *
 *  (A) BOLSTER N (CR 701.39 / 701.39a) — "Choose a creature you control with the least toughness or tied for
 *      least toughness among creatures you control. Put N +1/+1 counters on that creature." A NON-targeted
 *      controller choice. Modeled as the existing +1/+1 add-counter atom scoped to a new leastToughnessYouControl
 *      selector (shared.js atomTargets — LAYER-AWARE creatureToughness, ties broken by battlefield order). No
 *      targetType → non-chosen → routes native on triggers/spells like a self/team pump. No excludeSource (701.39a
 *      has no "other", so the source is eligible if it's a creature you control).
 *
 *  (B) ENDURE N (CR 701.63 / 701.63a) — "creates an N/N white Spirit creature token unless they put N +1/+1
 *      counters on that permanent." A MODAL controller choice; BOTH modes modeled in the endure atom. The mode is
 *      auto-picked deterministically (a controller free choice, resolved like proliferate / oneYouControl): source
 *      still on the battlefield → N +1/+1 counters on it (MODE A); source gone → an N/N white Spirit token
 *      (MODE B). endure 0 does nothing (CR 701.63b).
 *
 * Pins: recognition on the REAL oracle → the intended native tier; parser HIGH + the deliberately-parked
 * variable-N ("bolster X" / "endure X") LOW; runtime through checkEnterTriggers — bolster lands N counters on
 * the LEAST-EFFECTIVE-TOUGHNESS own creature (never an opponent's, never a higher-toughness one, source eligible),
 * endure lands N counters on the source (mode A) / mints an N/N Spirit when the source has left (mode B); whole-card
 * FN guards (a bolster X or a second-unmodeled-ability carrier stays parked).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { parseEffectClause, programConfidence } from "./effects/parser.js";
import { classifyCard } from "./coverage.js";
import { applyEndure } from "./effects/atoms/counters.js";
import { resolveTopOfStack } from "./gameEngine.js";
import { _resetIdsForTests, createGameState, createPermanent } from "./gameState.js";

beforeEach(() => _resetIdsForTests());

const conf = (t) => programConfidence(parseEffectClause(t, "Instant"));
const atom0 = (t) => parseEffectClause(t, "Instant")?.atoms?.[0];

function stateWith(user = [], ai = []) {
  const s = createGameState({ userDeck: [], aiDeck: [] });
  return {
    ...s, activePlayer: "user", priorityHolder: "user", phase: "precombat-main", step: "main",
    players: { ...s.players, user: { ...s.players.user, battlefield: user }, ai: { ...s.players.ai, battlefield: ai } },
  };
}
const perm = (id, ctrl, over = {}) => createPermanent({ id, card: { id: `c-${id}`, name: id, type: "Creature — Beast", power: 2, toughness: 2, ...over }, controller: ctrl });
// Cast a creature spell so its ETB trigger flushes onto the stack; return the post-enter state (trigger on stack).
function castCreature(card, user = [], ai = []) {
  let s = stateWith(user, ai);
  s = { ...s, stack: [{ id: "stk-1", kind: "spell", source: card, controller: "user", targets: [], cost: null, payload: { resolver: "spell.permanent", params: { card, controller: "user" } } }] };
  return resolveTopOfStack(s);
}
const counterOf = (s, id) => { for (const p of Object.keys(s.players)) { const f = s.players[p].battlefield.find((x) => x.id === id); if (f) return f.counters?.["+1/+1"] || 0; } return null; };

// ===================================================================================================
describe("BOLSTER N — recognition (real oracle)", () => {
  it("bare 'bolster N' parses to the +1/+1 add-counter atom scoped to leastToughnessYouControl", () => {
    expect(atom0("bolster 1")).toEqual({ op: "add-counter", counterType: "+1/+1", amount: 1, scope: "leastToughnessYouControl" });
    expect(atom0("bolster 5")).toMatchObject({ op: "add-counter", amount: 5, scope: "leastToughnessYouControl" });
    expect(conf("bolster 2")).toBe("high");
    expect(conf("bolster 4")).toBe("high");
  });

  it("the ETB / attack / dies / activated bolster carriers classify native", () => {
    expect(classifyCard({ name: "Sandcrafter Mage", type: "Creature — Human Wizard", oracle: "When this creature enters, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Aven Tactician", type: "Creature — Bird Soldier", oracle: "Flying\nWhen this creature enters, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Dromoka Captain", type: "Creature — Human Soldier", oracle: "First strike\nWhenever this creature attacks, bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Abzan Skycaptain", type: "Creature — Bird Soldier", oracle: "Flying\nWhen this creature dies, bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Echoes of the Kin Tree", type: "Enchantment", oracle: "{2}{W}: Bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)" })).toBe("native-activated");
  });

  it("bolster as a SPELL clause (own-side, non-targeted) rides with other modeled clauses → native-spell", () => {
    expect(classifyCard({ name: "Cached Defenses", type: "Sorcery", oracle: "Bolster 3. (Choose a creature with the least toughness among creatures you control and put three +1/+1 counters on it.)" })).toBe("native-spell");
    expect(classifyCard({ name: "Honor's Reward", type: "Instant", oracle: "You gain 4 life. Bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)" })).toBe("native-spell");
    expect(classifyCard({ name: "Enduring Victory", type: "Instant", oracle: "Destroy target attacking or blocking creature. Bolster 1. (Choose a creature with the least toughness among creatures you control and put a +1/+1 counter on it.)" })).toBe("native-spell");
  });

  it("FN guard: a variable-N bolster ('bolster X') stays LOW → Arbiter", () => {
    expect(conf("bolster x")).toBe("low");
    expect(conf("bolster x, where x is the number of tapped creatures you control")).toBe("low");
    expect(classifyCard({ name: "Dragonscale General", type: "Creature — Human Warrior", oracle: "At the beginning of your end step, bolster X, where X is the number of tapped creatures you control. (Choose a creature with the least toughness among creatures you control and put X +1/+1 counters on it.)" })).toBe("body-only");
  });

  it("WHOLE-CARD FN (CREED): a bolster creature with an unmodeled second ability stays body-only", () => {
    // bolster 2 (modeled) + a control-exchange activated ability the engine does NOT model → the whole card
    // correctly parks. (Elite Scaleguard — the prior bolster + "with a +1/+1 counter on it attacks, tap"
    // example — now flips native via BLITZ CNT-1's counter-predicate scope, so a still-unmodeled rider is used.)
    expect(classifyCard({ name: "Bolster Warden", type: "Creature — Human Soldier", oracle: "When this creature enters, bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)\n{3}, {T}: Exchange control of target creature you control and target creature an opponent controls." })).toBe("body-only");
  });
});

describe("BOLSTER N — runtime through checkEnterTriggers", () => {
  it("puts N counters on the LEAST-EFFECTIVE-TOUGHNESS own creature — never an opponent's, never a higher one, source eligible", () => {
    const src = { id: "card-scav", name: "Scav", type: "Creature — Dog", power: 2, toughness: 2, oracle: "When this creature enters, bolster 2. (Choose a creature with the least toughness among creatures you control and put two +1/+1 counters on it.)" };
    // u_small 2/1 (least toughness), u_big 4/4, opponent 0/1 (an opponent's low-toughness creature is NOT eligible).
    const afterSpell = castCreature(src, [perm("u_small", "user", { power: 2, toughness: 1 }), perm("u_big", "user", { power: 4, toughness: 4 })], [perm("opp", "ai", { power: 0, toughness: 1 })]);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    expect(trig.payload.params.targets).toEqual([]); // non-targeted scope — no chosen target
    const after = resolveTopOfStack(afterSpell);
    expect(counterOf(after, "u_small")).toBe(2); // the least-toughness own creature
    expect(counterOf(after, "u_big")).toBe(0);
    expect(counterOf(after, "opp")).toBe(0);   // opponents are NOT "creatures you control"
    const source = after.players.user.battlefield.find((p) => p.card?.name === "Scav");
    expect(source.counters?.["+1/+1"] || 0).toBe(0); // the 2/2 source isn't the least here
  });

  it("least toughness is LAYER-AWARE (counters count) — a low-PRINTED-toughness creature buffed above another is not chosen", () => {
    const src = { id: "card-b", name: "Bolsterer", type: "Creature — Dog", power: 2, toughness: 5, oracle: "When this creature enters, bolster 1." };
    // u_buffed prints toughness 1 but carries two +1/+1 counters → EFFECTIVE toughness 3; u_least prints 3/2 →
    // effective toughness 2 (the true least). The layer-aware pick must be u_least, NOT the lower-printed u_buffed.
    const buffed = { ...perm("u_buffed", "user", { power: 1, toughness: 1 }), counters: { "+1/+1": 2 } };
    const afterSpell = castCreature(src, [buffed, perm("u_least", "user", { power: 3, toughness: 2 })], []);
    const after = resolveTopOfStack(afterSpell);
    expect(counterOf(after, "u_least")).toBe(1); // effective-toughness 2 < buffed's effective 3
    expect(counterOf(after, "u_buffed")).toBe(2); // unchanged (still just its two pre-existing counters)
  });

  it("the SOURCE itself is eligible when it is the least-toughness creature you control (701.39a has no 'other')", () => {
    const src = { id: "card-lone", name: "Lonecrafter", type: "Creature — Dog", power: 2, toughness: 1, oracle: "When this creature enters, bolster 1." };
    // Only the source (2/1) and a bigger ally (3/3) — the source has the least toughness, so it gets the counter.
    const afterSpell = castCreature(src, [perm("ally", "user", { power: 3, toughness: 3 })], []);
    const after = resolveTopOfStack(afterSpell);
    const source = after.players.user.battlefield.find((p) => p.card?.name === "Lonecrafter");
    expect(source.counters?.["+1/+1"] || 0).toBe(1);
    expect(counterOf(after, "ally")).toBe(0);
  });
});

// ===================================================================================================
describe("ENDURE N — recognition (real oracle)", () => {
  it("bare 'it endures N' parses to the endure atom (self-scoped, no targetType)", () => {
    expect(atom0("it endures 1")).toEqual({ op: "endure", amount: 1, targetType: null });
    expect(atom0("it endures 3")).toMatchObject({ op: "endure", amount: 3, targetType: null });
    expect(atom0("this creature endures 2")).toMatchObject({ op: "endure", amount: 2 });
    expect(conf("it endures 2")).toBe("high");
  });

  it("the ETB / attack / compound-trigger endure carriers classify native-trigger", () => {
    expect(classifyCard({ name: "Fortress Kin-Guard", type: "Creature — Dog Soldier", oracle: "When this creature enters, it endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)" })).toBe("native-trigger");
    expect(classifyCard({ name: "Sandskitter Outrider", type: "Creature — Goblin Soldier", oracle: "Menace\nWhen this creature enters, it endures 2. (Put two +1/+1 counters on it or create a 2/2 white Spirit creature token.)" })).toBe("native-trigger");
    // Compound "enters or attacks" trigger + endure.
    expect(classifyCard({ name: "Inspirited Vanguard", type: "Creature — Human Soldier", oracle: "Whenever this creature enters or attacks, it endures 2. (Put two +1/+1 counters on it or create a 2/2 white Spirit creature token.)" })).toBe("native-trigger");
    // Attack trigger with a lose-life rider + endure (both clauses modeled).
    expect(classifyCard({ name: "Sinkhole Surveyor", type: "Creature — Bird Scout", oracle: "Flying\nWhenever this creature attacks, you lose 1 life and this creature endures 1. (Put a +1/+1 counter on it or create a 1/1 white Spirit creature token.)" })).toBe("native-trigger");
  });

  it("FN guard: a variable-N endure ('endures X') or a non-self referent stays LOW → Arbiter", () => {
    expect(conf("it endures x")).toBe("low");
    expect(conf("target creature endures 2")).toBe("low"); // no fixed-N non-self endure exists; never mis-bound to the source
    expect(classifyCard({ name: "Warden of the Grove", type: "Creature — Hydra", oracle: "At the beginning of your end step, put a +1/+1 counter on this creature.\nWhenever another nontoken creature you control enters, it endures X, where X is the number of counters on this creature. (Put X +1/+1 counters on the creature that entered or create an X/X white Spirit creature token.)" })).toBe("body-only");
  });
});

describe("ENDURE N — runtime", () => {
  it("MODE A: with the source on the battlefield, endure puts N +1/+1 counters on the source", () => {
    const src = { id: "card-kg", name: "KinGuard", type: "Creature — Dog Soldier", power: 1, toughness: 1, oracle: "When this creature enters, it endures 2. (Put two +1/+1 counters on it or create a 2/2 white Spirit creature token.)" };
    const afterSpell = castCreature(src, [], []);
    const trig = afterSpell.stack.find((o) => o.kind === "triggered-ability");
    expect(trig.payload.resolver).toBe("effect-program");
    const after = resolveTopOfStack(afterSpell);
    const kg = after.players.user.battlefield.find((p) => p.card?.name === "KinGuard");
    expect(kg.counters?.["+1/+1"] || 0).toBe(2);
  });

  it("MODE B: with the source gone, endure creates an N/N white Spirit creature token", () => {
    const s = stateWith([], []);
    const before = s.players.user.battlefield.length;
    const after = applyEndure(s, { op: "endure", amount: 3 }, { controller: "user", sourceId: "ghost-not-on-battlefield" });
    const bf = after.players.user.battlefield;
    expect(bf.length - before).toBe(1);
    const tok = bf[bf.length - 1];
    expect(tok.card.power).toBe(3);
    expect(tok.card.toughness).toBe(3);
    expect(/Spirit/.test(tok.card.type)).toBe(true);
  });

  it("endure 0 does nothing (CR 701.63b) — no counters, no token, state untouched", () => {
    const s = stateWith([perm("z", "user")], []);
    const after = applyEndure(s, { op: "endure", amount: 0 }, { controller: "user", sourceId: "z" });
    expect(after).toBe(s);
  });
});
